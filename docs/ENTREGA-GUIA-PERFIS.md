# Entrega: orientação inicial e perfis de busca

## Primeiros passos

- Menu e card permanente removidos. O endereço antigo redireciona à visão geral.
- Novos usuários recebem balões nos controles: perfil comercial, oportunidades e radar. A configuração comercial pode ser pulada.
- Exibição registrada no banco por usuário, independentemente de navegador ou empresa selecionada. Uma operação atômica impede exibição simultânea em duas abas/dispositivos.
- Fechar, concluir, sair ou recarregar após a primeira exibição não reinicia o guia. O guia não possui retomada automática nem menu permanente.
- Contas anteriores à atualização ficam dispensadas. Novos usuários não são dispensados apenas porque colegas já possuem oportunidades no radar.
- O guia termina ao confirmar uma inclusão no radar durante a sessão guiada. Não envia propostas nem realiza inscrições.

## Perfis de busca

Em Oportunidades, abra **Perfis de busca** e use **Criar perfil de busca**. Nomeie a busca, informe interesses e exclusões e selecione estados. Município, múltiplas modalidades/portais, datas, valores e demais filtros ficam em uma seção opcional. O formulário pode partir dos filtros da busca atual.

- Perfis pertencem à empresa selecionada; administradores criam, editam, duplicam, pausam, reativam e excluem. Membros podem aplicar os perfis ativos.
- Pausar impede aplicar o perfil, mas preserva seus filtros e as oportunidades já acompanhadas. Duplicar cria uma cópia editável, sem modificar o original. Nenhuma destas ações inicia alertas automáticos.
- A seleção aplica os filtros salvos, reiniciando a paginação. Busca livre permite voltar a explorar sem esse recorte.
- Alterações nos filtros da tela não sobrescrevem o perfil. A interface informa quando a busca difere do que foi salvo.
- Termos separados por vírgula são alternativas. Todas as palavras normalizadas de uma alternativa precisam aparecer nos tokens da oportunidade; isso não exige uma frase contígua.
- Exclusões utilizam a mesma normalização. Estados usam a localização cadastrada na fonte, não uma comprovação de abrangência logística.
- Os perfis não alteram o cadastro comercial, o cálculo de aderência da empresa ou as recomendações do painel. Não geram novos alertas automaticamente.
- A exclusão remove apenas o perfil. Editais e radar são preservados. Alterações concorrentes são detectadas antes de sobrescrever ou excluir.
- Limites técnicos: até 50 perfis por empresa e 20 termos por campo. Não foram criados novos planos comerciais nesta entrega; o acesso acompanha a funcionalidade de descoberta do plano existente.

## Validação

- Compilação da API e checagem TypeScript do frontend.
- Testes em PostgreSQL local temporário, separado dos dados reais: migração de usuários anteriores, guia, concorrência, persistência, permissões, isolamento de empresas, CRUD, revisão concorrente, validação e filtros.
- Testes de navegador: guia sem repetição, ausência do menu/card, perfis, falha ao salvar sem perder o formulário, edição/exclusão, filtros alterados, responsividade e temas. Regressão de busca e Kanban.
- Migração aplicada no Supabase; contas existentes dispensadas, tabela criada e API saudável. Nenhum usuário de teste foi cadastrado no Supabase para esta validação.

Testes adicionados/atualizados: `tests/onboarding-search-api.mjs` e `tests/first-steps-browser.ts`. O teste de API exige `TEST_DATABASE_URL` apontando para PostgreSQL local e cria/remove apenas uma base temporária com prefixo `licitaro_qa_`.

## Histórico da visão geral

O quadro de movimentos mostra um resumo legível das mudanças. A opção **Entenda o que mudou** apresenta as informações antes/depois, datas e nomes dos anexos sem expor URLs ou identificadores internos como explicação ao usuário.
