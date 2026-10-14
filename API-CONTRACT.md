# Contrato do MVP v2

API `/api`. JSON direto (não envelopado). Erros `{error: string}` com HTTP apropriado. Sessão por cookie HTTP-only. Todas as rotas salvo health/auth exigem sessão e filtram empresa. Datas ISO, valores numéricos em BRL. IDs UUID. Campos ausentes `null`.

## Sessão

- GET `/health` -> `{status, database, version}`
- GET `/auth/me` -> `{user:{id,name,email},organization:{id,name,taxId,isDemo},role:'ADMIN'|'MEMBER'}` ou 401
- POST `/auth/register` `{name,email,password,organizationName}` -> sessão
- POST `/auth/login` `{email,password}` -> sessão
- POST `/auth/logout` -> `{ok:true}`
- POST `/auth/demo` -> sessão de uma empresa de demonstração isolada, com dados fictícios explicitamente identificados
- POST `/auth/forgot-password` `{email}` -> `{message}` (resposta uniforme; email configurável, nunca revelar token)
- POST `/auth/reset-password` `{token,password}` -> `{message}`

## Leitura assistida de editais

- GET `/opportunities/:id/analysis?version=<uuid opcional>` → `{analysis,topics,versions}`. Somente oportunidades visíveis e versões da empresa autenticada. `analysis.stale` indica leitura anterior ou metadados/lista de anexos alterados; até 20 versões são listadas.
- POST `/opportunities/:id/analysis` → HTTP 202 `{id}`. Fila persistente; execução ativa reaproveitada; intervalo mínimo entre solicitações. Estados PENDING/RUNNING/READY/PARTIAL/FAILED. READY significa cobertura de texto, nunca aprovação da participação.
- PUT `/opportunities/:id/analysis/:analysisId/review` `{topic,state:'PENDING'|'REVIEWED'|'ATTENTION',notes}` → `{ok:true}`. Somente versão mais recente e compatível com a fonte; máximo 3000 caracteres; autor e data registrados. Versões anteriores ficam somente para consulta.
- Resultado: documentos com nome/link, estado de leitura, quantidade de páginas e evidências `{topic,page,quote}`. Paginação física do PDF, sem interpretação legal ou extração numérica automática. PDFs não suportados permanecem pendentes, não são silenciosamente descartados.

## Perfil e catálogo (operações)

- GET/PUT `/profile` -> `{organizationName,taxId,segments:string[],states:string[],cities:string[],keywords:string[],excludedKeywords:string[],modalities:string[],minValue:number|null,maxValue:number|null}`
- GET `/members` -> `[{id,name,email,role}]`
- POST `/members` `{name,email,password,role}` -> membro (admin; usuário local criado com senha temporária informada, sem convite falso)
- GET `/catalog` -> `[{id,type:'PRODUCT'|'SERVICE',name,description,category,keywords:string[],active:boolean,updatedAt}]`
- POST `/catalog`, PATCH `/catalog/:id`, DELETE `/catalog/:id` (delete -> `{ok:true}`)

## Oportunidades

Objeto Opportunity: `{id,canonicalKey,title,description,agency,state,city,modality,sphere,value,publishedAt,opensAt,closesAt,status,url,sourceCode,sourceName,syncedAt,isDemo,documents:[{name,url}],match:{score,reasons:string[],excluded:boolean},trackingId:string|null}`.

- GET `/opportunities?q=&state=&city=&modality=&agency=&source=&minValue=&maxValue=&minScore=&status=&from=&to=&sort=score|newest|deadline|value&page=1&pageSize=12` -> `{items:Opportunity[],total,page,pageSize,pages}`
- GET `/opportunities/:id` -> Opportunity
- POST `/opportunities/:id/refresh` -> Opportunity atualizado, incluindo anexos oficiais; não disponível na demonstração
- GET `/dashboard` -> `{stats:{opportunities,recommended,tracked,urgent,potentialValue},recommended:Opportunity[],deadlines:Tracking[],byState:[{label,count}],byModality:[{label,count}],activity:[{id,title,description,createdAt}],lastSync:string|null}`

## Gestão

