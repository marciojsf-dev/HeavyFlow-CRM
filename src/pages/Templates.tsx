import React, { useEffect, useState } from 'react';
import { useAuth } from '../lib/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { PlusCircle, Edit, Send, RefreshCw } from 'lucide-react';
import { TemplateEditor } from './TemplateEditor';
import { io } from 'socket.io-client';

interface Template {
  id: string;
  name: string;
  language: string;
  category: 'UTILITY' | 'MARKETING' | 'AUTHENTICATION';
  status: 'DRAFT' | 'PENDING' | 'APPROVED' | 'REJECTED';
  components: any[];
}

export function Templates() {
  const { profile } = useAuth();
  const [templates, setTemplates] = useState<Template[]>([]);
  const [isNewOpen, setIsNewOpen] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<Template | null>(null);
  const [loading, setLoading] = useState<string | null>(null);

  const effectiveTeamId = profile?.teamId || 'team_ivw2d5s3u';

  useEffect(() => {
    fetchTemplates();

    const socket = io();
    socket.on("templates:synced", () => {
      fetchTemplates();
    });
    socket.on("templates:updated", (data: any) => {
      console.log("Template status/category updated via Meta webhook:", data);
      fetchTemplates();
    });

    return () => {
      socket.disconnect();
    };
  }, [profile?.teamId]);

  const fetchTemplates = async () => {
    try {
      const res = await fetch(`/api/templates?teamId=${effectiveTeamId}`);
      if (!res.ok) throw new Error("Falha ao buscar modelos");
      const data = await res.json();
      setTemplates(data as Template[]);
    } catch (err) {
      console.error(err);
      toast.error("Erro ao buscar modelos");
    }
  };

  const submitForApproval = async (template: Template) => {
     setLoading(template.id);
     try {
        // Use saved variables from the document if available
        const savedVars = (template as any).variables || {};
        
        const bodyText = template.components?.find((c: any) => c.type === 'BODY')?.text || '';
        const headerText = template.components?.find((c: any) => c.type === 'HEADER')?.text || '';
        
        const bodyVars = bodyText.match(/\{\{\d+\}\}/g) || [];
        const headerVars = headerText.match(/\{\{\d+\}\}/g) || [];
        const footerText = template.components?.find((c: any) => c.type === 'FOOTER')?.text || '';

        // Meta validation
        if (/^\{\{\d+\}\}/.test(bodyText.trim())) {
           throw new Error(`As variáveis não podem estar no início do corpo.`);
        }
        if (/\{\{\d+\}\}$/.test(bodyText.trim())) {
           throw new Error(`As variáveis não podem estar no final do corpo.`);
        }
        if (headerText && (/^\{\{\d+\}\}/.test(headerText.trim()) || /\{\{\d+\}\}$/.test(headerText.trim()))) {
           throw new Error(`As variáveis não podem estar no início ou fim do cabeçalho.`);
        }
        if (footerText && footerText.match(/\{\{\d+\}\}/g)) {
           throw new Error(`As variáveis não são permitidas no Rodapé.`);
        }
        
        const bodyExampleValues = bodyVars.map(m => savedVars[m] || 'Exemplo');
        const headerExampleValues = headerVars.map(m => savedVars[m] || 'Exemplo');

        const examples = {
           body: bodyExampleValues.length > 0 ? [bodyExampleValues] : undefined,
           header: headerExampleValues.length > 0 ? headerExampleValues : undefined
        };

        const metaPayload = {
           id: template.id,
           name: template.name,
           category: template.category,
           language: template.language,
           components: template.components,
           examples,
           teamId: effectiveTeamId
        };

        const res = await fetch('/api/templates/register', {
           method: 'POST',
           headers: { 'Content-Type': 'application/json' },
           body: JSON.stringify(metaPayload)
        });

        const metaResult = await res.json();
        if (!metaResult.success) {
           throw new Error(metaResult.error || 'Erro meta API');
        }

        // Update PG
        await fetch(`/api/templates/${template.id}`, {
           method: 'PUT',
           headers: { 'Content-Type': 'application/json' },
           body: JSON.stringify({ status: 'PENDING' })
        });
        
        toast.success("Enviado para a Meta com sucesso!");
        await fetchTemplates();
     } catch (err: any) {
        console.error(err);
        toast.error("Erro ao enviar para Meta: " + err.message);
     } finally {
        setLoading(null);
     }
  };

  const syncTemplatesWithMeta = async () => {
    setLoading('syncing');
    try {
      const response = await fetch(`/api/templates/sync?teamId=${effectiveTeamId}`, { method: 'POST' });
      const data = await response.json();
      if (!data.success) throw new Error(data.error);

      if (data.templates) {
         toast.success(`Sincronização concluída! Categorias e status oficiais da Meta atualizados.`);
      }
      await fetchTemplates();
    } catch (err: any) {
      toast.error("Erro ao sincronizar com a Meta: " + err.message);
    } finally {
      setLoading(null);
    }
  };

  if (isNewOpen) {
     return <TemplateEditor onClose={() => setIsNewOpen(false)} onSaved={() => {
        setIsNewOpen(false);
        fetchTemplates();
     }} />;
  }

  if (editingTemplate) {
     return <TemplateEditor 
              template={editingTemplate}
              onClose={() => setEditingTemplate(null)} 
              onSaved={() => {
                 setEditingTemplate(null);
                 fetchTemplates();
              }} 
            />;
  }

  return (
    <div className="flex flex-col h-full bg-zinc-50 p-8 space-y-6 overflow-y-auto w-full max-w-7xl mx-auto">
       <div className="flex justify-between items-center">
          <div>
              <h1 className="text-2xl font-bold tracking-tight">Modelos de Mensagem</h1>
              <p className="text-zinc-500 text-sm mt-1">Crie templates ricos com botões para a Meta.</p>
          </div>
          
          <div className="flex gap-2">
             <Button variant="outline" onClick={syncTemplatesWithMeta} disabled={loading === 'syncing'}>
                <RefreshCw className={`w-4 h-4 mr-2 ${loading === 'syncing' ? 'animate-spin' : ''}`} /> Sincronizar
             </Button>
             <Button className="bg-emerald-600 hover:bg-emerald-700" onClick={() => setIsNewOpen(true)}>
                <PlusCircle className="w-4 h-4 mr-2" /> Novo Modelo
             </Button>
          </div>
       </div>

       <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {templates.length === 0 ? (
             <div className="col-span-full py-12 text-center text-zinc-500 border border-dashed rounded-xl bg-white">
                Nenhum modelo cadastrado.
             </div>
          ) : templates.map(t => {
             const body = t.components?.find((c: any) => c.type === 'BODY')?.text || '';
             const footer = t.components?.find((c: any) => c.type === 'FOOTER')?.text || '';
             const btns = t.components?.find((c: any) => c.type === 'BUTTONS')?.buttons || [];
             
             const categoryMap: Record<string, { label: string; className: string }> = {
                MARKETING: { label: 'Marketing', className: 'bg-purple-50 text-purple-700 border-purple-200' },
                UTILITY: { label: 'Utilidade', className: 'bg-blue-50 text-blue-700 border-blue-200' },
                AUTHENTICATION: { label: 'Autenticação', className: 'bg-amber-50 text-amber-700 border-amber-200' }
             };
             const statusMap: Record<string, string> = {
                DRAFT: 'Rascunho Local',
                PENDING: 'Em Análise Meta',
                APPROVED: 'Aprovado Meta',
                REJECTED: 'Rejeitado Meta'
             };

             const catInfo = categoryMap[t.category] || { label: t.category, className: 'bg-zinc-100 text-zinc-700 border-zinc-200' };

              return (
               <Card key={t.id} className="shadow-sm flex flex-col group border border-zinc-200/80 hover:border-zinc-300 transition-colors">
                  <CardHeader className="pb-3 border-b border-zinc-100 mb-0 bg-white rounded-t-xl shrink-0">
                     <div className="flex justify-between items-start mb-2">
                        <CardTitle className="text-sm font-semibold truncate pr-2" title={t.name}>{t.name}</CardTitle>
                         <Badge 
                           variant={t.status === 'APPROVED' ? 'default' : (t.status === 'REJECTED' ? 'destructive' : (t.status === 'PENDING' ? 'secondary' : 'outline'))}
                           className={
                             t.status === 'APPROVED' ? 'bg-emerald-500 text-white hover:bg-emerald-600 shrink-0' : 
                             t.status === 'PENDING' ? 'bg-amber-500 text-white hover:bg-amber-600 shrink-0' : 
                             t.status === 'DRAFT' ? 'bg-zinc-100 text-zinc-600 border-zinc-200 shrink-0' : 'shrink-0'
                           }
                         >
                            {statusMap[t.status] || t.status}
                        </Badge>
                     </div>
                     <div className="flex gap-2 text-[10px]">
                        <Badge variant="outline" className={`font-medium ${catInfo.className}`}>{catInfo.label}</Badge>
                        <Badge variant="outline" className="font-normal text-zinc-500">{t.language === 'pt_BR' ? 'Português (BR)' : t.language === 'en_US' ? 'Inglês (US)' : t.language}</Badge>
                     </div>
                  </CardHeader>
                  <CardContent className="flex-1 bg-[#efeae2]/40 p-3 max-h-[300px] overflow-y-auto">
                     {/* WhatsApp bubble style preview */}
                     <div className="flex justify-start">
                        <div className="bg-white rounded-lg shadow-sm relative rounded-tl-none w-full max-w-[90%] before:content-[''] before:absolute before:top-0 before:-left-2 before:border-[8px] before:border-transparent before:border-r-white before:border-t-white ml-2">
                           <div className="p-2 space-y-1">
                              {body && <p className="text-[13px] whitespace-pre-wrap leading-relaxed text-zinc-800 font-sans">{body}</p>}
                              {footer && <p className="text-[11px] text-zinc-400 mt-1 shadow-none bg-transparent">{footer}</p>}
                           </div>
                           {btns.length > 0 && (
                             <div className="border-t border-zinc-100 flex flex-col pb-0.5">
                                {btns.map((btn: any, i: number) => (
                                   <div key={i} className={`py-1.5 text-center text-[#00a884] font-medium text-[13px] ${i > 0 ? 'border-t border-zinc-100' : ''}`}>
                                      {btn.text}
                                   </div>
                                ))}
                             </div>
                           )}
                        </div>
                     </div>
                  </CardContent>
                  
                  <div className="p-3 border-t bg-white rounded-b-xl flex gap-2">
                      <Button 
                        variant="outline" 
                        size="sm" 
                        className="flex-1 text-xs h-8"
                        onClick={() => setEditingTemplate(t)}
                      >
                         <Edit className="w-3 h-3 mr-1.5" /> Editar
                      </Button>
                      
                      {(t.status === 'DRAFT' || t.status === 'REJECTED') && (
                         <Button 
                           size="sm" 
                           className="flex-1 text-xs h-8 bg-emerald-600 hover:bg-emerald-700 text-white"
                           disabled={loading === t.id}
                           onClick={() => submitForApproval(t)}
                         >
                            {loading === t.id ? 'Enviando...' : <><Send className="w-3 h-3 mr-1.5" /> Enviar Meta</>}
                         </Button>
                      )}

                      {t.status === 'PENDING' && (
                         <Button 
                           size="sm" 
                           variant="outline"
                           className="flex-1 text-xs h-8 text-amber-700 border-amber-300 hover:bg-amber-50"
                           disabled={loading === 'syncing'}
                           onClick={syncTemplatesWithMeta}
                         >
                            <RefreshCw className={`w-3 h-3 mr-1.5 ${loading === 'syncing' ? 'animate-spin' : ''}`} /> Checar Meta
                         </Button>
                      )}
                  </div>
               </Card>
             );
          })}
       </div>
    </div>
  )
}
