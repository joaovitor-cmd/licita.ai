# Revisão global de responsividade

- Pedido: revisar as telas para preencher a largura disponível como Meu radar.
- Escopo: apps/web/src/responsive.css, imports em main.tsx do portal/console, tests/responsive-pages-browser.mjs e este registro. Alterações anteriores preservadas.
- Contêineres centrais fluidos, sem limite 1700/1680px; grids com filhos min-width zero; detalhamento com painel lateral proporcional em tela ampla; formulários empilhados no celular; ações do cabeçalho quebram linha; tabelas com rolagem local.
- Limites de leitura de parágrafos, login e modais preservados intencionalmente; preencher a área útil não significa esticar cada texto ou modal até a borda.
- Typecheck de API/web/console aprovado.
- Varredura: 16 rotas principais do portal e 6 do console, 390/768/2400px, claro/escuro (132 combinações), aprovadas sem overflow horizontal global e com contêiner principal acima de 2100px em viewport 2400px.
- Fixtures de sucesso para dashboard, busca vazia, radar vazio, catálogo/documentos vazios, simulador, dados da empresa, monitoramentos, notificações e console overview/plans/companies/admins/reports.
- Segunda passagem: perfil, fontes, configurações, comercial e email do console em 390/2400px claro/escuro com fixtures adicionais de sucesso (20 combinações). Capturas de perfil móvel e comercial amplo revisadas.
- Limitações: detalhes de oportunidade, participação e boletim validados no estado de indisponibilidade; algumas subseções de configurações (preferências pessoais, boletins, entregas e alertas) também. Listas vazias não comprovam todos os casos com dados longos, tabelas preenchidas ou modais de cada página. Fluxos de login não foram percorridos nesta varredura autenticada. Não é auditoria completa de acessibilidade.
- Sem dados/API reais, Supabase, credenciais, dependências, commit, push ou deploy.