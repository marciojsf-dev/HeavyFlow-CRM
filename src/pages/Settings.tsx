import React, { useState, useEffect } from 'react';
import { collection, query, where, getDocs, addDoc, deleteDoc, doc, serverTimestamp } from 'firebase/firestore';
import { db, handleFirestoreError } from '../lib/firebase';
import { useAuth } from '../lib/AuthContext';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { Trash2, Plus, Info, AlertCircle, RefreshCw } from 'lucide-react';

export function Settings() {
  const { profile } = useAuth();
  const [statuses, setStatuses] = useState<any[]>([]);
  const [newStatus, setNewStatus] = useState('');
  const [newStatusColor, setNewStatusColor] = useState('#3b82f6');
  const [loading, setLoading] = useState(false);
  const [dbStatus, setDbStatus] = useState({ connected: false, message: '' });
  const [metaLimit, setMetaLimit] = useState<string | null>(null);
  const [waToken, setWaToken] = useState('');
  const [waPhoneId, setWaPhoneId] = useState('');
  const [waWabaId, setWaWabaId] = useState('');
  const [waVerifyToken, setWaVerifyToken] = useState('heavyflow123');
  const [metaAppId, setMetaAppId] = useState('');
  const [metaAppSecret, setMetaAppSecret] = useState('');
  const [savingConfig, setSavingConfig] = useState(false);
  const isAdmin = profile?.role === 'admin';

  useEffect(() => {
    if (!profile?.teamId) return;
    fetchStatuses();
    checkDbStatus();
    fetchMetaLimits();
    fetchWaConfig();
  }, [profile?.teamId]);

  useEffect(() => {
    (window as any).fbAsyncInit = function() {
      // Defer init until the user clicks login to ensure we use the latest App ID
    };

    (function(d, s, id){
       var js, fjs = d.getElementsByTagName(s)[0];
       if (d.getElementById(id)) {return;}
       js = d.createElement(s) as HTMLScriptElement; js.id = id;
       js.src = "https://connect.facebook.net/pt_BR/sdk.js";
       fjs?.parentNode?.insertBefore(js, fjs);
     }(document, 'script', 'facebook-jssdk'));
  }, []);

  const handleFacebookLogin = () => {
    if (!metaAppId || !metaAppSecret) {
      toast.error("Preencha o ID do Aplicativo e a Chave Secreta primeiro.");
      return;
    }

    if (!(window as any).FB) {
      toast.error("SDK do Facebook não carregado. Recarregue a página.");
      return;
    }

    // Initialize dynamically with the provided App ID right before opening the popup
    (window as any).FB.init({
      appId      : metaAppId,
      cookie     : true,
      xfbml      : true,
      version    : 'v20.0'
    });

    (window as any).FB.login((response: any) => {
      if (response.authResponse) {
        const accessToken = response.authResponse.accessToken;
        // Exchange short-lived token for long-lived one
        toast.info("Trocando token temporário por token permanente...");
        fetch('/api/whatsapp/exchange-token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            teamId: profile?.teamId,
            shortToken: accessToken,
            appId: metaAppId,
            appSecret: metaAppSecret
          })
        }).then(res => res.json()).then(data => {
          if (data.success && data.access_token) {
            setWaToken(data.access_token);
            toast.success("Token Permanente gerado! Clique em Salvar Configurações da Meta.");
          } else {
            toast.error(data.error || "Falha ao gerar token.");
          }
        }).catch(err => {
          toast.error("Erro na comunicação com servidor.");
        });
      } else {
        toast.error("Login cancelado ou não autorizado.");
      }
    }, {
      scope: 'whatsapp_business_management,whatsapp_business_messaging',
      extras: { feature: 'whatsapp_embedded_signup' }
    });
  };

  const fetchWaConfig = async () => {
    if (!profile?.teamId) return;
    try {
      const res = await fetch(`/api/whatsapp-config?teamId=${profile.teamId}`);
      if (res.ok) {
        const data = await res.json();
        if (data.success) {
          setWaToken(data.access_token || '');
          setWaPhoneId(data.phone_number_id || '');
          setWaWabaId(data.business_account_id || '');
          setWaVerifyToken(data.verify_token || 'heavyflow123');
          setMetaAppId(data.meta_app_id || '');
          setMetaAppSecret(data.meta_app_secret || '');
        }
      }
    } catch (err) {
      console.error("Erro ao buscar configuração do WhatsApp:", err);
    }
  };

  const handleSaveWaConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile?.teamId) return;
    setSavingConfig(true);
    try {
      const res = await fetch('/api/whatsapp-config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          teamId: profile.teamId,
          access_token: waToken,
          phone_number_id: waPhoneId,
          business_account_id: waWabaId,
          verify_token: waVerifyToken,
          meta_app_id: metaAppId,
          meta_app_secret: metaAppSecret
        })
      });
      if (res.ok) {
        toast.success("Credenciais da Meta salvas com sucesso!");
        fetchMetaLimits();
      } else {
        toast.error("Erro ao salvar credenciais da Meta.");
      }
    } catch (err: any) {
      toast.error("Erro inesperado: " + err.message);
    } finally {
      setSavingConfig(false);
    }
  };

  const fetchMetaLimits = async () => {
    try {
      const url = profile?.teamId ? `/api/meta-limits?teamId=${profile.teamId}` : '/api/meta-limits';
      const res = await fetch(url);
      const data = await res.json();
      if (data.limit) {
         setMetaLimit(data.limit);
      }
    } catch (err) {
      console.error("Erro ao buscar limites da Meta:", err);
    }
  };

  const checkDbStatus = async () => {
     try {
        const res = await fetch('/api/db-status');
        const data = await res.json();
        setDbStatus(data);
     } catch (err) {
        setDbStatus({ connected: false, message: 'Erro ao verificar banco' });
     }
  };

  const fetchStatuses = async () => {
     if (!profile?.teamId) return;
     try {
        const res = await fetch(`/api/custom-statuses?teamId=${profile.teamId}`);
        if (!res.ok) throw new Error("Erro ao buscar situações");
        const data = await res.json();
        setStatuses(data);
     } catch(err) {
        console.error(err);
        alert("Erro ao buscar situações no PostgreSQL");
     }
  };

  const handleMigrateContacts = async () => {
    if (!profile?.teamId) return;
    setLoading(true);
    try {
      // 1. Fetch from Firestore
      const q = query(collection(db, 'contacts'), where('teamId', '==', profile.teamId));
      const snap = await getDocs(q);
      const fsContacts = snap.docs.map(d => {
         const data = d.data();
         return {
            whatsapp_id: data.phone || d.id,
            name: data.name,
            phone: data.phone,
            team_id: profile.teamId,
            lastMessageAt: data.lastMessageAt?.toMillis ? data.lastMessageAt.toMillis() : null,
            createdAt: data.createdAt?.toMillis ? data.createdAt.toMillis() : (data.createdAt || Date.now())
         }
      });

      // Also migrate templates
      const qt = query(collection(db, 'templates'), where('teamId', '==', profile.teamId));
      const snapT = await getDocs(qt);
      for (const docT of snapT.docs) {
         const data = docT.data();
         await fetch('/api/templates', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
               teamId: profile.teamId,
               name: data.name,
               language: data.language,
               category: data.category,
               status: data.status,
               components: data.components || []
            })
         });
      }

      // Also migrate statuses
      const qs = query(collection(db, 'customStatuses'), where('teamId', '==', profile.teamId));
      const snapS = await getDocs(qs);
      for (const docS of snapS.docs) {
         const data = docS.data();
         await fetch('/api/custom-statuses', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
               teamId: profile.teamId,
               name: data.name,
               color: data.color || '#e4e4e7'
            })
         });
      }

      if (fsContacts.length === 0) {
        toast.info('Nenhum contato encontrado no Firestore. Mas modelos e situações foram verificados.');
        setLoading(false);
        return;
      }

      // 2. Post to API for contacts
      const res = await fetch('/api/contacts/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(fsContacts)
      });
      
      const result = await res.json();
      if (result.success) {
        toast.success(`Sucesso! ${result.count} contatos migrados.`);
        checkDbStatus();
        fetchStatuses();
      } else {
        toast.error('Erro na migração: ' + (result.error || 'Falha na conexão'));
      }
    } catch (err: any) {
      toast.error('Erro inesperado: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateStatus = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile?.teamId || !newStatus.trim()) return;
    setLoading(true);
    try {
      await fetch('/api/custom-statuses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          teamId: profile.teamId,
          name: newStatus.trim(),
          color: newStatusColor
        })
      });
      setNewStatus('');
      fetchStatuses();
    } catch(err) {
      console.error(err);
      toast.error("Erro ao criar situação");
    } finally {
       setLoading(false);
    }
  };

  const handleDeleteStatus = async (id: string | number) => {
     try {
        await fetch(`/api/custom-statuses/${id}`, { method: 'DELETE' });
        fetchStatuses();
     } catch(err) {
        console.error(err);
        alert("Erro ao deletar situação");
     }
  }

   const handleFixIds = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/fix-ids', { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        toast.success(`Correção concluída! ${data.fixedContacts} contatos e ${data.fixedMessages} mensagens normalizados.`);
      } else {
        toast.error('Erro ao corrigir IDs: ' + data.error);
      }
    } catch (err: any) {
      toast.error('Erro na correção: ' + err.message);
    } finally {
      setLoading(false);
    }
   };

  return (
    <div className="flex flex-col h-full bg-zinc-50 overflow-y-auto">
      <div className="w-full max-w-7xl mx-auto p-4 md:p-10 space-y-10">
        <div className="border-b border-zinc-200 pb-6">
           <h1 className="text-3xl font-bold tracking-tight text-zinc-900">Ajustes</h1>
           <p className="text-zinc-500 mt-2 text-lg">Gerencie as configurações da sua plataforma, integrações e banco de dados.</p>
        </div>
  
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          {/* Coluna da Esquerda - Integrações e Status */}
          <div className="lg:col-span-7 space-y-8">
            {isAdmin && (
               <Card className="shadow-md border-zinc-200 overflow-hidden">
                 <div className="bg-zinc-50 px-6 py-4 border-b border-zinc-200">
                    <CardTitle className="text-xl">Banco de Dados PostgreSQL</CardTitle>
                    <CardDescription>Migração de contatos e status da conexão.</CardDescription>
                 </div>
                 <CardContent className="p-6 space-y-6">
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 p-4 rounded-lg bg-white border border-zinc-200">
                       <div className="flex items-center gap-3">
                          <div className={`w-4 h-4 rounded-full shadow-sm ${dbStatus.connected ? 'bg-emerald-500 animate-pulse' : 'bg-red-500'}`} />
                          <div>
                             <p className="text-sm font-semibold text-zinc-900">
                               {dbStatus.connected ? 'Conectado ao PostgreSQL' : 'Desconectado'}
                             </p>
                             <p className="text-xs text-zinc-500">{dbStatus.message || 'Verifique sua DATABASE_URL'}</p>
                          </div>
                       </div>
                       <Button 
                         variant="outline" 
                         size="sm" 
                         onClick={checkDbStatus}
                         className="shrink-0"
                       >
                         Reverificar
                       </Button>
                    </div>
                                        <div className="space-y-4">
                      <div className="text-xs text-amber-800 bg-amber-50 p-4 border border-amber-100 rounded-lg leading-relaxed">
                        <p className="font-bold mb-1 flex items-center">
                          <AlertCircle className="w-4 h-4 mr-1" /> Importante
                        </p>
                        Esta ação sincroniza seus contatos do Firestore para o SQL. Use isto apenas uma vez após configurar seu banco de dados externo pela primeira vez.
                      </div>
        
                      <Button 
                        onClick={handleMigrateContacts} 
                        disabled={loading || !dbStatus.connected}
                        className="w-full h-12 text-base font-medium shadow-sm transition-all hover:scale-[1.01]"
                      >
                        {loading ? 'Processando Migração...' : 'Sincronizar Contatos com SQL'}
                      </Button>

                      <div className="pt-4 mt-4 border-t border-zinc-100">
                        <p className="text-sm font-semibold text-zinc-900 mb-2">Manutenção de Dados</p>
                        <p className="text-xs text-zinc-500 mb-3 leading-relaxed">
                          Se você percebeu que as mensagens estão chegando mas não aparecem na conversa, 
                          pode ser uma inconsistência entre o formato de número com 9 dígitos ou 8 dígitos. 
                          Clique no botão abaixo para normalizar todos os registros.
                        </p>
                        <Button 
                          variant="outline"
                          onClick={handleFixIds}
                          disabled={loading || !dbStatus.connected}
                          className="w-full gap-2"
                        >
                          <RefreshCw className={loading ? "w-4 h-4 animate-spin" : "w-4 h-4"} />
                          Normalizar IDs de Contatos (Correção de 9º Dígito)
                        </Button>
                      </div>
                    </div>
                 </CardContent>
               </Card>
            )}
  
            <Card className="shadow-md border-zinc-200 overflow-hidden">
               <div className="bg-blue-600 px-6 py-4 text-white">
                  <CardTitle className="flex items-center text-xl">
                     <Info className="w-6 h-6 mr-3 opacity-90" />
                     Status da Conta WhatsApp (Meta)
                  </CardTitle>
               </div>
               <CardContent className="p-6">
                  <div className="bg-blue-50 border border-blue-100 rounded-xl p-6 md:p-8 text-center sm:text-left">
                     <div className="text-sm text-blue-700 mb-3 font-semibold uppercase tracking-wider">Limite de Mensagens (24h)</div>
                     <div className="flex flex-col sm:flex-row sm:items-baseline gap-2">
                        <div className="text-4xl md:text-5xl font-extrabold text-blue-900">
                          {metaLimit === 'TIER_50' ? '50' : 
                          metaLimit === 'TIER_250' ? '250' :
                          metaLimit === 'TIER_1K' ? '1.000' :
                          metaLimit === 'TIER_10K' ? '10.000' :
                          metaLimit === 'TIER_100K' ? '100.000' : 
                          metaLimit || '1.000'}
                        </div>
                        <div className="text-blue-700 text-lg md:text-xl font-medium">conversas / dia</div>
                     </div>
                     <div className="mt-6 pt-6 border-t border-blue-200">
                        <p className="text-sm text-blue-800 leading-relaxed">
                          Este é o limite máximo de mensagens que seu número pode enviar para **novas conversas** nas últimas 24 horas. 
                          A Meta aumenta este limite automaticamente conforme você mantém uma boa pontuação de qualidade.
                        </p>
                        <div className="mt-4 inline-flex items-center text-xs font-mono bg-blue-100 text-blue-800 px-3 py-1 rounded-full border border-blue-200">
                           API Status: {metaLimit || 'TIER_UNDETECTED'}
                        </div>
                     </div>
                  </div>

                  {isAdmin && (
                    <div className="mt-8 pt-8 border-t border-zinc-200">
                      <div className="mb-8">
                         <h3 className="text-lg font-bold text-zinc-900 mb-2">Conexão Oficial via OAuth (Coexistência)</h3>
                         <p className="text-sm text-zinc-600 mb-4">
                           Use esta opção para conectar seu WhatsApp via popup do Facebook, permitindo a **Coexistência** (manter o App no celular).
                           Para isso, você precisa configurar um App no Meta for Developers com Login do Facebook ativado.
                         </p>
                         <div className="bg-zinc-50 border border-zinc-200 rounded-lg p-4 space-y-4 mb-4">
                           <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                             <div className="flex flex-col gap-1.5">
                                <label className="text-xs font-bold text-zinc-500 uppercase">ID do Aplicativo (App ID)</label>
                                <Input 
                                  value={metaAppId || ''} 
                                  onChange={e => setMetaAppId(e.target.value)} 
                                  placeholder="Ex: 897276593975" 
                                  className="h-11 font-mono text-sm bg-white" 
                                />
                             </div>
                             <div className="flex flex-col gap-1.5">
                                <label className="text-xs font-bold text-zinc-500 uppercase">Chave Secreta do Aplicativo</label>
                                <Input 
                                  type="password"
                                  value={metaAppSecret || ''} 
                                  onChange={e => setMetaAppSecret(e.target.value)} 
                                  placeholder="Cole o App Secret" 
                                  className="h-11 font-mono text-sm bg-white" 
                                />
                             </div>
                           </div>
                           <Button type="button" onClick={handleFacebookLogin} className="w-full bg-[#1877F2] hover:bg-[#166FE5] text-white">
                             Conectar com Facebook (Gerar Token)
                           </Button>
                         </div>
                      </div>

                      <h3 className="text-lg font-bold text-zinc-900 mb-4">Credenciais da API do WhatsApp Cloud</h3>
                      <form onSubmit={handleSaveWaConfig} className="space-y-4">
                         <div className="flex flex-col gap-1.5">
                            <label className="text-xs font-bold text-zinc-400 uppercase">Token de Acesso (Access Token)</label>
                            <Input 
                              type="password"
                              value={waToken || ''} 
                              onChange={e => setWaToken(e.target.value)} 
                              placeholder="Cole o novo EAAVzm... aqui" 
                              required 
                              className="h-11 font-mono text-sm" 
                            />
                            <p className="text-[10px] text-zinc-400 leading-relaxed">
                              Cole o novo token para substituir o expirado. Ou use o botão "Conectar com Facebook" acima para gerar automaticamente.
                            </p>
                         </div>
                         
                         <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                           <div className="flex flex-col gap-1.5">
                              <label className="text-xs font-bold text-zinc-400 uppercase">ID do Telefone</label>
                              <Input 
                                value={waPhoneId || ''} 
                                onChange={e => setWaPhoneId(e.target.value)} 
                                placeholder="ex: 1222561517599362" 
                                required 
                                className="h-11 font-mono text-sm" 
                              />
                           </div>
                           <div className="flex flex-col gap-1.5">
                              <label className="text-xs font-bold text-zinc-400 uppercase">ID da Conta Comercial (WABA)</label>
                              <Input 
                                value={waWabaId || ''} 
                                onChange={e => setWaWabaId(e.target.value)} 
                                placeholder="ex: 1222561517599363" 
                                required 
                                className="h-11 font-mono text-sm" 
                              />
                           </div>
                         </div>

                         <div className="flex flex-col gap-1.5">
                            <label className="text-xs font-bold text-zinc-400 uppercase">Token de Verificação do Webhook</label>
                            <Input 
                              value={waVerifyToken || ''} 
                              onChange={e => setWaVerifyToken(e.target.value)} 
                              placeholder="ex: heavyflow123" 
                              required 
                              className="h-11 font-mono text-sm" 
                            />
                         </div>

                         <Button type="submit" disabled={savingConfig} className="w-full h-11 shadow-sm font-semibold mt-2">
                           {savingConfig ? "Salvando..." : "Salvar Configurações da Meta"}
                         </Button>
                      </form>
                    </div>
                  )}
               </CardContent>
            </Card>
          </div>
  
          {/* Coluna da Direita - Configurações de Negócio */}
          <div className="lg:col-span-5 space-y-8">
            {isAdmin && (
               <Card className="shadow-md border-zinc-200">
                 <CardHeader className="px-6 py-5 border-b border-zinc-100 bg-zinc-50/50">
                   <CardTitle className="text-lg font-bold">Funis e Situações</CardTitle>
                   <CardDescription>Crie estados personalizados para organizar suas conversas na Inbox.</CardDescription>
                 </CardHeader>
                 <CardContent className="p-6">
                   <form onSubmit={handleCreateStatus} className="space-y-4 mb-8">
                      <div className="flex flex-col gap-1.5">
                         <label className="text-xs font-bold text-zinc-400 uppercase">Nome da Situação</label>
                         <Input 
                           value={newStatus} 
                           onChange={e => setNewStatus(e.target.value)} 
                           placeholder="Ex: Lead Quente, Orçamento..." 
                           required 
                           className="h-11" 
                         />
                      </div>
                      
                      <div className="flex flex-col sm:flex-row items-end gap-3">
                        <div className="flex flex-col gap-1.5 flex-1 w-full">
                           <label className="text-xs font-bold text-zinc-400 uppercase">Cor da Situação</label>
                           <div className="flex items-center gap-2 bg-white border border-zinc-200 px-3 rounded-md h-11 w-full">
                              <input 
                                type="color" 
                                value={newStatusColor} 
                                onChange={e => setNewStatusColor(e.target.value)}
                                className="w-8 h-8 rounded cursor-pointer border-none p-0 bg-transparent shrink-0"
                              />
                              <Input 
                                value={newStatusColor}
                                onChange={e => setNewStatusColor(e.target.value)}
                                className="border-none shadow-none focus-visible:ring-0 flex-1 font-mono text-sm uppercase"
                                placeholder="#000000"
                              />
                           </div>
                        </div>
                        
                        <Button type="submit" disabled={loading} className="h-11 px-8 shadow-sm font-semibold w-full sm:w-auto">
                          <Plus className="w-5 h-5 mr-2" /> Adicionar
                        </Button>
                      </div>
                   </form>
                   
                   <div className="space-y-3 max-h-[500px] overflow-y-auto pr-2 custom-scrollbar">
                      {statuses.length === 0 && (
                        <div className="text-center py-10 bg-zinc-100 rounded-lg border border-dashed border-zinc-300">
                          <p className="text-sm text-zinc-400">Nenhuma situação cadastrada.</p>
                        </div>
                      )}
                      {statuses.map(s => (
                         <div key={s.id} className="group flex items-center justify-between p-4 bg-white border border-zinc-200 rounded-xl hover:shadow-md transition-all">
                            <div className="flex items-center gap-3">
                               <div 
                                 className="w-3 h-8 rounded-full" 
                                 style={{ backgroundColor: s.color || '#3b82f6' }}
                               />
                               <div className="flex flex-col">
                                  <span className="font-semibold text-zinc-800">{s.name}</span>
                                  <span className="text-[10px] text-zinc-400 font-mono uppercase">{s.color || '#3b82f6'}</span>
                               </div>
                            </div>
                            <div className="flex items-center gap-2">
                               <input 
                                 type="color" 
                                 value={s.color || '#3b82f6'}
                                 onChange={async (e) => {
                                    const nextColor = e.target.value;
                                    if (nextColor === s.color) return;
                                    try {
                                       await fetch(`/api/custom-statuses/${s.id}`, {
                                          method: 'PUT',
                                          headers: { 'Content-Type': 'application/json' },
                                          body: JSON.stringify({ color: nextColor })
                                       });
                                       fetchStatuses();
                                       toast.success("Cor atualizada!");
                                    } catch (err) { toast.error("Erro ao atualizar cor"); }
                                 }}
                                 className="w-10 h-10 rounded-lg cursor-pointer border-2 border-zinc-100 p-0 bg-transparent transition-all hover:scale-110 shadow-sm shrink-0"
                                 title="Mudar cor desta situação"
                               />
                               <Button 
                                 variant="ghost" 
                                 size="icon" 
                                 onClick={() => handleDeleteStatus(s.id)} 
                                 className="text-zinc-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                               >
                                  <Trash2 className="w-5 h-5" />
                               </Button>
                            </div>
                         </div>
                      ))}
                   </div>
                 </CardContent>
               </Card>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
