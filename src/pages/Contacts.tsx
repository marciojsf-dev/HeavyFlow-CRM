import React, { useState, useEffect } from 'react';
import { collection, query, where, getDocs, addDoc, updateDoc, doc, serverTimestamp } from 'firebase/firestore';
import { db, handleFirestoreError } from '../lib/firebase';
import { useAuth } from '../lib/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Plus, User, Phone, CheckSquare, Square, Search, Loader2 } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { clsx } from 'clsx';
import { normalizePhone, formatPhone } from '../lib/phoneUtils';

export function Contacts() {
  const { profile } = useAuth();
  const [contacts, setContacts] = useState<any[]>([]);
  const [pgContacts, setPgContacts] = useState<any[]>([]);
  const [dbConnected, setDbConnected] = useState<boolean | null>(null);
  const [isNewOpen, setIsNewOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(true);
  
  // Form state
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [category, setCategory] = useState('');
  const [notes, setNotes] = useState('');
  const [optOut, setOptOut] = useState(false);
  
  // Editing state
  const [editingId, setEditingId] = useState<string | null>(null);

  useEffect(() => {
    if (!profile?.teamId) return;
    fetchContacts();
  }, [profile?.teamId]);

  const fetchContacts = async () => {
    if (!profile?.teamId) return;
    setFetching(true);
    try {
      // Fetch PostgreSQL contacts (Primary Storage)
      const res = await fetch(`/api/contacts?teamId=${profile.teamId}`);
      
      if (res.ok) {
        const pgData = await res.json();
        const mappedPg = Array.isArray(pgData) ? pgData.map((c: any) => ({
          id: c.whatsapp_id,
          source: 'whatsapp',
          name: c.name,
          phone: c.whatsapp_id,
          lastMessageAt: c.last_message_at,
          createdAt: { seconds: new Date(c.created_at).getTime() / 1000 }
        })) : [];
        setPgContacts(mappedPg);
        setDbConnected(true);
      } else {
        setDbConnected(false);
      }

      // Fetch Firestore contacts (legacy) - only if profile permits
      const q = query(collection(db, 'contacts'), where('teamId', '==', profile.teamId));
      const snap = await getDocs(q);
      const fsContacts = snap.docs.map(doc => ({ id: doc.id, source: 'firestore', ...doc.data() }));
      setContacts(fsContacts);

    } catch (err) {
      console.error("Error fetching contacts:", err);
      setDbConnected(false);
    } finally {
      setFetching(false);
    }
  };

  const allContacts = [...contacts, ...pgContacts].sort((a, b) => {
     const dateA = a.createdAt?.seconds ? a.createdAt.seconds * 1000 : (a.lastMessageAt ? new Date(a.lastMessageAt).getTime() : 0);
     const dateB = b.createdAt?.seconds ? b.createdAt.seconds * 1000 : (b.lastMessageAt ? new Date(b.lastMessageAt).getTime() : 0);
     return dateB - dateA;
  });

  const handleCreateOrUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile?.teamId || !phone.trim()) return;
    setLoading(true);
    
    try {
      const contactData = {
         teamId: profile.teamId,
         name: name.trim(),
         phone: normalizePhone(phone),
         category: category.trim(),
         notes: notes.trim(),
         optOut,
      };

      if (editingId) {
        await updateDoc(doc(db, 'contacts', editingId), contactData);
      } else {
        await addDoc(collection(db, 'contacts'), {
           ...contactData,
           createdAt: serverTimestamp()
        });
      }
      
      // Sync to PostgreSQL immediately
      try {
         await fetch('/api/contacts/sync', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify([{
               whatsapp_id: contactData.phone,
               name: contactData.name,
               phone: contactData.phone,
               team_id: contactData.teamId
            }])
         });
      } catch (syncErr) {
         console.warn("Failed to sync contact to PostgreSQL", syncErr);
      }
      
      setIsNewOpen(false);
      resetForm();
      fetchContacts();
    } catch (err) {
      handleFirestoreError(err, editingId ? ('update' as any) : ('create' as any), 'contacts');
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
     setEditingId(null);
     setName('');
     setPhone('');
     setCategory('');
     setNotes('');
     setOptOut(false);
  }

  const openEdit = (contact: any) => {
     setEditingId(contact.id);
     setName(contact.name || '');
     setPhone(contact.phone || '');
     setCategory(contact.category || '');
     setNotes(contact.notes || '');
     setOptOut(contact.optOut || false);
     setIsNewOpen(true);
  }

  return (
    <div className="flex flex-col h-full bg-zinc-50 p-8 space-y-6 overflow-y-auto">
      <div className="flex justify-between items-center">
        <div>
           <h1 className="text-2xl font-bold tracking-tight">Contatos</h1>
           <div className="flex items-center gap-4 mt-1">
              <p className="text-zinc-500 text-sm">Gerencie as informações dos seus clientes.</p>
              <div className="flex items-center gap-1.5 px-2 py-0.5 bg-zinc-100 rounded-full border border-zinc-200">
                <div className={`w-1.5 h-1.5 rounded-full ${dbConnected ? 'bg-emerald-500' : 'bg-orange-400'}`}></div>
                <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-tight">
                  SQL: {dbConnected === null ? 'Verificando...' : (dbConnected ? 'Conectado' : 'Ajustar Config.')}
                </span>
              </div>
           </div>
        </div>
        
        <Button className="bg-emerald-600 hover:bg-emerald-700" onClick={() => setIsNewOpen(true)}>
           <Plus className="w-4 h-4 mr-2" /> Novo Contato
        </Button>
        <Dialog open={isNewOpen} onOpenChange={(open) => {
           setIsNewOpen(open);
           if (!open) resetForm();
        }}>
          <DialogContent>
            <form onSubmit={handleCreateOrUpdate}>
               <DialogHeader>
                 <DialogTitle>{editingId ? 'Editar Contato' : 'Novo Contato'}</DialogTitle>
               </DialogHeader>
               <div className="space-y-4 py-4">
                 <div className="space-y-2">
                   <label className="text-sm font-medium text-zinc-700">Nome</label>
                   <Input value={name} onChange={e => setName(e.target.value)} placeholder="Ex: João Silva" />
                 </div>
                 <div className="space-y-2">
                   <label className="text-sm font-medium text-zinc-700">Telefone</label>
                   <Input value={phone} onChange={e => setPhone(e.target.value)} placeholder="Ex: 5511999999999" required />
                 </div>
                 <div className="space-y-2">
                   <label className="text-sm font-medium text-zinc-700">Categoria</label>
                   <Input value={category} onChange={e => setCategory(e.target.value)} placeholder="Ex: Categoria A" />
                 </div>
                 <div className="space-y-2">
                   <label className="text-sm font-medium text-zinc-700">Observações</label>
                   <Textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="Anotações sobre o cliente..." rows={3} />
                 </div>
                 <div className="flex items-center space-x-2 pt-2" onClick={() => setOptOut(!optOut)}>
                   {optOut ? <CheckSquare className="w-5 h-5 text-emerald-600 cursor-pointer" /> : <Square className="w-5 h-5 text-zinc-300 cursor-pointer" />}
                   <span className="text-sm cursor-pointer select-none">Cliente solicitou não receber mensagens em massa (Opt-out)</span>
                 </div>
               </div>
               <DialogFooter>
                 <Button type="button" variant="outline" onClick={() => setIsNewOpen(false)}>Cancelar</Button>
                 <Button type="submit" disabled={loading}>{loading ? 'Salvando...' : 'Salvar'}</Button>
               </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="bg-white border rounded-xl overflow-hidden shadow-sm">
        <table className="w-full text-sm text-left">
          <thead className="bg-zinc-50 border-b text-zinc-500 font-medium">
            <tr>
              <th className="px-6 py-4">Nome</th>
              <th className="px-6 py-4">Telefone</th>
              <th className="px-6 py-4">Categoria</th>
              <th className="px-6 py-4">Status de Envio</th>
              <th className="px-6 py-4 text-right">Ação</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100">
            {fetching ? (
              Array.from({ length: 5 }).map((_, i) => (
                <tr key={i}>
                  <td className="px-6 py-4"><Skeleton className="h-10 w-32" /></td>
                  <td className="px-6 py-4"><Skeleton className="h-4 w-24" /></td>
                  <td className="px-6 py-4"><Skeleton className="h-4 w-20" /></td>
                  <td className="px-6 py-4"><Skeleton className="h-4 w-16" /></td>
                  <td className="px-6 py-4 text-right"><Skeleton className="h-8 w-16 ml-auto" /></td>
                </tr>
              ))
            ) : allContacts.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-6 py-12 text-center text-zinc-500">
                  Nenhum contato cadastrado ou importado.
                </td>
              </tr>
            ) : (
              allContacts.map(c => (
                <tr key={c.id} className="hover:bg-zinc-50 transition-colors">
                  <td className="px-6 py-4 font-medium text-zinc-900 border-l-[3px] border-l-transparent">
                    <div className="flex items-center">
                      <div className={clsx(
                        "w-8 h-8 rounded-full flex items-center justify-center mr-3 text-zinc-400",
                        c.source === 'whatsapp' ? "bg-emerald-50 text-emerald-600" : "bg-zinc-100"
                      )}>
                         <User className="w-4 h-4" />
                      </div>
                      <div className="flex flex-col">
                         <span>{c.name || 'Sem nome'}</span>
                         {c.source === 'whatsapp' && <span className="text-[10px] text-emerald-600 font-bold uppercase tracking-tighter">Importado WhatsApp</span>}
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4 text-zinc-500">
                    <div className="flex items-center font-mono text-xs">
                      <Phone className="w-3 h-3 mr-1 text-zinc-400" />
                      {formatPhone(c.phone)}
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    {c.category ? (
                      <Badge variant="outline" className={c.source === 'whatsapp' ? "border-emerald-200 bg-emerald-50/30 text-emerald-700" : ""}>
                        {c.category}
                      </Badge>
                    ) : <span className="text-zinc-400">-</span>}
                  </td>
                  <td className="px-6 py-4">
                     {c.optOut ? <Badge variant="destructive">Opt-out</Badge> : <Badge variant="secondary" className="bg-emerald-50 text-emerald-700">Ativo</Badge>}
                  </td>
                  <td className="px-6 py-4 text-right">
                     {c.source === 'firestore' && <Button size="sm" variant="outline" onClick={() => openEdit(c)}>Editar</Button>}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
