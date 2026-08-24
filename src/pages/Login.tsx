import { useState, useEffect } from 'react';
import { toast } from 'sonner';
import { useAuth } from '../lib/AuthContext';
import { Button } from '@/components/ui/button';
import { Navigate } from 'react-router-dom';
import { AlertCircle } from 'lucide-react';

export function Login() {
  const { loginWithGoogle, registerWithGoogle, user, profile, loading, error } = useAuth();
  const [isRegistering, setIsRegistering] = useState(false);

  useEffect(() => {
    if (localStorage.getItem('session_expired') === 'true') {
      toast.info("Sua sessão expirou por inatividade. Por favor, faça login novamente.");
      localStorage.removeItem('session_expired');
    }
  }, []);
  

  // Se já estiver logado e com perfil carregado, vai direto para o app
  if (user && profile && !loading) {
    return <Navigate to="/" replace />;
  }

  // Enquanto carrega o estado de auth após login bem sucedido, mostra um loading central
  if (user && !profile && loading) {
    return (
      <div className="h-screen w-full flex flex-col items-center justify-center bg-zinc-50 space-y-4">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-emerald-600"></div>
        <p className="text-zinc-500 font-medium">Verificando autorização...</p>
      </div>
    );
  }

  return (
    <div className="h-screen w-full flex flex-col items-center justify-center bg-zinc-50 p-6">
      <div className="max-w-md w-full p-8 border rounded-3xl shadow-xl bg-white text-center space-y-6">
        <div className="flex justify-center mb-4">
          <img src="/logo.png" alt="HeavyFlow CRM Logo" className="w-40 h-40 sm:w-48 sm:h-48 object-contain" />
        </div>
        
        <div className="space-y-2">
          <h1 className="text-xl sm:text-2xl font-extrabold tracking-tight text-zinc-900">HeavyFlow CRM</h1>
          <p className="text-sm text-zinc-500 px-4">
            Gestão inteligente de WhatsApp para frotas e proteção veicular.
          </p>
        </div>

        {error && (
          <div className="p-4 bg-red-50 border border-red-100 rounded-lg flex items-start text-left space-x-3">
            <AlertCircle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
            <p className="text-sm text-red-700 font-medium">{error}</p>
          </div>
        )}

        <div className="pt-4 pb-2">
          {isRegistering ? (
            <div className="space-y-4">
              <Button 
                onClick={registerWithGoogle} 
                disabled={loading}
                className="w-full text-base h-12 bg-emerald-600 hover:bg-emerald-700 shadow-sm"
              >
                {loading ? 'Carregando...' : 'Criar Conta com Google'}
              </Button>
              <p className="text-sm text-zinc-500">
                Já tem uma conta? <button onClick={() => setIsRegistering(false)} className="text-emerald-600 font-bold hover:underline">Fazer login</button>
              </p>
              <p className="mt-8 text-xs text-zinc-400">
                Ao criar uma conta, você terá 7 dias gratuitos para testar a plataforma.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              <Button 
                onClick={loginWithGoogle} 
                disabled={loading}
                className="w-full text-base h-12 bg-zinc-900 hover:bg-zinc-800 shadow-sm"
              >
                {loading ? 'Carregando...' : 'Entrar com Google'}
              </Button>
              <p className="text-sm text-zinc-500">
                Ainda não tem cadastro? <button onClick={() => setIsRegistering(true)} className="text-emerald-600 font-bold hover:underline">Criar uma empresa</button>
              </p>
              <p className="mt-8 text-xs text-zinc-400">
                Apenas usuários autorizados pelo administrador da empresa podem fazer login.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