Tracking: `{id,opportunityId,opportunity:Opportunity,stage,ownerId:string|null,deadline:string|null,expectedValue:number|null,outcomeReason:string,notes:string,createdAt,updatedAt,tasks:Task[],events:Event[]}`.
Etapas `IDENTIFIED`, `IN_ANALYSIS`, `WILL_PARTICIPATE`, `PROPOSAL_SENT`, `WON`, `LOST`, `DISCARDED`.
Task: `{id,title,done,deadline:string|null,ownerId:string|null}`. Event: `{id,type,title,description,createdAt}`.

- GET `/trackings` -> Tracking[]
- POST `/trackings` `{opportunityId}` -> Tracking (idempotente)
- GET/PATCH `/trackings/:id` -> Tracking (patch stage,ownerId,deadline,expectedValue,outcomeReason,notes)
- POST `/trackings/:id/tasks` `{title,deadline?,ownerId?}` -> Task
- PATCH `/trackings/:id/tasks/:taskId` `{title?,done?,deadline?,ownerId?}` -> Task
- DELETE `/trackings/:id/tasks/:taskId` -> `{ok:true}`
- POST `/trackings/:id/events` `{description}` -> Event (comentário)
- GET `/trackings/:id/export` -> arquivo Markdown com resumo, tarefas, links, notas. Não é submissão de proposta.

## Documentos, avisos, fontes

- GET `/documents` -> `[{id,name,category,expiresAt:string|null,fileName,mimeType,size,createdAt}]`
- POST `/documents` multipart `file`, `name`, `category`, `expiresAt?` (PDF, DOCX, XLSX, PNG, JPG; máx 10MB; download autenticado)
- GET `/documents/:id/download` -> arquivo
- DELETE `/documents/:id` -> `{ok:true}`
- GET `/notifications` -> `[{id,title,description,read,createdAt,url}]`
- PATCH `/notifications/:id` `{read:true}` -> notificação; POST `/notifications/read-all` -> `{ok:true}`
- GET/PUT `/preferences` -> `{inApp:boolean,email:boolean,minScore:number}` (0–100, novos alertas; canal e-mail exige serviço testado).
- GET `/email-settings` retorna configuração sem senha, `hasPassword` e estado de verificação; PUT salva/invalida verificação; POST `/email-settings/test` testa somente com o usuário autenticado. Administrador da empresa, demonstração não permite escrita/envio.
- GET `/email-deliveries?page=1` -> `{items,total,page,pages}`; 20 por página, somente administrador da empresa. Estados `PENDING`, `SENDING`, `SENT` (aceito pelo SMTP, não entrega comprovada), `FAILED`, `UNKNOWN`, `BLOCKED`, `CANCELLED`.
- POST `/email-deliveries/:id/retry` `{confirmUnknown?:boolean}` -> `{message}`; SMTP testado obrigatório; somente `FAILED`, `UNKNOWN` (confirmação explícita), `BLOCKED`. Mantém tentativas anteriores e abre novo ciclo limitado.
- GET `/simulations` -> cenários da empresa (até 100 recentes), com `opportunity_id` e `opportunity_title` opcionais. POST `{name,inputs,opportunityId?:uuid|null}` cria cenário e verifica acesso ao edital.
- Inputs de simulação: `monoPages,colorPages,monoPrice,colorPrice,monoCost,colorCost,fixedRevenue,equipment,operations,taxPercent,targetMargin,months` e `monoIncluded,colorIncluded` (inteiros não negativos, padrão zero). Receita fixa + excedentes × preço; custo variável de todas as páginas. Tributos e margem são sobre a receita.
- GET `/simulation-context/:id` -> `{id,title,agency,value}` com controle de acesso, sem disparar consulta externa de anexos.
- GET `/sources` -> `{sources:[{code,name,description,url,status:'ready'|'unavailable'|'planned',lastRun:string|null,records:number}],runs:[{id,sourceCode,status,created,updated,read,error,startedAt,finishedAt}],scheduler:{enabled,intervalMinutes,emailConfigured}}`
- POST `/sources/sync` `{sourceCode?:'pncp'|'comprasgov'}` -> `{jobId,message}` HTTP 202; execução assíncrona, erro honesto, sem coleta em sessão demo
- GET `/admin` apenas PLATFORM_ADMIN_USER_ID configurado -> `{stats,organizations,users,runs}`; não conceder admin global a todo admin de empresa

## Conectores (contrato interno)

