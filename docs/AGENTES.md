# Operação dos agentes do Licitaro

## Etapa atual
Orquestrador e QA/Segurança definidos como papéis operacionais no Codex. Estes arquivos não criam processos autônomos, agendamentos ou integração com Agents SDK. A execução ocorre em uma demanda autorizada pelo usuário. UX/UI, Frontend e Backend também estão definidos em perfis próprios; a seleção e transferência de demandas seguem [FLUXO.md](agentes/FLUXO.md).

## Orquestrador
Entrada: objetivo do usuário e critérios de aceite. Responsabilidades: entender contexto, dividir a demanda, definir arquivos e comandos autorizados, identificar dependências e coordenar a revisão. Saída: demanda delimitada, resultado verificável e pendências explícitas. Não ampliar escopo para migração, deploy, infraestrutura ou banco real.

## QA/Segurança
Entrada: escopo, diff e critérios de aceite. Revisar comportamento e riscos proporcionais à mudança. Priorizar isolamento por empresa, privilégios do console, sessão/cookies, validação de origem, SQL parametrizado, uploads/PDFs, logs e e-mail. Classificar achados por impacto e indicar evidência com arquivo/linha. Não confundir leitura de código com teste executado ou garantia de segurança.

## Ambiente
- Node >=24 e npm >=10; preferir o executável instalado em C:\Program Files\nodejs nesta máquina.
- Executar preflight na raiz: node scripts/agents-preflight.mjs.
- Typecheck: npm run typecheck. Não gera build nem inicia API.
- Supabase inicial, RDS PostgreSQL futuro: manter camada pg, schema e autenticação independentes do provedor.

## QA isolado
npm run test:workflow:api executa scripts/qa-workflow.mjs, cria PostgreSQL temporário, compila a API e roda tests/onboarding-search-api.mjs.
O teste exige TEST_DATABASE_URL com hostname localhost/127.0.0.1, cria banco licitaro_qa_* e inicia API com DATABASE_URL explícita para esse banco. No modo LICITARO_ISOLATED_QA=true, .env não é carregado. A API exige NODE_ENV=test e banco local com nome licitaro_qa_<número>.

Este comando cria arquivos, inicia processos, executa migrações no banco temporário e remove seus próprios dados. Portanto requer autorização para essa validação. Não é uma suite completa: o wrapper executa onboarding-search-api.mjs e os módulos de propostas, paginação, ordem do radar e união de perfis importados por ele. Porta da API de teste: 3309; o teste recusa iniciar se a porta já estiver ocupada.

O executor e a API filha herdam somente variáveis essenciais do sistema operacional. Credenciais, NODE_OPTIONS e configurações da aplicação são removidos. No modo isolado a API não inicia scheduler nem workers de e-mail, análise ou resumos. O teste de análise processa explicitamente uma fixture de demonstração, sem temporizador. Os testes de proteção ficam em tests/qa-isolation.test.mjs. Este isolamento é da aplicação e do ambiente: não é uma sandbox de rede do sistema operacional.

Não executar npm test, testes de navegador ou suites específicas em bloco sem revisar imports e destinos. Não usar Supabase ou RDS real para validar agentes.

## Aprovações e progresso
Usar o modelo docs/agentes/DEMANDA.md, copiando apenas quando uma demanda de escrita estiver autorizada. Defaults: uma demanda por vez, duas tentativas por falha, nenhuma publicação automática. Registrar comandos realmente executados e resultados; para interrompidos, informar o próximo passo e dependências. Tokens, custos e retomada automática dependem de executor futuro e não são implementados por estes documentos.

## Próximas etapas
1. Concluído: configuração e tipos validados.
2. Concluído: isolamento do QA reforçado e três testes de proteção aprovados.
3. QA temporário validado em 14/10/2026; fluxo de branches/revisão/CI ainda pendente.
4. Concluído: perfis [UX/UI](agentes/UX-UI.md), [Frontend](agentes/FRONTEND.md) e [Backend](agentes/BACKEND.md), com limites por domínio e fluxo de revisão.
5. Avaliar executor próprio somente se necessário; chave API, orçamento, persistência, observabilidade e execução segura são requisitos separados.