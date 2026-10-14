# Primeira rodada: busca e acompanhamento

## Implementado

- Busca: fonte, publicação, última coleta e fim das propostas explicitamente identificados; razões da aderência acessíveis sob demanda.
- Ações no cartão: abrir oportunidade, acessar o portal oficial e adicionar ao radar; oportunidades já acompanhadas mostram “Ver no quadro”.
- Após adicionar, o quadro recebe o identificador do cartão e o destaca.
- Kanban: movimentação pela alça ou por formulário acessível pelo menu “Mais ações”. A alteração só aparece após sucesso da API.
- Etapas de resultado e proposta enviada pedem confirmação pelo formulário; resultados finais solicitam motivo.
- Responsável, criação de tarefa e observação disponíveis sem sair do quadro. A tarefa sugere o responsável da participação; observações são acrescentadas ao histórico, não sobrescrevem notas.
- Cartão apresenta próxima tarefa pendente (prioridade por prazo), responsável, progresso de tarefas e prazo interno ou fim das propostas.
- Fonte/situação oficial ficam separadas da etapa comercial.
- Estado vazio explica quando os filtros não encontram participações.
- Ajuste de disposição dos filtros do radar em telas pequenas.

## Backlog atendido parcialmente

LIC-05, LIC-06, LIC-07, LIC-09, LIC-55 e LIC-56. Não marcar essas tarefas inteiras como concluídas: esta é uma entrega incremental.

## Ainda pendente nesta frente

- Download consolidado de anexos em ZIP, com tratamento seguro de arquivos e falhas parciais.
- Colunas personalizadas (página inicial pessoal implementada na rodada de 06/10/2026).
- Atribuição automática implementada na rodada de 06/10/2026; esta primeira rodada atendia somente atribuição manual.
- Auditoria completa das regras de disponibilidade e atualização nas fontes.
- Perfis e interesses evoluídos na rodada de 06/10/2026; falta busca conjunta de perfis e cobertura de itens além da página carregada.
- Validação integrada com dados de homologação e múltiplos usuários.

## Verificação

- TypeScript e build da interface passaram usando Node 24.
- `tests/workflow-browser.mjs`: busca, link oficial, inclusão no radar, responsável, observação, tarefa, arraste, movimento por formulário, falha de salvamento, resultado, recarga, ausência de duplicidade, filtros e layout móvel.
- `tests/first-steps-browser.ts`: regressão do roteiro guiado passou.
- Testes de navegador usam APIs simuladas: não modificam registros reais e não substituem validação integrada do backend.
- Não foram criadas migrações, alterações no Supabase, commits ou publicação remota nesta entrega.

## Ambiente local

O executável de Node encontrado em `C:\Program Files\nodejs` está na versão 16. O projeto exige Node 24 ou superior; a validação utilizou o runtime 24 já disponível no computador, sem alterar a instalação global.
