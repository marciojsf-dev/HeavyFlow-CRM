import React, { createContext, useContext, useEffect, useState, useRef } from 'react';
import { User, signInWithPopup, GoogleAuthProvider, signOut } from 'firebase/auth';
import { auth, db, handleFirestoreError } from './firebase';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';

export interface UserProfile {
  email: string;
  name: string;
  teamId: string;
  role: 'admin' | 'agent';
  isSuperAdmin?: boolean;
  teamName?: string;
  subscriptionStatus?: string;
  companySetupComplete?: boolean;
  createdAt?: any;
}

interface AuthContextType {
  user: User | null;
  profile: UserProfile | null;
  loading: boolean;
  error: string | null;
  loginWithGoogle: () => Promise<void>;
  registerWithGoogle: () => Promise<void>;
  logout: () => Promise<void>;
  impersonateTeam: (teamId: string) => void;
  refreshProfile: () => Promise<void>;
  checkSubscription: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const impersonateTeam = (newTeamId: string) => {
    if (profile?.isSuperAdmin) {
      setProfile({ ...profile, teamId: newTeamId });
    }
  };

  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged(async (u) => {
      setLoading(true);
      // Only clear error if we are logging in successfully
      if (u) setError(null);
      setUser(u);
      
      if (u) {
        try {
          // 1. Tenta buscar pelo UID (se já logou antes e foi vinculado)
          const docRef = doc(db, 'users', u.uid);
          const snap = await getDoc(docRef);
          
          if (snap.exists()) {
            const data = snap.data() as UserProfile;
            // Force admin role for the main user
            if (u.email === 'marciojsf@gmail.com') {
              data.role = 'admin';
              data.isSuperAdmin = true;
            }
            
            
      // Load team name
      if (data.teamId) {
        try {
          const teamDoc = await getDoc(doc(db, 'teams', data.teamId));
          if (teamDoc.exists()) {
            data.teamName = teamDoc.data().name;
          }
        } catch (e) { console.error("Error loading team name", e); }
      }

            // Assume users with team or super admin are completely setup
            if (data.companySetupComplete === undefined || u.email === 'marciojsf@gmail.com' || data.teamId) {
              data.companySetupComplete = true;
            }
            
            

                  // Load team name
                  if (data.teamId) {
                    try {
                      const teamDoc = await getDoc(doc(db, 'teams', data.teamId));
                      if (teamDoc.exists()) {
                        data.teamName = teamDoc.data().name;
                      }
                    } catch (e) { console.error("Error loading team name", e); }
                  }
            
            // Check subscription status
            if (data.teamId) {
              try {
                const subRes = await fetch(`/api/teams/${data.teamId}/subscription`);
                const subData = await subRes.json();
                if (subData.success && subData.subscription) {
                  data.subscriptionStatus = subData.subscription.status;
                }
              } catch (err) {
                console.error("Failed to fetch subscription", err);
              }
            }

            setProfile(data);
          } else {
            // 2. Se não achou pelo UID, busca pelo e-mail (pré-autorização pelo admin)
            const { collection, query, where, getDocs, setDoc, deleteDoc } = await import('firebase/firestore');
            const q = query(collection(db, 'users'), where('email', '==', u.email));
            const querySnap = await getDocs(q);
            
            if (!querySnap.empty) {
              const userDoc = querySnap.docs[0];
              const data = userDoc.data() as UserProfile;
              
              // Force admin role for the main user
              if (u.email === 'marciojsf@gmail.com') {
                data.role = 'admin';
                data.isSuperAdmin = true;
              }
              
              // Migra o registro para o UID para performance e links de segurança
              try {
                // If it's an existing user migrating to UID, assume company setup is complete
                // unless explicitly false
                const isCompanySetup = data.companySetupComplete !== false;
                
                await setDoc(doc(db, 'users', u.uid), { 
                  ...data, 
                  companySetupComplete: isCompanySetup,
                  createdAt: data.createdAt || serverTimestamp(),
                  updatedAt: serverTimestamp() 
                });
                
                // Se o ID antigo não era o UID, removemos o antigo (ID por e-mail ou UUID)
                
                    // Load team name
                    if (data.teamId) {
                      try {
                        const teamDoc = await getDoc(doc(db, 'teams', data.teamId));
                        if (teamDoc.exists()) {
                          data.teamName = teamDoc.data().name;
                        }
                      } catch (e) { console.error("Error loading team name", e); }
                    }
              
              if (userDoc.id !== u.uid) {
                  const { deleteDoc } = await import('firebase/firestore');
                  await deleteDoc(userDoc.ref);
                }
                
                // Update local data with the assumed setup flag
                data.companySetupComplete = isCompanySetup;
              } catch (migrateErr) {
                console.warn("Could not migrate user doc to UID, but proceeding with profile", migrateErr);
              }
              
              
            // Check subscription status
            if (data.teamId) {
              try {
                const subRes = await fetch(`/api/teams/${data.teamId}/subscription`);
                const subData = await subRes.json();
                if (subData.success && subData.subscription) {
                  data.subscriptionStatus = subData.subscription.status;
                }
              } catch (err) {
                console.error("Failed to fetch subscription", err);
              }
            }

            setProfile(data);
            } else if (u.email === 'marciojsf@gmail.com') {
              // Super admin fresh start - auto create a team if none exists
              const teamId = 'team_main';
              const adminProfile: UserProfile = {
                email: u.email,
                name: u.displayName || 'Admin',
                teamId: teamId,
                role: 'admin',
                isSuperAdmin: true,
                companySetupComplete: false,
                createdAt: serverTimestamp()
              };
              try {
                await setDoc(doc(db, 'users', u.uid), adminProfile);
                setProfile(adminProfile);
              } catch (e) {
                console.error("Failed to self-provision super admin", e);
                setError('Erro ao configurar super-admin.');
              }
            } else {
              const authAction = localStorage.getItem('auth_action');
              
              if (authAction === 'register') {
                // Usuário novo - Auto-provisionar uma nova empresa/conta
                const teamId = `team_${u.uid.substring(0, 8)}`;
                const newProfile: UserProfile = {
                  email: u.email || '',
                  name: u.displayName || 'Novo Usuário',
                  teamId: teamId,
                  role: 'admin',
                  companySetupComplete: false,
                  createdAt: serverTimestamp(),
                  updatedAt: serverTimestamp()
                } as any;
                try {
                  await setDoc(doc(db, 'users', u.uid), newProfile);
                  setProfile(newProfile);
                  localStorage.removeItem('auth_action');
                } catch (e) {
                  console.error("Failed to provision new user", e);
                  setError('Erro ao criar sua nova conta. Verifique sua conexão.');
                  await signOut(auth);
                }
              } else {
                // Usuário não autorizado tentando apenas fazer login
                setError('Conta não encontrada. Peça para o administrador te adicionar à equipe, ou cadastre sua própria empresa.');
                setProfile(null);
                await signOut(auth);
              }
            }
          }
        } catch (e: any) {
             console.error("Auth context error:", e);
             setError('Erro ao verificar permissões de acesso. Verifique sua conexão.');
             await signOut(auth);
        }
      } else {
        setProfile(null);
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const loginWithGoogle = async () => {
    setError(null);
    try {
      localStorage.setItem('auth_action', 'login');
      const provider = new GoogleAuthProvider();
      provider.setCustomParameters({
        prompt: 'select_account'
      });
      await signInWithPopup(auth, provider);
    } catch (e: any) {
      console.error(e);
      if (e.code !== 'auth/popup-closed-by-user') {
        setError('Falha ao autenticar com o Google.');
      }
    }
  };

  const registerWithGoogle = async () => {
    setError(null);
    try {
      localStorage.setItem('auth_action', 'register');
      const provider = new GoogleAuthProvider();
      provider.setCustomParameters({
        prompt: 'select_account'
      });
      await signInWithPopup(auth, provider);
    } catch (e: any) {
      console.error(e);
      if (e.code !== 'auth/popup-closed-by-user') {
        setError('Falha ao autenticar com o Google.');
      }
    }
  };

  const logout = () => {
    localStorage.removeItem('auth_action');
    return signOut(auth);
  };

  const refreshProfile = async () => {
    if (!user) return;
    try {
      const docRef = doc(db, 'users', user.uid);
      const snap = await getDoc(docRef);
      if (snap.exists()) {
        const data = snap.data() as UserProfile;
        if (user.email === 'marciojsf@gmail.com') {
          data.role = 'admin';
          data.isSuperAdmin = true;
        }
        if (data.companySetupComplete === undefined || user.email === 'marciojsf@gmail.com' || data.teamId) {
          data.companySetupComplete = true;
        }

        if (data.teamId) {
          try {
            const teamDoc = await getDoc(doc(db, 'teams', data.teamId));
            if (teamDoc.exists()) {
              data.teamName = teamDoc.data().name;
            }
          } catch (e) { console.error("Error loading team name", e); }
        }

            // Check subscription status
            if (data.teamId) {
              try {
                const subRes = await fetch(`/api/teams/${data.teamId}/subscription`);
                const subData = await subRes.json();
                if (subData.success && subData.subscription) {
                  data.subscriptionStatus = subData.subscription.status;
                }
              } catch (err) {
                console.error("Failed to fetch subscription", err);
              }
            }

            setProfile(data);
      }
    } catch (e) {
      console.error("Failed to refresh profile", e);
    }
  };

  
  const lastCheck = useRef(0);

  const checkSubscription = async (force = false) => {
    if (!profile || profile.isSuperAdmin || !profile.teamId) return;
    
    const now = Date.now();
    // Cache de 5 minutos (300.000 ms) para evitar sobrecarga de consultas
    // Se não for forçado, usa cache de 5 minutos.
    // Se for forçado (ex: ao voltar para a aba), usa um debounce de 10 segundos para evitar spam.
    const ttl = force ? 10 * 1000 : 5 * 60 * 1000;
    if (now - lastCheck.current < ttl) return;
    lastCheck.current = now;

    try {
      const subRes = await fetch(`/api/teams/${profile.teamId}/subscription`);
      const subData = await subRes.json();
      if (subData.success && subData.subscription) {
        if (profile.subscriptionStatus !== subData.subscription.status) {
          setProfile(prev => prev ? { ...prev, subscriptionStatus: subData.subscription.status } : null);
        }
      } else if (profile.subscriptionStatus !== 'inactive') {
        setProfile(prev => prev ? { ...prev, subscriptionStatus: 'inactive' } : null);
      }
    } catch (e) {
      console.error("Failed to check subscription", e);
    }
  };

  useEffect(() => {
    const handleFocus = () => {
      // Força a validação com debounce curto ao voltar para a aba
      checkSubscription(true);
    };
    
    window.addEventListener('focus', handleFocus);
    
    return () => {
      window.removeEventListener('focus', handleFocus);
    };
  }, [profile]);

  // Idle Timer (Session Expiration) - OWASP Best Practice
  useEffect(() => {
    if (!user) return;
    
    let lastActivity = Date.now();
    const updateActivity = () => { lastActivity = Date.now(); };
    
    const events = ['mousemove', 'keydown', 'click', 'scroll', 'touchstart'];
    events.forEach(e => window.addEventListener(e, updateActivity, { passive: true }));
    
    const idleCheckInterval = setInterval(() => {
      const now = Date.now();
      // 30 minutos de inatividade (1.800.000 ms)
      if (now - lastActivity > 30 * 60 * 1000) {
        localStorage.setItem('session_expired', 'true');
        logout();
      }
    }, 60000); // Checa a cada 1 minuto
    
    return () => {
      events.forEach(e => window.removeEventListener(e, updateActivity));
      clearInterval(idleCheckInterval);
    };
  }, [user]);

  return (
    <AuthContext.Provider value={{ user, profile, loading, error, loginWithGoogle, registerWithGoogle, logout, impersonateTeam, refreshProfile, checkSubscription }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
  return ctx;
};
