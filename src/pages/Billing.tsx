import { useState, useEffect } from 'react';
import { useAuth } from '../lib/AuthContext';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { CreditCard, Check, Zap, ExternalLink, Shield, Info } from 'lucide-react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';

export function Billing() {
  const { profile, loading: authLoading } = useAuth();
  const [loading, setLoading] = useState(false);
  const [portalLoading, setPortalLoading] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { refreshProfile } = useAuth();
  
  const status = profile?.subscriptionStatus;
  const isSubscribed = status === 'active' || status === 'trialing';
  const isPastDue = status === 'past_due' || status === 'unpaid';
  const isCanceled = status === 'canceled';
  const hasHistory = isPastDue || isCanceled || status === 'incomplete' || status === 'incomplete_expired';
  
  useEffect(() => {
    const sessionId = searchParams.get('session_id');
    const checkoutStatus = searchParams.get('checkout');
    
    if (checkoutStatus === 'success' && sessionId) {
      const verifySession = async () => {
        setVerifying(true);
        try {
          const res = await fetch(`/api/stripe/verify-session?session_id=${sessionId}`);
          const data = await res.json();
          if (data.success) {
            await refreshProfile();
            toast.success("Assinatura confirmada com sucesso!");
            navigate('/dashboard', { replace: true });
          } else {
            toast.error("Ocorreu um erro ao verificar o pagamento. Tente recarregar.");
          }
        } catch (err) {
          console.error("Verification error", err);
          toast.error("Erro ao verificar status do pagamento.");
        } finally {
          setVerifying(false);
        }
      };
      
      verifySession();
    }
  }, [searchParams, navigate, refreshProfile]);
  
  const handleSubscribe = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/stripe/create-checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          teamId: profile?.teamId, 
          email: profile?.email,
          customerName: profile?.name
        }),
      });
      
      const data = await res.json();
      
      if (data.url) {
        window.location.href = data.url; 
      } else {
        toast.error(data.error || "Erro ao gerar checkout. Verifique as chaves do Stripe.");
      }
    } catch (err) {
      toast.error("Falha ao contatar servidor de pagamentos.");
    } finally {
      setLoading(false);
    }
  };

  const handleManageSubscription = async () => {
    setPortalLoading(true);
    try {
      const res = await fetch('/api/stripe/create-portal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ teamId: profile?.teamId }),
      });
      const data = await res.json();
      if (data.url) {
        window.location.href = data.url;
      } else {
        toast.error(data.error || "Erro ao acessar o portal da Stripe.");
      }
    } catch (err) {
      toast.error("Falha ao acessar o portal do cliente.");
    } finally {
      setPortalLoading(false);
    }
  };

  if (verifying) {
    return <div className="h-full flex items-center justify-center bg-zinc-50"><div className="text-center space-y-4"><div className="w-8 h-8 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin mx-auto"></div><p className="text-zinc-600">Verificando sua assinatura...</p></div></div>;
  }

  if (isSubscribed) {
    return (
      <div className="h-full flex flex-col bg-zinc-50 overflow-hidden">
        <div className="flex-1 overflow-y-auto p-4 md:p-8 pb-24">
          <div className="max-w-2xl mx-auto space-y-8 pt-8">
            <Card className="shadow-sm border-zinc-200 bg-white">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-2xl font-bold">Gerenciar Assinatura</CardTitle>
                    <CardDescription>
                      Você está no Plano Pro. 
                    </CardDescription>
                  </div>
                  <div className={`px-3 py-1 rounded-full text-xs font-semibold ${status === 'trialing' ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700'}`}>
                    {status === 'trialing' ? 'Em Período de Teste' : 'Assinatura Ativa'}
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="p-4 bg-zinc-50 rounded-lg border border-zinc-100">
                  <h3 className="font-semibold text-zinc-900 mb-2">Portal do Cliente</h3>
                  <p className="text-sm text-zinc-500 mb-4">
                    Acesse o portal seguro da Stripe para atualizar seus dados de pagamento, visualizar o histórico de faturas, baixar recibos ou cancelar sua assinatura.
                  </p>
                  <Button 
                    onClick={handleManageSubscription} 
                    disabled={portalLoading}
                    className="w-full sm:w-auto gap-2"
                  >
                    <CreditCard className="w-4 h-4" />
                    {portalLoading ? 'Abrindo portal...' : 'Acessar Portal da Stripe'}
                    <ExternalLink className="w-3.5 h-3.5 ml-1 opacity-70" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-zinc-50 overflow-hidden">
      <div className="flex-1 overflow-y-auto p-4 md:p-8 pb-24">
        <div className="max-w-4xl mx-auto space-y-8">
          
          <div className="text-center max-w-2xl mx-auto mb-10">
            {isPastDue ? (
              <>
                <h1 className="text-3xl font-bold tracking-tight text-red-600 mb-3">Pagamento em Atraso</h1>
                <p className="text-base text-zinc-500">
                  A renovação da sua assinatura falhou. Para continuar acessando o sistema, por favor, atualize sua forma de pagamento.
                </p>
              </>
            ) : isCanceled ? (
              <>
                <h1 className="text-3xl font-bold tracking-tight text-zinc-900 mb-3">Assinatura Cancelada</h1>
                <p className="text-base text-zinc-500">
                  Sua assinatura foi cancelada. Assine novamente para reativar seu acesso.
                </p>
              </>
            ) : (
              <>
                <h1 className="text-3xl font-bold tracking-tight text-zinc-900 mb-3">Libere seu Acesso</h1>
                <p className="text-base text-zinc-500">
                  Para acessar a plataforma, inicie seu período de avaliação. Você receberá <b>7 dias gratuitos</b> para testar a plataforma sem compromisso.
                </p>
              </>
            )}
          </div>

          <div className="max-w-md mx-auto">
            <Card className={`shadow-lg border-emerald-500 bg-white relative overflow-hidden ${isPastDue ? 'border-red-500' : ''}`}>
              <div className={`absolute top-0 inset-x-0 h-1 ${isPastDue ? 'bg-red-500' : 'bg-emerald-500'}`}></div>
              
              <CardHeader>
                <CardTitle className="text-xl flex items-center gap-2">
                  <Zap className={`w-5 h-5 ${isPastDue ? 'text-red-500' : 'text-emerald-500'}`} />
                  Plano Pro
                </CardTitle>
                <CardDescription>
                  Para operações que precisam escalar.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div>
                  <div className="flex items-baseline gap-1">
                    <span className="text-sm font-medium text-zinc-500">R$</span>
                    <span className="text-4xl font-bold text-zinc-900">147</span>
                    <span className="text-sm font-medium text-zinc-500">/mês</span>
                  </div>
                  {!hasHistory && (
                    <p className="text-[11px] text-emerald-600 font-medium mt-1">
                      7 dias grátis. Cancele quando quiser.
                    </p>
                  )}
                </div>
                
                <ul className="space-y-3 text-sm text-zinc-600">
                  <li className="flex gap-3 items-center">
                    <Check className={`w-4 h-4 ${isPastDue ? 'text-red-500' : 'text-emerald-500'}`} />
                    <b>Atendentes Ilimitados</b>
                  </li>
                  <li className="flex gap-3 items-center">
                    <Check className={`w-4 h-4 ${isPastDue ? 'text-red-500' : 'text-emerald-500'}`} />
                    Conexão API Oficial (Meta)
                  </li>
                  <li className="flex gap-3 items-center">
                    <Check className={`w-4 h-4 ${isPastDue ? 'text-red-500' : 'text-emerald-500'}`} />
                    Disparo de Campanhas em Massa
                  </li>
                  <li className="flex gap-3 items-center">
                    <Check className={`w-4 h-4 ${isPastDue ? 'text-red-500' : 'text-emerald-500'}`} />
                    Dashboard de Métricas
                  </li>
                </ul>

                {isPastDue ? (
                  <Button 
                    onClick={handleManageSubscription} 
                    disabled={portalLoading}
                    className="w-full bg-red-600 hover:bg-red-700 text-white shadow-md shadow-red-500/20"
                  >
                    <CreditCard className="w-4 h-4 mr-2" />
                    {portalLoading ? 'Abrindo portal...' : 'Regularizar Pagamento'}
                  </Button>
                ) : (
                  <Button 
                    onClick={handleSubscribe} 
                    disabled={loading}
                    className="w-full bg-emerald-600 hover:bg-emerald-700 text-white shadow-md shadow-emerald-500/20"
                  >
                    <CreditCard className="w-4 h-4 mr-2" />
                    {loading ? 'Redirecionando...' : (isCanceled ? 'Reativar Assinatura' : 'Assinar e Iniciar Teste')}
                  </Button>
                )}
                
                <div className="flex items-start gap-2 pt-2">
                  <Shield className="w-4 h-4 text-zinc-400 shrink-0 mt-0.5" />
                  <p className="text-[10px] text-zinc-500 leading-relaxed">
                    Pagamento 100% seguro processado via <b>Stripe</b>. Não armazenamos os dados do seu cartão. {!hasHistory && "Você só será cobrado no 8º dia."}
                  </p>
                </div>
              </CardContent>
            </Card>
          </div>

          {!hasHistory && (
            <div className="max-w-md mx-auto mt-8 bg-zinc-100/50 border border-zinc-200 rounded-xl p-5 flex gap-4 items-start">
              <Info className="w-5 h-5 text-zinc-500 shrink-0" />
              <div className="text-sm text-zinc-600">
                <p className="font-semibold text-zinc-900 mb-1">Como funciona?</p>
                <p>
                  Um cartão de crédito é exigido para ativação, mas <b>nenhum valor será cobrado hoje</b>. Você tem 7 dias completos para usar a plataforma. Se cancelar antes, a cobrança não ocorrerá e o acesso será suspenso ao final dos dias grátis.
                </p>
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}