`apps/api/src/connectors.ts` exporta `ExternalOpportunity`, `collectSource(sourceCode, options, onBatch): Promise<{read:number,pages:number}>`, `refreshOpportunity(opportunity): Promise<ExternalOpportunity|null>`, `SOURCE_DEFINITIONS`.
ExternalOpportunity = `{canonicalKey,externalId,title,description,agency,state,city,modality,sphere,value,publishedAt,opensAt,closesAt,status,url,sourceCode,sourceName,documents:Array<{name,url}>,raw?:unknown}`. Strings vazias/null permitidas para desconhecidos; datas strings ISO/null; value number/null.
options = `{states:string[],days?:number,maxPages?:number,signal?:AbortSignal,cursor?:CollectionCursor,onCheckpoint?:(cursor:CollectionCursor|null)=>Promise<void>}`. `onBatch: (items:ExternalOpportunity[])=>Promise<void>`. Códigos `pncp`, `comprasgov`. O coletor informa truncamento lançando erro explícito se limite alcançado; batches já gravados ficam como parcial. O cursor persistido permite retomar as partições/páginas pendentes em execução posterior.
# Preparação da oportunidade

- `GET /opportunities/:id/preparation`: resumo, exigências documentais, tarefas e identificação do acompanhamento, isolados por organização. `effective_state` considera remoção, validade e versão de leitura; não é aprovação jurídica.
- `POST /opportunities/:id/preparation/actions`: `{analysisId,topic,kind:"TASK"|"DOCUMENT",title}`. Apenas leitura atual/concluída com evidência. Idempotente por tema, versão e tipo; tarefa inicia acompanhamento se ausente. Evidências são copiadas no servidor, nunca aceitas do cliente.
- `POST /opportunities/:id/preparation/documents`: `{title}` cadastra exigência manual (201), até 100 por oportunidade.
- `PUT /opportunities/:id/preparation/documents/:documentId`: `{title,documentId:null|uuid,state:"MISSING"|"LINKED"|"REVIEWED"|"UPDATE",notes,revision}`. O parâmetro de rota identifica a exigência; o campo documentId identifica o arquivo. Vínculo só com a própria organização, documento vencido não pode ser conferido. Retorna 409 em edição concorrente.
- `DELETE /opportunities/:id/preparation/documents/:documentId`: `{revision}` remove apenas a exigência, preservando arquivo. Registra auditoria.
# Modelos de checklist

- `GET /checklist-templates`: roteiros iniciais (`builtin:true`) e modelos ativos da organização; id, nome, itens e revisão.
- `POST /checklist-templates`: `{name,items:[{kind:"TASK"|"DOCUMENT",title}]}` cria modelo (201). De 1 a 60 itens, títulos de 3 a 200 caracteres; até 100 modelos ativos por organização. Campos de arquivo, responsável ou estado não são aceitos.
- `PUT /checklist-templates/:id`: mesmo corpo mais `{revision}`; edita modelo próprio e incrementa versão, com 409 para edição concorrente. Não modifica cópias aplicadas.
- `DELETE /checklist-templates/:id`: `{revision}` arquiva modelo próprio sem remover cópias ou histórico.
- `GET /opportunities/:id/checklist-applications`: histórico isolado, seleção original e contagens.
- `POST /opportunities/:id/checklist-applications`: `{templateId,revision,selected:[indices]}`; prévia é a versão de `/checklist-templates`. Índices únicos, de 0 a 59 e dentro do modelo. Aplicação transacional e idempotente por organização/oportunidade/modelo/versão; retorno `alreadyApplied` informa repetição. Mesmo tipo/título normalizado existente é preservado. Novos itens não herdam vínculos/conferências/prazos/responsáveis. Limite documental excedido retorna 400 sem aplicação parcial. Mudança de versão antes da primeira aplicação retorna 409.
# Boletim diário

