import React from 'react';

export function DataDeletion() {
  React.useEffect(() => {
    document.title = "Exclusão de Dados - HeavyFlow CRM";
  }, []);

  return (
    <div className="max-w-4xl mx-auto p-12 bg-white min-h-screen border-x border-zinc-100 shadow-sm">
      <h1 className="text-3xl font-bold mb-2">Instruções para Exclusão de Dados (Data Deletion)</h1>
      <p className="text-zinc-500 mb-8 uppercase tracking-widest text-xs font-bold">User Data Deletion Policy</p>
      
      <section className="space-y-6">
        <p className="text-zinc-600">Em conformidade com as políticas da Meta e a LGPD, oferecemos controle total sobre seus dados. Se você deseja excluir seus dados associados ao nosso aplicativo HeavyFlow CRM, siga os passos abaixo:</p>

        <div className="bg-zinc-50 p-6 rounded-lg border border-zinc-200">
          <h2 className="text-xl font-semibold mb-2">Como solicitar a exclusão:</h2>
          <ol className="list-decimal list-inside space-y-2 text-zinc-700">
            <li>Acesse as <b>Configurações</b> no painel de controle.</li>
            <li>Vá até a aba de <b>Privacidade e Dados</b>.</li>
            <li>Clique no botão <b>"Excluir Minha Conta e Todos os Dados"</b>.</li>
          </ol>
        </div>
        
        <p className="text-sm text-zinc-500 italic text-center">
          Ou envie um e-mail para suporte@exemp.com com o assunto "Exclusão de Dados" informando seu número de telefone cadastrado. Os dados serão removidos permanentemente em até 48 horas.
        </p>
      </section>
    </div>
  );
}
