# Primeiros passos

O menu do cliente `/app/primeiros-passos` oferece um roteiro curto: perfil comercial, exploração de edital e primeira oportunidade no radar. Uma introdução em diálogo é aberta por ação explícita; durante a orientação, um painel contextual acompanha a navegação sem bloquear os controles da página. A primeira visita à visão geral oferece começar ou dispensar.

`GET /api/getting-started` usa a sessão e a empresa ativa: considera perfil iniciado quando há segmentos ou palavras-chave salvos, e verifica existência no radar com `EXISTS`, sem carregar a coleção de editais. O perfil não equivale a configuração completa nem habilitação. O sinal de abertura de edital só é emitido após o detalhe carregar sem erro. Nenhuma proposta, documento ou alteração comercial é enviada pelo tutorial.

Administrador pode configurar ou optar por explorar antes. Membros consultam o perfil e começam pela exploração. Links opcionais respeitam os recursos do plano. O radar é compartilhado pela empresa; se já houver registro, o guia informa isso em vez de solicitar uma inclusão duplicada.

Pausa, dispensa, abertura de detalhe e opção de explorar antes ficam no navegador, com chave versionada por usuário e empresa. Não sincronizam entre dispositivos; apagar dados do navegador reinicia essa parte. O perfil e o radar são sempre conferidos no servidor. Troca de usuário/empresa remonta o guia com chave própria.

Preparação documental e preferências de alertas são próximos passos opcionais. Não se exige completar cadastro para explorar, e o guia não interfere nos filtros existentes.

Validação: compilação, testes unitários da plataforma e `tests/first-steps-browser.ts` (dados simulados; pausa, retomada, perfil salvo, conclusão apenas após resposta do radar, membro e largura móvel).
