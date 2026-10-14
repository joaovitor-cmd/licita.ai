# Busca conjunta de perfis — LIC-32

## Uso no portal

Em Oportunidades, abra **Perfis de busca**, marque os focos desejados e clique em **Buscar com selecionados**. Cada resultado pode atender a qualquer perfil selecionado; o mesmo edital aparece apenas uma vez. Um detalhe no cartão identifica os perfis que corresponderam.

A aplicação substitui os critérios anteriores, preservando ordenação e tamanho da página. Depois, a busca livre e os filtros adicionais refinam o conjunto. O resumo de filtros mostra os nomes, não identificadores técnicos, e permite remover a combinação. Limpar seleção no diálogo apenas prepara uma nova escolha; não altera a busca até aplicação explícita.

Criar um perfil durante a busca conjunta abre um perfil independente vazio, com aviso. Não copia nem grava a combinação como se fosse um único foco. Selecionar/pesquisar não altera perfis, empresa ou Radar. Administradores continuam responsáveis pelas alterações dos perfis; membros podem consultar os perfis disponíveis.

## Regras e desempenho

- `GET /opportunities?searchProfiles=UUID,UUID` aceita até 10 entradas, normaliza maiúsculas e deduplica IDs. Limite técnico de consulta, não limite comercial de plano.
- Somente perfis ativos da empresa atual são aceitos. ID inexistente, pausado ou de outra empresa retorna erro genérico; nenhum perfil é silenciosamente descartado.
- Critérios dentro de cada perfil continuam combinados como na busca individual. Os perfis são alternativas (OR); filtros adicionais do pedido são refinamentos (AND). Um perfil vazio não limita oportunidades, assim como a busca individual vazia.
- Aderência continua baseada no perfil comercial e catálogo ativos da empresa, não uma nova pontuação por perfil de busca. Cada limiar mínimo salvo é respeitado antes de identificar correspondências. A ordenação é única para o conjunto.
- Um construtor de regras compartilhado evita divergências entre busca livre e perfil. Valores são parametrizados. Não se realiza uma consulta de oportunidades por perfil nem se carregam todos os resultados no navegador.
- Contagem e página compartilham uma consulta/snapshot; identificação de correspondências é devolvida apenas para os resultados da página. Configurações são lidas antes da consulta e suas revisões constam na resposta: não há snapshot transacional único abrangendo alterações concorrentes de perfil comercial, catálogo e perfis salvos.
- Resposta acrescenta `searchProfiles` e `items[].matchedSearchProfiles` com ID/nome/revisão, na ordem da seleção. Não são gravados nos editais, nem armazenados como análise histórica.
- `searchProfiles` não pode ser gravado dentro dos filtros de um perfil (combinação recursiva rejeitada).

## Verificação e limites

Integração em PostgreSQL local descartável: união, deduplicação, correspondências, refinamento, paginação, zero/ausência, limiar, IDs repetidos/maiúsculos/inválidos, isolamento empresarial, pausa/retomada/revisões e ausência de alterações nos filtros salvos. Testes de regras e resumo, navegador com seleção explícita, perfil pausado desabilitado, criação independente, remoção, ausência de gravações e largura móvel.

Não adiciona alertas automáticos por perfil, integração com novos portais, equivalência técnica de catálogo, assinatura comercial ou IA externa. LIC-32 continua em melhoria até validação com usuários/amostras reais. Nenhuma migração ou massa de teste enviada ao Supabase.
