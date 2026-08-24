import React, { useState, useEffect } from 'react';
import { useAuth } from '../lib/AuthContext';
import { db } from '../lib/firebase';
import { doc, getDoc, updateDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Building2, Save, CheckCircle2, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';

export function CompanySettings() {
  const { user, profile, refreshProfile } = useAuth();
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(true);
  
  const [formData, setFormData] = useState({
    name: '',
    documento: '',
    telefone: '',
  });

  const [docError, setDocError] = useState<string | null>(null);
  const [phoneError, setPhoneError] = useState<string | null>(null);

  useEffect(() => {
    if (profile?.teamId) {
      loadTeam();
    }
  }, [profile?.teamId]);

  const loadTeam = async () => {
    setFetching(true);
    try {
      const docRef = doc(db, 'teams', profile!.teamId);
      const snap = await getDoc(docRef);
      if (snap.exists()) {
        const data = snap.data();
        const initialDoc = data.documento || data.cnpj || '';
        const initialPhone = data.telefone || '';
        setFormData({
          name: data.name || '',
          documento: formatDocument(initialDoc),
          telefone: formatPhone(initialPhone),
        });
      }
    } catch (e) {
      console.error(e);
      toast.error('Erro ao carregar dados da empresa');
    } finally {
      setFetching(false);
    }
  };

  const formatDocument = (val: string) => {
    let v = val.replace(/\D/g, '');
    if (v.length <= 11) {
      v = v.replace(/(\d{3})(\d)/, '$1.$2');
      v = v.replace(/(\d{3})(\d)/, '$1.$2');
      v = v.replace(/(\d{3})(\d{1,2})$/, '$1-$2');
    } else {
      v = v.substring(0, 14);
      v = v.replace(/^(\d{2})(\d)/, '$1.$2');
      v = v.replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3');
      v = v.replace(/\.(\d{3})(\d)/, '.$1/$2');
      v = v.replace(/(\d{4})(\d)/, '$1-$2');
    }
    return v;
  };

  const formatPhone = (val: string) => {
    let v = val.replace(/\D/g, '');
    v = v.substring(0, 11);
    if (v.length > 2) {
      v = v.replace(/^(\d{2})(\d)/g, '($1) $2');
    }
    if (v.length > 9) {
      v = v.replace(/(\d{5})(\d)/, '$1-$2');
    } else if (v.length > 8) {
      v = v.replace(/(\d{4})(\d)/, '$1-$2');
    }
    return v;
  };

  const validateCPF = (cpf: string): boolean => {
    const clean = cpf.replace(/\D/g, '');
    if (clean.length !== 11) return false;
    if (/^(\d)\1{10}$/.test(clean)) return false;

    let sum = 0;
    for (let i = 0; i < 9; i++) {
      sum += parseInt(clean.charAt(i), 10) * (10 - i);
    }
    let rev = 11 - (sum % 11);
    if (rev === 10 || rev === 11) rev = 0;
    if (rev !== parseInt(clean.charAt(9), 10)) return false;

    sum = 0;
    for (let i = 0; i < 10; i++) {
      sum += parseInt(clean.charAt(i), 10) * (11 - i);
    }
    rev = 11 - (sum % 11);
    if (rev === 10 || rev === 11) rev = 0;
    if (rev !== parseInt(clean.charAt(10), 10)) return false;

    return true;
  };

  const validateCNPJ = (cnpj: string): boolean => {
    const clean = cnpj.replace(/\D/g, '');
    if (clean.length !== 14) return false;
    if (/^(\d)\1{13}$/.test(clean)) return false;

    const weights1 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    let sum = 0;
    for (let i = 0; i < 12; i++) {
      sum += parseInt(clean.charAt(i), 10) * weights1[i];
    }
    let rest = sum % 11;
    const digit1 = rest < 2 ? 0 : 11 - rest;
    if (parseInt(clean.charAt(12), 10) !== digit1) return false;

    const weights2 = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    sum = 0;
    for (let i = 0; i < 13; i++) {
      sum += parseInt(clean.charAt(i), 10) * weights2[i];
    }
    rest = sum % 11;
    const digit2 = rest < 2 ? 0 : 11 - rest;
    if (parseInt(clean.charAt(13), 10) !== digit2) return false;

    return true;
  };

  const validateDocument = (val: string): { valid: boolean; message?: string } => {
    const clean = val.replace(/\D/g, '');
    if (!clean) return { valid: true };
    if (clean.length < 11) {
      return { valid: false, message: 'Documento incompleto (mínimo 11 dígitos para CPF).' };
    }
    if (clean.length === 11) {
      if (!validateCPF(clean)) {
        return { valid: false, message: 'CPF inválido. Verifique os dígitos informados.' };
      }
      return { valid: true };
    }
    if (clean.length > 11 && clean.length < 14) {
      return { valid: false, message: 'CNPJ incompleto (deve conter 14 dígitos).' };
    }
    if (clean.length === 14) {
      if (!validateCNPJ(clean)) {
        return { valid: false, message: 'CNPJ inválido. Verifique os dígitos informados.' };
      }
      return { valid: true };
    }
    return { valid: false, message: 'Documento inválido.' };
  };

  const validatePhone = (val: string): { valid: boolean; message?: string } => {
    const clean = val.replace(/\D/g, '');
    if (!clean) return { valid: true };
    if (clean.length < 10 || clean.length > 11) {
      return { valid: false, message: 'Telefone deve conter DDD + 8 ou 9 dígitos.' };
    }
    const ddd = parseInt(clean.substring(0, 2), 10);
    if (ddd < 11 || ddd > 99) {
      return { valid: false, message: 'DDD inválido.' };
    }
    return { valid: true };
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    let formattedValue = value;
    if (name === 'documento') {
      formattedValue = formatDocument(value);
      if (formattedValue.replace(/\D/g, '').length >= 11) {
        const check = validateDocument(formattedValue);
        setDocError(check.valid ? null : (check.message || 'Inválido'));
      } else {
        setDocError(null);
      }
    }
    if (name === 'telefone') {
      formattedValue = formatPhone(value);
      if (formattedValue.replace(/\D/g, '').length >= 10) {
        const check = validatePhone(formattedValue);
        setPhoneError(check.valid ? null : (check.message || 'Inválido'));
      } else {
        setPhoneError(null);
      }
    }
    
    setFormData(prev => ({ ...prev, [name]: formattedValue }));
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.name.trim()) {
      toast.error('Informe o nome da empresa.');
      return;
    }

    if (formData.documento) {
      const docCheck = validateDocument(formData.documento);
      if (!docCheck.valid) {
        setDocError(docCheck.message || 'CPF ou CNPJ inválido');
        toast.error(docCheck.message || 'CPF ou CNPJ inválido. Não foi possível salvar.');
        return;
      }
    }
    
    if (formData.telefone) {
      const phoneCheck = validatePhone(formData.telefone);
      if (!phoneCheck.valid) {
        setPhoneError(phoneCheck.message || 'Telefone inválido');
        toast.error(phoneCheck.message || 'Telefone inválido. Verifique o número digitado.');
        return;
      }
    }
    
    setLoading(true);
    try {
      if (!profile?.teamId) {
        throw new Error('Identificador da empresa não encontrado.');
      }

      const teamRef = doc(db, 'teams', profile.teamId);
      await setDoc(teamRef, {
        name: formData.name.trim(),
        documento: formData.documento,
        telefone: formData.telefone,
        updatedAt: serverTimestamp(),
      }, { merge: true });
      
      // Assegurar que o usuário permaneça com companySetupComplete = true e teamName no Firestore
      if (user) {
        const userRef = doc(db, 'users', user.uid);
        await setDoc(userRef, {
          teamName: formData.name.trim(),
          companySetupComplete: true,
          updatedAt: serverTimestamp(),
        }, { merge: true }).catch(err => console.warn('Could not update user doc', err));
      }

      // Sincronizar com banco SQL
      try {
        await fetch('/api/teams/update', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            teamId: profile.teamId,
            name: formData.name.trim(),
            documento: formData.documento,
            telefone: formData.telefone,
          })
        });
      } catch (err) {
        console.warn('Postgres team sync optional error', err);
      }

      // Atualiza o contexto global para refletir o novo nome sem redirecionar
      await refreshProfile();
      
      toast.success('Dados da empresa atualizados com sucesso!');
    } catch (e: any) {
      console.error(e);
      toast.error('Erro ao salvar dados: ' + (e.message || 'Falha na conexão'));
    } finally {
      setLoading(false);
    }
  };

  if (fetching) {
    return (
      <div className="h-full flex items-center justify-center bg-zinc-50">
        <div className="w-8 h-8 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  const isDocValid = formData.documento ? validateDocument(formData.documento).valid : null;
  const isPhoneValid = formData.telefone ? validatePhone(formData.telefone).valid : null;

  return (
    <div className="p-4 md:p-8 max-w-2xl mx-auto h-full overflow-y-auto pb-24">
      <div className="mb-8">
        <h1 className="text-2xl font-bold tracking-tight text-zinc-900 flex items-center gap-2">
          <Building2 className="w-6 h-6 text-zinc-500" />
          Dados da Empresa
        </h1>
        <p className="text-zinc-500 mt-1">Gerencie as informações oficiais da sua empresa.</p>
      </div>

      <form onSubmit={handleSave}>
        <Card className="shadow-sm border-zinc-200">
          <CardHeader>
            <CardTitle>Perfil da Empresa</CardTitle>
            <CardDescription>
              Essas informações aparecerão no menu do sistema e serão vinculadas à sua equipe.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="name" className="text-zinc-700 font-semibold">Nome da Empresa (Razão Social ou Fantasia) *</Label>
              <Input 
                id="name" 
                name="name" 
                value={formData.name} 
                onChange={handleChange} 
                required 
                placeholder="Ex: HeavyFlow Tecnologia" 
                className="h-10"
              />
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="documento" className="text-zinc-700 font-semibold">CNPJ ou CPF</Label>
                  {isDocValid === true && (
                    <span className="text-[11px] font-medium text-emerald-600 flex items-center gap-1">
                      <CheckCircle2 className="w-3.5 h-3.5" /> Válido
                    </span>
                  )}
                </div>
                <Input 
                  id="documento" 
                  name="documento" 
                  value={formData.documento} 
                  onChange={handleChange} 
                  placeholder="00.000.000/0000-00" 
                  className={`h-10 ${docError ? 'border-red-500 focus-visible:ring-red-500' : isDocValid ? 'border-emerald-500' : ''}`}
                />
                {docError && (
                  <p className="text-xs text-red-600 flex items-center gap-1 mt-1">
                    <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                    {docError}
                  </p>
                )}
              </div>
              
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="telefone" className="text-zinc-700 font-semibold">Telefone de Contato</Label>
                  {isPhoneValid === true && (
                    <span className="text-[11px] font-medium text-emerald-600 flex items-center gap-1">
                      <CheckCircle2 className="w-3.5 h-3.5" /> Válido
                    </span>
                  )}
                </div>
                <Input 
                  id="telefone" 
                  name="telefone" 
                  value={formData.telefone} 
                  onChange={handleChange} 
                  placeholder="(00) 00000-0000" 
                  className={`h-10 ${phoneError ? 'border-red-500 focus-visible:ring-red-500' : isPhoneValid ? 'border-emerald-500' : ''}`}
                />
                {phoneError && (
                  <p className="text-xs text-red-600 flex items-center gap-1 mt-1">
                    <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                    {phoneError}
                  </p>
                )}
              </div>
            </div>

            <div className="pt-4 flex justify-end">
              <Button type="submit" disabled={loading} className="gap-2 bg-emerald-600 hover:bg-emerald-700 text-white">
                <Save className="w-4 h-4" />
                {loading ? 'Salvando...' : 'Salvar Alterações'}
              </Button>
            </div>
          </CardContent>
        </Card>
      </form>
    </div>
  );
}
