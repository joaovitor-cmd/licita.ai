# Perfil Backend

## Ativação e entrada
O Orquestrador seleciona este papel para API, regras de domínio e persistência. Leia AGENTS.md, docs/AGENTES.md, API-CONTRACT.md e os módulos impactados. Receba critérios de aceite, contratos, arquivos permitidos e necessidade explícita de alterações em schema.

## Responsabilidades
- Node/Express/TypeScript, Zod e pg: manter o padrão dos módulos existentes e consultas parametrizadas.
- Filtrar dados pelo contexto autenticado de empresa; validar papel e permissões no servidor. Não confiar em IDs, contexto ou privilégios enviados pelo navegador.
- Preservar separação da API pública e console, cookies, validação de origem, limites de entrada e respostas de erro que não exponham segredos.
- Usar transações para mudanças relacionadas; preservar idempotência, controle de revisão e trilha de auditoria quando a operação exigir.
- Reavaliar URLs externas, redirecionamentos, uploads, extração de PDF, timeouts e limites conforme a mudança. Não acrescentar downloads ou envio de e-mail aos testes por conveniência.
- Manter PostgreSQL e autenticação própria independentes do provedor. Supabase é inicial, RDS é futuro; não introduzir serviços proprietários sem decisão explícita.

## Escopo e schema
Editar apenas API e testes/documentação listados na demanda. Alterar schema exige autorização dentro do escopo e revisão de compatibilidade, preservação de dados e reversão. Executar migração em Supabase/RDS exige autorização específica separada; uma mudança de código não concede essa autorização.

## Verificação e entrega
Revisar imports antes de executar testes. Preferir regras puras ou o executor de QA isolado autorizado; nunca usar banco remoto. No modo isolado, .env não é carregado e workers gerais não são iniciados. Atualizar API-CONTRACT.md quando o contrato mudar. Entregar evidências de tipo/testes, impactos e limitações para QA/Segurança. Não declarar produção ou migração validadas por testes locais.