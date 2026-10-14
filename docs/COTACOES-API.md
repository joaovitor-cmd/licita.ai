# Cotações comerciais — contrato e limites

Persistência validada em banco local em 06/10/2026, com interface inicial em 07/10/2026. Ainda sem geração de documento. Não registra envio oficial, não altera automaticamente a etapa do radar e não comprova atendimento ao edital.

## Interface inicial

A oportunidade possui aba **Cotações**, carregada somente ao abri-la, também acessível por `?tab=propostas`. Permite selecionar itens PNCP por página, pesquisar na página, inserir linhas manuais, preencher quantidades/preços/marca/modelo/solução, condições e conferências. Seleção e valores permanecem ao trocar de página ou pesquisar; estimativa publicada não é aplicada automaticamente. Textos oficiais maiores que o limite comercial são recusados com orientação, nunca cortados silenciosamente.

A prévia calcula valores exatamente como a API, aceitando vírgula ou ponto decimal sem separador de milhar. Falha ao salvar preserva formulário e identificador de tentativa enquanto o conteúdo não mudar. Tela de leitura mostra os valores e a empresa preservados, autor, revisões e avisos de desatualização. Editar a versão atual abre nova revisão com conferências desmarcadas. Trocar de aba ou substituir a cotação pede confirmação quando há alterações não salvas; recarregar/fechar a página usa proteção nativa. Navegação para outras rotas e voltar pelo navegador ainda precisam de proteção uniforme.

O seletor comercial do catálogo abre por linha e é carregado sob demanda, com pesquisa explícita e paginação. Vincular preserva preço, descrição, unidade e quantidade. Aplicar preço de venda exige unidade normalizada igual, base `PER_UNIT` e preço válido; substituir um preço preenchido diferente pede confirmação. Alterar preço/unidade manualmente desmarca a origem automática, preservando o vínculo. Remover vínculo não apaga o preço ofertado. Não solicita o endpoint geral do catálogo, que inclui dados internos.

Ações de seleção em lote atuam somente sobre itens exibidos na página, respeitando a pesquisa atual. Inclusão valida todos os novos itens antes de alterar o rascunho, sem reaplicar dados/preços de itens já escolhidos. Limpar preserva itens ocultos pela pesquisa, outras páginas e linhas manuais; se houver preços/marca/modelo/solução/catálogo, exige confirmação. Não equivale à seleção de um lote da contratação, cujo agrupamento não foi extraído.

A seleção permite escolher um perfil de busca ativo e mostrar somente itens de interesse nesta página. Termos são comparados por palavras inteiras, sem acentos; exclusões têm prioridade. Não utiliza filtros de estado/modalidade/portal como equivalência técnica de produtos, nem seleciona automaticamente. Alterar perfil/filtro preserva a seleção e os preços. Perfis pausados não são oferecidos. Perfil sem termos não habilita o filtro de interesses; falha na consulta oferece aviso/repetição e mantém pesquisa/seleção disponíveis.

A lista de histórico mostra as 50 versões recentes; quando existem anteriores, a interface permite consultar por número (inteiro positivo, até a revisão atual e o limite de consulta da API). Versões antigas permanecem somente leitura, com retorno explícito à versão atual para editar. Uma consulta que falha mantém a versão anteriormente exibida; não realiza gravação.

Após conflito de gravação, a interface oferece conferência sob demanda, preservando o formulário. Consulta a versão atual e o contexto atualizado, lista diferenças comerciais por linha estável e condições, sem mostrar JSON/custos internos, e avisa mudança de cadastro/edital. Mostra 30 diferenças por vez. Não altera a revisão base nem aplica os valores consultados. Mesclagem e atualização assistida das referências ainda não disponíveis; abrir a cotação salva para substituir o rascunho continua exigindo confirmação de descarte.

Pendentes: agrupamento de lotes, mesclagem e atualização assistida do contexto/referências após conflito, representantes/timbrado, Word/PDF e comprovante de envio. A API existente não significa que todos esses fluxos já tenham interface.

## Contexto e consulta

