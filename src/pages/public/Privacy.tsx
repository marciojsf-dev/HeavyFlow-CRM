import React from 'react';

export function Privacy() {
  React.useEffect(() => {
    document.title = "Política de Privacidade - HeavyFlow CRM";
  }, []);

  return (
    <div className="max-w-4xl mx-auto p-12 bg-white min-h-screen border-x border-zinc-100 shadow-sm">
      <h1 className="text-3xl font-bold mb-6">Política de Privacidade</h1>
      <p className="text-zinc-600 mb-4">Última atualização: {new Date().toLocaleDateString()}</p>
      
      <section className="space-y-4">
        <h2 className="text-xl font-semibold">1. Coleta de Dados</h2>
        <p>Coletamos informações necessárias para a gestão de contatos e envio de mensagens via WhatsApp, incluindo nomes, números de telefone e histórico de mensagens importados conforme autorização do usuário.</p>
        
        <h2 className="text-xl font-semibold">2. Uso das Informações</h2>
        <p>Os dados são processados exclusivamente para fornecer as funcionalidades da plataforma de atendimento ao cliente e marketing.</p>
        
        <h2 className="text-xl font-semibold">3. Segurança</h2>
        <p>Implementamos medidas de segurança técnicas e organizacionais para proteger suas informações, incluindo bancos de dados isolados e criptografia.</p>
        
        <h2 className="text-xl font-semibold">4. Meta Cloud API</h2>
        <p>Este aplicativo utiliza a API oficial do WhatsApp (Meta Cloud API). Ao utilizar nossa plataforma, você também concorda com os termos de privacidade da Meta.</p>
      </section>
    </div>
  );
}
