# Preparação de Orquestrador e QA/Segurança

- Objetivo: configurar regras de atuação e validar QA em PostgreSQL temporário.
- Autorização: usuário autorizou começar e continuar esta etapa; banco Supabase, deploy, commit e push fora do escopo.
- Estado Git inicial: main limpa antes da configuração; arquivos da configuração inicial preservados.
- Escopo: AGENTS.md, docs/AGENTES.md, docs/agentes, scripts/agents-preflight.mjs, scripts/qa-environment.mjs, scripts/qa-workflow.mjs, apps/api/src/env.ts, apps/api/src/index.ts, tests/qa-isolation.test.mjs, tests/onboarding-search-api.mjs.
- Critérios: testes não carregam .env nem herdam credenciais; API recusa banco remoto ou não descartável; workers gerais desativados no QA; fixture de análise processada pontualmente; aplicação normal mantém comportamento.
- Verificações: preflight e typecheck de API/web/console passaram na etapa inicial. Três testes de isolamento passaram nesta etapa.
- Primeira integração: falhou porque teste de análise dependia do worker periódico. Ajuste: processamento explícito da fixture de demonstração e recuperação sintética, preservando workers desativados.
- Integração após ajuste: aprovada em 14/10/2026; propostas, paginação, ordem do radar, união de perfis, migrações locais, isolamento, permissões e CRUD passaram. PostgreSQL temporário encerrado normalmente.
- Verificação final: typecheck da API, web e console aprovado; diff --check sem erros. Um marcador SQL da nova asserção foi corrigido durante a validação.
- Sem alteração de .env, Supabase, dependências, commit, push ou deploy.
- Limitação: isolamento de ambiente e aplicação não é sandbox de rede do sistema operacional. Suite executada não cobre todos os testes do repositório.
- Próximo passo: registrar resultado integrado e preparar perfis UX/UI, Frontend e Backend em etapa posterior.