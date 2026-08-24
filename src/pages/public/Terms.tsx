import React from 'react';

export function Terms() {
  React.useEffect(() => {
    document.title = "Termos de Serviço - HeavyFlow CRM";
  }, []);

  return (
    <div className="max-w-4xl mx-auto p-12 bg-white min-h-screen border-x border-zinc-100 shadow-sm">
      <h1 className="text-3xl font-bold mb-6">Termos de Serviço</h1>
      <p className="text-zinc-600 mb-4">Última atualização: {new Date().toLocaleDateString()}</p>
      
      <section className="space-y-4">
        <h2 className="text-xl font-semibold">1. Aceitação dos Termos</h2>
        <p>Ao acessar e usar este serviço de gestão de WhatsApp, você concorda em cumprir estes termos de uso e todas as políticas da Meta em relação ao uso comercial do WhatsApp.</p>
        
        <h2 className="text-xl font-semibold">2. Uso Permitido</h2>
        <p>O usuário se compromete a não utilizar a plataforma para envio de Spam ou mensagens abusivas que violem as políticas do WhatsApp Business.</p>
        
        <h2 className="text-xl font-semibold">3. Responsabilidade</h2>
        <p>Somos uma ferramenta de interface. A responsabilidade pelas mensagens enviadas e pelo relacionamento com os clientes finais é integral do proprietário da conta.</p>
      </section>
    </div>
  );
}
