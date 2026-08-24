import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/AuthContext';
import { db, auth } from '../lib/firebase';
import { signOut } from 'firebase/auth';
import { doc, setDoc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Navigate } from 'react-router-dom';
import { Building2, User, Phone, MapPin, Mail, Loader2, CheckCircle2, LogOut } from 'lucide-react';
import { toast } from 'sonner';

export function Onboarding() {
  const { user, profile, loading, refreshProfile } = useAuth();
  const navigate = useNavigate();
  const [submitting, setSubmitting] = useState(false);

  const [tipoPessoa, setTipoPessoa] = useState<'JURIDICA' | 'FISICA'>('JURIDICA');

  const [formData, setFormData] = useState({
    razaoSocial: '',
    documento: '',
    telefone: '',
    endereco: '',
    bairro: '',
    cidade: '',
    estado: '',
    responsavelNome: profile?.name || '',
    responsavelEmail: profile?.email || ''
  });

  // Se já completou o setup ou está carregando, não mostra a tela
  if (loading) return null;
  if (profile?.companySetupComplete) return <Navigate to="/dashboard" replace />;
  if (!user || !profile) return <Navigate to="/login" replace />;

  const handleLogout = async () => {
    await signOut(auth);
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);

    try {
      // 1. Criar a empresa na coleção teams
      const teamRef = doc(db, 'teams', profile.teamId);
      await setDoc(teamRef, {
        name: formData.razaoSocial,
        tipoPessoa,
        ...formData,
        createdAt: serverTimestamp()
      });

      // 2. Atualizar o perfil do usuário
      const userRef = doc(db, 'users', user.uid);
      await updateDoc(userRef, {
        companySetupComplete: true,
        updatedAt: serverTimestamp()
      });

      toast.success("Empresa cadastrada com sucesso!");
      await refreshProfile();
      navigate('/billing');
    } catch (err) {
      console.error(err);
      toast.error("Erro ao cadastrar a empresa. Tente novamente.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-zinc-50 p-6">
      <div className="max-w-3xl w-full bg-white rounded-3xl shadow-xl overflow-hidden flex flex-col md:flex-row">
        
        {/* Left Side - Info */}
        <div className="bg-zinc-900 text-white p-10 md:w-2/5 flex flex-col justify-between">
          <div>
            <div className="flex items-center gap-3 mb-8">
              <Building2 className="w-8 h-8 text-emerald-400" />
              <h1 className="text-2xl font-bold">HeavyFlow CRM</h1>
            </div>
            <h2 className="text-xl font-medium mb-4">Complete o seu cadastro</h2>
            <p className="text-zinc-400 text-sm leading-relaxed mb-8">
              Para garantir a emissão de notas fiscais e a correta configuração do seu ambiente exclusivo, precisamos dos dados da sua empresa.
            </p>
            <ul className="space-y-4 text-sm text-zinc-300">
              <li className="flex gap-3"><CheckCircle2 className="w-5 h-5 text-emerald-500 shrink-0" /> Ambiente 100% isolado</li>
              <li className="flex gap-3"><CheckCircle2 className="w-5 h-5 text-emerald-500 shrink-0" /> 7 dias de teste gratuito</li>
              <li className="flex gap-3"><CheckCircle2 className="w-5 h-5 text-emerald-500 shrink-0" /> Faturamento centralizado</li>
            </ul>
          </div>
          <div className="mt-8">
            <p className="text-xs text-zinc-500 mb-4">Entrou com a conta errada?</p>
            <Button onClick={handleLogout} variant="ghost" className="text-zinc-400 hover:text-white hover:bg-zinc-800 px-3 h-8 text-xs font-medium -ml-3">
              <LogOut className="w-3.5 h-3.5 mr-2" />
              Sair desta conta
            </Button>
            <p className="text-xs text-zinc-600 mt-4 pt-4 border-t border-zinc-800">Seguro e criptografado.</p>
          </div>
        </div>

        {/* Right Side - Form */}
        <div className="p-10 md:w-3/5">
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="flex items-center justify-between border-b pb-2 mb-4">
              <h3 className="text-lg font-semibold text-zinc-800">Dados do Contratante</h3>
              <div className="flex bg-zinc-100 p-1 rounded-lg">
                <button
                  type="button"
                  onClick={() => setTipoPessoa('JURIDICA')}
                  className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${tipoPessoa === 'JURIDICA' ? 'bg-white shadow-sm text-zinc-900' : 'text-zinc-500 hover:text-zinc-700'}`}
                >
                  Pessoa Jurídica
                </button>
                <button
                  type="button"
                  onClick={() => setTipoPessoa('FISICA')}
                  className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${tipoPessoa === 'FISICA' ? 'bg-white shadow-sm text-zinc-900' : 'text-zinc-500 hover:text-zinc-700'}`}
                >
                  Pessoa Física
                </button>
              </div>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2 md:col-span-2">
                <label className="text-xs font-medium text-zinc-500 uppercase">
                  {tipoPessoa === 'JURIDICA' ? 'Razão Social / Nome Fantasia *' : 'Nome Completo / Negócio *'}
                </label>
                <div className="relative">
                  <Building2 className="w-4 h-4 absolute left-3 top-3 text-zinc-400" />
                  <Input name="razaoSocial" required value={formData.razaoSocial} onChange={handleChange} className="pl-10" placeholder={tipoPessoa === 'JURIDICA' ? "Sua Empresa LTDA" : "Seu Nome ou Negócio"} />
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-medium text-zinc-500 uppercase">
                  {tipoPessoa === 'JURIDICA' ? 'CNPJ *' : 'CPF *'}
                </label>
                <Input name="documento" required value={formData.documento} onChange={handleChange} placeholder={tipoPessoa === 'JURIDICA' ? "00.000.000/0001-00" : "000.000.000-00"} />
              </div>

              <div className="space-y-2">
                <label className="text-xs font-medium text-zinc-500 uppercase">Telefone (Whatsapp) *</label>
                <div className="relative">
                  <Phone className="w-4 h-4 absolute left-3 top-3 text-zinc-400" />
                  <Input name="telefone" required value={formData.telefone} onChange={handleChange} className="pl-10" placeholder="(11) 99999-9999" />
                </div>
              </div>
            </div>

            <h3 className="text-lg font-semibold text-zinc-800 border-b pb-2 mb-4 mt-8">Endereço</h3>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2 md:col-span-2">
                <label className="text-xs font-medium text-zinc-500 uppercase">Logradouro e Número *</label>
                <div className="relative">
                  <MapPin className="w-4 h-4 absolute left-3 top-3 text-zinc-400" />
                  <Input name="endereco" required value={formData.endereco} onChange={handleChange} className="pl-10" placeholder="Rua Exemplo, 123" />
                </div>
              </div>
              <div className="space-y-2">
                <label className="text-xs font-medium text-zinc-500 uppercase">Bairro *</label>
                <Input name="bairro" required value={formData.bairro} onChange={handleChange} placeholder="Centro" />
              </div>
              <div className="space-y-2">
                <label className="text-xs font-medium text-zinc-500 uppercase">Cidade *</label>
                <Input name="cidade" required value={formData.cidade} onChange={handleChange} placeholder="São Paulo" />
              </div>
              <div className="space-y-2">
                <label className="text-xs font-medium text-zinc-500 uppercase">Estado (UF) *</label>
                <Input name="estado" required value={formData.estado} onChange={handleChange} placeholder="SP" maxLength={2} />
              </div>
            </div>

            <h3 className="text-lg font-semibold text-zinc-800 border-b pb-2 mb-4 mt-8">Responsável</h3>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-xs font-medium text-zinc-500 uppercase">Nome Completo *</label>
                <div className="relative">
                  <User className="w-4 h-4 absolute left-3 top-3 text-zinc-400" />
                  <Input name="responsavelNome" required value={formData.responsavelNome} onChange={handleChange} className="pl-10" />
                </div>
              </div>
              <div className="space-y-2">
                <label className="text-xs font-medium text-zinc-500 uppercase">E-mail *</label>
                <div className="relative">
                  <Mail className="w-4 h-4 absolute left-3 top-3 text-zinc-400" />
                  <Input name="responsavelEmail" type="email" required value={formData.responsavelEmail} onChange={handleChange} className="pl-10" />
                </div>
              </div>
            </div>

            <div className="pt-6">
              <Button type="submit" disabled={submitting} className="w-full h-12 text-base bg-emerald-600 hover:bg-emerald-700">
                {submitting ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Finalizar Cadastro e Acessar'}
              </Button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