- `GET /api/opportunities/:id/proposal-context`: empresa proponente atual, revisão do cadastro e referência da versão do edital. O identificador da empresa deve acompanhar a gravação, para impedir salvar um formulário aberto em outro contexto empresarial.
- `GET /api/opportunities/:id/proposals`: até 50 cotações da empresa nesta oportunidade, com total/estado resumidos; não carrega as linhas de cada uma.
- `GET /api/proposals/:id?revision=N`: versão atual ou revisão específica, valores, dados preservados, autor, referências e avisos de desatualização. Lista as últimas 50 revisões e informa se há anteriores; qualquer revisão existente pode ser consultada por número.
- `GET /api/proposals/catalog-options?q=texto&page=N`: somente itens ativos da empresa, em páginas de 25. Retorna identificação, unidade, preço de venda e periodicidade; não seleciona custo interno. Exige também acesso ao catálogo no plano.

## Gravação e concorrência

`POST /api/proposals` recebe `opportunityId`, `requestId`, `companyId`, `companyRevision`, `sourceFingerprint` e `body`.

`PUT /api/proposals/:id` recebe os mesmos campos, sem `opportunityId`, e adiciona `expectedRevision`. Sempre cria uma nova versão, sem editar a anterior.

O identificador `requestId` deve ser UUID novo para uma intenção de gravação. Reenvie o mesmo UUID e corpo se uma falha deixar o resultado desconhecido. Alterar campos significa uma nova intenção e exige novo UUID. Mesmo identificador com conteúdo diferente retorna conflito; tentativa de editar revisão antiga também. Falhas não gravam parcialmente a cotação.

Não troque automaticamente empresa, referência do edital ou revisão após conflito. Preserve o rascunho, mostre o motivo e permita conferência explícita antes de abrir um contexto atualizado. Ao criar nova versão de uma já revisada, a interface deve voltar a rascunho e solicitar novas conferências quando modificar itens/condições.

## Corpo comercial

- `name`: nome da cotação, até 100 caracteres.
- `state`: `DRAFT` ou `REVIEWED` (revisada internamente, não aprovada juridicamente).
- `items`: 1–100 linhas, com UUID estável `id`, `number`, `lot`, `description`, `unit`, `quantity`, `unitPrice`, `brand`, `model`, `solution`, `catalogId`, `catalogPriceApplied` e `sourceItem`.
- `conditions`: `validity`, `payment`, `delivery` e `observations`, todas comerciais. Não há prazo padrão inferido; observações internas não devem ser copiadas.
- `reviewChecks`: `selectionAllowed`, `itemsChecked`, `conditionsChecked` e `zeroPriceAllowed`.

Quantidade e preço são strings com ponto decimal, sem milhar e até quatro casas, ou `null` quando desconhecidos. `0` é preço informado; vazio permanece `null`. Quantidade zero/negativa é rejeitada. Subtotais são calculados em inteiros escalados, arredondados por linha a centavos e somados; `totals.complete=false` indica que o total ainda é parcial. A interface não deve converter os valores exatos grandes para ponto flutuante para calcular/formatar.

Não aceite campos como `unitCost`, margem ou notas internas em dados comerciais. O servidor também rejeita campos desconhecidos. Vincular catálogo não aplica preço automaticamente: a aplicação explícita usa somente preço de venda, item ativo, unidade igual e base `PER_UNIT`. Não converta periodicidades/unidades silenciosamente. Preço manual permanece uma oferta manual, independente do custo/estimativa.

`sourceItem`, quando usado, contém número oficial, página consultada e `checkedAt`. A página deve estar no cache da mesma oportunidade e o instante deve corresponder ao que foi exibido. Não invente proveniência para linha manual. Itens oficiais duplicados são rejeitados. Informações sigilosas não viram referências de preço zero.

## Revisão e rastreabilidade

Rascunhos podem estar incompletos. Revisão requer razão social/CNPJ da proponente, descrição/unidade/quantidade/preço das linhas, condições preenchidas e conferência explícita da seleção, itens e condições. Preço zero exige confirmação adicional. Lotação/agrupamento de lotes não é inferido: informe essa limitação e peça conferência no original.

Cada versão guarda cópias dos dados da proponente, identificação/objeto do edital, dados comerciais do catálogo e referências oficiais usadas. Descrição oficial longa pode ter trecho limitado no snapshot; `descriptionTruncated` informa isso. Referências originais devem continuar consultáveis.

Mudanças posteriores na empresa, na fonte do edital ou no conteúdo de uma página de itens geram `staleReasons`. Não alteram o preço, cadastro ou texto da versão antiga. Mudança de bytes mantendo o mesmo endereço e sem nova coleta ainda exige conferência manual.

Exportar, registrar envio/comprovante, modelos Word/PDF, representante, timbrado e transferência de cenário do simulador não estão implementados nesta base. Não apresente esses estados ou ações como concluídos.
