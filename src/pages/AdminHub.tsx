import React, { useEffect, useState } from 'react';
import { useAuth } from '../lib/AuthContext';
import { useNavigate } from 'react-router-dom';
import { Shield, Building2, Users, MessageSquare, ArrowRight, Activity, Search, Database } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import { collection, getDocs } from 'firebase/firestore';
import { db } from '../lib/firebase';

interface TeamData {
  team_id: string;
  name: string;
  documento?: string;
  tipoPessoa?: string;
  telefone?: string;
  responsavelEmail?: string;
  phone_number_id?: string;
  total_messages?: string;
  total_contacts?: string;
}

export function AdminHub() {
  const { profile, impersonateTeam } = useAuth();
  const navigate = useNavigate();
  const [teams, setTeams] = useState<TeamData[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    // Security check: Only render if super admin
    if (profile && !profile.isSuperAdmin) {
      toast.error("Acesso restrito.");
      navigate('/');
      return;
    }

    if (profile?.isSuperAdmin) {
      fetchTeams();
    }
  }, [profile, navigate]);

  const fetchTeams = async () => {
    try {
      // 1. Fetch details from Firestore
      const snap = await getDocs(collection(db, 'teams'));
      const fsTeams = snap.docs.map(doc => {
        const data = doc.data();
        return {
          team_id: doc.id,
          name: data.name || 'Sem Nome',
          documento: data.documento || data.cnpj,
          tipoPessoa: data.tipoPessoa || 'JURIDICA',
          telefone: data.telefone,
          responsavelEmail: data.responsavelEmail,
        };
      });

      // 2. Fetch Postgres stats
      let pgStats: Record<string, any> = {};
      try {
        const res = await fetch('/api/admin/teams');
        if (res.ok) {
          const data = await res.json();
          data.forEach((t: any) => {
            pgStats[t.team_id] = t;
          });
        }
      } catch (e) {
        console.error("Erro pg", e);
      }

      // Merge
      const merged: TeamData[] = fsTeams.map(fst => ({
        ...fst,
        phone_number_id: pgStats[fst.team_id]?.phone_number_id || '',
        total_messages: pgStats[fst.team_id]?.total_messages || '0',
        total_contacts: pgStats[fst.team_id]?.total_contacts || '0',
      }));

      setTeams(merged);
    } catch (err) {
      console.error(err);
      toast.error("Erro ao carregar empresas.");
    } finally {
      setLoading(false);
    }
  };

  const handleImpersonate = (teamId: string) => {
    impersonateTeam(teamId);
    toast.success(`Acessando como a empresa: ${teamId}`);
    navigate('/dashboard');
  };

  if (!profile?.isSuperAdmin) return null;

  const filteredTeams = teams.filter(t => 
    t.team_id.toLowerCase().includes(searchTerm.toLowerCase()) || 
    t.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (t.documento && t.documento.includes(searchTerm)) ||
    (t.responsavelEmail && t.responsavelEmail.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  return (
    <div className="h-full flex flex-col bg-zinc-50 overflow-hidden">
      <div className="flex-1 overflow-y-auto p-4 md:p-8 pb-24">
        <div className="max-w-6xl mx-auto space-y-8">
          
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 bg-zinc-900 text-white rounded-xl flex items-center justify-center shadow-lg">
                <Shield className="w-6 h-6 text-emerald-400" />
              </div>
              <div>
                <h1 className="text-3xl font-bold tracking-tight text-zinc-900">Admin Hub</h1>
                <p className="text-base text-zinc-500">
                  Gerenciamento global de SaaS. Acesso restrito a administradores.
                </p>
              </div>
            </div>
            
            <div className="flex items-center gap-3 bg-white p-2 rounded-lg border border-zinc-200 shadow-sm">
              <div className="text-right">
                <p className="text-xs text-zinc-500 font-medium">Equipes Ativas</p>
                <p className="text-xl font-bold text-zinc-900 leading-none">{teams.length}</p>
              </div>
              <div className="w-10 h-10 bg-emerald-50 rounded-md flex items-center justify-center">
                <Building2 className="w-5 h-5 text-emerald-600" />
              </div>
            </div>
          </div>

          <Card className="shadow-sm border-zinc-200 bg-white">
            <CardHeader className="border-b border-zinc-100 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <CardTitle className="text-lg">Empresas (Tenants)</CardTitle>
                <CardDescription>
                  Visualize e acesse todas as instâncias isoladas do sistema.
                </CardDescription>
              </div>
              <div className="relative w-full sm:w-72">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
                <Input 
                  placeholder="Buscar por ID da Equipe ou Telefone..." 
                  className="pl-9 h-9 text-sm bg-zinc-50"
                  value={searchTerm}
                  onChange={e => setSearchTerm(e.target.value)}
                />
              </div>
            </CardHeader>
            <CardContent className="p-0">
              {loading ? (
                <div className="p-12 flex flex-col items-center justify-center text-zinc-400">
                  <Activity className="w-8 h-8 animate-spin mb-4" />
                  <p className="text-sm">Carregando dados das empresas...</p>
                </div>
              ) : filteredTeams.length === 0 ? (
                <div className="p-12 text-center text-zinc-500 text-sm">
                  Nenhuma empresa encontrada com estes critérios.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm whitespace-nowrap">
                    <thead className="bg-zinc-50/80 text-zinc-500 font-medium border-b border-zinc-100">
                      <tr>
                        <th className="px-6 py-4">Empresa / ID</th>
                        <th className="px-6 py-4">Documento</th>
                        <th className="px-6 py-4">Contato</th>
                        <th className="px-6 py-4">WhatsApp ID (WABA)</th>
                        <th className="px-6 py-4 text-center">Mensagens / Contatos</th>
                        <th className="px-6 py-4 text-right">Ação</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-100">
                      {filteredTeams.map((team, idx) => (
                        <tr key={idx} className="hover:bg-zinc-50/50 transition-colors group">
                          <td className="px-6 py-4">
                            <div className="flex items-center gap-3">
                              <div className="w-8 h-8 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center font-bold text-xs uppercase shrink-0">
                                {team.name.substring(0, 2)}
                              </div>
                              <div className="flex flex-col">
                                <span className="font-semibold text-zinc-900 flex items-center gap-2">
                                  {team.name}
                                  {profile.teamId === team.team_id && (
                                    <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-[10px] font-bold">VOCÊ</span>
                                  )}
                                </span>
                                <span className="text-xs text-zinc-400 font-mono">{team.team_id}</span>
                              </div>
                            </div>
                          </td>
                          <td className="px-6 py-4 text-zinc-600 font-mono text-xs flex flex-col">
                            <span className="font-medium text-zinc-800">{team.documento || '-'}</span>
                            <span className="text-[10px] text-zinc-400 font-sans tracking-wide uppercase">{team.tipoPessoa === 'FISICA' ? 'Pessoa Física' : 'Pessoa Jurídica'}</span>
                          </td>
                          <td className="px-6 py-4">
                            <div className="flex flex-col text-xs text-zinc-600">
                              <span>{team.responsavelEmail || '-'}</span>
                              <span className="text-zinc-400">{team.telefone || '-'}</span>
                            </div>
                          </td>
                          <td className="px-6 py-4 text-zinc-600 font-mono text-xs">
                            {team.phone_number_id || 'Não configurado'}
                          </td>
                          <td className="px-6 py-4 text-center">
                            <div className="flex flex-col items-center justify-center text-xs text-zinc-600">
                              <div className="flex items-center gap-1.5"><MessageSquare className="w-3.5 h-3.5 text-zinc-400" /> {team.total_messages}</div>
                              <div className="flex items-center gap-1.5 mt-1"><Users className="w-3.5 h-3.5 text-zinc-400" /> {team.total_contacts}</div>
                            </div>
                          </td>
                          <td className="px-6 py-4 text-right">
                            <Button
                              variant="outline"
                              size="sm"
                              className="text-xs group-hover:bg-zinc-900 group-hover:text-white transition-colors"
                              onClick={() => handleImpersonate(team.team_id)}
                              disabled={profile.teamId === team.team_id}
                            >
                              Acessar Painel
                              <ArrowRight className="w-3.5 h-3.5 ml-2" />
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>

        </div>
      </div>
    </div>
  );
}
