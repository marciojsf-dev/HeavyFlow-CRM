import React, { useState, useEffect, useRef } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { AlertCircle, Search, Users, ChevronRight, ChevronLeft, Upload, Check, FileSpreadsheet } from 'lucide-react';
import Papa from 'papaparse';
import * as XLSX from 'xlsx';
import { collection, query, where, getDocs, serverTimestamp, addDoc } from 'firebase/firestore';
import { db, handleFirestoreError } from '../lib/firebase';
import { useAuth } from '../lib/AuthContext';

export function CampaignWizard({ 
  open, 
  onOpenChange,
  templates,
  customStatuses,
  onSuccess
}: { 
  open: boolean; 
  onOpenChange: (open: boolean) => void;
  templates: any[];
  customStatuses: any[];
  onSuccess?: () => void;
}) {
  const { profile } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const STATUS_LABELS: Record<string, string> = {
    'open': 'Aberto',
    'resolved': 'Resolvido',
    'spam': 'Spam',
    'waiting': 'Aguardando'
  };

  const getStatusLabel = (status: string) => {
    return STATUS_LABELS[status.toLowerCase()] || status;
  };

  const [step, setStep] = useState(1);
  const [name, setName] = useState('');
  const [templateId, setTemplateId] = useState('');
  const [variableMappings, setVariableMappings] = useState<Record<string, string>>({});
  const [audienceType, setAudienceType] = useState('ALL'); // ALL, STATUS, MANUAL
  const [statusFilter, setStatusFilter] = useState('');
  
  const [contacts, setContacts] = useState<any[]>([]);
  const [selectedContactIds, setSelectedContactIds] = useState<Set<string>>(new Set());
  const [loadingContacts, setLoadingContacts] = useState(false);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);

  // CSV Import State
  const [csvData, setCsvData] = useState<any[]>([]);
  const [csvColumns, setCsvColumns] = useState<string[]>([]);
  const [phoneColumn, setPhoneColumn] = useState<string>('');
  const [nameColumn, setNameColumn] = useState<string>('');

  // When step changes to 2, fetch contacts
  useEffect(() => {
    if (step === 2 && audienceType !== 'MANUAL') {
      fetchAudience();
    }
  }, [step, audienceType, statusFilter]);

  const fetchAudience = async () => {
    setLoadingContacts(true);
    try {
      if (!profile?.teamId) return;
      let statusParam = 'ALL';
      if (audienceType === 'STATUS') {
        statusParam = statusFilter;
      }
      const res = await fetch(`/api/contacts/audience?teamId=${profile.teamId}&status=${encodeURIComponent(statusParam)}`);
      const data = await res.json();
      
      let fetchedContacts = data.contacts || [];
      
      // se for MANUAL, o usuário importa (ainda a implementar importaçao por CSV)
      // se não for manual, carrega todos
      setContacts(fetchedContacts);
      
      // Auto-select those who are NOT opted out
      const initialSelected = new Set<string>();
      fetchedContacts.forEach((c: any) => {
        if (!c.opt_out && c.phone) {
          initialSelected.add(c.phone);
        }
      });
      setSelectedContactIds(initialSelected);
      
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingContacts(false);
    }
  };

  const toggleContact = (phone: string) => {
    const newSet = new Set(selectedContactIds);
    if (newSet.has(phone)) {
      newSet.delete(phone);
    } else {
      newSet.add(phone);
    }
    setSelectedContactIds(newSet);
  };

  const toggleAll = () => {
    if (selectedContactIds.size === contacts.filter(c => !c.opt_out).length) {
      // unselect all
      setSelectedContactIds(new Set());
    } else {
      // select all valid
      setSelectedContactIds(newSet => {
        const addSet = new Set(newSet);
        contacts.forEach(c => {
          if (!c.opt_out && c.phone) addSet.add(c.phone);
        });
        return addSet;
      });
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const processData = (data: any[]) => {
      if (data && data.length > 0) {
        const _cols = Object.keys(data[0]);
        setCsvColumns(_cols);
        setCsvData(data);
        
        const phoneGuess = _cols.find(c => c.toLowerCase().includes('whatsapp') || c.toLowerCase().includes('telefone') || c.toLowerCase().includes('phone') || c.toLowerCase().includes('celular') || c.toLowerCase().includes('numero'));
        if (phoneGuess) setPhoneColumn(phoneGuess);
        
        const nameGuess = _cols.find(c => c.toLowerCase().includes('nome') || c.toLowerCase().includes('name') || c.toLowerCase().includes('associado') || c.toLowerCase().includes('cliente'));
        if (nameGuess) setNameColumn(nameGuess);
      }
    };

    if (file.name.endsWith('.csv')) {
        Papa.parse(file, {
          header: true,
          skipEmptyLines: true,
          encoding: "ISO-8859-1",
          complete: (results) => {
            processData(results.data);
          }
        });
    } else {
      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: 'array' });
      const firstSheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[firstSheetName];
      const data = XLSX.utils.sheet_to_json(worksheet);
      processData(data);
    }
    
    // clear input
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const confirmImport = () => {
     if(!phoneColumn) return;
     const newContacts = csvData.map(row => {
        let phoneVal = String(row[phoneColumn] || '').replace(/\D/g, '');
        if (phoneVal.length === 10 || phoneVal.length === 11) {
           phoneVal = '55' + phoneVal; // Add country code if missing
        }
        
        let nameVal = '';
        if (nameColumn) nameVal = row[nameColumn] || '';
        if (!nameVal) nameVal = 'Contato Importado';
        
        return {
           phone: phoneVal,
           name: nameVal,
           opt_out: false,
           _rawRow: row 
        };
     }).filter(c => c.phone.length >= 12); 
     
     setContacts(newContacts);
     setSelectedContactIds(new Set(newContacts.map(c => c.phone)));
  };

  const getTemplateVariables = (tid: string) => {
    const template = templates.find(t => String(t.id) === String(tid));
    if (!template) return [];
    
    const vars = new Set<string>();
    const text = JSON.stringify(template.components || []);
    const matches = text.matchAll(/\{\{(\d+)\}\}/g);
    for (const match of matches) {
      vars.add(match[1]);
    }
    return Array.from(vars).sort((a, b) => Number(a) - Number(b));
  };

  const handleTemplateChange = (id: string) => {
    setTemplateId(id);
    const vars = getTemplateVariables(id);
    const initialMappings: Record<string, string> = {};
    vars.forEach(v => {
      // Auto-suggest defaults: 1 -> name, etc. (common pattern)
      if (v === '1') initialMappings[v] = 'name';
      else initialMappings[v] = 'category';
    });
    setVariableMappings(initialMappings);
  };

  const handleNext = () => {
    if (step === 1) {
      if (!name.trim() || !templateId) return;
      setStep(2);
    } else if (step === 2) {
      setStep(3);
    }
  };

  const handleCreate = async () => {
    if (!profile?.teamId || !name.trim() || !templateId) return;
    
    setLoading(true);
    try {
      const targetContacts = Array.from(selectedContactIds).map(phone => {
        const contact = contacts.find(c => c.phone === phone);
        
        // Resolve variables
        const resolvedVariables: Record<string, string> = {};
        Object.entries(variableMappings).forEach(([vNum, src]) => {
           const source = src as string;
           if (source === 'name') resolvedVariables[vNum] = contact?.name || '';
           else if (source === 'phone') resolvedVariables[vNum] = contact?.phone || '';
           else if (source === 'category') resolvedVariables[vNum] = contact?.category || '';
           else if (source.startsWith('csv:')) {
               const col = source.replace('csv:', '');
               resolvedVariables[vNum] = contact?._rawRow?.[col] || '';
           }
           else resolvedVariables[vNum] = ''; 
        });

        return {
           whatsapp_id: phone,
           variables: resolvedVariables
        };
      });

      const template = templates.find(t => String(t.id) === String(templateId));

      const res = await fetch('/api/campaigns', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          teamId: profile.teamId,
          name: name.trim(),
          templateId,
          templateName: template?.name || '',
          contacts: targetContacts
        })
      });

      if (!res.ok) throw new Error("Falha ao criar campanha");
      
      onOpenChange(false);
      reset();
      if (onSuccess) onSuccess();
    } catch (err) {
      console.error(err);
      alert("Erro ao criar campanha no PostgreSQL");
    } finally {
      setLoading(false);
    }
  };

  const reset = () => {
    setStep(1);
    setName('');
    setTemplateId('');
    setAudienceType('ALL');
    setStatusFilter('');
    setContacts([]);
    setSelectedContactIds(new Set());
    setCsvData([]);
    setCsvColumns([]);
    setPhoneColumn('');
    setNameColumn('');
  };

  const filteredContacts = contacts.filter(c => 
    (c.name?.toLowerCase() || '').includes(search.toLowerCase()) || 
    (c.phone || '').includes(search)
  );

  return (
    <Dialog open={open} onOpenChange={(val) => {
      onOpenChange(val);
      if (!val) reset();
    }}>
      <DialogContent className="w-[95vw] sm:max-w-2xl md:max-w-3xl lg:max-w-4xl max-h-[90vh] md:h-[700px] flex flex-col p-0 overflow-hidden">
        <DialogHeader className="px-6 py-1 border-b shrink-0">
          <DialogTitle className="text-lg">Nova Campanha em Massa</DialogTitle>
          <div className="flex gap-2 mt-1">
             <div className={`h-1 flex-1 rounded-full ${step >= 1 ? 'bg-emerald-500' : 'bg-zinc-200'}`} />
             <div className={`h-1 flex-1 rounded-full ${step >= 2 ? 'bg-emerald-500' : 'bg-zinc-200'}`} />
             <div className={`h-1 flex-1 rounded-full ${step >= 3 ? 'bg-emerald-500' : 'bg-zinc-200'}`} />
          </div>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto pt-0.5 px-6 pb-4">
          {step === 1 && (
            <div className="space-y-6">
               <div className="space-y-4">
                 <div className="space-y-3">
                   <label className="text-sm font-medium text-zinc-700">Nome da Campanha</label>
                   <Input value={name} onChange={e => setName(e.target.value)} placeholder="Ex: Promoção Dia das Mães" required />
                 </div>

                 <div className="space-y-3">
                   <label className="text-sm font-medium text-zinc-700">Modelo de Mensagem (Meta)</label>
                   <Select value={templateId} onValueChange={handleTemplateChange} required>
                     <SelectTrigger className="h-auto py-2">
                       <SelectValue placeholder="Selecione um modelo aprovado">
                         {templateId ? templates.find(t => String(t.id) === String(templateId))?.name : "Selecione um modelo aprovado"}
                       </SelectValue>
                     </SelectTrigger>
                     <SelectContent>
                       {templates.length === 0 && <SelectItem value="none" disabled>Nenhum modelo aprovado</SelectItem>}
                       {templates.map(t => (
                         <SelectItem key={t.id} value={String(t.id)} textValue={t.name}>
                            <div className="flex items-center gap-2">
                               <span className="font-medium">{t.name}</span>
                               <span className="text-xs text-zinc-500 opacity-70">({t.category} • {t.language})</span>
                            </div>
                         </SelectItem>
                       ))}
                     </SelectContent>
                   </Select>
                 </div>
               </div>

              <div className="space-y-2.5">
                <label className="text-sm font-medium text-zinc-700">Público Alvo (Quem vai receber?)</label>
                
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                   <div 
                     onClick={() => setAudienceType('ALL')}
                     className={`p-3 rounded-xl flex items-center gap-3 border-2 cursor-pointer transition-colors ${audienceType === 'ALL' ? 'border-emerald-500 bg-emerald-50/50' : 'border-zinc-200 hover:border-emerald-200 bg-white'}`}
                   >
                      <div className="shrink-0 p-2 bg-white rounded-lg border border-zinc-200 shadow-sm">
                         <Users className="w-4 h-4 text-zinc-700" />
                      </div>
                      <div className="text-left flex-1 min-w-0">
                         <div className="font-medium text-zinc-900 text-sm leading-tight truncate">Todos os Contatos</div>
                         <div className="text-[11px] text-zinc-500 truncate mt-0.5">Enviar para toda base.</div>
                      </div>
                   </div>
                   
                   <div 
                     onClick={() => setAudienceType('STATUS')}
                     className={`p-3 rounded-xl flex items-center gap-3 border-2 cursor-pointer transition-colors ${audienceType === 'STATUS' ? 'border-emerald-500 bg-emerald-50/50' : 'border-zinc-200 hover:border-emerald-200 bg-white'}`}
                   >
                      <div className="shrink-0 p-2 bg-white rounded-lg border border-zinc-200 shadow-sm">
                         <Search className="w-4 h-4 text-zinc-700" />
                      </div>
                      <div className="text-left flex-1 min-w-0">
                         <div className="font-medium text-zinc-900 text-sm leading-tight truncate">Filtrar Situação</div>
                         <div className="text-[11px] text-zinc-500 truncate mt-0.5">Status da caixa de entrada.</div>
                      </div>
                   </div>

                   <div 
                     onClick={() => setAudienceType('MANUAL')}
                     className={`p-3 rounded-xl flex items-center gap-3 border-2 cursor-pointer transition-colors ${audienceType === 'MANUAL' ? 'border-emerald-500 bg-emerald-50/50' : 'border-zinc-200 hover:border-emerald-200 bg-white'}`}
                   >
                      <div className="shrink-0 p-2 bg-white rounded-lg border border-zinc-200 shadow-sm">
                         <Upload className="w-4 h-4 text-zinc-700" />
                      </div>
                      <div className="text-left flex-1 min-w-0">
                         <div className="font-medium text-zinc-900 text-sm leading-tight truncate">Seleção Manual</div>
                         <div className="text-[11px] text-zinc-500 truncate mt-0.5">Lista manual ou CSV.</div>
                      </div>
                   </div>
                </div>

                {audienceType === 'STATUS' && (
                   <div className="mt-2 p-3 bg-zinc-50 rounded-xl border border-zinc-200">
                     <label className="text-xs font-medium text-zinc-700 mb-2 block">Escolha a Situação:</label>
                     <Select value={statusFilter} onValueChange={setStatusFilter}>
                      <SelectTrigger className="bg-white h-9">
                        <SelectValue placeholder="Selecione um status...">
                          {statusFilter ? getStatusLabel(statusFilter) : "Selecione um status..."}
                        </SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="open">Aberto</SelectItem>
                        <SelectItem value="resolved">Resolvido</SelectItem>
                        <SelectItem value="spam">Spam</SelectItem>
                        <SelectItem value="waiting">Aguardando</SelectItem>
                        {customStatuses.length > 0 && <div className="px-2 py-1.5 text-xs font-medium text-zinc-500">Status Personalizados</div>}
                        {customStatuses.map((status) => (
                           <SelectItem key={status.id} value={status.name} textValue={status.name}>{status.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                   </div>
                )}
              </div>
            </div>
          )}


          {step === 2 && (
            <div className="space-y-4">
               <div className="flex justify-between items-center bg-zinc-50 p-3 rounded-lg border border-zinc-200">
                  <div>
                    <h3 className="font-medium text-zinc-900">Revisão de Público</h3>
                    <p className="text-xs text-zinc-500">Selecione ou remova contatos para este envio.</p>
                  </div>
                  <Badge variant="secondary" className="text-sm px-3 py-1 bg-white border-zinc-200">
                     {selectedContactIds.size} selecionados
                  </Badge>
               </div>
               
               {audienceType === 'MANUAL' && contacts.length === 0 && (
                  <div className="p-8 text-center border-2 border-dashed rounded-lg bg-zinc-50 flex flex-col items-center">
                     <FileSpreadsheet className="w-10 h-10 text-emerald-400 mb-3" />
                     <h3 className="font-medium text-zinc-900">Importar Contatos via Planilha</h3>
                     <p className="text-sm text-zinc-500 mt-1 px-4 mb-4">Escolha um arquivo CSV para importar a sua lista e as variáveis para o corpo da mensagem.</p>
                     
                     <input 
                        type="file" 
                        accept=".csv,.xlsx,.xls" 
                        className="hidden" 
                        ref={fileInputRef} 
                        onChange={handleFileUpload}
                     />
                     
                     {csvData.length === 0 ? (
                        <Button variant="outline" onClick={() => fileInputRef.current?.click()}>
                           Selecionar Arquivo CSV ou Excel
                        </Button>
                     ) : (
                        <div className="w-full max-w-sm mt-4 p-4 border rounded-xl bg-white shadow-sm text-left">
                           <h4 className="font-medium mb-3 text-sm text-center text-zinc-800">
                             {csvData.length} Contatos Encontrados! <br/><span className="text-xs font-normal text-zinc-500">Mapeie as colunas para importar:</span>
                           </h4>
                           <div className="space-y-4">
                              <div className="space-y-2">
                                 <label className="text-xs font-medium text-zinc-700 block">Identifique a coluna de WHATSAPP:</label>
                                 <Select value={phoneColumn} onValueChange={setPhoneColumn}>
                                    <SelectTrigger className="h-8 text-xs">
                                       <SelectValue placeholder="Selecione a coluna" />
                                    </SelectTrigger>
                                    <SelectContent>
                                       {csvColumns.map(c => <SelectItem key={c} value={c} textValue={c}>{c}</SelectItem>)}
                                    </SelectContent>
                                 </Select>
                              </div>
                              <div className="space-y-2">
                                 <label className="text-xs font-medium text-zinc-700 block">Coluna de NOME do contato (opcional):</label>
                                 <Select value={nameColumn} onValueChange={setNameColumn}>
                                    <SelectTrigger className="h-8 text-xs">
                                       <SelectValue placeholder="Sem nome" />
                                    </SelectTrigger>
                                    <SelectContent>
                                       <SelectItem value="none">IGNORAR NOME</SelectItem>
                                       {csvColumns.map(c => <SelectItem key={c} value={c} textValue={c}>{c}</SelectItem>)}
                                    </SelectContent>
                                 </Select>
                              </div>
                              <Button onClick={confirmImport} size="sm" disabled={!phoneColumn} className="w-full">
                                Confirmar Importação
                              </Button>
                           </div>
                        </div>
                     )}
                  </div>
               )}

               {(audienceType !== 'MANUAL' || contacts.length > 0) && (
                 <>
                   <div className="relative">
                      <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" />
                      <Input 
                        placeholder="Buscar nesta lista..." 
                        className="pl-9" 
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                      />
                   </div>

                   <div className="rounded-lg border border-zinc-200 bg-white">
                      <div className="overflow-x-auto">
                         <table className="w-full text-sm text-left relative min-w-[500px]">
                       <thead className="bg-zinc-50 border-b text-zinc-500 font-medium sticky top-0 z-10 shadow-sm">
                         <tr>
                           <th className="p-3 w-10">
                              <Checkbox 
                                checked={selectedContactIds.size > 0 && selectedContactIds.size === contacts.filter(c => !c.opt_out).length} 
                                onCheckedChange={toggleAll} 
                              />
                           </th>
                           <th className="p-3">Nome</th>
                           <th className="p-3 hidden sm:table-cell">Telefone</th>
                           <th className="p-3 hidden md:table-cell">Status Atual</th>
                           <th className="p-3">Permissão</th>
                         </tr>
                       </thead>
                       <tbody className="divide-y divide-zinc-100">
                         {loadingContacts ? (
                           <tr>
                              <td colSpan={5} className="p-8 text-center text-zinc-500">Buscando contatos...</td>
                           </tr>
                         ) : filteredContacts.length === 0 ? (
                           <tr>
                              <td colSpan={5} className="p-8 text-center text-zinc-500">Nenhum contato encontrado.</td>
                           </tr>
                         ) : filteredContacts.map((contact, index) => {
                           const isOptOut = contact.opt_out;
                           const isChecked = selectedContactIds.has(contact.phone);

                           return (
                             <tr key={contact.phone || index} className={`hover:bg-zinc-50 ${isOptOut ? 'bg-zinc-50/50' : ''}`}>
                               <td className="p-3">
                                  <Checkbox 
                                    checked={isChecked} 
                                    disabled={isOptOut}
                                    onCheckedChange={() => toggleContact(contact.phone)} 
                                  />
                               </td>
                               <td className="p-3 font-medium text-zinc-900">
                                 {contact.name || 'Sem nome'}
                                 <div className="sm:hidden text-xs font-mono text-zinc-500 mt-1">{contact.phone}</div>
                                 <div className="md:hidden mt-1">{contact.status && <Badge variant="outline" className="font-normal text-[10px]">{getStatusLabel(contact.status)}</Badge>}</div>
                               </td>
                               <td className="p-3 font-mono text-xs hidden sm:table-cell">{contact.phone}</td>
                               <td className="p-3 hidden md:table-cell">
                                  {contact.status && (
                                     <Badge variant="outline" className="font-normal">{getStatusLabel(contact.status)}</Badge>
                                  )}
                               </td>
                               <td className="p-3">
                                  {isOptOut ? (
                                    <Badge variant="destructive" className="bg-red-100 text-red-700 border-red-200 hover:bg-red-100 font-normal whitespace-nowrap">Opt-out</Badge>
                                  ) : (
                                    <Badge variant="outline" className="text-emerald-700 border-emerald-200 bg-emerald-50 font-normal whitespace-nowrap">Permitido</Badge>
                                  )}
                               </td>
                             </tr>
                           )
                         })}
                       </tbody>
                     </table>
                    </div>
                  </div>
                 </>
               )}
            </div>
          )}

          {step === 3 && (
            <div className="flex flex-col h-full">
               <div className="bg-emerald-50 px-6 py-4 border-b border-emerald-100 flex items-center justify-between shrink-0">
                  <div>
                     <h3 className="font-bold text-emerald-900 leading-none mb-1">Revisão e Mapeamento</h3>
                     <p className="text-xs text-emerald-700">Verifique o modelo da mensagem e as variáveis, antes de finalizar a criação.</p>
                  </div>
                  <div className="text-right">
                     <div className="font-bold text-emerald-900 border bg-white px-3 py-1 rounded-full text-xs shadow-sm shadow-emerald-100 inline-block">
                        {selectedContactIds.size} contatos selecionados
                     </div>
                  </div>
               </div>
               
               <div className="flex-1 overflow-y-auto p-6 bg-zinc-50/50">
                   <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                     {/* Preview Side */}
                     <div className="bg-zinc-100/80 rounded-2xl p-6 flex flex-col items-center justify-center border border-zinc-200 order-2 md:order-1">
                        <div className="w-full max-w-[300px]">
                           <div className="bg-emerald-500 text-white px-4 py-2 rounded-t-xl text-xs font-medium flex items-center gap-2">
                              <div className="w-2 h-2 rounded-full bg-white animate-pulse" />
                              Pré-visualização (Simulado)
                           </div>
                           <div className="bg-[#E5DDD5] p-3 rounded-b-xl min-h-[200px] border border-emerald-500/20 shadow-lg relative overflow-hidden">
                              <div className="absolute inset-0 opacity-[0.03] pointer-events-none" style={{ backgroundImage: 'url("https://user-images.githubusercontent.com/15075759/28719144-86dc0f70-73b1-11e7-911d-60d70fcded21.png")' }} />
                              
                              <div className="bg-white rounded-lg p-2.5 shadow-sm max-w-[95%] relative z-10 animate-in zoom-in-95 duration-200">
                                 {(() => {
                                    const template = templates.find(t => String(t.id) === String(templateId));
                                    let bodyComponent = template?.components.find((c: any) => c.type === 'BODY');
                                    let text = bodyComponent?.text || "Selecione um modelo para visualizar...";
                                    
                                    const MAPPING_OPTIONS = [
                                       { value: 'name', label: 'Nome do Contato' },
                                       { value: 'phone', label: 'Telefone' },
                                       { value: 'category', label: 'Categoria' },
                                       { value: 'fixed', label: 'Texto Fixo' },
                                    ];
                                    if (csvColumns && csvColumns.length > 0) {
                                       csvColumns.forEach(c => MAPPING_OPTIONS.push({ value: `csv:${c}`, label: `${c}` }));
                                    }
                                    
                                    Object.entries(variableMappings).forEach(([vNum, src]) => {
                                       const source = src as string;
                                       const option = MAPPING_OPTIONS.find(o => o.value === source);
                                       const label = option ? `[${option.label}]` : `{{${vNum}}}`;
                                       text = text.replace(`{{${vNum}}}`, label);
                                    });
                                    
                                    return <div className="text-[13px] text-zinc-800 whitespace-pre-wrap leading-relaxed">{text}</div>;
                                 })()}
                                 <div className="text-[10px] text-zinc-400 text-right mt-1">
                                    {new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                 </div>
                              </div>
                           </div>
                        </div>
                        <p className="text-[11px] text-zinc-500 max-w-[260px] text-center mt-4 px-2">
                           As variáveis entre parênteses [ ] serão substituídas pelos dados de cada contato durante o envio.
                        </p>
                     </div>

                     {/* Configuration Side */}
                     <div className="space-y-5 order-1 md:order-2">
                        {getTemplateVariables(templateId).length > 0 ? (
                           <>
                              <div>
                                 <h4 className="font-bold text-zinc-900 text-sm mb-1">Mapeamento de Variáveis</h4>
                                 <p className="text-xs text-zinc-500 mb-4 pb-4 border-b">Selecione de onde cada variável do corpo da mensagem deve ser preenchida.</p>
                              </div>
                              <div className="space-y-3">
                                 {getTemplateVariables(templateId).map(v => (
                                    <div key={v} className="px-4 py-3 bg-white rounded-lg border border-zinc-200 shadow-sm flex items-center justify-between gap-4">
                                       <div className="min-w-0">
                                          <div className="text-xs font-bold text-zinc-500 uppercase tracking-wider flex items-center">
                                             Variável {'{{'}{v}{'}}'}
                                          </div>
                                       </div>
                                       <div className="flex-1 min-w-0 max-w-[280px]">
                                          <Select 
                                            value={variableMappings[v]} 
                                            onValueChange={(val) => setVariableMappings(prev => ({ ...prev, [v]: val }))}
                                          >
                                             <SelectTrigger className="h-8 text-xs bg-zinc-50/50 w-full truncate">
                                                <div className="truncate w-full text-left">
                                                   {(() => {
                                                        const MAPPING_OPTIONS = [
                                                           { value: 'name', label: 'Nome do Contato' },
                                                           { value: 'phone', label: 'Telefone' },
                                                           { value: 'category', label: 'Categoria' },
                                                           { value: 'fixed', label: 'Texto Fixo' },
                                                        ];
                                                        if (csvColumns && csvColumns.length > 0) {
                                                           csvColumns.forEach(c => MAPPING_OPTIONS.push({ value: `csv:${c}`, label: `${c}` }));
                                                        }
                                                        return MAPPING_OPTIONS.find(o => o.value === variableMappings[v])?.label || "Mapear para...";
                                                   })()}
                                                </div>
                                             </SelectTrigger>
                                             <SelectContent>
                                                <SelectItem value="name">Nome do Contato</SelectItem>
                                                <SelectItem value="phone">Telefone</SelectItem>
                                                <SelectItem value="category">Categoria</SelectItem>
                                                <SelectItem value="fixed">Texto Fixo</SelectItem>
                                                {csvColumns?.map(c => (
                                                   <SelectItem key={`csv:${c}`} value={`csv:${c}`}>{c}</SelectItem>
                                                ))}
                                             </SelectContent>
                                          </Select>
                                       </div>
                                    </div>
                                 ))}
                              </div>
                           </>
                        ) : (
                           <div className="flex flex-col items-center justify-center p-8 bg-zinc-50 border border-zinc-200 border-dashed rounded-xl h-full text-center">
                              <Check className="w-8 h-8 text-emerald-400 mb-3" />
                              <h4 className="font-bold text-zinc-800 text-sm mb-1">Tudo Pronto</h4>
                              <p className="text-xs text-zinc-500 max-w-[200px]">Este modelo de mensagem não possui variáveis no corpo da mensagem.</p>
                           </div>
                        )}

                        <div className="mt-8 p-3 bg-amber-50 rounded-lg border border-amber-100 flex items-start text-left">
                           <AlertCircle className="w-4 h-4 mr-2 text-amber-600 shrink-0 mt-0.5" />
                           <div className="text-[11px] text-amber-700 leading-relaxed">
                              A campanha será criada como <strong>rascunho</strong>. Você precisará clicar em "Iniciar" na listagem para que o sistema comece a enviar os disparos de forma controlada.
                           </div>
                        </div>
                     </div>
                   </div>
               </div>
            </div>
          )}
        </div>

        <DialogFooter className="px-6 pt-4 pb-7 border-t bg-zinc-50 flex flex-row items-center justify-between w-full shrink-0 gap-4">
            <Button 
               type="button" 
               variant="ghost" 
               className="px-4"
               onClick={() => step > 1 ? setStep(step - 1) : onOpenChange(false)}
            >
               {step > 1 ? <><ChevronLeft className="w-4 h-4 mr-1"/> Voltar</> : 'Cancelar'}
            </Button>
            
            <div className="flex gap-2">
               {step === 1 && (
                  <Button onClick={handleNext} className="px-6" disabled={!name || !templateId || (audienceType === 'STATUS' && !statusFilter)}>
                    Avançar <ChevronRight className="w-4 h-4 ml-1" />
                  </Button>
               )}
               {step === 2 && (
                  <Button onClick={handleNext} className="px-6" disabled={selectedContactIds.size === 0 && audienceType !== 'MANUAL'}>
                    Avançar <ChevronRight className="w-4 h-4 ml-1" />
                  </Button>
               )}
               {step === 3 && (
                  <Button onClick={handleCreate} className="px-6" disabled={loading}>
                    {loading ? 'Salvando...' : 'Criar Campanha e Concluir'}
                  </Button>
               )}
            </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}


