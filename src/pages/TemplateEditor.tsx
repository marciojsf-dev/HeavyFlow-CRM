import React, { useState, useEffect } from 'react';
import { collection, addDoc, serverTimestamp, doc, updateDoc, setDoc } from 'firebase/firestore';
import { db, handleFirestoreError } from '../lib/firebase';
import { useAuth } from '../lib/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from '@/components/ui/dropdown-menu';
import { Badge } from '@/components/ui/badge';
import { ArrowLeft, Bold, Italic, Strikethrough, Code, Smile, Plus, Trash2, Smartphone, ExternalLink, Phone, MessageSquare, Ban } from 'lucide-react';
import { Toggle } from '@/components/ui/toggle';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

interface Props {
  template?: any;
  onClose: () => void;
  onSaved: () => void;
}

export function TemplateEditor({ template, onClose, onSaved }: Props) {
  const { profile } = useAuth();
  const [loading, setLoading] = useState(false);
  const [name, setName] = useState(template?.name || '');
  const [category, setCategory] = useState(template?.category || 'MARKETING');
  const [language] = useState('pt_BR');
  
  const initialHeader = template?.components?.find((c: any) => c.type === 'HEADER')?.text || '';
  const initialBody = template?.components?.find((c: any) => c.type === 'BODY')?.text || '';
  const initialFooter = template?.components?.find((c: any) => c.type === 'FOOTER')?.text || '';
  const initialButtons = template?.components?.find((c: any) => c.type === 'BUTTONS')?.buttons || [];
  const initialVariables = template?.variables || {};

  const [headerText, setHeaderText] = useState(initialHeader);
  const [bodyText, setBodyText] = useState(initialBody);
  const [footerText, setFooterText] = useState(initialFooter);
  const [buttons, setButtons] = useState<any[]>(initialButtons);
  const [variables, setVariables] = useState<Record<string, string>>(initialVariables);

  useEffect(() => {
    // Extrair variáveis {{1}}, {{2}} de todos os campos (Header e Body)
    const bodyVars = bodyText.match(/\{\{\d+\}\}/g) || [];
    const headerVars = headerText.match(/\{\{\d+\}\}/g) || [];
    const allVars = [...new Set([...headerVars, ...bodyVars])];
    
    if (footerText.match(/\{\{\d+\}\}/g)) {
       console.warn("Meta não suporta variáveis no rodapé.");
    }

    setVariables(prev => {
       const next: Record<string, string> = {};
       allVars.forEach(v => {
          next[v] = prev[v] || '';
       });
       return next;
    });
  }, [headerText, bodyText, footerText]);

  const saveTemplate = async (status: string) => {
    if (!profile?.teamId) {
       alert("Sessão expirada. Faça login novamente.");
       return;
    }
    if (!name.trim()) {
       alert("O nome do modelo é obrigatório.");
       return;
    }
    if (!bodyText.trim()) {
       alert("O corpo da mensagem é obrigatório.");
       return;
    }

    setLoading(true);
    
    try {
      const sanitizedName = name.toLowerCase().trim().replace(/[^a-z0-9_]/g, '_');
      const components: any[] = [];
      
      if (headerText.trim()) {
         components.push({ type: 'HEADER', format: 'TEXT', text: headerText.trim() });
      }
      
      components.push({ type: 'BODY', text: bodyText.trim() });
      
      if (footerText.trim()) {
         components.push({ type: 'FOOTER', text: footerText.trim() });
      }
      
      if (buttons.length > 0) {
         components.push({ 
           type: 'BUTTONS', 
           buttons: buttons.filter(b => b.text.trim()).map(b => ({ 
             type: b.type, 
             text: b.text.trim(), 
             url: b.url?.trim(), 
             phone_number: b.phone_number?.trim() 
           })) 
         });
      }

      // Save to PostgreSQL
      const templateData = {
        teamId: profile.teamId,
        name: sanitizedName,
        language,
        category,
        status: status === 'PENDING' ? 'PENDING' : 'DRAFT',
        components,
        variables,
      };

      let currentId = template?.id;
      if (currentId) {
         await fetch(`/api/templates/${currentId}`, {
           method: 'PUT',
           headers: { 'Content-Type': 'application/json' },
           body: JSON.stringify(templateData)
         });
      } else {
         const res = await fetch('/api/templates', {
           method: 'POST',
           headers: { 'Content-Type': 'application/json' },
           body: JSON.stringify(templateData)
         });
         const saved = await res.json();
         currentId = saved.id;
      }

    if (status === 'PENDING') {
         // Validação antes do envio
         const emptyVars = Object.keys(variables).filter(v => !variables[v].trim());
         if (emptyVars.length > 0) {
            throw new Error(`A Meta exige exemplos para todas as variáveis. Preencha as amostras para: ${emptyVars.join(', ')}`);
         }

         // Validação: Variáveis não podem estar no início ou no fim (Meta Policy)
         if (/^\{\{\d+\}\}/.test(bodyText.trim())) {
            throw new Error(`As variáveis não podem estar no início do corpo. Adicione um texto de saudação ou introdução.`);
         }
         if (/\{\{\d+\}\}$/.test(bodyText.trim())) {
            throw new Error(`As variáveis não podem estar no final do corpo. Adicione um ponto final ou um texto de encerramento.`);
         }
         
         if (headerText && /^\{\{\d+\}\}/.test(headerText.trim())) {
            throw new Error(`As variáveis não podem estar no início do cabeçalho.`);
         }
         if (footerText.match(/\{\{\d+\}\}/g)) {
            throw new Error(`As variáveis não são permitidas no Rodapé. Remova qualquer "{{1}}" do rodapé.`);
         }

         for (const b of buttons) {
            if (b.type === 'PHONE_NUMBER') {
               const cleanPhone = (b.phone_number || '').replace(/\D/g, '');
               if (cleanPhone.length < 10) {
                  throw new Error(`O número de telefone "${b.phone_number}" está incompleto. Utilize o padrão: +55 (DDD) Número.`);
               }
            }
         }

         // Preparar exemplos das variáveis
         const bodyMatches = bodyText.match(/\{\{\d+\}\}/g) || [];
         const bodyExampleValues = bodyMatches.map(m => variables[m] || 'Exemplo');
         const headerMatches = headerText.match(/\{\{\d+\}\}/g) || [];
         const headerExampleValues = headerMatches.map(m => variables[m] || 'Exemplo');

         const metaPayload = { 
            id: currentId,
            name: sanitizedName,
            category,
            language,
            components,
            examples: {
               body: bodyExampleValues.length > 0 ? [bodyExampleValues] : undefined,
               header: headerExampleValues.length > 0 ? headerExampleValues : undefined
            },
            teamId: profile?.teamId || "main-team"
         };

         try {
            const res = await fetch('/api/templates/register', {
               method: 'POST',
               headers: { 'Content-Type': 'application/json' },
               body: JSON.stringify(metaPayload)
            });
            
            const metaResult = await res.json();
            
            if (!metaResult.success) {
               console.error(">>> [ERROR] Meta API Failure:", metaResult);
               
               // Extract detailed error from Meta response
               const metaError = metaResult.details || metaResult;
               let errorMsg = metaError.message || metaError.error?.message || 'Erro desconhecido na Meta';
               
               if (metaError.error_user_msg) {
                  errorMsg = metaError.error_user_msg;
               }
               
               throw new Error(`Meta: ${errorMsg}`);
            }
            
            const metaIdStr = metaResult.metaResponse?.id ? `\n(ID na Meta: ${metaResult.metaResponse.id})` : '';
            alert(`Sucesso! Modelo salvo e enviado para análise da Meta.${metaIdStr}`);
         } catch (metaErr: any) {
            throw new Error(`O modelo foi salvo no sistema, mas a Meta retornou erro.\n\n${metaErr.message}`);
         }
    } else {
         alert("Modelo salvo como rascunho com sucesso!");
      }
      
      onSaved();
    } catch (err: any) {
      console.error('Save error:', err);
      // Exibe erro de forma mais amigável
      alert(err.message || 'Erro ao processar modelo. Verifique os logs do console para mais detalhes.');
    } finally {
      setLoading(false);
    }
  };

  const insertFormat = (format: string) => {
     const textarea = document.getElementById('body-textarea') as HTMLTextAreaElement;
     if (!textarea) return;
     const start = textarea.selectionStart;
     const end = textarea.selectionEnd;
     const selectedText = bodyText.substring(start, end);
     
     let wrapped = '';
     if (format === 'bold') wrapped = `*${selectedText || 'negrito'}*`;
     if (format === 'italic') wrapped = `_${selectedText || 'itálico'}_`;
     if (format === 'strikethrough') wrapped = `~${selectedText || 'tachado'}~`;
     if (format === 'code') wrapped = `\`\`\`${selectedText || 'código'}\`\`\``;
     if (format === 'variable') {
        const nextVarIndex = Object.keys(variables).length + 1;
        wrapped = `{{${nextVarIndex}}}`;
     }
     
     const newText = bodyText.substring(0, start) + wrapped + bodyText.substring(end);
     setBodyText(newText);
     
     // focus back
     setTimeout(() => {
        textarea.focus();
        textarea.setSelectionRange(start + wrapped.length, start + wrapped.length);
     }, 0);
  };

  const getPreviewBody = () => {
    let html = bodyText || '';
    // Replace variables with their sample values
    Object.keys(variables).forEach(k => {
       html = html.replace(new RegExp(k.replace(/\{|\}/g, '\\$&'), 'g'), variables[k] || k);
    });
    // WhatsApp Markdown to HTML (simplified)
    html = html.replace(/\*(.*?)\*/g, '<strong>$1</strong>');
    html = html.replace(/_(.*?)_/g, '<em>$1</em>');
    html = html.replace(/~(.*?)~/g, '<del>$1</del>');
    html = html.replace(/```(.*?)```/gs, '<code class="bg-black/5 rounded px-1.5 py-0.5">$1</code>');
    return html;
  };

  return (
    <div className="flex flex-col h-[100dvh] bg-zinc-50 overflow-hidden w-full fixed inset-0 z-[60] shadow-2xl">
      <div className="h-auto min-h-[64px] py-2 md:h-16 px-3 md:px-8 border-b bg-white flex flex-row items-center justify-between shrink-0 shadow-sm z-20 gap-2">
         <div className="flex items-center space-x-1 md:space-x-4 flex-1 min-w-0">
            <Button variant="ghost" size="icon" onClick={onClose} className="shrink-0 text-zinc-500 hover:text-zinc-900">
               <ArrowLeft className="w-5 h-5" />
            </Button>
            <div className="flex-1 min-w-0">
               <h1 className="text-base md:text-xl font-bold tracking-tight truncate">{template ? 'Editar Modelo' : 'Novo Modelo'}<span className="hidden md:inline"> de Mensagem</span></h1>
               <p className="text-sm text-zinc-500 hidden md:block">{template ? 'Edite o template existente' : 'Crie um novo template'} para enviar na Meta.</p>
            </div>
         </div>
         <div className="flex items-center gap-2 shrink-0">
            <Button type="button" variant="outline" onClick={() => saveTemplate('DRAFT')} disabled={loading || !name || !bodyText} className="px-3 md:px-6 shrink-0 bg-white hover:bg-zinc-100 hidden sm:flex">
               Salvar Rascunho
            </Button>
            <Button type="button" onClick={() => saveTemplate('PENDING')} disabled={loading || !name || !bodyText} className="bg-emerald-600 hover:bg-emerald-700 px-3 md:px-6 shrink-0 text-white text-xs md:text-sm h-9 md:h-10">
               {loading ? 'Aguarde...' : 'Salvar e Enviar para Meta'}
            </Button>
         </div>
      </div>

      <div className="flex-1 overflow-y-auto overflow-x-hidden relative">
         <div className="flex flex-col lg:flex-row min-h-full max-w-[1400px] mx-auto bg-white shadow-xl lg:border-x border-zinc-200">
         {/* Editor Form */}
         <div className="flex-1 bg-white border-b lg:border-b-0 lg:border-r border-zinc-200">
            <div className="max-w-3xl mx-auto p-4 md:p-8 space-y-6 pb-12 lg:pb-8">
               
               {/* 1. Header Details */}
               <div className="bg-emerald-50/30 border border-emerald-100 rounded-2xl p-6 space-y-6">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                     <div className="space-y-2">
                        <label className="text-sm font-bold text-zinc-800 flex items-center">
                           Nome do modelo
                           <span className="text-emerald-600 ml-1">*</span>
                        </label>
                        <Input 
                           required 
                           value={name} 
                           onChange={e => setName(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '_'))} 
                           placeholder="ex: confirmacao_pedido" 
                           className="h-12 bg-white border-zinc-200 focus:ring-emerald-500 rounded-xl" 
                        />
                        <p className="text-[11px] text-zinc-400">Minúsculas e underline (ex: aviso_entrega)</p>
                     </div>
                     <div className="space-y-2">
                        <label className="text-sm font-bold text-zinc-800 flex items-center">
                           Categoria
                           <span className="text-emerald-600 ml-1">*</span>
                        </label>
                        <select 
                          value={category} 
                          onChange={e => setCategory(e.target.value)}
                          className="h-12 bg-white border border-zinc-200 w-full rounded-xl px-4 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20 cursor-pointer appearance-none"
                          style={{ backgroundImage: 'url("data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' fill=\'none\' viewBox=\'0 0 24 24\' stroke=\'%236b7280\'%3E%3Cpath stroke-linecap=\'round\' stroke-linejoin=\'round\' stroke-width=\'2\' d=\'M19 9l-7 7-7-7\'%3E%3C/path%3E%3C/svg%3E")', backgroundRepeat: 'no-repeat', backgroundPosition: 'right 1rem center', backgroundSize: '1.25rem' }}
                        >
                          <option value="MARKETING">Marketing (Promoções, Avisos)</option>
                          <option value="UTILITY">Utilitário (Senhas, Alertas, Pedidos)</option>
                          <option value="AUTHENTICATION">Autenticação (Códigos de Acesso)</option>
                        </select>
                        <p className="text-[11px] text-zinc-400">Escolha a categoria correta para evitar rejeição.</p>
                     </div>
                  </div>

                  {category === 'UTILITY' && (
                     <div className="bg-blue-50 border border-blue-100 p-4 rounded-xl flex items-start gap-3">
                        <div className="bg-blue-500 text-white p-1 rounded-full shrink-0">
                           <Smile className="w-3 h-3" />
                        </div>
                        <div className="text-[12px] text-blue-800 leading-relaxed">
                           <strong>Dica de Aprovação:</strong> Modelos "Utilitários" devem ser informativos (ex: status de pedido, confirmação de conta). Evite palavras como "promoção", "oferta" ou "compre agora" nestes modelos para que a Meta não mude para Marketing ou rejeite.
                        </div>
                     </div>
                  )}
               </div>

               {/* 2. Header */}
               <div className="space-y-3">
                  <label className="text-sm font-semibold text-zinc-800 flex items-center">Cabeçalho <span className="font-normal text-zinc-400 text-xs ml-2">(Opcional)</span></label>
                  <Input value={headerText} onChange={e => setHeaderText(e.target.value)} placeholder="Insira o texto do cabeçalho" maxLength={60} className="w-full h-11 bg-white border-zinc-200" />
               </div>

               {/* 3. Body */}
               <div className="space-y-4">
                  <label className="text-sm font-semibold text-zinc-800 flex items-center">Corpo <span className="text-emerald-600 ml-1 font-bold">*</span></label>
                  <div className="border border-zinc-200 rounded-xl overflow-hidden bg-white shadow-sm focus-within:ring-2 focus-within:ring-emerald-500/20 focus-within:border-emerald-500 transition-all">
                     <div className="bg-zinc-50 border-b border-zinc-200 p-2 flex items-center gap-1 flex-wrap">
                        <Button type="button" variant="ghost" size="sm" onClick={() => insertFormat('bold')} className="h-8 w-8 p-0" title="Negrito"><Bold className="w-4 h-4" /></Button>
                        <Button type="button" variant="ghost" size="sm" onClick={() => insertFormat('italic')} className="h-8 w-8 p-0" title="Itálico"><Italic className="w-4 h-4" /></Button>
                        <Button type="button" variant="ghost" size="sm" onClick={() => insertFormat('strikethrough')} className="h-8 w-8 p-0" title="Tachado"><Strikethrough className="w-4 h-4" /></Button>
                        <Button type="button" variant="ghost" size="sm" onClick={() => insertFormat('code')} className="h-8 w-8 p-0" title="Código"><Code className="w-4 h-4" /></Button>
                        <div className="w-px h-4 bg-zinc-300 mx-1" />
                        <Button type="button" variant="ghost" size="sm" onClick={() => insertFormat('variable')} className="h-8 px-2 text-xs font-medium text-emerald-700 bg-emerald-50 hover:bg-emerald-100"><Plus className="w-3 h-3 mr-1" /> Variável</Button>
                     </div>
                     <Textarea 
                        id="body-textarea"
                        value={bodyText} 
                        onChange={e => setBodyText(e.target.value)} 
                        required 
                        rows={8} 
                        placeholder="*Olá*, {{1}} ! Tudo bem?" 
                        className="resize-none border-0 focus-visible:ring-0 rounded-none shadow-none text-[14px]" 
                     />
                     <div className="bg-zinc-50 border-t border-zinc-100 p-2 text-right">
                        <p className="text-[11px] text-zinc-500">{bodyText.length}/1024</p>
                     </div>
                  </div>
               </div>

               {/* Variables Editor */}
               {Object.keys(variables).length > 0 && (
                  <div className="bg-amber-50 border border-amber-200 rounded-xl p-6 space-y-4">
                     <div className="flex items-center gap-2 text-amber-800">
                        <Code className="w-5 h-5" />
                        <h4 className="text-sm font-bold uppercase tracking-wider">Amostras das Variáveis</h4>
                     </div>
                     <p className="text-[12px] text-amber-700 leading-relaxed">
                        A Meta exige que você forneça exemplos reais do que será substituído pelas variáveis (ex: {"{{1}}"}), para que eles possam aprovar o modelo.
                     </p>
                     <div className="grid grid-cols-1 gap-3">
                        {Object.keys(variables).sort((a, b) => a.localeCompare(b, undefined, {numeric: true})).map(v => (
                           <div key={v} className="flex items-center gap-3 bg-white p-2 rounded-lg border border-amber-100 shadow-sm">
                              <div className="shrink-0 w-10 h-10 flex items-center justify-center bg-amber-100 border border-amber-200 rounded-lg font-mono text-sm font-bold text-amber-800">{v}</div>
                              <Input 
                                 value={variables[v]} 
                                 onChange={e => setVariables({...variables, [v]: e.target.value})} 
                                 placeholder={`Informe um exemplo para ${v}`} 
                                 className="h-10 bg-transparent border-none focus-visible:ring-0 text-sm" 
                              />
                           </div>
                        ))}
                     </div>
                  </div>
               )}

               {/* 4. Footer */}
               <div className="space-y-3">
                  <label className="text-sm font-semibold text-zinc-800">Rodapé <span className="font-normal text-zinc-400 text-xs ml-1">(Opcional)</span></label>
                  <Input value={footerText} onChange={e => setFooterText(e.target.value)} placeholder="Insira o texto de rodapé legal ou rápido" maxLength={60} className="w-full h-11 bg-white border-zinc-200" />
                  <p className="text-[11px] text-zinc-500">{footerText.length}/60</p>
               </div>

               <div className="w-full h-px bg-zinc-100" />

               {/* 5. Buttons */}
               <div className="space-y-4 pt-4">
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 border-t border-zinc-100 pt-6">
                     <div>
                        <label className="text-sm font-bold text-zinc-800">Interatividade</label>
                        <p className="text-[11px] text-zinc-400">Adicione até 10 botões ao seu modelo.</p>
                     </div>
                     <div className="flex flex-wrap gap-2">
                        <button 
                           type="button" 
                           onClick={() => { if(buttons.length < 10) setButtons([...buttons, { type: 'QUICK_REPLY', text: '', url: '', phone_number: '' }])}}
                           className="flex items-center px-4 h-10 bg-white border border-emerald-200 text-emerald-700 text-sm font-semibold rounded-xl hover:bg-emerald-50 transition-all shadow-sm active:scale-95"
                        >
                           <MessageSquare className="w-4 h-4 mr-2" /> + Resposta
                        </button>
                        <button 
                           type="button" 
                           onClick={() => { if(buttons.length < 10) setButtons([...buttons, { type: 'URL', text: '', url: '', phone_number: '' }])}}
                           className="flex items-center px-4 h-10 bg-white border border-blue-200 text-blue-700 text-sm font-semibold rounded-xl hover:bg-blue-50 transition-all shadow-sm active:scale-95"
                        >
                           <ExternalLink className="w-4 h-4 mr-2" /> + Site
                        </button>
                        <button 
                           type="button" 
                           onClick={() => { if(buttons.length < 10) setButtons([...buttons, { type: 'PHONE_NUMBER', text: '', url: '', phone_number: '' }])}}
                           className="flex items-center px-4 h-10 bg-white border border-zinc-200 text-zinc-700 text-sm font-semibold rounded-xl hover:bg-zinc-50 transition-all shadow-sm active:scale-95"
                        >
                           <Phone className="w-4 h-4 mr-2" /> + Telefone
                        </button>
                     </div>
                  </div>
                  
                  {buttons.length > 0 ? (
                     <div className="space-y-3">
                        {buttons.map((btn, index) => (
                           <div key={index} className="bg-zinc-50 border border-zinc-200 p-4 rounded-xl flex flex-col gap-4 relative pr-12">
                              <Button type="button" variant="ghost" size="icon" onClick={() => setButtons(buttons.filter((_, i) => i !== index))} className="absolute right-2 top-2 text-zinc-400 hover:text-red-600 hover:bg-red-50"><Trash2 className="w-4 h-4" /></Button>
                              <div className="flex flex-col gap-1">
                                 <Badge className="w-fit mb-2 bg-emerald-100 text-emerald-800 border-none font-medium hover:bg-emerald-100">
                                    {btn.type === 'QUICK_REPLY' ? 'Resposta Rápida' :
                                     btn.type === 'URL' ? 'Acessar Site' :
                                     btn.type === 'PHONE_NUMBER' ? 'Ligar para Número' : 'Sair (Opt-Out)'}
                                 </Badge>
                                 <label className="text-xs font-semibold text-zinc-700">Texto do botão</label>
                                 <Input value={btn.text} onChange={e => {
                                    const n = [...buttons]; n[index].text = e.target.value; setButtons(n);
                                 }} maxLength={25} required className="bg-white" placeholder="ex: Saber mais" />
                              </div>
                              {btn.type === 'URL' && (
                                 <div className="flex flex-col gap-1">
                                    <label className="text-xs font-semibold text-zinc-700">URL</label>
                                    <Input value={btn.url} onChange={e => {
                                       const n = [...buttons]; n[index].url = e.target.value; setButtons(n);
                                    }} required className="bg-white" placeholder="https://..." />
                                 </div>
                              )}
                              {btn.type === 'PHONE_NUMBER' && (
                                 <div className="flex flex-col gap-1">
                                    <label className="text-xs font-semibold text-zinc-700">Telefone (com código do país)</label>
                                    <Input value={btn.phone_number} onChange={e => {
                                       const n = [...buttons]; n[index].phone_number = e.target.value; setButtons(n);
                                    }} required className="bg-white" placeholder="+5511999999999" />
                                 </div>
                              )}
                           </div>
                        ))}
                     </div>
                  ) : (
                     <div className="border border-dashed border-zinc-200 p-8 rounded-xl text-center text-zinc-500 bg-zinc-50/50">
                        Nenhum botão adicionado ainda.
                     </div>
                  )}
               </div>

            </div>
         </div>

         {/* Preview Sidebar */}
         <div className="w-full lg:w-[450px] bg-[#efeae2] flex flex-col shrink-0 lg:sticky lg:top-0 h-auto lg:h-[calc(100dvh-64px)] z-10 border-t lg:border-t-0 p-4 md:p-8 overflow-y-auto items-center justify-start lg:justify-center">
            {/* Phone Mock */}
            <div className="w-full max-w-[340px] bg-white rounded-[32px] overflow-hidden shadow-2xl border-[6px] border-zinc-800 relative flex flex-col shrink-0" style={{ maxHeight: '800px', minHeight: '500px' }}>
               {/* Phone Header */}
               <div className="bg-[#075e54] text-white p-3 pt-5 flex items-center justify-between z-20 shrink-0">
                  <div className="flex items-center gap-2">
                     <ArrowLeft className="w-4 h-4" />
                     <div className="w-8 h-8 rounded-full bg-white/20" />
                     <div>
                        <p className="text-[13px] font-medium leading-tight">Cliente</p>
                        <p className="text-[10px] text-white/80">online</p>
                     </div>
                  </div>
               </div>

               {/* Phone Chat Area */}
               <div className="bg-[#efeae2] flex-1 overflow-y-auto p-3 flex flex-col justify-start">
                  {(!bodyText && !footerText && !headerText && buttons.length === 0) ? (
                     <div className="text-center p-4 bg-white/80 rounded-xl text-sm text-zinc-500 mt-auto mb-auto">
                        Comece a digitar para ver a prévia.
                     </div>
                  ) : (
                     <div className="bg-white rounded-xl shadow-[0_1px_0.5px_rgba(11,20,26,.13)] relative rounded-tl-none w-fit max-w-[95%] before:content-[''] before:absolute before:top-0 before:-left-2 before:border-[8px] before:border-transparent before:border-r-white before:border-t-white mt-2 mb-4 shrink-0">
                        {/* Simulated Header */}
                        {headerText && (
                           <div className="px-2 pt-2 pb-1">
                              <p className="font-bold text-[14.2px] text-[#111b21]">{headerText}</p>
                           </div>
                        )}

                        {/* Body text */}
                        <div className="p-2.5 pb-1.5 space-y-1">
                           {bodyText && (
                              <p className="text-[14.2px] whitespace-pre-wrap leading-[1.35] text-[#111b21] font-sans break-words" 
                                 dangerouslySetInnerHTML={{__html: getPreviewBody()}}
                              />
                           )}
                           {footerText && <p className="text-[12.5px] text-zinc-500 mt-1.5 leading-tight">{footerText}</p>}
                           <div className="text-[10px] text-zinc-400 text-right pt-1 pb-0.5">12:00</div>
                        </div>

                        {/* Buttons */}
                        {buttons.length > 0 && (
                           <div className="border-t border-[#f0f2f5] flex flex-col pb-0.5">
                              {buttons.map((btn, i) => {
                                 const isLink = btn.type === 'URL' && btn.url;
                                 const isTel = btn.type === 'PHONE_NUMBER' && btn.phone_number;
                                 const href = isLink ? btn.url : isTel ? `tel:${btn.phone_number}` : undefined;
                                 const Tag = href ? 'a' : 'button';

                                 return (
                                    <Tag 
                                       key={i} 
                                       href={href as string}
                                       target={isLink ? "_blank" : undefined}
                                       rel={isLink ? "noopener noreferrer" : undefined}
                                       className={`w-full py-3 px-2 flex items-center justify-center gap-2 text-center text-[#00a884] font-medium text-[14.5px] select-none hover:bg-zinc-50 transition-colors ${i > 0 ? 'border-t border-[#f0f2f5]' : ''}`}
                                       onClick={e => {
                                          if (!href) {
                                             e.preventDefault();
                                             alert(`Botão do tipo ${btn.type} testado!`);
                                          }
                                       }}
                                    >
                                       {btn.type === 'URL' && <ExternalLink className="w-4 h-4 shrink-0" />}
                                       {btn.type === 'PHONE_NUMBER' && <Phone className="w-4 h-4 shrink-0" />}
                                       {btn.type === 'QUICK_REPLY' && <MessageSquare className="w-4 h-4 shrink-0" />}
                                       {btn.type === 'OPT_OUT' && <Ban className="w-4 h-4 shrink-0 text-zinc-400" />}
                                       <span className="truncate">{btn.text || '...'}</span>
                                    </Tag>
                                 );
                              })}
                           </div>
                        )}
                     </div>
                  )}
               </div>
            </div>
         </div>
      </div>
      </div>
    </div>
  );
}

// Icon helper
function FileText({className}: {className?: string}) {
   return <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><polyline points="14 2 14 8 20 8"/><line x1="16" x2="8" y1="13" y2="13"/><line x1="16" x2="8" y1="17" y2="17"/><line x1="10" x2="8" y1="9" y2="9"/></svg>;
}
