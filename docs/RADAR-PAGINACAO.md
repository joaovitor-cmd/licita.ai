# Radar — consulta paginada

API e tela integradas em 07/10/2026. O quadro carrega até 25 cartões por etapa inicialmente, com “Carregar mais” independente em cada coluna. A lista carrega até 50 por página. Totais e valores consideram todos os resultados filtrados, não apenas os cartões carregados.

`GET /api/trackings/page` exige o acesso ao Radar e respeita empresa/visibilidade de demonstração. Aceita `q` (nome/órgão, literal, até 200 caracteres), `owner` (UUID), `includeClosed=true|false`, `changesOnly=true|false`, `view=board|list`, `stage` (etapa conhecida) e `page` (1–10.000). Sem filtros: quadro, página 1, sem etapas encerradas.

- Quadro: até 25 participações por etapa por página. Para carregar mais de uma coluna, informe sua etapa e próxima página.
- Lista: até 50 participações por página; filtro opcional de etapa.
- `items`: participações/tarefas somente dos IDs selecionados, sem carregar os históricos completos.
- `stages`: quantidade, potencial conhecido, quantidade sem valor informado, tarefas pendentes e próxima página por etapa, considerando os filtros. `summary`: totais das etapas em andamento, também filtrados, não apenas cartões da página.
- `total`: quantidade de todas as etapas que passaram nos filtros gerais. `pageTotal`: quantidade no escopo da etapa solicitada, quando definida. `hasMore`: existência de outra página no escopo solicitado.
- Ausência de valor não vira zero: potencial é `null` quando todos os valores são desconhecidos; somas de valores conhecidos acompanham `unknownValues` para indicar parcialidade.

Ordenação determinística: quadro por posição manual e ID; lista por atualização decrescente e ID, com índices da empresa/etapa/ordenação. Paginação por posição: movimentações/edições concorrentes podem mudar a composição de páginas. A interface deduplica IDs ao acumular cartões e recarrega a consulta ao movimentar/alterar filtros; não tratar a sequência como um snapshot imutável. `orderRevision` e `boardPosition` são strings decimais exatas; mudança de revisão entre cargas adicionais reinicia a consulta. Ver [ordem persistente](RADAR-ORDEM.md).

A tela deduplica IDs, cancela/ignora respostas de filtros anteriores, preserva os cartões em falhas de carregamento adicional e permite repetir a mesma página. Atualizações de tarefas/responsáveis/movimentos recarregam os totais sem desmontar o quadro durante a espera. A busca aguarda 250 ms e os filtros reiniciam a paginação. Uma atualização bem-sucedida volta à carga inicial; cartões carregados adicionalmente podem sair da visualização.

`highlight` (UUID opcional): no quadro inicial, acrescenta no máximo um cartão fora da primeira página para localizar uma participação recém-adicionada. Respeita todos os filtros, a empresa e a visibilidade; pode resultar em 26 cartões na coluna destacada. Não altera totais nem limites das próximas páginas. A lista ignora esse destaque adicional.

A consulta anterior `/trackings` permanece compatível para consumidores atuais. Permanecem pendentes colunas personalizadas e revisão de tarefas/catálogos muito grandes, não apenas quantidade de cartões. Também não há snapshot imutável entre páginas concorrentes.

Verificação em banco local descartável: 62 participações, limite por coluna/lista, três páginas com empate de atualização sem repetição, totais completos, valores desconhecidos, responsáveis, encerradas, filtros de alterações/conferências, validação de parâmetros, destaque e isolamento empresarial. Navegador: carregamento independente, recuperação de falha, filtros, resposta atrasada, lista, movimentação, tarefas e largura móvel. A API local atualizada foi iniciada após os testes; sua inicialização normal aplicou os índices idempotentes ao Supabase existente. Não foram inseridos dados de teste no Supabase real.
