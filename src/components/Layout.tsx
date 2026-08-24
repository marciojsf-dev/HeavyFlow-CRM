import { useState, useEffect } from 'react';
import { Outlet, Link, useLocation } from 'react-router-dom';
import { useAuth } from '../lib/AuthContext';
import { io } from 'socket.io-client';
import { collection, query, where, getDocs, addDoc, updateDoc, doc, serverTimestamp, setDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { Button } from '@/components/ui/button';
import { MessageSquare, LayoutDashboard, FileText, Users, LogOut, Inbox as InboxIcon, Megaphone, Settings, Contact2, ChevronLeft, ChevronRight, Menu, QrCode, ShieldAlert, CreditCard, Building2, Kanban } from 'lucide-react';
import { clsx } from "clsx";
import { toast } from 'sonner';
import { formatPhone } from '../lib/phoneUtils';

export function Layout() {
  const { logout, profile } = useAuth();
  const location = useLocation();
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);

  useEffect(() => {
    if (!profile?.teamId) return;

    const socket = io();
    
    // Listen for Webhook events from Meta directly relayed by the backend
    socket.on('whatsapp:message_received', (data: any) => {
      console.log('Layout interceptou mensagem!', data);
      
      const rawFrom = data.message?.contact_whatsapp_id || data.message?.from || 'Desconhecido';
      const content = data.message?.text?.body || data.message?.content || 'Mídia recebida';
      
      // Clean up the from value for comparison
      const cleanFrom = rawFrom.replace(/\D/g, '');

      // Normalize for route (handle Brazil 12/13 digits)
      const normalizedFrom = (cleanFrom.startsWith('55') && cleanFrom.length === 12 && cleanFrom.charAt(4) !== '9') 
         ? (cleanFrom.slice(0, 4) + '9' + cleanFrom.slice(4))
         : cleanFrom;

      const currentPath = location.pathname;
      const isCurrentChat = currentPath.includes(cleanFrom) || currentPath.includes(normalizedFrom);
      
      const isOutbound = data.message?.direction === 'outbound';

      // Only show toast if not currently looking at this specific chat and not outbound
      if (!isCurrentChat && !isOutbound && cleanFrom !== 'Desconhecido') {
         toast("Nova mensagem de " + (cleanFrom.length > 5 ? formatPhone(cleanFrom) : cleanFrom), {
            description: typeof content === 'string' ? (content.substring(0, 60) + (content.length > 60 ? '...' : '')) : 'Mensagem recebida',
            action: {
               label: "Ver",
               onClick: () => window.location.href = `/inbox/${normalizedFrom}`
            }
         });
      }
    });

    return () => {
      socket.off('whatsapp:message_received');
    };
  }, [profile?.teamId]);

  const allLinks = [
    { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { to: '/board', label: 'Kanban', icon: Kanban },
    { to: '/inbox', label: 'Caixa de Entrada', icon: InboxIcon },
    { to: '/campaigns', label: 'Envio em Massa', icon: Megaphone, adminOnly: true },
    { to: '/contacts', label: 'Contatos', icon: Contact2, adminOnly: true },
    { to: '/connect', label: 'Conectar WhatsApp', icon: QrCode, adminOnly: true },
    { to: '/templates', label: 'Modelos Meta', icon: FileText, adminOnly: true },
    { to: '/team', label: 'Equipe', icon: Users, adminOnly: true },
    { to: '/billing', label: 'Assinatura', icon: CreditCard, adminOnly: true },
  ];

  if (profile?.isSuperAdmin) {
    allLinks.push({ to: '/admin-hub', label: 'Super Admin', icon: ShieldAlert, adminOnly: true });
  }

  const links = allLinks.filter(link => {
    if (link.adminOnly && profile?.role !== 'admin') return false;
    return true;
  });

  return (
    <div className="flex h-screen w-full bg-zinc-100 overflow-hidden relative">
      {/* Mobile Overlay */}
      {isSidebarOpen && (
        <div 
          className="md:hidden fixed inset-0 bg-black/20 z-40 transition-opacity" 
          onClick={() => setIsSidebarOpen(false)}
        />
      )}
      <aside className={clsx(
        "bg-white border-r flex flex-col transition-all duration-300 z-50 absolute md:static inset-y-0 left-0", 
        isSidebarOpen ? "w-64 translate-x-0" : "-translate-x-full md:translate-x-0 md:w-20"
      )}>
        <div className="h-16 flex items-center px-4 border-b shrink-0 overflow-hidden">
          <img src="/logo.png" alt="Logo" className="w-10 h-10 shrink-0 object-contain" />
          <div className={clsx("flex flex-col ml-3 overflow-hidden whitespace-nowrap transition-all duration-300", isSidebarOpen ? "opacity-100 w-auto" : "opacity-0 w-0 md:hidden")}>
             <span className="font-bold text-base tracking-tight text-zinc-900 truncate" title={profile?.teamName || 'HeavyFlow CRM'}>
               {profile?.teamName || 'HeavyFlow CRM'}
             </span>
             {profile?.teamName && (
               <span className="text-[11px] text-zinc-400 font-medium tracking-wide truncate">
                 HeavyFlow CRM
               </span>
             )}
          </div>
        </div>
        
        <nav className="flex-1 overflow-y-auto py-4 px-3 space-y-1 overflow-x-hidden">
          {links.map(link => {
            const Icon = link.icon;
            const active = location.pathname.startsWith(link.to);
            return (
              <Link key={link.to} to={link.to} title={!isSidebarOpen ? link.label : undefined} className={clsx(
                "flex items-center px-3 py-2.5 rounded-md text-sm font-medium transition-colors",
                active ? "bg-emerald-50 text-emerald-700" : "text-zinc-700 hover:bg-zinc-100",
                !isSidebarOpen && "justify-center px-0"
              )}>
                <Icon className={clsx("w-5 h-5 shrink-0", active ? "text-emerald-700" : "text-zinc-400", isSidebarOpen ? "mr-3" : "")} />
                {isSidebarOpen ? (
                  <span className="whitespace-nowrap overflow-hidden">{link.label}</span>
                ) : (
                  <span className="whitespace-nowrap overflow-hidden opacity-0 md:hidden">{link.label}</span>
                )}
              </Link>
            )
          })}
        </nav>
        
        <div className="p-4 border-t border-zinc-200 flex flex-col space-y-4">
          {profile?.role === 'admin' && (
            isSidebarOpen ? (
               <div className="flex flex-col space-y-2">
                 <Link to="/company-settings" className="flex items-center text-sm font-medium text-zinc-600 hover:text-zinc-900 transition-colors px-1">
                    <Building2 className="w-4 h-4 mr-2" /> Empresa
                 </Link>
                 <Link to="/settings" className="flex items-center text-sm font-medium text-zinc-600 hover:text-zinc-900 transition-colors px-1">
                    <Settings className="w-4 h-4 mr-2" /> Ajustes
                 </Link>
               </div>
            ) : (
               <div className="flex flex-col space-y-4">
                 <Link to="/company-settings" title="Empresa" className="flex justify-center text-zinc-600 hover:text-zinc-900">
                    <Building2 className="w-5 h-5" />
                 </Link>
                 <Link to="/settings" title="Ajustes" className="flex justify-center text-zinc-600 hover:text-zinc-900">
                    <Settings className="w-5 h-5" />
                 </Link>
               </div>
            )
          )}

          {isSidebarOpen ? (
            <div className="flex items-center space-x-3 px-1">
              <div className="w-8 h-8 shrink-0 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center font-bold">
                {profile?.name?.charAt(0) || 'U'}
              </div>
              <div className="flex flex-col overflow-hidden">
                <span className="text-sm font-medium truncate">{profile?.name}</span>
                <span className="text-xs text-zinc-500 truncate">{profile?.role === 'admin' ? 'Administrador' : 'Agente'}</span>
              </div>
            </div>
          ) : (
            <div className="w-8 h-8 shrink-0 rounded-full mx-auto bg-emerald-100 text-emerald-700 flex items-center justify-center font-bold" title={profile?.name}>
                {profile?.name?.charAt(0) || 'U'}
            </div>
          )}

          {isSidebarOpen ? (
            <Button variant="outline" className="w-full justify-start text-zinc-600" onClick={logout}>
              <LogOut className="w-4 h-4 mr-2" /> Sair
            </Button>
          ) : (
            <Button variant="outline" size="icon" className="w-full text-zinc-600" onClick={logout} title="Sair">
              <LogOut className="w-4 h-4" />
            </Button>
          )}

          {/* Toggle Button for Desktop */}
          <Button variant="ghost" className="w-full justify-center hidden md:flex" onClick={() => setIsSidebarOpen(!isSidebarOpen)}>
             {isSidebarOpen ? <><ChevronLeft className="w-4 h-4 mr-2" /> Recolher</> : <ChevronRight className="w-4 h-4" />}
          </Button>
        </div>
      </aside>

      <main className="flex-1 flex flex-col overflow-hidden h-full relative">
        {/* Mobile Header Topbar */}
        <div className="md:hidden h-14 bg-white border-b flex items-center px-4 shrink-0 shadow-sm z-30 justify-between">
           <div className="flex items-center">
             <Button variant="ghost" size="icon" className="text-zinc-600 hover:bg-zinc-100 mr-2 h-9 w-9 rounded-md" onClick={() => setIsSidebarOpen(true)}>
                <Menu className="w-5 h-5" />
             </Button>
             <img src="/logo.png" alt="Logo" className="w-10 h-10 mr-2 sm:w-12 sm:h-12 object-contain" />
             <span className="font-bold tracking-tight text-zinc-900 text-sm sm:text-base">{profile?.teamName || 'HeavyFlow CRM'}</span>
           </div>
        </div>
        
        <div className="flex-1 overflow-hidden relative">
           <Outlet />
        </div>
      </main>
    </div>
  );
}
