import React, { useEffect, useState } from 'react';
import { collection, query, where, getDocs, doc, updateDoc, addDoc, setDoc, serverTimestamp, deleteDoc } from 'firebase/firestore';
import { db, handleFirestoreError } from '../lib/firebase';
import { useAuth, UserProfile } from '../lib/AuthContext';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Plus, Trash2 } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Checkbox } from '@/components/ui/checkbox';

export interface Department {
  id: string;
  name: string;
  teamId: string;
  userIds: string[];
}

export function Team() {
  const { profile } = useAuth();
  const [members, setMembers] = useState<(UserProfile & { id: string })[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  
  // Agent UI
  const [isNewOpen, setIsNewOpen] = useState(false);
  const [newEmail, setNewEmail] = useState('');
  const [newName, setNewName] = useState('');
  
  // Department UI
  const [isDeptOpen, setIsDeptOpen] = useState(false);
  const [editingDept, setEditingDept] = useState<Department | null>(null);
  const [deptName, setDeptName] = useState('');
  const [deptUserIds, setDeptUserIds] = useState<string[]>([]);
  
  const [loading, setLoading] = useState(false);
  const isAdmin = profile?.role === 'admin';

  useEffect(() => {
    if (!profile?.teamId) return;
    fetchMembers();
    fetchDepartments();
  }, [profile?.teamId]);

  const fetchMembers = async () => {
    if (!profile?.teamId) return;
    try {
      const q = query(collection(db, 'users'), where('teamId', '==', profile.teamId));
      const snapshot = await getDocs(q);
      const data: (UserProfile & { id: string })[] = [];
      snapshot.forEach(doc => data.push({ id: doc.id, ...doc.data() } as any));
      setMembers(data);
    } catch (err) {
      handleFirestoreError(err, 'list' as any, 'users');
    }
  };

  const fetchDepartments = async () => {
    if (!profile?.teamId) return;
    try {
      const q = query(collection(db, 'departments'), where('teamId', '==', profile.teamId));
      const snapshot = await getDocs(q);
      const data: Department[] = [];
      snapshot.forEach(doc => data.push({ id: doc.id, ...doc.data() } as any));
      setDepartments(data);
    } catch (err) {
      console.warn("Could not fetch departments", err);
    }
  };

  const updateRole = async (userId: string, newRole: string) => {
    try {
      await updateDoc(doc(db, 'users', userId), { 
         role: newRole,
         updatedAt: serverTimestamp()
      });
      setMembers(prev => prev.map(m => m.id === userId ? { ...m, role: newRole as any } : m));
    } catch (err) {
      handleFirestoreError(err, 'update' as any, `users/${userId}`);
    }
  };

  const handleDeleteAgent = async (userId: string) => {
    if (!confirm("Tem certeza que deseja remover o acesso deste usuário? Ele não poderá mais fazer login.")) return;
    try {
      await deleteDoc(doc(db, 'users', userId));
      setMembers(prev => prev.filter(m => m.id !== userId));
    } catch (err) {
      handleFirestoreError(err, 'delete' as any, `users/${userId}`);
    }
  };

  const handleAddAgent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile?.teamId || !newEmail || !newName) return;
    setLoading(true);
    try {
      // Use email as document ID for pre-authorization to simplify security and AuthContext matching
      const userDocId = newEmail.trim().toLowerCase();
      await setDoc(doc(db, 'users', userDocId), {
        email: newEmail.trim().toLowerCase(),
        name: newName.trim(),
        teamId: profile.teamId,
        role: 'agent',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });
      setIsNewOpen(false);
      setNewEmail('');
      setNewName('');
      fetchMembers(); // refresh
    } catch (err) {
      handleFirestoreError(err, 'create' as any, 'users');
    } finally {
      setLoading(false);
    }
  };

  const handleSaveDepartment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile?.teamId || !deptName.trim()) return;
    setLoading(true);
    try {
      if (editingDept) {
        await updateDoc(doc(db, 'departments', editingDept.id), {
           name: deptName.trim(),
           userIds: deptUserIds,
           updatedAt: serverTimestamp()
        });
      } else {
        await addDoc(collection(db, 'departments'), {
           name: deptName.trim(),
           teamId: profile.teamId,
           userIds: deptUserIds,
           createdAt: serverTimestamp()
        });
      }
      setIsDeptOpen(false);
      setDeptName('');
      setDeptUserIds([]);
      setEditingDept(null);
      fetchDepartments();
    } catch (err) {
      console.warn("Error saving dept", err);
    } finally {
      setLoading(false);
    }
  };

  const handleEditDept = (dept: Department) => {
    setEditingDept(dept);
    setDeptName(dept.name);
    setDeptUserIds(dept.userIds || []);
    setIsDeptOpen(true);
  };

  const handleDeleteDept = async (id: string) => {
    if (!confirm("Tem certeza que deseja remover este departamento?")) return;
    try {
      await deleteDoc(doc(db, 'departments', id));
      fetchDepartments();
    } catch (err) {
      console.warn("Delete error", err);
    }
  };

  const openNewDept = () => {
    setEditingDept(null);
    setDeptName('');
    setDeptUserIds([]);
    setIsDeptOpen(true);
  };

  return (
    <div className="flex flex-col h-full bg-zinc-50 p-8 space-y-6">
       <div className="flex justify-between items-center">
           <div>
               <h1 className="text-2xl font-bold tracking-tight">Equipe</h1>
               <p className="text-zinc-500 text-sm mt-1">Gerencie agentes e departamentos de atendimento.</p>
           </div>
       </div>

       <Tabs defaultValue="agents" className="flex-1 flex flex-col">
          <TabsList className="w-fit mb-4">
            <TabsTrigger value="agents">Agentes</TabsTrigger>
            <TabsTrigger value="departments">Departamentos</TabsTrigger>
          </TabsList>

          <TabsContent value="agents" className="flex-1 mt-0">
             <div className="mb-4 flex justify-end">
               {isAdmin && (
                 <>
                   <Button className="bg-emerald-600 hover:bg-emerald-700" onClick={() => setIsNewOpen(true)}>
                      <Plus className="w-4 h-4 mr-2" /> Novo Agente
                   </Button>
                   <Dialog open={isNewOpen} onOpenChange={setIsNewOpen}>
                     <DialogContent>
                     <form onSubmit={handleAddAgent}>
                       <DialogHeader>
                         <DialogTitle>Adicionar Agente</DialogTitle>
                       </DialogHeader>
                       <div className="space-y-4 py-4">
                         <div className="space-y-2">
                           <label className="text-sm font-medium text-zinc-700">Nome</label>
                           <Input value={newName} onChange={e => setNewName(e.target.value)} required />
                         </div>
                         <div className="space-y-2">
                           <label className="text-sm font-medium text-zinc-700">E-mail</label>
                           <Input type="email" value={newEmail} onChange={e => setNewEmail(e.target.value)} required />
                         </div>
                         <p className="text-xs text-zinc-500">
                           Nota: O agente deverá fazer login com Google para este e-mail.
                         </p>
                       </div>
                       <DialogFooter>
                         <Button type="button" variant="outline" onClick={() => setIsNewOpen(false)}>Cancelar</Button>
                         <Button type="submit" disabled={loading}>{loading ? 'Salvando...' : 'Adicionar'}</Button>
                       </DialogFooter>
                     </form>
                   </DialogContent>
                 </Dialog>
                 </>
               )}
             </div>

             <div className="bg-white border rounded-xl overflow-hidden shadow-sm">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-zinc-50">
                      <TableHead>Nome</TableHead>
                      <TableHead>Email</TableHead>
                      <TableHead className="text-right">Permissão & Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {members.map((member) => (
                      <TableRow key={member.id}>
                        <TableCell className="font-medium">{member.name}</TableCell>
                        <TableCell className="text-zinc-500">{member.email}</TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-2 items-center">
                            {isAdmin && member.id !== profile?.teamId ? (
                               <Select value={member.role} onValueChange={(val) => updateRole(member.id, val)}>
                                  <SelectTrigger className="w-28 h-8">
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                     <SelectItem value="admin">Admin</SelectItem>
                                     <SelectItem value="agent">Agente</SelectItem>
                                  </SelectContent>
                               </Select>
                            ) : (
                               <Badge variant={member.role === 'admin' ? 'default' : 'secondary'}>
                                  {member.role === 'admin' ? 'Admin' : 'Agente'}
                               </Badge>
                            )}
                            
                            {isAdmin && member.email !== profile?.email && (
                              <Button variant="ghost" size="sm" className="text-red-500 hover:text-red-600 px-2" onClick={() => handleDeleteAgent(member.id)}>
                                 <Trash2 className="w-4 h-4" />
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
             </div>
          </TabsContent>

          <TabsContent value="departments" className="flex-1 mt-0">
             <div className="mb-4 flex justify-end">
               {isAdmin && (
                 <>
                   <Button className="bg-emerald-600 hover:bg-emerald-700" onClick={openNewDept}>
                      <Plus className="w-4 h-4 mr-2" /> Novo Departamento
                   </Button>
                   <Dialog open={isDeptOpen} onOpenChange={setIsDeptOpen}>
                     <DialogContent>
                     <form onSubmit={handleSaveDepartment}>
                       <DialogHeader>
                         <DialogTitle>{editingDept ? 'Editar Departamento' : 'Novo Departamento'}</DialogTitle>
                       </DialogHeader>
                       <div className="space-y-4 py-4">
                         <div className="space-y-2">
                           <label className="text-sm font-medium text-zinc-700">Nome do Departamento</label>
                           <Input value={deptName} onChange={e => setDeptName(e.target.value)} required placeholder="Ex: Suporte" />
                         </div>
                         <div className="space-y-2 mt-4">
                           <label className="text-sm font-medium text-zinc-700">Agentes Atendentes</label>
                           <div className="space-y-2 mt-2 max-h-[200px] overflow-y-auto border p-3 rounded-md bg-zinc-50">
                             {members.map(member => (
                               <div key={member.id} className="flex items-center space-x-2">
                                 <Checkbox 
                                    id={`member-${member.id}`}
                                    checked={deptUserIds.includes(member.id)}
                                    onCheckedChange={(checked) => {
                                       if (checked) {
                                         setDeptUserIds(prev => [...prev, member.id]);
                                       } else {
                                         setDeptUserIds(prev => prev.filter(id => id !== member.id));
                                       }
                                    }}
                                 />
                                 <label htmlFor={`member-${member.id}`} className="text-sm cursor-pointer select-none">
                                    {member.name} <span className="text-zinc-400 text-xs">({member.email})</span>
                                 </label>
                               </div>
                             ))}
                             {members.length === 0 && <span className="text-xs text-zinc-500">Nenhum agente cadastrado.</span>}
                           </div>
                         </div>
                       </div>
                       <DialogFooter>
                         <Button type="button" variant="outline" onClick={() => setIsDeptOpen(false)}>Cancelar</Button>
                         <Button type="submit" disabled={loading}>{loading ? 'Salvando...' : 'Salvar'}</Button>
                       </DialogFooter>
                     </form>
                   </DialogContent>
                 </Dialog>
                 </>
               )}
             </div>

             <div className="bg-white border rounded-xl overflow-hidden shadow-sm">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-zinc-50">
                      <TableHead>Nome do Departamento</TableHead>
                      <TableHead>Agentes Alocados</TableHead>
                      <TableHead className="text-right">Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {departments.map((dept) => {
                       const assignedMembers = members.filter(m => (dept.userIds || []).includes(m.id));
                       return (
                         <TableRow key={dept.id}>
                           <TableCell className="font-medium">{dept.name}</TableCell>
                           <TableCell>
                             <div className="flex flex-wrap gap-1">
                               {assignedMembers.map(m => (
                                 <Badge key={m.id} variant="secondary" className="text-xs font-normal">
                                   {m.name}
                                 </Badge>
                               ))}
                               {assignedMembers.length === 0 && <span className="text-xs text-zinc-400">Nenhum agente</span>}
                             </div>
                           </TableCell>
                           <TableCell className="text-right space-x-2">
                             {isAdmin && (
                               <>
                                 <Button variant="ghost" size="sm" onClick={() => handleEditDept(dept)}>Editar</Button>
                                 <Button variant="ghost" size="sm" className="text-red-500 hover:text-red-600" onClick={() => handleDeleteDept(dept.id)}>
                                    <Trash2 className="w-4 h-4" />
                                 </Button>
                               </>
                             )}
                           </TableCell>
                         </TableRow>
                       );
                    })}
                    {departments.length === 0 && (
                       <TableRow>
                          <TableCell colSpan={3} className="text-center py-6 text-zinc-500 text-sm">
                             Nenhum departamento cadastrado.
                          </TableCell>
                       </TableRow>
                    )}
                  </TableBody>
                </Table>
             </div>
          </TabsContent>
       </Tabs>
    </div>
  )
}
