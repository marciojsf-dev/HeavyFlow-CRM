import { useState, useEffect } from 'react';
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle, 
  DialogFooter 
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from '@/components/ui/select';
import { 
  Search, 
  Send, 
  Check,
  CheckCheck,
  Info,
  ChevronRight,
  MessageSquare,
  User,
  AlertTriangle,
  Clock
} from 'lucide-react';
import { useAuth } from '@/src/lib/AuthContext';

interface TemplateSelectorModalProps {
  isOpen: boolean;
  onClose: () => void;
  templates: any[];
  onSend: (template: any, variables: Record<string, string>) => void;
  contactName?: string;
  initialTemplate?: any;
}

export function TemplateSelectorModal({ isOpen, onClose, templates, onSend, contactName, initialTemplate }: TemplateSelectorModalProps) {
  const { profile } = useAuth();
  const [search, setSearch] = useState('');
  const [selectedTemplate, setSelectedTemplate] = useState<any>(null);
  const [variables, setVariables] = useState<Record<string, string>>({});

  const filteredTemplates = templates.filter(t => 
    t.name.toLowerCase().includes(search.toLowerCase()) || 
    (t.category && t.category.toLowerCase().includes(search.toLowerCase()))
  );

  useEffect(() => {
    if (!isOpen) {
      setSelectedTemplate(null);
      setVariables({});
      setSearch('');
    } else if (initialTemplate) {
      handleSelect(initialTemplate);
    }
  }, [isOpen, initialTemplate]);

  const handleSelect = (t: any) => {
    setSelectedTemplate(t);
    
    // Extract variables from components
    const vars: Record<string, string> = {};
    t?.components?.forEach((c: any) => {
      const matches = c.text?.match(/\{\{\d+\}\}/g) || [];
      matches.forEach((m: string) => {
        if (!vars[m]) {
          vars[m] = m === '{{1}}' && profile?.name ? profile.name : '';
        }
      });
    });
    setVariables(vars);
  };

  const getPreviewText = () => {
    if (!selectedTemplate) return "";
    
    let bodyComponent = selectedTemplate.components?.find((c: any) => c.type === 'BODY');
    return bodyComponent?.text ? replaceVars(bodyComponent.text) : "";
  };

  const replaceVars = (content: string) => {
    let result = content;
    Object.entries(variables).forEach(([vNum, val]) => {
      const displayVal = (val as string).trim() || `[${vNum}]`;
      result = result.replace(vNum, displayVal);
    });
    return result;
  };

  const handleSend = () => {
    if (!selectedTemplate || selectedTemplate.status !== 'APPROVED') return;
    onSend(selectedTemplate, variables);
    onClose();
  };

  const isApproved = selectedTemplate?.status === 'APPROVED';

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="w-full h-[100dvh] md:w-[95vw] md:max-w-4xl md:h-[85vh] flex flex-col p-0 overflow-hidden rounded-none md:rounded-xl shadow-xl">
        <DialogHeader className="p-4 md:p-5 border-b shrink-0 bg-white">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <DialogTitle className="flex items-center gap-2 text-xl font-bold text-zinc-900">
              <div className="p-2 bg-emerald-100 rounded-lg">
                <Send className="w-5 h-5 text-emerald-600" />
              </div>
              {selectedTemplate ? 'Configuração da Mensagem' : 'Escolher Modelo Meta'}
            </DialogTitle>
            {contactName && (
              <Badge variant="secondary" className="px-3 py-1 text-sm bg-emerald-50 text-emerald-700 font-medium w-fit sm:w-auto">
                <User className="w-4 h-4 mr-1.5" />
                {contactName}
              </Badge>
            )}
          </div>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto overflow-x-hidden md:overflow-hidden flex flex-col md:flex-row bg-zinc-50/30">
          {/* Left: Configuration Form */}
          <div className="w-full md:flex-1 flex flex-col border-b md:border-b-0 md:border-r border-zinc-200 bg-white md:overflow-y-auto shrink-0">
            <div className="p-4 md:p-6 space-y-6">
              {/* Template Selection Dropdown */}
              <div className="space-y-2">
                <Label className="text-sm font-semibold text-zinc-900">Modelo de Mensagem da Meta</Label>
                <Select 
                   value={selectedTemplate?.id || ''} 
                   onValueChange={(val) => handleSelect(templates.find(t => String(t.id) === String(val)))}
                >
                  <SelectTrigger className="w-full text-left h-11 bg-zinc-50 border-zinc-200">
                    <SelectValue placeholder="Selecione o modelo desejado...">
                       {selectedTemplate ? (
                         <div className="flex items-center justify-between w-full pr-2">
                           <span className="truncate">{selectedTemplate.name.replace(/_/g, ' ')}</span>
                           <Badge 
                             variant="outline" 
                             className={`ml-2 text-[10px] uppercase font-bold shrink-0 ${
                               selectedTemplate.status === 'APPROVED' ? 'bg-emerald-50 text-emerald-700 border-emerald-300' :
                               selectedTemplate.status === 'PENDING' ? 'bg-amber-50 text-amber-700 border-amber-300' :
                               'bg-zinc-100 text-zinc-600'
                             }`}
                           >
                             {selectedTemplate.status === 'APPROVED' ? 'Aprovado' : selectedTemplate.status === 'PENDING' ? 'Em Análise' : 'Rascunho'}
                           </Badge>
                         </div>
                       ) : "Selecione o modelo desejado..."}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {templates.map(t => (
                      <SelectItem key={t.id} value={String(t.id)} className="cursor-pointer">
                        <div className="flex items-center justify-between gap-3 py-1 w-full">
                           <div className="flex flex-col min-w-0">
                              <span className="font-semibold text-zinc-900 truncate">{t.name.replace(/_/g, ' ')}</span>
                              <span className="text-[10px] uppercase tracking-wider text-zinc-500">{t.category} • {t.language}</span>
                           </div>
                           <Badge 
                             variant="outline" 
                             className={`text-[9px] uppercase font-bold shrink-0 ${
                               t.status === 'APPROVED' ? 'bg-emerald-50 text-emerald-700 border-emerald-300' :
                               t.status === 'PENDING' ? 'bg-amber-50 text-amber-700 border-amber-300' :
                               'bg-zinc-100 text-zinc-600'
                             }`}
                           >
                             {t.status === 'APPROVED' ? 'Aprovado' : t.status === 'PENDING' ? 'Pendente Meta' : 'Rascunho'}
                           </Badge>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Status warning banner if not approved */}
              {selectedTemplate && !isApproved && (
                <div className={`p-3.5 rounded-xl border flex items-start gap-3 ${
                  selectedTemplate.status === 'PENDING' 
                    ? 'bg-amber-50 border-amber-200 text-amber-900' 
                    : 'bg-zinc-50 border-zinc-200 text-zinc-800'
                }`}>
                  {selectedTemplate.status === 'PENDING' ? (
                    <Clock className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                  ) : (
                    <AlertTriangle className="w-5 h-5 text-zinc-500 shrink-0 mt-0.5" />
                  )}
                  <div className="text-xs leading-relaxed">
                    {selectedTemplate.status === 'PENDING' ? (
                      <>
                        <strong>Modelo em análise pela Meta:</strong> Este modelo foi submetido e está aguardando homologação pelo WhatsApp. A Meta costuma aprovar em poucos minutos. Você poderá dispará-lo assim que for aprovado.
                      </>
                    ) : (
                      <>
                        <strong>Modelo não aprovado na Meta:</strong> Este modelo ainda é um rascunho. Acesse a aba <strong>Modelos</strong> no menu lateral para enviá-lo à aprovação da Meta.
                      </>
                    )}
                  </div>
                </div>
              )}

              {/* Variables */}
              {selectedTemplate && (
                <div className="space-y-4">
                  <div className="flex items-center gap-2 border-b pb-2 mb-4">
                     <Info className="w-4 h-4 text-emerald-600" />
                     <h3 className="font-semibold text-sm text-zinc-800">Preencher Variáveis</h3>
                  </div>

                  {Object.keys(variables).length === 0 ? (
                    <div className="py-6 px-4 text-center border-2 border-dashed border-zinc-200 rounded-xl bg-zinc-50">
                       <MessageSquare className="w-6 h-6 text-zinc-300 mx-auto mb-1.5" />
                       <p className="text-xs text-zinc-500 font-medium">Este modelo não possui variáveis dinâmicas.</p>
                    </div>
                  ) : (
                    <div className="space-y-4">
                       {Object.keys(variables).sort((a,b) => {
                         const nA = parseInt(a.replace(/\D/g, ''));
                         const nB = parseInt(b.replace(/\D/g, ''));
                         return nA - nB;
                       }).map(v => (
                          <div key={v} className="space-y-1.5 group">
                             <Label className="text-xs font-bold text-zinc-500 uppercase flex items-center group-focus-within:text-emerald-600 transition-colors">
                                {v === '{{1}}' ? 'Variável 1 (ex: Nome do Cliente)' : `Variável ${v.replace(/\D/g, '')}`}
                                <span className="ml-2 text-[10px] bg-zinc-100 text-zinc-400 px-1.5 py-0.5 rounded uppercase font-bold">{v}</span>
                             </Label>
                             <Input 
                                placeholder={`${v === '{{1}}' ? (contactName ? `Ex: ${contactName}` : 'Ex: João') : 'Digite o valor aqui...'}`}
                                value={variables[v]}
                                onChange={e => setVariables(prev => ({...prev, [v]: e.target.value}))}
                                className="h-10 text-sm border-zinc-200 focus:border-emerald-500 focus:ring-emerald-500 rounded-lg shadow-sm"
                             />
                          </div>
                       ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Right: WhatsApp Preview */}
          <div className={`w-full h-[400px] md:h-auto md:w-[350px] bg-[#efeae2] flex flex-col relative shrink-0 ${!selectedTemplate && 'hidden md:flex items-center justify-center'}`}>
             <div className="absolute inset-0 opacity-[0.05] pointer-events-none" style={{ backgroundImage: 'url("https://user-images.githubusercontent.com/15075759/28719144-86dc0f70-73b1-11e7-911d-60d70fcded21.png")' }} />
             
             {selectedTemplate ? (
               <div className="flex flex-col h-full absolute inset-0">
                 <div className="bg-[#075e54] text-white px-4 py-3 flex items-center gap-3 shrink-0 z-10 shadow-sm relative">
                    <div className="w-9 h-9 rounded-full bg-zinc-200 flex items-center justify-center font-bold text-sm text-[#075e54] shrink-0">
                       {contactName?.substring(0, 2) || "WC"}
                    </div>
                    <div className="flex-1 min-w-0">
                       <div className="text-sm font-semibold leading-tight truncate">{contactName || "WhatsApp Business"}</div>
                       <div className="text-[11px] text-emerald-100 flex items-center gap-1.5 mt-0.5">
                          online
                       </div>
                    </div>
                 </div>

                 <div className="flex-1 p-4 overflow-y-auto z-10 flex flex-col gap-4">
                    <div className="flex flex-col items-center mt-1">
                       <div className="bg-white/80 backdrop-blur-md text-[10px] text-zinc-500 px-2 py-1 rounded-md shadow-sm uppercase font-bold tracking-widest border border-black/5">
                          Hoje
                       </div>
                    </div>

                    <div className="bg-white rounded-xl p-3 shadow-sm max-w-[95%] relative rounded-tl-none ring-1 ring-black/5">
                       {/* Header */}
                       {selectedTemplate.components?.find((c: any) => c.type === 'HEADER') && (
                         <div className="font-bold text-sm text-zinc-900 mb-2">
                           {replaceVars(selectedTemplate.components.find((c: any) => c.type === 'HEADER').text)}
                         </div>
                       )}

                       {/* Body */}
                       <div className="text-sm text-zinc-800 whitespace-pre-wrap leading-relaxed">
                          {getPreviewText() || "Preencha as variáveis para ver a mensagem..."}
                       </div>

                       {/* Footer */}
                       {selectedTemplate.components?.find((c: any) => c.type === 'FOOTER') && (
                         <div className="text-xs text-zinc-400 mt-2 italic">
                           {selectedTemplate.components.find((c: any) => c.type === 'FOOTER').text}
                         </div>
                       )}

                       <div className="flex items-center justify-end gap-1 mt-1">
                          <span className="text-[10px] text-zinc-400 font-medium">
                             {new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </span>
                          <CheckCheck className="w-3.5 h-3.5 text-emerald-500" />
                       </div>
                       {/* Tail */}
                       <div className="absolute top-0 -left-1.5 w-2 h-2 bg-white clip-path-triangle transform rotate-180" style={{ clipPath: 'polygon(0 0, 100% 0, 100% 100%)' }} />
                    </div>
                    
                    {selectedTemplate.components?.find((c: any) => c.type === 'BUTTONS') && (
                       <div className="space-y-1.5 w-[95%] z-10 -mt-2">
                          {selectedTemplate.components.find((c: any) => c.type === 'BUTTONS').buttons.map((b: any, idx: number) => (
                             <div key={idx} className="bg-white text-[#00a884] py-2.5 rounded-xl text-center text-sm font-semibold shadow-sm border border-zinc-100 flex items-center justify-center gap-2">
                                {b.type === 'URL' && <Send className="w-3.5 h-3.5" />}
                                {b.text}
                             </div>
                          ))}
                       </div>
                    )}
                 </div>
               </div>
             ) : (
                <div className="flex-1 flex flex-col items-center justify-center p-6 text-center text-zinc-500 relative z-10">
                   <MessageSquare className="w-10 h-10 text-zinc-300 mb-3" />
                   <p className="text-sm border border-zinc-200 p-3 rounded-xl bg-white/70 backdrop-blur shadow-sm">
                      Selecione um modelo no menu ao lado para visualizar.
                   </p>
                </div>
             )}
          </div>
        </div>

        <DialogFooter className="p-4 pb-8 md:pb-6 md:p-6 border-t bg-white shrink-0 flex flex-col sm:flex-row sm:items-center justify-between gap-4 relative z-20 shadow-[0_-4px_10px_rgba(0,0,0,0.02)]">
          <p className="text-xs text-zinc-500 hidden sm:block">
             {isApproved ? 'Pronto para disparo através da Meta API.' : 'Apenas modelos Aprovados pela Meta podem ser disparados.'}
          </p>
          <div className="flex items-center gap-3 w-full sm:w-auto">
             <Button variant="ghost" onClick={onClose} className="flex-1 sm:flex-none h-11 md:h-10 text-sm font-medium">Cancelar</Button>
             <Button 
               className="flex-1 sm:flex-none bg-emerald-600 hover:bg-emerald-700 text-white h-11 md:h-10 px-6 font-semibold shadow-sm disabled:opacity-50" 
               disabled={!selectedTemplate || !isApproved}
               onClick={handleSend}
             >
                <Send className="w-4 h-4 mr-2" />
                Disparar Agora
             </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
