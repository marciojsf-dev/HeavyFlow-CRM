import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle, 
} from "@/components/ui/dialog";
import { 
  CheckCircle2, 
  Clock, 
  AlertCircle, 
  Eye, 
  MessageSquare, 
  Check, 
  CheckCheck,
  Search,
  ExternalLink
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

interface CampaignContact {
  id: number;
  whatsapp_id: string;
  status: string;
  sent_at: string;
  delivered_at: string;
  read_at: string;
  replied_at: string;
  error?: string;
}

interface Campaign {
  id: number;
  name: string;
  status: string;
  total_contacts: number;
  sent_count: number;
  delivered_count: number;
  read_count: number;
  replied_count: number;
  failed_count: number;
}

export function CampaignDetails({ 
  campaignId, 
  open, 
  onOpenChange 
}: { 
  campaignId: number | null; 
  open: boolean; 
  onOpenChange: (open: boolean) => void;
}) {
  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [contacts, setContacts] = useState<CampaignContact[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');

  const fetchDetails = async () => {
    if (!campaignId) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/campaigns/${campaignId}`);
      if (res.ok) {
        const data = await res.json();
        setCampaign(data);
        setContacts(data.contacts || []);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open && campaignId) {
      fetchDetails();
      const interval = setInterval(fetchDetails, 5000);
      return () => clearInterval(interval);
    }
  }, [open, campaignId]);

  const filteredContacts = contacts.filter(c => 
    c.whatsapp_id.includes(search) || 
    (c.error && c.error.toLowerCase().includes(search.toLowerCase()))
  );

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'SENT': return <Check className="w-3 h-3 text-zinc-400" />;
      case 'DELIVERED': return <CheckCheck className="w-3 h-3 text-zinc-400" />;
      case 'READ': return <CheckCheck className="w-3 h-3 text-emerald-500" />;
      case 'REPLIED': return <MessageSquare className="w-3 h-3 text-blue-500" />;
      case 'FAILED': return <AlertCircle className="w-3 h-3 text-red-500" />;
      default: return <Clock className="w-3 h-3 text-zinc-300" />;
    }
  };

  const getCampaignStatusLabel = (status: string) => {
    switch (status) {
      case 'DRAFT': return 'Rascunho';
      case 'RUNNING': return 'Em Execução';
      case 'COMPLETED': return 'Concluído';
      case 'PAUSED': return 'Pausado';
      case 'FAILED': return 'Falhou';
      default: return status;
    }
  };

  const getCampaignStatusClass = (status: string) => {
    switch (status) {
      case 'RUNNING': return 'bg-blue-500 hover:bg-blue-600';
      case 'COMPLETED': return 'bg-emerald-500 hover:bg-emerald-600';
      case 'FAILED': return 'bg-red-500 hover:bg-red-600';
      case 'DRAFT': return 'bg-zinc-500 hover:bg-zinc-600';
      default: return '';
    }
  };

  const getContactStatusLabel = (status: string) => {
    switch (status) {
      case 'PENDING': return 'Pendente';
      case 'SENT': return 'Enviado';
      case 'DELIVERED': return 'Entregue';
      case 'READ': return 'Lido';
      case 'REPLIED': return 'Respondido';
      case 'FAILED': return 'Falhou';
      case 'sent': return 'Enviado';
      case 'delivered': return 'Entregue';
      case 'read': return 'Lido';
      case 'failed': return 'Falhou';
      default: return status;
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-4xl max-h-[90vh] flex flex-col p-0 overflow-hidden">
        <DialogHeader className="px-6 py-4 border-b shrink-0">
          <div className="flex items-center justify-between">
            <div>
               <DialogTitle className="text-xl font-bold text-zinc-900">{campaign?.name}</DialogTitle>
               <p className="text-xs text-zinc-500 mt-1">Detalhes do envio e engajamento dos contatos</p>
            </div>
            {campaign && (
               <Badge variant="secondary" className={`text-white border-none ${getCampaignStatusClass(campaign.status)}`}>
                  {getCampaignStatusLabel(campaign.status)}
               </Badge>
            )}
          </div>
        </DialogHeader>

        {/* Stats Summary */}
        <div className="px-6 py-4 bg-zinc-50 border-b grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-4 shrink-0">
           <div className="p-3 bg-white rounded-xl border border-zinc-200 shadow-sm">
              <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider block mb-1">Total</span>
              <div className="flex items-baseline gap-2">
                 <span className="text-xl font-bold text-zinc-900">{campaign?.total_contacts || 0}</span>
                 <span className="text-[11px] text-zinc-500">contatos</span>
              </div>
           </div>
           <div className="p-3 bg-white rounded-xl border border-zinc-200 shadow-sm">
              <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider block mb-1">Caminho</span>
              <div className="flex items-baseline gap-2">
                 <span className="text-xl font-bold text-zinc-900">{campaign?.sent_count || 0}</span>
                 <span className="text-[11px] text-emerald-600 font-medium">{Math.round(((campaign?.sent_count || 0) / (campaign?.total_contacts || 1)) * 100)}%</span>
              </div>
           </div>
           <div className="p-3 bg-white rounded-xl border border-zinc-200 shadow-sm">
              <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider block mb-1">Leitura</span>
              <div className="flex items-baseline gap-2">
                 <span className="text-xl font-bold text-emerald-600">{campaign?.read_count || 0}</span>
                 <span className="text-[11px] text-emerald-600 font-medium">{Math.round(((campaign?.read_count || 0) / (campaign?.total_contacts || 1)) * 100)}%</span>
              </div>
           </div>
           <div className="p-3 bg-white rounded-xl border border-zinc-200 shadow-sm">
              <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider block mb-1">Respostas</span>
              <div className="flex items-baseline gap-2">
                 <span className="text-xl font-bold text-blue-600">{campaign?.replied_count || 0}</span>
                 <span className="text-[11px] text-blue-600 font-medium">{Math.round(((campaign?.replied_count || 0) / (campaign?.total_contacts || 1)) * 100)}%</span>
              </div>
           </div>
           <div className="p-3 bg-white rounded-xl border border-zinc-200 shadow-sm">
              <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider block mb-1">Falhas</span>
              <div className="flex items-baseline gap-2">
                 <span className="text-xl font-bold text-red-500">{campaign?.failed_count || 0}</span>
                 <span className="text-[11px] text-red-400">{Math.round(((campaign?.failed_count || 0) / (campaign?.total_contacts || 1)) * 100)}%</span>
              </div>
           </div>
        </div>

        <div className="flex-1 overflow-hidden flex flex-col">
           <div className="px-6 py-3 border-b flex items-center justify-between gap-4 shrink-0 bg-white">
              <div className="relative flex-1 max-w-sm">
                 <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
                 <Input 
                   placeholder="Buscar por número ou erro..." 
                   className="pl-9 h-9"
                   value={search}
                   onChange={e => setSearch(e.target.value)}
                 />
              </div>
              <div className="flex gap-2">
                 <Button variant="outline" size="sm" onClick={fetchDetails}>Atualizar</Button>
              </div>
           </div>

           <div className="flex-1 overflow-y-auto min-h-[300px]">
              <table className="w-full text-left border-collapse">
                 <thead className="sticky top-0 bg-white border-b z-10 shadow-sm">
                    <tr>
                       <th className="px-6 py-3 text-[11px] font-bold text-zinc-400 uppercase tracking-wider">Contato</th>
                       <th className="px-6 py-3 text-[11px] font-bold text-zinc-400 uppercase tracking-wider">Status</th>
                       <th className="px-6 py-3 text-[11px] font-bold text-zinc-400 uppercase tracking-wider">Envio</th>
                       <th className="px-6 py-3 text-[11px] font-bold text-zinc-400 uppercase tracking-wider">Entrega/Leitura</th>
                       <th className="px-6 py-3 text-[11px] font-bold text-zinc-400 uppercase tracking-wider">Ações</th>
                    </tr>
                 </thead>
                 <tbody className="divide-y">
                    {filteredContacts.map(c => (
                       <tr key={c.id} className="hover:bg-zinc-50 transition-colors">
                          <td className="px-6 py-4">
                             <div className="font-medium text-sm text-zinc-900">{c.whatsapp_id}</div>
                          </td>
                          <td className="px-6 py-4">
                             <div className="flex items-center gap-2">
                                <div className="p-1 bg-zinc-100 rounded-full">
                                   {getStatusIcon(c.status)}
                                </div>
                                <span className={`text-xs font-medium ${c.status === 'FAILED' ? 'text-red-500' : 'text-zinc-600'}`}>
                                   {getContactStatusLabel(c.status)}
                                </span>
                             </div>
                             {c.error && <p className="text-[10px] text-red-400 mt-1 max-w-[200px] truncate" title={c.error}>{c.error}</p>}
                          </td>
                          <td className="px-6 py-4">
                             <div className="text-xs text-zinc-500">
                                {c.sent_at ? new Date(c.sent_at).toLocaleString() : '-'}
                             </div>
                          </td>
                          <td className="px-6 py-4">
                             <div className="space-y-1">
                                {c.delivered_at && (
                                   <div className="flex items-center gap-1.5 text-[10px] text-zinc-500">
                                      <CheckCheck className="w-3 h-3 text-zinc-300" />
                                      <span>Entregue: {new Date(c.delivered_at).toLocaleTimeString()}</span>
                                   </div>
                                )}
                                {c.read_at && (
                                   <div className="flex items-center gap-1.5 text-[10px] text-zinc-500">
                                      <CheckCheck className="w-3 h-3 text-emerald-500" />
                                      <span className="text-emerald-600 font-medium">Lido: {new Date(c.read_at).toLocaleTimeString()}</span>
                                   </div>
                                )}
                                {c.replied_at && (
                                   <div className="flex items-center gap-1.5 text-[10px] text-zinc-500">
                                      <MessageSquare className="w-3 h-3 text-blue-500" />
                                      <span className="text-blue-600 font-medium">Respondido: {new Date(c.replied_at).toLocaleTimeString()}</span>
                                   </div>
                                )}
                                {!c.delivered_at && !c.read_at && !c.replied_at && <span className="text-xs text-zinc-300">-</span>}
                             </div>
                          </td>
                          <td className="px-6 py-4">
                             <Button variant="ghost" size="sm" asChild className="h-8 w-8 p-0">
                                <Link to={`/inbox?contactId=${c.whatsapp_id}`} title="Ver conversa">
                                   <MessageSquare className="w-4 h-4 text-zinc-400" />
                                </Link>
                             </Button>
                          </td>
                       </tr>
                    ))}
                    {filteredContacts.length === 0 && (
                       <tr>
                          <td colSpan={5} className="px-6 py-12 text-center text-zinc-500">
                             Nenhum contato encontrado
                          </td>
                       </tr>
                    )}
                 </tbody>
              </table>
           </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
