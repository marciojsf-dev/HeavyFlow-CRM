import React, { useState, useEffect, useRef } from 'react';
import { collection, query, where, orderBy, onSnapshot, doc, updateDoc, serverTimestamp, getDocs } from 'firebase/firestore';
import { db, handleFirestoreError } from '../lib/firebase';
import { useAuth } from '../lib/AuthContext';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Play, Pause, Plus, Calendar, Target, Eye } from 'lucide-react';
import { CampaignWizard } from '../components/CampaignWizard';
import { CampaignDetails } from '../components/CampaignDetails';

export function Campaigns() {
  const { profile } = useAuth();
  const [campaigns, setCampaigns] = useState<any[]>([]);
  const [templates, setTemplates] = useState<any[]>([]);
  const [customStatuses, setCustomStatuses] = useState<any[]>([]);
  const [isNewOpen, setIsNewOpen] = useState(false);
  const [selectedCampaignId, setSelectedCampaignId] = useState<number | null>(null);
  const [isDetailsOpen, setIsDetailsOpen] = useState(false);
  const isRunningRef = useRef<Set<string>>(new Set());
  
  useEffect(() => {
    if (!profile?.teamId) return;
    
    fetchCampaigns();
    fetchTemplates();
    fetchCustomStatuses();

    // Poll for running campaigns every 5 seconds
    const interval = setInterval(() => {
      fetchCampaigns();
    }, 5000);

    return () => clearInterval(interval);
  }, [profile?.teamId]);

  const fetchCampaigns = async () => {
    try {
      const teamId = profile?.teamId || 'main-team';
      const res = await fetch(`/api/campaigns?teamId=${teamId}`);
      if (!res.ok) throw new Error("Failed to fetch campaigns");
      const camps = await res.json();
      setCampaigns(camps || []);
    } catch (err) {
      console.error(err);
    }
  };

  const fetchTemplates = async () => {
    try {
      const teamId = profile?.teamId || 'main-team';
      const res = await fetch(`/api/templates?teamId=${teamId}`);
      if (!res.ok) throw new Error("Failed to fetch templates");
      const data = await res.json();
      setTemplates(data.filter((t: any) => t.status === 'APPROVED'));
    } catch (err) {
      console.error(err);
    }
  };

  const fetchCustomStatuses = async () => {
    try {
      const teamId = profile?.teamId || 'main-team';
      const res = await fetch(`/api/custom-statuses?teamId=${teamId}`);
      if (!res.ok) throw new Error("Failed to fetch statuses");
      const data = await res.json();
      setCustomStatuses(data);
    } catch (err) {
      console.error(err);
    }
  };

  const updateStatus = async (id: string | number, status: string) => {
     try {
        if (status === 'RUNNING') {
          await fetch(`/api/campaigns/${id}/send`, { method: 'POST' });
        } else if (status === 'DRAFT') {
          await fetch(`/api/campaigns/${id}/pause`, { method: 'POST' });
        }
        await fetchCampaigns();
     } catch (err) {
        console.error("Update status error:", err);
     }
  }

  const getStatusBadge = (status: string) => {
     const val = status.toUpperCase();
     switch(val) {
        case 'DRAFT': return <Badge variant="secondary">Rascunho</Badge>;
        case 'SCHEDULED': return <Badge variant="outline" className="text-blue-600 border-blue-200 bg-blue-50">Agendado</Badge>;
        case 'RUNNING': return <Badge variant="outline" className="text-emerald-600 border-emerald-200 bg-emerald-50 animate-pulse">Executando</Badge>;
        case 'COMPLETED': return <Badge variant="outline" className="text-zinc-600 border-zinc-200 bg-zinc-50">Concluído</Badge>;
        case 'FAILED': return <Badge variant="destructive">Falha</Badge>;
        default: return <Badge variant="secondary">{status}</Badge>;
     }
  };

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto w-full">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-8">
        <div>
           <h1 className="text-2xl md:text-3xl font-bold text-zinc-900">Envio em Massa</h1>
           <p className="text-zinc-500 mt-1">Dispare mensagens de modelos aprovados respeitando os limites da Meta.</p>
        </div>
        
        <Button className="bg-emerald-600 hover:bg-emerald-700 w-full sm:w-auto h-11" onClick={() => setIsNewOpen(true)}>
           <Plus className="w-5 h-5 mr-2" /> Nova Campanha
        </Button>
        <CampaignWizard 
          open={isNewOpen} 
          onOpenChange={setIsNewOpen} 
          templates={templates}
          customStatuses={customStatuses}
          onSuccess={fetchCampaigns}
        />
      </div>

      <div className="bg-white rounded-xl border border-zinc-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="bg-zinc-50 border-b text-zinc-500 font-medium whitespace-nowrap">
              <tr>
                <th className="px-6 py-4">Campanha</th>
                <th className="px-6 py-4">Modelo</th>
                <th className="px-6 py-4">Progresso</th>
                <th className="px-6 py-4">Status</th>
                <th className="px-6 py-4 text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {campaigns.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-6 py-20 text-center text-zinc-400">
                    <div className="flex flex-col items-center">
                       <Target className="w-10 h-10 mb-2 opacity-20" />
                       <p>Nenhuma campanha encontrada.</p>
                    </div>
                  </td>
                </tr>
              )}
              {campaigns.map(camp => (
                <tr 
                  key={camp.id} 
                  className="hover:bg-zinc-50 transition-colors cursor-pointer group"
                  onClick={() => {
                    setSelectedCampaignId(camp.id);
                    setIsDetailsOpen(true);
                  }}
                >
                  <td className="px-6 py-4">
                     <div className="font-semibold text-zinc-900 group-hover:text-emerald-600 transition-colors">{camp.name}</div>
                     <div className="text-[10px] text-zinc-500 flex items-center mt-1">
                        <Calendar className="w-3 h-3 mr-1" />
                        {camp.created_at ? format(new Date(camp.created_at), "dd/MM/yyyy HH:mm", { locale: ptBR }) : '...'}
                     </div>
                  </td>
                  <td className="px-6 py-4">
                     <Badge variant="outline" className="font-normal truncate max-w-[150px]">
                        {camp.template_name || '...'}
                     </Badge>
                  </td>
                   <td className="px-6 py-4">
                      <div className="space-y-1.5 w-48">
                         <div className="flex justify-between text-[10px] text-zinc-500">
                            <span>{camp.sent_count || 0} / {camp.total_contacts || 0}</span>
                            <span>{Math.round((( (camp.sent_count || 0) + (camp.failed_count || 0) ) / (camp.total_contacts || 1)) * 100)}%</span>
                         </div>
                         <div className="w-full bg-zinc-100 h-1.5 rounded-full overflow-hidden flex">
                            <div 
                              className="bg-emerald-500 h-full transition-all duration-500" 
                              style={{ width: `${Math.min(100, ((camp.sent_count || 0) / (camp.total_contacts || 1)) * 100)}%` }}
                              title="Enviado"
                            />
                            <div 
                              className="bg-red-400 h-full transition-all duration-500" 
                              style={{ width: `${Math.min(100, ((camp.failed_count || 0) / (camp.total_contacts || 1)) * 100)}%` }}
                              title="Falhou"
                            />
                         </div>
                         <div className="flex gap-3 text-[9px]">
                            {camp.delivered_count > 0 && (
                               <div className="flex items-center text-zinc-500">
                                  <div className="w-1.5 h-1.5 rounded-full bg-zinc-300 mr-1" />
                                  {camp.delivered_count} entregues
                               </div>
                            )}
                            {camp.read_count > 0 && (
                               <div className="flex items-center text-emerald-600 font-medium">
                                  <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 mr-1" />
                                  {camp.read_count} lidos
                               </div>
                            )}
                         </div>
                         {camp.failed_count > 0 && (
                            <div className="text-[9px] text-red-500 font-medium">
                               {camp.failed_count} falhas detectadas
                            </div>
                         )}
                      </div>
                   </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                     {getStatusBadge(camp.status)}
                  </td>
                   <td className="px-6 py-4 text-right">
                      <div className="flex items-center justify-end gap-2" onClick={e => e.stopPropagation()}>
                        <Button 
                          size="sm" 
                          variant="ghost" 
                          className="h-8 w-8 p-0" 
                          title="Ver detalhes"
                          onClick={() => {
                            setSelectedCampaignId(camp.id);
                            setIsDetailsOpen(true);
                          }}
                        >
                           <Eye className="w-4 h-4 text-zinc-400" />
                        </Button>
                        
                        {camp.status.toUpperCase() === 'DRAFT' && (
                           <Button size="sm" variant="outline" className="border-emerald-200 text-emerald-700 hover:bg-emerald-50 h-8 px-3" onClick={() => updateStatus(camp.id, 'RUNNING')}>
                             <Play className="w-3.5 h-3.5 mr-1" /> Iniciar
                           </Button>
                        )}
                        {camp.status.toUpperCase() === 'RUNNING' && (
                           <Button size="sm" variant="outline" className="border-amber-200 text-amber-700 hover:bg-amber-50 h-8 px-3" onClick={() => updateStatus(camp.id, 'DRAFT')}>
                             <Pause className="w-3.5 h-3.5 mr-1" /> Pausar
                           </Button>
                        )}
                        {camp.status.toUpperCase() === 'COMPLETED' && (
                           <Button size="sm" variant="ghost" className="text-zinc-400 h-8 px-3" onClick={() => updateStatus(camp.id, 'RUNNING')}>
                             Refazer
                           </Button>
                        )}
                      </div>
                   </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      
      <CampaignDetails 
        campaignId={selectedCampaignId} 
        open={isDetailsOpen} 
        onOpenChange={setIsDetailsOpen} 
      />
    </div>
  );
}