- `GET /digest-settings` (administrador): enabled, sendTime (Brasília), recipientIds (vazio = todos os administradores atuais), revision e disponibilidade dos pré-requisitos.
- `PUT /digest-settings` (administrador): `{enabled,sendTime:"HH:mm",recipientIds:[uuid],revision}`. Ativação exige conta real, canal email e SMTP disponível. Destinatários devem ser administradores da própria organização. Edição concorrente retorna 409; ativação/reativação inicia novo cursor sem retroatividade.
- `GET /digest-preview` (administrador): prévia somente leitura, sem enfileirar ou consumir cursor; até 20 resultados de uma consulta limitada a 2.000 registros. Quando desativado, consulta as últimas 24h.
- `GET /digests`: últimas 30 verificações da organização, incluindo vazias; quantidade, data e indicação de consulta parcial.
- `GET /digests/:id?page=1`: snapshot isolado por organização e paginado em 25 itens. Score é o da geração, não necessariamente o atual.
- Worker local consulta a cada minuto, no máximo uma geração por dia de Brasília. Geração e fila são uma transação; fila DIGEST revalida destinatários/configuração. Não há endpoint de envio manual nem ativação automática de contas existentes.
# Itens de contratação PNCP

- `GET /opportunities/:id/items?page=1`: exige sessão e visibilidade da oportunidade; UUID e página inteira de 1 a 400. Página de 25 itens, sem count inventado. Demonstração ou identificador não PNCP retorna `supported:false` e explicação, sem consulta externa.
- Retorno: `supported,items,page,hasMore,sourceUrl,checkedAt,stale,notice?`. Item: `number,description,quantity,unit,confidential,estimatedUnit,estimatedTotal,hasResult,status`. Valores ausentes/sigilosos são null; até quatro casas são exibidas na interface. `hasResult` é só indicação da fonte, não coleta de preço homologado.
- Cache PostgreSQL por oportunidade/página durante 1h; acesso é conferido antes de ler o cache. Falha conserva cópia anterior com `stale:true`; sem cópia retorna 502. Consultas simultâneas da mesma página compartilham promessa; limite de 8 consultas externas simultâneas por processo e 45 requisições/minuto por chave de rate limit. URL construída no host oficial, sem redirecionamento, limite 15s/2MB.
- `hasMore` é inferido de página cheia e limite local, não total oficial. Páginas são snapshots independentes; o PNCP pode mudar entre consultas. A indicação de sigilo prevalece mesmo se houver resultado.

# Indicadores de disponibilidade e agenda

- `GET /dashboard`: `stats.opportunities` e distribuições consideram apenas `status=open`; `stats.recommended` também aplica o `minScore` da organização. `recommendationMinScore` explicita o limiar aplicado.
- Filtro `status=open`: encerramento futuro, abertura ausente/passada e status sem indicação de término, suspensão ou cancelamento. Sem encerramento conhecido não confirma disponibilidade; consulta sem filtro ainda permite histórico.
- `stats.urgent`: participações não WON/LOST/DISCARDED com prazo efetivo entre agora e sete dias. `stats.overdue`: prazo efetivo anterior a agora. `deadlines` mantém até seis pendências datadas, ordenadas por prazo, incluindo vencidas explicitamente identificadas na interface.
- Prazo efetivo: `tracking.deadline ?? opportunity.closesAt`. `PATCH /trackings/:id` com `deadline:null` usa automaticamente o prazo oficial; data explícita permanece interna. Interface aceita data/hora em Brasília e não converte o padrão automático em cópia fixa.

# Histórico comercial

## Gestão de clientes e empresas

As rotas `/management/*` são exclusivas da API do console (3001 no preview), com cookie e identidade administrativa independentes. A API cliente não oferece `/management/*` nem `/admin`. `/entitlements` e `/workspaces` continuam exclusivos do cliente.

- `/console-auth/login`, `/me`, `/logout`, `/activate` pertencem ao console; não compartilham recuperação nem sessões do cliente. Mutações exigem origem autorizada e JSON.
- `/management/admins` GET/POST, PATCH `/:id`, POST `/:id/invitation`: somente OWNER. ADMIN opera ambientes/planos; VIEWER apenas consulta e exporta. Credenciais nunca constam da listagem.
- `/management/overview`: indicadores do mês em Brasília. `/management/reports?from=YYYY-MM-DD&to=YYYY-MM-DD&page=1&pageSize=25`: inclusões no radar e status atual. `/management/reports/export?from=&to=`: CSV com limite explícito de 10.000 registros, sem truncamento. Período inclusivo, valores publicados por participação, não receita.
- DELETE `/management/companies/:id` com `{revision}` arquiva e bloqueia sem apagar histórico. POST `/:id/restore` com `{revision}` restaura bloqueado. Listagem `archived=true` mostra arquivados. PATCH aceita `taxId` opcional para corrigir CNPJ.

