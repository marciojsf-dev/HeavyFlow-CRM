import { useEffect, useState, useMemo } from 'react';
import { useAuth } from '../lib/AuthContext';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { MessageSquare, Kanban, Search, Filter, Building, Users, Tags } from 'lucide-react';
import { db } from '../lib/firebase';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { useNavigate } from 'react-router-dom';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { formatPhone } from '../lib/phoneUtils';
import { io } from 'socket.io-client';
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';

const DraggableItem = Draggable as any;
const DroppableArea = Droppable as any;

interface Contact {
  whatsapp_id: string;
  name: string;
  status: string;
  last_message_at: any;
  unread_count: number;
  tags: string[];
  agent_id: string;
  department_id: string;
}

interface CustomStatus {
  id: string;
  name: string;
  color: string;
}

export const DEFAULT_SYSTEM_STATUSES = [
  { id: 'open', name: 'Em Aberto', color: '#3b82f6', isSystem: true },
  { id: 'pending', name: 'Aguardando Cliente', color: '#f59e0b', isSystem: true },
  { id: 'snoozed', name: 'Adiado', color: '#8b5cf6', isSystem: true },
  { id: 'closed', name: 'Resolvido', color: '#10b981', isSystem: true },
];

export function Board() {
  const { profile } = useAuth();
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [statuses, setStatuses] = useState<CustomStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const navigate = useNavigate();

  const effectiveTeamId = profile?.teamId || 'team_ivw2d5s3u';

  const [departments, setDepartments] = useState<any[]>([]);
  const [teamMembers, setTeamMembers] = useState<any[]>([]);
  
  // Filter States
  const [filterDepartment, setFilterDepartment] = useState('all');
  const [filterAgent, setFilterAgent] = useState('all');
  const [filterTags, setFilterTags] = useState<string[]>([]);
  const [isFilterModalOpen, setIsFilterModalOpen] = useState(false);

  useEffect(() => {
    if (profile?.role === 'agent' && profile?.name) {
      setFilterAgent(profile.name);
    }
  }, [profile]);

  // Mapped Columns: System statuses + Company custom statuses
  const columns = useMemo(() => {
    const customCols = statuses.map(s => ({
      id: String(s.id),
      name: s.name,
      color: s.color || '#64748b',
      isSystem: false
    }));
    return [...DEFAULT_SYSTEM_STATUSES, ...customCols];
  }, [statuses]);

  const getContactColumnId = (contactStatus: string | undefined, allCols: { id: string; name: string }[]) => {
    if (!contactStatus) return 'open';
    const statusStr = String(contactStatus).trim().toLowerCase();
    
    // 1. Direct ID match
    const directMatch = allCols.find(c => String(c.id).toLowerCase() === statusStr);
    if (directMatch) return directMatch.id;

    // 2. Name match (case-insensitive)
    const nameMatch = allCols.find(c => c.name.toLowerCase() === statusStr);
    if (nameMatch) return nameMatch.id;

    // 3. Status aliases mapping
    if (statusStr === 'aberto' || statusStr === 'open' || statusStr === 'novo') return 'open';
    if (statusStr === 'aguardando' || statusStr === 'pending' || statusStr === 'pendente' || statusStr === 'aguardando cliente') return 'pending';
    if (statusStr === 'adiado' || statusStr === 'snoozed' || statusStr === 'pausado') return 'snoozed';
    if (statusStr === 'resolvido' || statusStr === 'closed' || statusStr === 'fechado' || statusStr === 'finalizado') return 'closed';

    return 'open';
  };

  useEffect(() => {
    fetchData();

    const socket = io();
    socket.emit('join', effectiveTeamId);
    socket.emit('join_team', effectiveTeamId);

    socket.on('contact_updated', (data) => {
      setContacts(prev => prev.map(c => 
        c.whatsapp_id === data.whatsapp_id ? { ...c, status: data.status } : c
      ));
    });

    socket.on('conversation:updated', () => {
      fetchData();
    });

    socket.on('chat_update', (data) => {
      setContacts(prev => {
        const idx = prev.findIndex(c => c.whatsapp_id === data.contact_whatsapp_id);
        if (idx >= 0) {
           const newContacts = [...prev];
           newContacts[idx] = { ...newContacts[idx], last_message_at: new Date() };
           return newContacts;
        }
        return prev;
      });
    });

    socket.on('whatsapp:message_received', () => {
      setTimeout(fetchData, 800);
    });

    return () => {
      socket.disconnect();
    };
  }, [profile?.teamId]);

  const fetchData = async () => {
    try {
      const [stsRes, cntRes] = await Promise.all([
        fetch(`/api/custom-statuses?teamId=${effectiveTeamId}`),
        fetch(`/api/contacts?teamId=${effectiveTeamId}`)
      ]);
      const stsData = await stsRes.json();
      const cntData = await cntRes.json();
      
      if (effectiveTeamId) {
        try {
          const deptQ = query(collection(db, 'departments'), where('teamId', '==', effectiveTeamId));
          const deptSnap = await getDocs(deptQ);
          setDepartments(deptSnap.docs.map(d => ({ id: d.id, ...d.data() })));
          
          const usrQ = query(collection(db, 'users'), where('teamId', '==', effectiveTeamId));
          const usrSnap = await getDocs(usrQ);
          setTeamMembers(usrSnap.docs.map(d => ({ id: d.id, ...d.data() })));
        } catch(e) { console.warn("Firebase fetch error", e); }
      }

      setStatuses(Array.isArray(stsData) ? stsData.map((s: any) => ({ id: s.id.toString(), name: s.name, color: s.color })) : []);
      setContacts(Array.isArray(cntData) ? cntData.map((c: any) => ({
        whatsapp_id: c.whatsapp_id,
        name: c.name || formatPhone(c.whatsapp_id) || 'Desconhecido',
        status: c.status || 'open',
        last_message_at: c.last_message_at || c.created_at,
        unread_count: c.unread_count || 0,
        tags: c.tags || [],
        agent_id: c.agent_id || '',
        department_id: c.department_id || ''
      })) : []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const onDragEnd = async (result: any) => {
    const { destination, source, draggableId } = result;

    if (!destination) return;
    if (destination.droppableId === source.droppableId) return; // Same column

    const newStatusId = destination.droppableId;
    const oldStatusId = source.droppableId;
    
    // Optimistic UI update
    setContacts(prev => prev.map(c => 
      c.whatsapp_id === draggableId ? { ...c, status: newStatusId } : c
    ));

    try {
      const res = await fetch(`/api/contacts/${draggableId}/status`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatusId, teamId: effectiveTeamId })
      });
      
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Erro ao atualizar status');
      }
      toast.success('Status atualizado!');
    } catch (e: any) {
      console.error("Fail to save status", e);
      toast.error('Erro ao salvar alteração no Kanban: ' + (e.message || 'Falha na conexão'));
      // Rollback optimistic update
      setContacts(prev => prev.map(c => 
        c.whatsapp_id === draggableId ? { ...c, status: oldStatusId } : c
      ));
    }
  };

  const allTags = useMemo(() => {
    const tagsSet = new Set<string>();
    contacts.forEach(c => c.tags?.forEach(t => tagsSet.add(t)));
    return Array.from(tagsSet).sort();
  }, [contacts]);

  const toggleTagFilter = (tag: string) => {
    setFilterTags(prev => 
      prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag]
    );
  };

  const filteredContacts = contacts.filter(c => {
    const searchMatch = c.name.toLowerCase().includes(search.toLowerCase()) || c.whatsapp_id.includes(search);
    const deptMatch = filterDepartment === 'all' || c.department_id === filterDepartment;
    const agentMatch = filterAgent === 'all' || c.agent_id === filterAgent;
    const tagsMatch = filterTags.length === 0 || filterTags.some(tag => c.tags?.includes(tag));
    
    return searchMatch && deptMatch && agentMatch && tagsMatch;
  });

  if (loading) {
    return <div className="h-full flex items-center justify-center bg-zinc-50"><div className="w-8 h-8 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin"></div></div>;
  }

  return (
    <div className="h-full flex flex-col bg-zinc-50/50">
      <div className="p-4 md:p-6 pb-0 shrink-0">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-zinc-900 flex items-center gap-2">
              <Kanban className="w-6 h-6 text-emerald-500" />
              Kanban Dinâmico
            </h1>
            <p className="text-zinc-500 text-sm mt-1">
              Gerencie seus atendimentos e funil de vendas combinando status padrão e personalizados.
            </p>
          </div>
          
          <div className="flex w-full sm:w-auto items-center gap-2">
            <div className="relative flex-1 sm:w-72">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-zinc-400" />
              <Input
                type="text"
                placeholder="Buscar cliente ou telefone..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9 bg-white shadow-xs"
              />
            </div>

            <Dialog open={isFilterModalOpen} onOpenChange={setIsFilterModalOpen}>
              <DialogTrigger asChild>
                <Button variant="outline" className="shrink-0 bg-white">
                  <Filter className="w-4 h-4 mr-2" />
                  Filtros
                  {(filterDepartment !== 'all' || (filterAgent !== 'all' && profile?.role !== 'agent') || filterTags.length > 0) && (
                    <Badge variant="secondary" className="ml-2 h-5 w-5 p-0 flex items-center justify-center rounded-full bg-emerald-100 text-emerald-700">!</Badge>
                  )}
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-[425px]">
                <DialogHeader>
                  <DialogTitle>Filtros do Kanban</DialogTitle>
                </DialogHeader>
                <div className="space-y-4 py-4">
                  <div className="space-y-2">
                    <Label>Departamento</Label>
                    <Select value={filterDepartment} onValueChange={setFilterDepartment}>
                      <SelectTrigger>
                        <SelectValue placeholder="Todos os departamentos">
                          {filterDepartment === 'all' ? 'Todos' : departments.find(d => d.id === filterDepartment)?.name}
                        </SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">Todos</SelectItem>
                        {departments.map(d => (
                          <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label>Agente</Label>
                    <Select 
                      value={filterAgent} 
                      onValueChange={setFilterAgent}
                      disabled={profile?.role === 'agent'}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Todos os agentes">
                          {filterAgent === 'all' ? 'Todos' : filterAgent}
                        </SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">Todos</SelectItem>
                        {teamMembers.map(m => (
                          <SelectItem key={m.id} value={m.name}>{m.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {profile?.role === 'agent' && (
                      <p className="text-xs text-zinc-500">Agentes podem ver apenas seus próprios atendimentos.</p>
                    )}
                  </div>

                  <div className="space-y-2">
                    <Label className="flex items-center gap-2"><Tags className="w-3.5 h-3.5" /> Tags e Etiquetas</Label>
                    {allTags.length === 0 ? (
                      <p className="text-sm text-zinc-500">Nenhuma tag encontrada.</p>
                    ) : (
                      <div className="flex flex-wrap gap-2 pt-1 max-h-32 overflow-y-auto custom-scrollbar">
                        {allTags.map(tag => {
                          const [tagName, tagColor = '#10b981'] = tag.split("::");
                          return (
                          <Badge 
                            key={tag}
                            variant={filterTags.includes(tag) ? "default" : "outline"}
                            className="cursor-pointer"
                            style={{ 
                               backgroundColor: filterTags.includes(tag) ? tagColor : 'transparent',
                               borderColor: tagColor,
                               color: filterTags.includes(tag) ? '#fff' : tagColor
                            }}
                            onClick={() => toggleTagFilter(tag)}
                          >
                            {tagName}
                          </Badge>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
                <div className="flex justify-end gap-2">
                  <Button variant="ghost" onClick={() => {
                    setFilterDepartment('all');
                    setFilterAgent(profile?.role === 'agent' ? (profile?.name || 'all') : 'all');
                    setFilterTags([]);
                  }}>Limpar</Button>
                  <Button onClick={() => setIsFilterModalOpen(false)}>Aplicar</Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-x-auto overflow-y-hidden p-4 md:p-6 pt-0">
        <DragDropContext onDragEnd={onDragEnd}>
          <div className="flex h-full gap-4 items-start pb-4">
            {columns.map(col => {
               const colContacts = filteredContacts.filter(c => {
                 const targetColId = getContactColumnId(c.status, columns);
                 return targetColId === col.id;
               });
               
               return (
                 <DroppableArea droppableId={col.id} key={col.id}>
                   {(provided: any, snapshot: any) => (
                     <div 
                       ref={provided.innerRef}
                       {...provided.droppableProps}
                       className={`w-80 shrink-0 flex flex-col h-full bg-zinc-100/80 border border-zinc-200 rounded-xl overflow-hidden transition-colors ${snapshot.isDraggingOver ? 'bg-zinc-200/50' : ''}`}
                     >
                        <div className="p-3 border-b border-zinc-200 bg-white/70 flex items-center justify-between shrink-0">
                          <div className="flex items-center gap-2 min-w-0 pr-2">
                            <div className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: col.color }} />
                            <h3 className="font-semibold text-sm text-zinc-800 truncate" title={col.name}>{col.name}</h3>
                          </div>
                          <div className="flex items-center gap-1.5 shrink-0">
                            {col.isSystem && (
                              <span className="text-[10px] uppercase font-semibold text-zinc-400 px-1 py-0.5 bg-zinc-100 rounded">
                                Padrão
                              </span>
                            )}
                            <Badge variant="secondary" className="bg-white text-zinc-700 font-bold text-xs shadow-2xs">
                              {colContacts.length}
                            </Badge>
                          </div>
                        </div>
                        
                        <div className="flex-1 overflow-y-auto p-3 space-y-3 custom-scrollbar">
                          {colContacts.map((contact, index) => (
                            <DraggableItem key={contact.whatsapp_id} draggableId={contact.whatsapp_id} index={index}>
                              {(provided: any, snapshot: any) => (
                                <div
                                  ref={provided.innerRef}
                                  {...provided.draggableProps}
                                  {...provided.dragHandleProps}
                                  onClick={() => navigate(`/inbox/${contact.whatsapp_id}`)}
                                  className={`bg-white p-4 border border-zinc-200 rounded-lg shadow-sm hover:border-emerald-300 hover:shadow-md transition-all cursor-grab active:cursor-grabbing ${snapshot.isDragging ? 'shadow-xl scale-[1.02] rotate-1 z-50' : ''}`}
                                >
                                  <div className="flex justify-between items-start mb-2">
                                    <h4 className="font-semibold text-sm text-zinc-900 line-clamp-1 pr-2">{contact.name}</h4>
                                    {contact.unread_count > 0 && (
                                      <Badge className="bg-emerald-500 hover:bg-emerald-600 shrink-0 h-5 px-1.5 min-w-[20px] flex items-center justify-center text-[10px]">
                                        {contact.unread_count}
                                      </Badge>
                                    )}
                                  </div>
                                  
                                  <div className="flex items-center text-xs text-zinc-500 mb-2">
                                    <div className="flex items-center gap-1.5 truncate">
                                      <MessageSquare className="w-3.5 h-3.5 shrink-0" />
                                      <span className="truncate">{formatPhone(contact.whatsapp_id)}</span>
                                    </div>
                                  </div>

                                  {(contact.department_id || contact.agent_id) && (
                                    <div className="flex flex-col gap-1 mt-3 mb-2 bg-zinc-50/80 p-2 rounded border border-zinc-100">
                                      {contact.department_id && (
                                        <div className="flex items-center gap-1.5 text-[10px] text-zinc-600">
                                          <Building className="w-3 h-3 text-zinc-400 shrink-0" />
                                          <span className="truncate">
                                            {departments.find(d => d.id === contact.department_id)?.name || 'Depto. Desconhecido'}
                                          </span>
                                        </div>
                                      )}
                                      {contact.agent_id && (
                                        <div className="flex items-center gap-1.5 text-[10px] text-zinc-600">
                                          <Users className="w-3 h-3 text-zinc-400 shrink-0" />
                                          <span className="truncate">{contact.agent_id}</span>
                                        </div>
                                      )}
                                    </div>
                                  )}

                                  {contact.tags && contact.tags.length > 0 && (
                                    <div className="flex flex-wrap gap-1 mt-2">
                                      {contact.tags.map((tag, idx) => {
                                        const [tagName, tagColor = '#10b981'] = tag.split("::");
                                        return (
                                        <Badge key={idx} variant="secondary" className="text-[9px] px-1.5 py-0 h-4 font-medium text-white shadow-none" style={{ backgroundColor: tagColor, borderColor: tagColor }}>
                                          {tagName}
                                        </Badge>
                                        );
                                      })}
                                    </div>
                                  )}
                                  
                                  {contact.last_message_at && (
                                    <div className="mt-3 text-[10px] text-zinc-400 font-medium bg-zinc-50 py-1 px-2 rounded inline-block">
                                      {formatDistanceToNow(new Date(contact.last_message_at), { addSuffix: true, locale: ptBR })}
                                    </div>
                                  )}
                                </div>
                              )}
                            </DraggableItem>
                          ))}
                          {provided.placeholder}
                        </div>
                     </div>
                   )}
                 </DroppableArea>
               );
            })}
          </div>
        </DragDropContext>
      </div>
    </div>
  );
}
