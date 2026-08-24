import { useEffect, useState } from 'react';
import { useAuth } from '../lib/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, LineChart, Line, Legend } from 'recharts';
import { MessageSquare, Clock, CheckCircle, Users } from 'lucide-react';
import { format } from 'date-fns';

export function Dashboard() {
  const { profile } = useAuth();
  const [stats, setStats] = useState({
    total: 0,
    open: 0,
    closed: 0,
    pending: 0
  });

  const [hourlyData, setHourlyData] = useState<any[]>([]);

  useEffect(() => {
    if (!profile?.teamId) return;

    const fetchStats = async () => {
      try {
        const res = await fetch(`/api/conversations?teamId=${profile.teamId}`);
        const data = await res.json();
        
        let open = 0, closed = 0, pending = 0;
        const hours = new Array(24).fill(0).map((_, i) => ({ hour: `${i}:00`, count: 0 }));

        data.forEach((item: any) => {
          if (item.status === 'open') open++;
          else if (item.status === 'closed') closed++;
          else pending++;

          if (item.created_at) {
             const date = new Date(item.created_at);
             const h = date.getHours();
             hours[h].count++;
          }
        });

        setStats({ total: data.length, open, closed, pending });
        setHourlyData(hours);

      } catch (err) {
        console.error("Dashboard fetch error:", err);
      }
    };

    fetchStats();
  }, [profile?.teamId]);

  const pieData = [
    { name: 'Aberto', value: stats.open, color: '#10b981' },
    { name: 'Aguardando', value: stats.pending, color: '#f59e0b' },
    { name: 'Resolvido', value: stats.closed, color: '#64748b' },
  ];

  return (
    <div className="flex flex-col h-full bg-zinc-50/50 p-8 space-y-6 overflow-y-auto w-full">
      <div>
         <h1 className="text-2xl font-bold tracking-tight text-zinc-900">Dashboard</h1>
         <p className="text-zinc-500 mt-1">Acompanhe as métricas de atendimento da sua equipe.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="shadow-sm border-zinc-200/60">
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-sm font-medium text-zinc-600">Total de Atendimentos</CardTitle>
            <MessageSquare className="w-4 h-4 text-zinc-400" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-zinc-900">{stats.total}</div>
          </CardContent>
        </Card>
        
        <Card className="shadow-sm border-zinc-200/60">
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-sm font-medium text-zinc-600">Em Atendimento</CardTitle>
            <Clock className="w-4 h-4 text-emerald-500" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-emerald-600">{stats.open}</div>
          </CardContent>
        </Card>

        <Card className="shadow-sm border-zinc-200/60">
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-sm font-medium text-zinc-600">Encerrados</CardTitle>
            <CheckCircle className="w-4 h-4 text-zinc-400" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-zinc-700">{stats.closed}</div>
          </CardContent>
        </Card>

        <Card className="shadow-sm border-zinc-200/60">
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-sm font-medium text-zinc-600">Na Fila (Aguardando)</CardTitle>
            <Users className="w-4 h-4 text-amber-500" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-amber-600">{stats.pending}</div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
         {/* Pie Chart */}
         <Card className="shadow-sm border-zinc-200/60 col-span-1 min-w-0">
           <CardHeader>
             <CardTitle className="text-base font-semibold">Status dos Atendimentos</CardTitle>
           </CardHeader>
           <CardContent className="flex justify-center justify-items-center pb-6">
              <div className="h-[250px] w-full min-w-0">
                  <ResponsiveContainer width="100%" height={250} debounce={50}>
                    <PieChart>
                      <Pie
                        data={pieData}
                        cx="50%"
                        cy="50%"
                        innerRadius={60}
                        outerRadius={85}
                        paddingAngle={2}
                        dataKey="value"
                      >
                        {pieData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.color} />
                        ))}
                      </Pie>
                      <Tooltip formatter={(value: number) => [value, 'Atendimentos']} />
                      <Legend verticalAlign="bottom" height={36} />
                    </PieChart>
                  </ResponsiveContainer>
              </div>
           </CardContent>
         </Card>

         {/* Bar Chart */}
         <Card className="shadow-sm border-zinc-200/60 col-span-1 lg:col-span-2 min-w-0">
           <CardHeader>
             <CardTitle className="text-base font-semibold">Volume por Hora do Dia</CardTitle>
           </CardHeader>
           <CardContent>
             <div className="h-[250px] w-full mt-4 min-w-0">
                <ResponsiveContainer width="100%" height={250} debounce={50}>
                  <BarChart data={hourlyData} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
                    <XAxis dataKey="hour" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#71717a' }} />
                    <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#71717a' }} />
                    <Tooltip cursor={{ fill: '#f4f4f5' }} contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} />
                    <Bar dataKey="count" name="Atendimentos" fill="#10b981" radius={[4, 4, 0, 0]} maxBarSize={40} />
                  </BarChart>
                </ResponsiveContainer>
             </div>
           </CardContent>
         </Card>
      </div>
    </div>
  );
}