- `GET /entitlements`: plano efetivo do ambiente, `features`, `multiCompany`, `max_companies`, `company_count`. `GET /workspaces`: vínculos ativos somente dentro do mesmo ambiente; plano de uma empresa retorna apenas a atual.
- `POST /workspaces/switch`: `{organizationId}`; exige plano multiempresa e vínculo ativo no mesmo ambiente, revoga sessão atual e emite outra. `X-Workspace-Id` divergente em chamadas autenticadas retorna 409.
- Rotas `/management/*` exigem `isPlatformAdmin` definido no servidor, não ADMIN de cliente. `GET /management/companies?q=&page=1` lista 20 empresas reais; `GET /management/companies/:id` retorna dados de acesso, membros e últimas 20 ações.
- `POST /management/companies`: `{name,taxId?,planCode,ownerName,ownerEmail}`. Retorna `{id,userId,activationUrl}`; URL privada somente para usuário novo, sem envio automático. `POST /management/companies/:id/members`: `{name,email,role}` concede vínculo sem sobrescrever existente (409).
- `PATCH /management/companies/:id`: `{name,active,planCode,revision}`; controle otimista e bloqueio de auto-inativação da empresa atual do gestor. `PATCH /management/companies/:id/members/:userId`: `{active,role}`; revoga sessões desse vínculo; não permite auto-inativação do gestor. Não apaga dados.
- `GET /management/plans`: planos e catálogo de funcionalidades; `enforced:true` indica suporte aos controles, cada plano possui `enforce_features`. `PUT /management/plans/:code`: `{name,description,plannedFeatures,revision,maxCompanies,enforceFeatures}`. Limite entre 1 e 100; redução incompatível retorna 409. Quando ativada, seleção de recursos restringe os módulos no servidor; tarefas de envio revalidam permissões.
- `GET /management/metrics`: indicadores agregados, excluindo demos e ambiente atual da gestão. Atividade começa nesta versão; não mede receita nem entrega final de e-mail.
- `POST /management/environments/:id/companies`: `{name,taxId?}` cria empresa adicional respeitando limite, com vínculos dos membros ativos da principal. `PATCH /management/environments/:id/companies/:childId`: `{active}` inativa/reativa empresa adicional sem apagar dados. Reativação respeita limite. Inativar ambiente principal revoga sessões de todas as suas empresas; mudanças de membro no ambiente propagam aos seus vínculos nas empresas adicionais.
- Autenticação exige empresa e vínculo ativos. Suspensão cancela fila PENDING/BLOCKED da empresa; acesso não volta por reaproveitamento de sessão antiga quando reativada. Login pode selecionar outro vínculo ativo do mesmo usuário.

## Acompanhamento de mudanças (endpoints independentes)

- `GET /change-alert-settings` (admin): inApp, email, types, revision e labels; ausência usa defaults, com RELATED desativado.
- `PUT /change-alert-settings` (admin): `{inApp,email,types,revision}`; tipos únicos CANCELLATION, SUSPENSION, REOPENING, DEADLINE, DOCUMENTS, STATUS, OTHER, RELATED. Revisão concorrente retorna 409; não altera canais gerais. Cancela fila PENDING/BLOCKED de mudanças quando o canal ou todos os tipos correspondentes foram desativados.
- `GET /opportunities/:id/changes?page=1`: exige acesso à oportunidade; histórico de 10 mudanças por página, total/pages, before_data/after_data/types/detected_at e até 20 relações da organização. Não é histórico retroativo de conteúdo de arquivos.
- `PATCH /opportunity-relations/:id`: `{state:CONFIRMED|REJECTED|PENDING,revision}`; membros da própria empresa com acesso às duas oportunidades. Atualiza revisão, autor e data da última conferência; 404 fora do escopo e 409 em conflito. Não mescla registros.
- Avisos de mudanças usam categoria `CHANGE:tipo1,tipo2` na fila. Worker revalida preferências e autorização antes do SMTP; evento, snapshot e criação da fila são atômicos na ingestão. Relações textuais são sugestões, nunca vínculo oficial presumido.

## Endpoints de histórico comercial

