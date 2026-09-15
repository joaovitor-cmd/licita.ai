# Perfil comercial sugerido pelo CNPJ

Em Perfil comercial, um administrador informa o CNPJ e seleciona **Sugerir perfil pelo CNPJ**. A consulta explícita envia somente esse número à BrasilAPI (`/api/cnpj/v1/`), que utiliza Minha Receita. Não são enviados palavras-chave, catálogo ou documentos do cliente.

A resposta é validada, incluindo correspondência do CNPJ, e limitada aos dados necessários: razão social e atividades econômicas. O formulário mostra fonte e horário da consulta (não a data de atualização cadastral). O endpoint autenticado `POST /api/profile/cnpj-suggestion` exige administrador, valida dígitos verificadores de CNPJ numérico e alfanumérico (módulo 11, valor ASCII menos 48), limita consultas a 10 por minuto por IP e encerra a consulta externa após 8 segundos. Não grava o perfil nem retorna quadro societário ou contatos pessoais.

Esta primeira versão tem regras explícitas baseadas nas descrições dos CNAEs principal e secundários para impressão, informática, software/TI, engenharia, limpeza e materiais/equipamentos de saúde. Não é uma classificação universal nem análise com IA. A ausência de correspondência orienta o preenchimento manual; a consulta aceita CNPJ alfanumérico, mas depende da cobertura da fonte externa. O cadastro manual continua disponível se a fonte não localizar a empresa.

Cada grupo apresenta a atividade que motivou a sugestão. O usuário pode desmarcar grupos, descartar tudo ou adicionar os termos ao formulário. A adição preserva critérios anteriores, elimina duplicações e não altera razão social, CNPJ, região, modalidades, valores ou exclusões. Mais de 50 termos exige revisão, sem truncamento silencioso. Só **Salvar perfil** persiste a configuração pelo endpoint existente.

Não há bloqueio por CNAE, segmento contratado ou palavra-chave. Nenhuma rota de busca foi alterada. O perfil continua alimentando a aderência existente; filtros escolhidos pelo próprio usuário continuam tendo seu comportamento anterior. As sugestões não atestam habilitação, capacidade ou elegibilidade para um edital.

Validação: testes unitários em `apps/api/src/cnpj-profile.test.ts` e fluxo de navegador com fonte simulada em `tests/cnpj-profile-browser.ts`. A disponibilidade da fonte pública em produção deve ser monitorada; falha de consulta não impede o uso manual da plataforma.
