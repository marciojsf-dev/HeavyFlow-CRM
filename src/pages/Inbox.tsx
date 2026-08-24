import { useState, useEffect } from 'react';
import { useAuth } from '../lib/AuthContext';
import { Outlet, useNavigate, useParams, Link, useSearchParams, useLocation } from 'react-router-dom';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { io } from 'socket.io-client';
import { Badge } from '@/components/ui/badge';
import { Search, ChevronLeft, ChevronRight, User, Plus } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { clsx } from "clsx";
import { TemplateSelectorModal } from '../components/TemplateSelectorModal';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

import { toast } from 'sonner';
import { normalizePhone, formatPhone, getCanonicalId } from '../lib/phoneUtils';

import { collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '../lib/firebase';

export function Inbox() {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const [conversations, setConversations] = useState<any[]>([]);
  const [customStatuses, setCustomStatuses] = useState<any[]>([]);
  const [departments, setDepartments] = useState<any[]>([]);
  const [teamMembers, setTeamMembers] = useState<any[]>([]);
  const [selectedDeptId, setSelectedDeptId] = useState<string>('all');

  useEffect(() => {
    const contactId = searchParams.get('contactId');
    if (contactId) {
      navigate(`/inbox/${contactId}`, { replace: true });
    }
  }, [searchParams]);
  const [contactsCache, setContactsCache] = useState<Record<string, any>>({});
  const [search, setSearch] = useState('');
  const [isListOpen, setIsListOpen] = useState(true);
  const [templates, setTemplates] = useState<any[]>([]);
  const [isTemplateModalOpen, setIsTemplateModalOpen] = useState(false);
  const [isNewChatModalOpen, setIsNewChatModalOpen] = useState(false);
  const [newContactPhone, setNewContactPhone] = useState('');
  const [phoneInput, setPhoneInput] = useState('');
  const [allContacts, setAllContacts] = useState<any[]>([]);
  const [contactSearch, setContactSearch] = useState('');

  const effectiveTeamId = profile?.teamId || 'team_ivw2d5s3u';

  useEffect(() => {
    fetch(`/api/contacts?teamId=${effectiveTeamId}`)
      .then(res => {
        if (!res.ok) throw new Error('Failed to fetch contacts');
        return res.json();
      })
      .then(data => setAllContacts(Array.isArray(data) ? data : []))
      .catch(err => {
        console.error(err);
        setAllContacts([]);
      });
  }, [profile?.teamId]);

  const filteredContacts = allContacts.filter(c => 
    c.name?.toLowerCase().includes(contactSearch.toLowerCase()) ||
    c.whatsapp_id?.includes(contactSearch) ||
    c.phone?.includes(contactSearch)
  ).slice(0, 5);

  const handleStartChat = (phone: string) => {
    const canonical = getCanonicalId(phone);
    setNewContactPhone(canonical);
    setIsNewChatModalOpen(false);
    setIsTemplateModalOpen(true);
  };

  useEffect(() => {
     fetch(`/api/templates?teamId=${effectiveTeamId}`)
       .then(async res => {
          const contentType = res.headers.get("content-type");
          if (contentType && contentType.indexOf("application/json") !== -1) {
            return res.json();
          } else {
            const text = await res.text();
            throw new Error(text || 'Response was not JSON');
          }
       })
       .then(data => setTemplates(data.filter((t: any) => t.status === 'APPROVED')))
       .catch(err => console.warn('Failed to fetch templates:', err.message));
  }, [profile?.teamId]);

  useEffect(() => {
    const fetchConversations = async () => {
      try {
        const res = await fetch(`/api/conversations?teamId=${effectiveTeamId}`);
        const contentType = res.headers.get("content-type");
        if (!contentType || contentType.indexOf("application/json") === -1) {
          const text = await res.text();
          throw new Error(text || 'Response was not JSON');
        }
        const data = await res.json();
        setConversations(data.map((c: any) => ({ 
          ...c, 
          id: c.whatsapp_id, 
          contactId: c.whatsapp_id,
          unreadCount: c.unread_count || 0,
          lastMessageAt: c.last_message_at ? new Date(c.last_message_at) : null 
        })));
        
        // Populate cache for names
        const cache: Record<string, any> = {};
        data.forEach((c: any) => {
          cache[c.whatsapp_id] = { name: c.name, phone: c.phone };
        });
        setContactsCache(cache);
      } catch (err: any) {
        console.warn("Failed to fetch conversations:", err.message);
      }
    };

    const fetchDepartments = async () => {
      if (!profile?.teamId) return;
      try {
        const q = query(collection(db, 'departments'), where('teamId', '==', profile.teamId));
        const snapshot = await getDocs(q);
        const data: any[] = [];
        snapshot.forEach(doc => data.push({ id: doc.id, ...doc.data() }));
        setDepartments(data);
      } catch (err) {
        console.warn("Failed to load departments:", err);
      }
    };

    const fetchTeamMembers = async () => {
      if (!profile?.teamId) return;
      try {
        const q = query(collection(db, "users"), where("teamId", "==", profile.teamId));
        const snapshot = await getDocs(q);
        const data: any[] = [];
        snapshot.forEach((doc) => data.push({ id: doc.id, ...doc.data() }));
        setTeamMembers(data);
      } catch (err) {
        console.warn("Failed to load team members:", err);
      }
    };

    fetchConversations();
    fetchDepartments();
    fetchTeamMembers();
    fetch(`/api/custom-statuses?teamId=${effectiveTeamId}`).then(res => res.json()).then(setCustomStatuses).catch(e => console.warn(e));

    // Socket real-time refresh
    const socket = io();
    socket.on('connect', () => {
       console.log('>>> [INBOX SOCKET] Conectado! Time:', effectiveTeamId);
       socket.emit('join', effectiveTeamId);
       socket.emit('join_team', effectiveTeamId);
    });

    socket.on('whatsapp:message_received', () => {
       console.log('>>> [INBOX SOCKET] Nova mensagem, recarregando lista.');
       fetchConversations();
    });

    socket.on('whatsapp:message_status', (data) => {
       console.log('>>> [INBOX SOCKET] Status Update:', data);
       setConversations(prev => prev.map(c => {
          if (c.last_message_id === data.messageId || c.whatsapp_id === data.recipient_id) {
             return { ...c, last_message_status: data.status };
          }
          return c;
       }));
       setTimeout(fetchConversations, 800);
    });

    socket.on('conversation:updated', () => fetchConversations());
    socket.on('contact_updated', () => fetchConversations());
    socket.on('chat_update', () => fetchConversations());

    const interval = setInterval(fetchConversations, 15000);

    return () => {
       socket.disconnect();
       clearInterval(interval);
    };
  }, [profile?.teamId]);

  const getContactInfo = (contactId: string) => {
     const info = contactsCache[contactId];
     if (info?.name && info.name !== contactId && info.name !== 'Desconhecido' && !info.name.match(/^55\d+$/)) {
        return { name: info.name, phone: formatPhone(contactId) };
     }
     return { name: formatPhone(contactId), phone: null };
  }

  const statusMap: Record<string, string> = {
     open: 'Aberto',
     pending: 'Aguardando',
     snoozed: 'Adiado',
     closed: 'Resolvido'
  };

  const filtered = conversations
    .filter(c => {
      if (selectedDeptId !== 'all') {
         const dept = departments.find(d => d.id === selectedDeptId);
         let matchesDept = c.department_id === selectedDeptId;
         if (dept && !matchesDept) {
            const agentIdsInDept = dept.userIds || [];
            const agentNames = teamMembers
               .filter(m => agentIdsInDept.includes(m.id))
               .map(m => m.name);
            if (agentNames.includes(c.agent_id)) {
               matchesDept = true;
            }
         }
         if (!matchesDept) return false;
      }

      const info = getContactInfo(c.contactId);
      const searchLower = search.toLowerCase();
      
      const statusText = statusMap[c.status || "open"] || customStatuses.find(s => s.id === c.status)?.name || "Aberto";

      return (
        info.name.toLowerCase().includes(searchLower) || 
        (info.phone || '').includes(searchLower) || 
        c.contactId.includes(searchLower) || 
        (c.tags || []).join(' ').toLowerCase().includes(searchLower) ||
        (c.agent_id || "").toLowerCase().includes(searchLower) ||
        statusText.toLowerCase().includes(searchLower)
      );
    })
    .sort((a, b) => {
      const timeA = a.lastMessageAt?.getTime() || 0;
      const timeB = b.lastMessageAt?.getTime() || 0;
      return timeB - timeA;
    });

  return (
    <div className="flex h-full bg-white relative overflow-hidden">
      {/* Sidebar: Conversation List */}
      <div className={clsx(
         "border-r bg-white z-20 flex flex-col transition-all duration-300 absolute md:static inset-y-0 left-0",
         isListOpen ? "w-full md:w-80 lg:w-96" : "w-0 md:w-0 border-r-0 overflow-hidden",
         !isListOpen && "invisible md:visible",
         id && !isListOpen ? "hidden md:flex" : "flex"
      )}>
        <TemplateSelectorModal 
           isOpen={isTemplateModalOpen}
           onClose={() => setIsTemplateModalOpen(false)}
           templates={templates}
           contactName={newContactPhone}
           onSend={async (template, vars) => {
              try {
                 const components: any[] = [];
                 const headerText = template.components?.find((c: any) => c.type === 'HEADER')?.text || '';
                 const headerVars = headerText.match(/\{\{\d+\}\}/g) || [];
                 if (headerVars.length > 0) {
                    components.push({
                       type: 'header',
                       parameters: headerVars.map((v: string) => ({ type: 'text', text: vars[v] || ' ' }))
                    });
                 }
                 const bodyText = template.components?.find((c: any) => c.type === 'BODY')?.text || '';
                 const bodyVars = bodyText.match(/\{\{\d+\}\}/g) || [];
                 if (bodyVars.length > 0) {
                    components.push({
                       type: 'body',
                       parameters: bodyVars.map((v: string) => ({ type: 'text', text: vars[v] || ' ' }))
                    });
                 }

                 let evaluatedText = template.components?.find((c: any) => c.type === 'BODY')?.text || `[Template: ${template.name}]`;
                 const varsToReplace = evaluatedText.match(/\{\{\d+\}\}/g) || [];
                 varsToReplace.forEach((v: string) => {
                    evaluatedText = evaluatedText.replace(v, vars[v] || ' ');
                 });

                 const cleanTo = newContactPhone.replace(/\D/g, '');

                 const templatePayload: any = {
                    name: template.name,
                    language: { code: template.language || 'pt_BR' }
                 };
                 if (components.length > 0) {
                    templatePayload.components = components;
                 }

                 const res = await fetch('/api/send-message', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                       to: cleanTo,
                       type: 'template',
                       templateText: evaluatedText,
                       teamId: profile?.teamId,
                       template: templatePayload
                    })
                 });

                 const resData = await res.json();
                 if (!resData.success) {
                    const errorMsg = resData.details?.error?.message || resData.error?.message || resData.error || 'Erro na Meta';
                    throw new Error(errorMsg);
                 }

                 const canonical = getCanonicalId(cleanTo);
                 
                 toast.success("Modelo enviado com sucesso!");

                 navigate(`/inbox/${canonical}`);
              } catch (err: any) {
                 toast.error("Erro ao iniciar conversa: " + err.message);
              }
           }}
        />
        <div className="p-4 border-b">
          <div className="flex items-center justify-between mb-4">
             <h2 className="text-xl font-bold tracking-tight">Caixa de Entrada</h2>
             <Button 
                size="sm" 
                className="h-8 px-2 bg-emerald-600 hover:bg-emerald-700"
                onClick={() => setIsNewChatModalOpen(true)}
             >
                <Plus className="w-4 h-4 mr-1" />
                Novo
             </Button>

             <Dialog open={isNewChatModalOpen} onOpenChange={setIsNewChatModalOpen}>
                <DialogContent className="max-w-md">
                   <DialogHeader>
                      <DialogTitle>Iniciar Nova Conversa</DialogTitle>
                   </DialogHeader>
                   <div className="py-4 space-y-6">
                      <div className="space-y-3">
                         <Label className="text-zinc-700 font-bold">Pesquisar Contato Existente</Label>
                         <div className="relative">
                            <Search className="w-4 h-4 absolute left-3 top-3 text-zinc-400" />
                            <Input 
                               placeholder="Nome ou telefone..." 
                               className="pl-9"
                               value={contactSearch}
                               onChange={(e) => setContactSearch(e.target.value)}
                            />
                         </div>
                         
                         {contactSearch && filteredContacts.length > 0 && (
                            <div className="border rounded-xl mt-2 overflow-hidden bg-zinc-50 shadow-sm">
                               {filteredContacts.map(c => (
                                  <button 
                                     key={c.whatsapp_id}
                                     onClick={() => handleStartChat(c.whatsapp_id)}
                                     className="w-full p-3 flex items-center justify-between hover:bg-white border-b last:border-0 transition-colors"
                                  >
                                     <div className="text-left">
                                        <p className="font-semibold text-sm text-zinc-900">{c.name}</p>
                                        <p className="text-xs text-zinc-500">{formatPhone(c.whatsapp_id)}</p>
                                     </div>
                                     <Plus className="w-4 h-4 text-emerald-600" />
                                  </button>
                               ))}
                            </div>
                         )}

                         {contactSearch && filteredContacts.length === 0 && (
                            <div className="p-4 text-center text-zinc-500 text-xs bg-zinc-50 rounded-xl border border-dashed">
                               Nenhum contato encontrado. Informe o número manualmente abaixo.
                            </div>
                         )}
                      </div>

                      <div className="space-y-3 border-t pt-6">
                         <Label className="text-zinc-700 font-bold">Ou Informe Manualmente</Label>
                         <div className="flex items-center gap-2">
                            <div className="h-10 px-3 flex items-center bg-zinc-100 border rounded-lg text-sm font-bold text-zinc-600">+55</div>
                            <Input 
                               placeholder="(DDD) 99999-9999" 
                               value={phoneInput}
                               onChange={(e) => setPhoneInput(e.target.value)}
                               className="flex-1"
                            />
                         </div>
                         <p className="text-[10px] text-zinc-400 leading-relaxed">
                            O sistema adicionará automaticamente o +55 do Brasil. Informe apenas o DDD e o número.
                         </p>
                      </div>
                   </div>
                   <DialogFooter className="gap-2">
                      <Button variant="ghost" onClick={() => setIsNewChatModalOpen(false)}>Cancelar</Button>
                      <Button 
                         className="bg-emerald-600 hover:bg-emerald-700 text-white"
                         disabled={!phoneInput || phoneInput.replace(/\D/g, '').length < 10}
                         onClick={() => handleStartChat(phoneInput)}
                      >
                         Próximo: Escolher Modelo
                      </Button>
                   </DialogFooter>
                </DialogContent>
             </Dialog>
          </div>
          <div className="flex flex-col gap-2 relative">
            <Select value={selectedDeptId} onValueChange={setSelectedDeptId}>
              <SelectTrigger className="w-full bg-zinc-50 border-none">
                <SelectValue placeholder="Filtrar por Departamento">
                   {selectedDeptId === 'all' 
                      ? 'Todos os Departamentos' 
                      : departments.find(d => d.id === selectedDeptId)?.name || 'Todos os Departamentos'}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os Departamentos</SelectItem>
                {departments.map(dept => (
                  <SelectItem key={dept.id} value={dept.id}>{dept.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <div className="relative">
              <Search className="w-4 h-4 absolute left-3 top-3 text-zinc-400" />
              <Input 
                 placeholder="Buscar contato, tag, status ou agente..." 
                 className="pl-9 bg-zinc-50 border-none"
                 value={search}
                 onChange={e => setSearch(e.target.value)}
              />
            </div>
          </div>
        </div>
        
        <div className="flex-1 overflow-y-auto">
          {filtered.length === 0 && <div className="p-4 text-center text-zinc-500 text-sm">Nenhuma conversa encontrada</div>}
          {filtered.map(conv => {
            const effectiveUnread = id === conv.id ? 0 : conv.unreadCount;
            return (
            <Link 
               to={`/inbox/${conv.id}`}
               key={conv.id}
               onClick={() => {
                   if (window.innerWidth < 768) setIsListOpen(false);
               }}
               className={`block p-4 border-b hover:bg-zinc-50 cursor-pointer transition-colors ${id === conv.id ? 'bg-emerald-50 hover:bg-emerald-50' : ''}`}
            >
                <div className="flex justify-between items-start mb-1">
                  <span className={clsx(
                     "text-sm truncate pr-2 flex items-center",
                     effectiveUnread > 0 ? "font-bold text-zinc-900" : "font-semibold text-zinc-600"
                  )}>
                     <User className={clsx("w-3 h-3 mr-1.5 shrink-0", effectiveUnread > 0 ? "text-emerald-500" : "text-zinc-400")} />
                     {getContactInfo(conv.contactId).name}
                  </span>
                  <span className={clsx("text-[10px] shrink-0", effectiveUnread > 0 ? "text-emerald-600 font-bold" : "text-zinc-500")}>
                     {conv.lastMessageAt ? formatDistanceToNow(new Date(conv.lastMessageAt), { addSuffix: true, locale: ptBR }) : ''}
                  </span>
                </div>
                {conv.last_message_content && (
                  <p className={clsx(
                     "text-xs truncate mb-1 line-clamp-1",
                     effectiveUnread > 0 ? "text-zinc-900 font-medium" : "text-zinc-400"
                  )}>
                    {conv.last_message_content}
                  </p>
                )}
                <div className="flex justify-between items-center mt-2">
                 <div className="flex gap-1 overflow-hidden flex-wrap max-w-[80%]">
                    {conv.status && conv.status !== 'open' && (() => {
                       const custom = customStatuses.find(s => String(s.id) === String(conv.status));
                       if (custom) {
                          const hex = custom.color || '#e4e4e7';
                          const r = parseInt(hex.slice(1, 3), 16);
                          const g = parseInt(hex.slice(3, 5), 16);
                          const b = parseInt(hex.slice(5, 7), 16);
                          const brightness = (r * 299 + g * 587 + b * 114) / 1000;
                          const textColor = brightness > 128 ? 'text-zinc-900' : 'text-white';
                          return (
                             <Badge style={{ backgroundColor: custom.color, borderColor: custom.color }} className={clsx("text-[9px] py-0.5 px-1.5 border shadow-sm font-bold", textColor)}>
                                {custom.name}
                             </Badge>
                          );
                       }
                       const colorClass = conv.status === 'pending' ? 'bg-amber-500 text-white hover:bg-amber-600 border-amber-600 shadow-sm' :
                                          conv.status === 'snoozed' ? 'bg-blue-500 text-white hover:bg-blue-600 border-blue-600 shadow-sm' :
                                          conv.status === 'closed' ? 'bg-emerald-500 text-white hover:bg-emerald-600 border-emerald-600 shadow-sm' :
                                          'bg-zinc-500 text-white hover:bg-zinc-600 border-zinc-200 shadow-sm';
                       return (
                       <Badge className={clsx("text-[9px] py-0 px-1 font-bold", colorClass)}>
                          {statusMap[conv.status] || conv.status}
                       </Badge>
                       );
                    })()}
                    {conv.tags && Array.isArray(conv.tags) && conv.tags.slice(0, 2).map((t: string) => {
                       const [tName, tColor = '#10b981'] = t.split('::');
                       return (
                       <Badge key={t} style={{ color: tColor, borderColor: tColor }} className="text-[9px] py-0 px-1 truncate max-w-[60px] bg-transparent border">{tName}</Badge>
                       );
                    })}
                    {conv.agent_id && (
                       <Badge variant="outline" className="text-[9px] py-0 px-1 text-zinc-600 bg-white border-zinc-200 truncate max-w-[60px]">
                          @ {conv.agent_id}
                       </Badge>
                    )}
                 </div>
                 {effectiveUnread > 0 && (
                   <span className="bg-emerald-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full min-w-[20px] text-center">
                     {effectiveUnread}
                   </span>
                 )}
               </div>
            </Link>
          )})}
        </div>
      </div>

      {/* Main Area */}
      <div className="flex-1 flex flex-col relative w-full overflow-hidden">
         {/* Toggle List Button */}
         {id && (
             <Button 
               variant="outline" 
               size="icon" 
               className="absolute top-3 left-3 z-30 bg-white shadow-sm border h-8 w-8 rounded-full" 
               onClick={() => setIsListOpen(!isListOpen)}
             >
                {isListOpen ? <ChevronLeft className="w-4 h-4 text-zinc-600" /> : <ChevronRight className="w-4 h-4 text-zinc-600" />}
             </Button>
         )}

         {id ? (
            <Outlet context={{ contactsCache }} />
         ) : (
            <div className="h-full flex items-center justify-center bg-zinc-50/50 flex-col text-center p-8">
               <div className="w-16 h-16 rounded-full bg-zinc-100 flex items-center justify-center mb-4">
                  <Search className="w-8 h-8 text-zinc-400" />
               </div>
               <h3 className="text-xl font-medium text-zinc-700 mb-2">Selecione uma conversa</h3>
               <p className="text-zinc-500 max-w-md">Para iniciar uma nova conversa ou enviar uma campanha, acesse os Modelos Meta ou Crie uma Campanha de Envio em Massa.</p>
            </div>
         )}
      </div>
    </div>
  );
}