- `GET /commercial-options`: códigos e rótulos de motivos; `UNCLASSIFIED` representa ausência, não é um código gravável.
- `PATCH /trackings/:id` aceita `outcomeCategory` opcional/nulo (PRICE, DOCUMENTATION, TECHNICAL, DEADLINE, REGION, STRATEGY, COMPETITION, OTHER). Mudança de etapa sem categoria explícita remove a categoria anterior; texto livre é preservado.
- `GET /commercial-report?from=YYYY-MM-DD&to=YYYY-MM-DD&ownerId=uuid&stage=WON&page=1`: datas opcionais inclusivas, referentes à criação no radar em Brasília. Datas e responsável afetam todo relatório; stage afeta apenas a lista. Agregados e página compartilham um snapshot SQL e são isolados por organização.
- Resposta: summary, motivos, grupos mensais (até 24 meses com entradas), etapas, lista de 25 registros, contagem e páginas. Taxa sem base é null; valores previstos são strings decimais com contagem de valores ausentes. Não representam receita contratada/recebida.

## Biblioteca: modelos e datas de revisão
- Modelos de apoio no frontend, editáveis e dependentes de revisão humana; imprimir/salvar PDF e cadastrar arquivo assinado. Não são certificados nem assinados automaticamente.
- PATCH `/documents/:id` `{expiresAt: ISO date/datetime | null}`: altera somente prazo, restrito à empresa autenticada; retorno no formato do GET `/documents`. Não renova conteúdo do arquivo.
- Sem data: sem alerta automático. Com data: aviso no sistema a partir de 15 dias antes e outro quando vencido; deduplicação por empresa, documento, data e fase. Respeita preferências de aviso no sistema e ambientes ativos.
- Verificação documental a cada minuto pelo worker da API normal; independente da coleta de oportunidades. Não roda no modo QA isolado. Serviço precisa estar em execução; indisponibilidade é recuperada na próxima checagem.
- E-mail documental desativado nesta etapa, mesmo quando SMTP estiver configurado. Não houve alteração de schema nesta demanda.

## Reconciliação de fontes e atas de registro de preços
- GET `/opportunities/:id/source-observations` → últimas observações por fonte `{sourceCode,sourceName,sourceUrl,reportedUpdatedAt,consultedAt,decision,reason,snapshot}`. Mesma visibilidade da oportunidade. `decision`: accepted/rejected/conflicting. Data de consulta não comprova atualização; campos ausentes preservados podem ter origem anterior. Versão comprovadamente antiga não substitui; divergência sem datas comparáveis ou com datas iguais preserva o snapshot aceito. Não altera o identificador canônico PNCP.
- GET `/price-records?q=&page=1&pageSize=20&archived=false&highlight=<uuid opcional>` → `{items,total,page,pages}`. PageSize máximo 50. GET `/price-records/:id` → registro da empresa. GET `/price-records/:id/events?page=1` → array de até 50 eventos, recentes primeiro.
- POST `/price-records` e PUT `/price-records/:id` (ADMIN) → `{number,title,agency,opportunityId,documentId,ownerId,startsOn,endsOn,notes,items}`; PUT exige `revision`. Datas civis YYYY-MM-DD, fim inclusivo não anterior ao início. Itens até 100: `{description,unit,quantity,unitPrice,supplierName,supplierTaxId}`; números são strings com ponto, até 12 dígitos inteiros e 6 casas; quantidade >0 e preço >=0. Nenhum cálculo ou receita inferida.
- Vínculos opcionais: oportunidade visível, membro ativo da empresa, PDF privado da própria empresa. Cadastro manual não confirma a situação na fonte. Não exige origem no radar.
- PATCH `/price-records/:id/archive` ou `/restore` (ADMIN) `{revision}`; arquivamento preserva dados/eventos. Conflito retorna 409, outras empresas 404. Retorno inclui id, nomes dos vínculos, datas, items, revision, archived, createdAt e updatedAt.
- Alertas de vigência no portal: 30 dias antes, inclusive hoje, e vencido (fase separada), calendário Brasília; chave por ata/data/fase; edição da data resolve avisos antigos, arquivamento resolve avisos, restauração reconcilia o aviso atual. Sem e-mail nesta etapa; processamento até 200 candidatos elegíveis por ciclo do worker. API desligada não verifica prazos.

- DELETE `/documents/:id` retorna 409 enquanto o PDF estiver vinculado a alguma ata da empresa, inclusive arquivada. Exige desvinculação explícita para preservar o documento original.
