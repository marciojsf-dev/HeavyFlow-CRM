import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { 
  Facebook, 
  Smartphone, 
  MessageCircle, 
  ShieldCheck, 
  CheckCircle2, 
  ArrowRight, 
  Settings as SettingsIcon,
  RefreshCw,
  Zap,
  HelpCircle,
  ExternalLink,
  Lock
} from 'lucide-react';
import { useAuth } from '../lib/AuthContext';
import { Link } from 'react-router-dom';

declare global {
  interface Window {
    FB?: any;
    fbAsyncInit?: () => void;
  }
}

export function WhatsAppConnect() {
  const { profile } = useAuth();
  const [isConnecting, setIsConnecting] = useState(false);
  const [loadingConfig, setLoadingConfig] = useState(true);
  const [waConfig, setWaConfig] = useState<{
    phone_number_id?: string;
    waba_id?: string;
    app_id?: string;
    app_secret?: string;
    connected?: boolean;
  }>({});

  const [customAppId, setCustomAppId] = useState('');
  const [customConfigId, setCustomConfigId] = useState('');
  const [showAdvanced, setShowAdvanced] = useState(false);

  // Load existing config
  const fetchConfig = async () => {
    if (!profile?.teamId) return;
    setLoadingConfig(true);
    try {
      const res = await fetch(`/api/whatsapp-config?teamId=${profile.teamId}`);
      const data = await res.json();
      if (data) {
        const wabaVal = data.waba_id || data.business_account_id || '';
        const phoneVal = data.phone_number_id || '';
        const tokenVal = data.access_token || '';
        
        setWaConfig({
          phone_number_id: phoneVal,
          waba_id: wabaVal,
          app_id: data.meta_app_id || data.app_id || '',
          app_secret: data.meta_app_secret || data.app_secret || '',
          connected: !!(tokenVal && phoneVal)
        });
        if (data.meta_app_id || data.app_id) {
          setCustomAppId(data.meta_app_id || data.app_id);
        }
      }
    } catch (err) {
      console.error('Error fetching WhatsApp config:', err);
    } finally {
      setLoadingConfig(false);
    }
  };

  useEffect(() => {
    fetchConfig();
  }, [profile?.teamId]);

  // Load Facebook SDK
  useEffect(() => {
    if (window.FB) return;

    window.fbAsyncInit = function() {
      // SDK loaded
    };

    const scriptId = 'facebook-jssdk';
    if (!document.getElementById(scriptId)) {
      const js = document.createElement('script');
      js.id = scriptId;
      js.src = 'https://connect.facebook.net/pt_BR/sdk.js';
      js.async = true;
      js.defer = true;
      document.body.appendChild(js);
    }

    // Message listener for Meta Embedded Signup session events
    const handleMessage = async (event: MessageEvent) => {
      if (event.origin !== 'https://www.facebook.com' && event.origin !== 'https://web.facebook.com') return;

      try {
        const payload = typeof event.data === 'string' ? JSON.parse(event.data) : event.data;
        if (payload.type === 'WA_EMBEDDED_SIGNUP') {
          if (payload.event === 'FINISH') {
            const { phone_number_id, waba_id } = payload.data || {};
            toast.success('Número do WhatsApp vinculado com sucesso!');
            
            // Save received identifiers to backend
            if (phone_number_id || waba_id) {
              await fetch('/api/whatsapp-config', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  teamId: profile?.teamId,
                  phone_number_id,
                  waba_id
                })
              });
              fetchConfig();
            }
          } else if (payload.event === 'CANCEL') {
            toast.info('Processo de conexão cancelado.');
          } else if (payload.event === 'ERROR') {
            toast.error('Ocorreu um erro no cadastro do WhatsApp na Meta.');
          }
        }
      } catch (e) {
        // Non-JSON message, ignore
      }
    };

    window.addEventListener('message', handleMessage);
    return () => {
      window.removeEventListener('message', handleMessage);
    };
  }, [profile?.teamId]);

  const handleConnectFacebook = async () => {
    const appIdToUse = customAppId || waConfig.app_id;

    if (!appIdToUse) {
      toast.error('Informe o App ID da Meta para iniciar a conexão.');
      setShowAdvanced(true);
      return;
    }

    if (!window.FB) {
      toast.error('O SDK do Facebook ainda está carregando. Aguarde alguns instantes e tente novamente.');
      return;
    }

    setIsConnecting(true);

    try {
      window.FB.init({
        appId: appIdToUse,
        cookie: true,
        xfbml: true,
        version: 'v21.0'
      });

      const loginOptions: any = {
        scope: 'whatsapp_business_management,whatsapp_business_messaging',
        extras: {
          feature: 'whatsapp_embedded_signup',
          sessionInfoVersion: '2'
        }
      };

      if (customConfigId) {
        loginOptions.config_id = customConfigId;
        loginOptions.response_type = 'code';
        loginOptions.override_default_response_type = true;
      }

      window.FB.login(async (response: any) => {
        setIsConnecting(false);

        if (response.authResponse) {
          const accessToken = response.authResponse.accessToken;
          const code = response.authResponse.code;

          toast.loading('Processando autorização da Meta...');

          // If we have an app_secret configured or access token, exchange token
          if (accessToken) {
            try {
              const exchangeRes = await fetch('/api/whatsapp/exchange-token', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  teamId: profile?.teamId,
                  shortToken: accessToken,
                  appId: appIdToUse,
                  appSecret: waConfig.app_secret || ''
                })
              });
              const exchangeData = await exchangeRes.json();
              
              if (exchangeData.success && exchangeData.access_token) {
                // Save long-lived token
                await fetch('/api/whatsapp-config', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    teamId: profile?.teamId,
                    access_token: exchangeData.access_token,
                    app_id: appIdToUse
                  })
                });
                toast.dismiss();
                toast.success('Conectado à Meta com sucesso!');
                fetchConfig();
              } else {
                toast.dismiss();
                toast.success('Login concluído! Atualizando conexão...');
                fetchConfig();
              }
            } catch (err) {
              toast.dismiss();
              toast.error('Erro ao registrar credenciais.');
            }
          } else {
            toast.dismiss();
            toast.success('Autorização concedida na Meta!');
            fetchConfig();
          }
        } else {
          toast.info('Login com Facebook não concluído.');
        }
      }, loginOptions);
    } catch (err: any) {
      setIsConnecting(false);
      toast.error('Erro ao abrir janela de login da Meta: ' + (err.message || ''));
    }
  };

  return (
    <div className="h-full flex flex-col bg-zinc-50 overflow-hidden" id="whatsapp-connect-page">
      <div className="flex-1 overflow-y-auto p-4 md:p-8 pb-24">
        <div className="max-w-3xl mx-auto space-y-8">
          
          <div className="flex flex-col gap-2 text-center items-center mb-6 pt-4" id="whatsapp-connect-header">
            <div className="w-14 h-14 bg-emerald-100 text-emerald-600 rounded-2xl flex items-center justify-center mb-1 shadow-sm">
              <MessageCircle className="w-7 h-7" />
            </div>
            <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-zinc-900">Conectar WhatsApp Business</h1>
            <p className="text-sm md:text-base text-zinc-500 max-w-lg mx-auto">
              Vincule seu número oficial ao HeavyFlow através do fluxo de Cadastro Incorporado da Meta (Coexistência).
            </p>
          </div>

          {/* Status Banner when Connected */}
          {!loadingConfig && waConfig.connected && (
            <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center justify-between shadow-sm" id="whatsapp-connected-banner">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-600">
                  <CheckCircle2 className="w-6 h-6" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <p className="font-semibold text-emerald-950 text-sm">WhatsApp Conectado e Ativo</p>
                    <Badge variant="outline" className="bg-emerald-100 text-emerald-800 border-emerald-300 text-xs">
                      Oficial Cloud API
                    </Badge>
                  </div>
                  <p className="text-xs text-emerald-700 mt-0.5">
                    Phone ID: <code className="font-mono">{waConfig.phone_number_id}</code> | WABA ID: <code className="font-mono">{waConfig.waba_id}</code>
                  </p>
                </div>
              </div>
              <Button variant="outline" size="sm" onClick={fetchConfig} className="text-xs bg-white text-zinc-700">
                <RefreshCw className="w-3.5 h-3.5 mr-1" /> Atualizar
              </Button>
            </div>
          )}

          {/* Main Card */}
          <Card className="shadow-sm border-zinc-200 bg-white overflow-hidden" id="whatsapp-connect-card">
            <div className="bg-gradient-to-r from-blue-600 to-indigo-700 p-6 md:p-8 text-white text-center flex flex-col items-center gap-3 relative overflow-hidden">
              <div className="absolute top-0 right-0 -mt-8 -mr-8 w-32 h-32 bg-white opacity-10 rounded-full blur-2xl pointer-events-none"></div>
              <div className="absolute bottom-0 left-0 -mb-8 -ml-8 w-24 h-24 bg-blue-400 opacity-20 rounded-full blur-xl pointer-events-none"></div>
              <Facebook className="w-10 h-10 relative z-10" />
              <div className="relative z-10">
                <h2 className="text-xl md:text-2xl font-bold mb-1">Login Oficial com Facebook</h2>
                <p className="text-blue-100 text-xs md:text-sm max-w-md mx-auto leading-relaxed">
                  Conecte sua conta do WhatsApp Business existente ou crie uma nova em poucos cliques sem perder seu histórico.
                </p>
              </div>
            </div>
            
            <CardContent className="p-6 md:p-8 space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                <div className="flex flex-col items-center text-center gap-2 p-3 rounded-lg bg-zinc-50 border border-zinc-100">
                  <div className="w-10 h-10 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center mb-0.5">
                    <Smartphone className="w-5 h-5" />
                  </div>
                  <h3 className="font-semibold text-zinc-900 text-sm">Use seu Número</h3>
                  <p className="text-xs text-zinc-500">Mantenha seu número de atendimento sem interrupções de serviço.</p>
                </div>
                <div className="flex flex-col items-center text-center gap-2 p-3 rounded-lg bg-zinc-50 border border-zinc-100">
                  <div className="w-10 h-10 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center mb-0.5">
                    <ShieldCheck className="w-5 h-5" />
                  </div>
                  <h3 className="font-semibold text-zinc-900 text-sm">100% Oficial</h3>
                  <p className="text-xs text-zinc-500">Sem risco de bloqueios por ferramentas não autorizadas de QR Code.</p>
                </div>
                <div className="flex flex-col items-center text-center gap-2 p-3 rounded-lg bg-zinc-50 border border-zinc-100">
                  <div className="w-10 h-10 rounded-full bg-purple-50 text-purple-600 flex items-center justify-center mb-0.5">
                    <Zap className="w-5 h-5" />
                  </div>
                  <h3 className="font-semibold text-zinc-900 text-sm">Configuração Rápida</h3>
                  <p className="text-xs text-zinc-500">Webhooks e permissões vinculados de forma automática pela Meta.</p>
                </div>
              </div>

              {/* Advanced / Custom App ID Setup */}
              <div className="border-t border-zinc-100 pt-4">
                <button
                  type="button"
                  onClick={() => setShowAdvanced(!showAdvanced)}
                  className="text-xs font-medium text-blue-600 hover:text-blue-700 flex items-center gap-1 mx-auto"
                >
                  <SettingsIcon className="w-3.5 h-3.5" />
                  {showAdvanced ? 'Ocultar configurações do App ID' : 'Configurar App ID da Meta'}
                </button>

                {showAdvanced && (
                  <div className="mt-4 p-4 bg-zinc-50 rounded-xl border border-zinc-200 space-y-3">
                    <div>
                      <label className="text-xs font-semibold text-zinc-700 mb-1 block">
                        Meta App ID (ID do Aplicativo no Meta for Developers)
                      </label>
                      <Input
                        placeholder="Ex: 123456789012345"
                        value={customAppId}
                        onChange={(e) => setCustomAppId(e.target.value)}
                        className="bg-white text-sm"
                      />
                    </div>
                    <div>
                      <label className="text-xs font-semibold text-zinc-700 mb-1 block">
                        Configuration ID (Opcional - Login de Cliente do WhatsApp)
                      </label>
                      <Input
                        placeholder="Ex: 987654321098765"
                        value={customConfigId}
                        onChange={(e) => setCustomConfigId(e.target.value)}
                        className="bg-white text-sm"
                      />
                    </div>
                    <p className="text-[11px] text-zinc-500">
                      Você pode obter esses valores criando um Aplicativo Comercial em{' '}
                      <a 
                        href="https://developers.facebook.com/apps" 
                        target="_blank" 
                        rel="noreferrer"
                        className="text-blue-600 hover:underline inline-flex items-center gap-0.5"
                      >
                        developers.facebook.com <ExternalLink className="w-3 h-3" />
                      </a>
                    </p>
                  </div>
                )}
              </div>
            </CardContent>

            <div className="px-6 md:px-8 pb-8 pt-2 flex flex-col items-center justify-center border-t border-zinc-100 bg-zinc-50/50" id="whatsapp-connect-action-area">
              <Button 
                size="lg" 
                id="btn-facebook-login"
                className="w-full md:w-auto px-8 gap-2 bg-blue-600 hover:bg-blue-700 text-white shadow-md shadow-blue-600/20 text-sm font-medium"
                onClick={handleConnectFacebook}
                disabled={isConnecting}
              >
                {isConnecting ? (
                  <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                ) : (
                  <>
                    <Facebook className="w-4 h-4" />
                    {waConfig.connected ? 'Reconectar com Facebook' : 'Continuar com Facebook'}
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </Button>

              <div className="flex items-center gap-2 mt-4 text-[11px] text-zinc-500 text-center">
                <Lock className="w-3 h-3 text-zinc-400" />
                <span>Conexão criptografada e segura diretamente com a infraestrutura da Meta.</span>
              </div>
            </div>
          </Card>

          {/* Direct link to Settings */}
          <div className="text-center">
            <Link 
              to="/settings" 
              className="text-xs text-zinc-500 hover:text-zinc-800 transition-colors inline-flex items-center gap-1.5"
            >
              <SettingsIcon className="w-3.5 h-3.5" />
              Prefere inserir Token e IDs manualmente? Acesse Ajustes
            </Link>
          </div>

        </div>
      </div>
    </div>
  );
}
