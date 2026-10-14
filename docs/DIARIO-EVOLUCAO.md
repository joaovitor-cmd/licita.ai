# Diário de evolução do Licitaro

## 07/10/2026 — atualização conferida de referências da cotação (LIC-60)

- Consulta de contexto disponível durante a edição, não apenas após conflito. Compara identidade/revisão empresarial inicial e consultada, avisa sobre edital alterado e abre cadastro/histórico em novas abas para preservar o formulário.
- Aplicação exige confirmação do contexto consultado e mesma empresa. Mantém nome, itens, preços, quantidades, condições e vínculos; atualiza apenas referências, reinicia conferências e identidade de tentativa, marca rascunho alterado e não salva/envia. Revisão-base não muda, mesmo se a consulta encontrar versão concorrente mais recente. Erro de consulta impede aplicação; nova resposta exige confirmação nova.
- API existente não alterada. Integração em banco local descartável ampliada e aprovada: contexto atualizado não contorna revisão-base obsoleta nem referência de página de itens alterada; versões anteriores preservadas. Nenhuma massa de teste no Supabase.
- 115 testes unitários e 22 fluxos de navegador aprovados; tipos/compilação/diferenças aprovados. Fluxo novo verifica preço e condições preservados, confirmação, reinício de conferências, requestId novo, revisão-base 7 mantida apesar de consulta da 8, erro/retry, outra empresa recusada e largura móvel.
- Imagem móvel inspecionada; texto empresarial duplicado removido e confirmação alinhada com seu texto. Teste específico aprovado novamente após o ajuste. Painel continua carregado sob demanda: 7,09 kB / 2,76 kB gzip; bundle principal permanece 425,75 kB / 133,50 kB gzip. Ambos os portais saudáveis e banco conectado. Sem migração, reinício de API, publicação, commit ou push.

Limites: atualização de contexto não é reconciliação de itens/quantidades, atualização técnica do catálogo ou mesclagem concorrente. Não oferece recuperação durável nem Word/PDF. Contrato em `COTACOES-REFERENCIAS.md`; LIC-60 permanece parcial.

## 07/10/2026 — proteção antes de encerrar sessão/trocar empresa (LIC-60)

- Estado de rascunho/gravação registrado somente em memória, sem compartilhar campos comerciais. Logout e troca de empresa pedem confirmação antes da requisição quando há alteração; cancelar não envia nada. Troca de empresa mantém confirmação de contexto mesmo sem rascunho; logout limpo não exige aviso extra.
- Gravação da cotação impede ambas as ações. Após confirmação explícita de saída, editor/abas e novas ações de contexto ficam indisponíveis durante a requisição. Falha anterior à confirmação do servidor mantém conta/empresa/campos e reativa bloqueios; sucesso confirmado permite encerrar sessão ou recarregar empresa sem um segundo aviso de descarte. Nada é salvo ou enviado automaticamente.
- Falha de armazenamento para aviso entre abas não mantém esta aba na empresa antiga após sucesso do servidor: recarrega contexto confirmado. Sincronização das outras abas pode exigir atualização manual nesse caso. Teste específico cobre armazenamento indisponível.
- Regressão encontrou abertura do menu móvel fechada por conclusão tardia de rota carregada sob demanda. A abertura passou a ser associada ao endereço atual e preservada quando a rota termina de carregar; cenário rápido original mantido, sem adicionar espera artificial para esconder a corrida.
- Tipos, 115 testes unitários, 21 fluxos de navegador e compilação aprovados. Cinco cenários novos de navegador cobrem cancelamento, falha, pendência, contexto confirmado, ausência de segundo aviso, recusa durante gravação e armazenamento indisponível. Regressão geral final inclui o cenário móvel rápido que revelou a corrida; nenhum ajuste de espera foi usado para mascarar a falha.
- Bundle principal final: 425,75 kB / 133,50 kB gzip. Ambos os portais saudáveis e Supabase conectado; somente interface alterada, sem migração, reinício da API, sessões/empresas reais modificadas, publicação, commit ou push.

Limites: recuperação durável de rascunho, contexto alterado por outra aba e demais formulários ainda pendentes. Segurança de expiração de sessão não é interceptada. `COTACOES-NAVEGACAO.md` atualizado; LIC-60 continua parcial.

## 07/10/2026 — cotações: navegação protegida e telas sob demanda (LIC-60)

- Rascunho comercial alterado pede confirmação antes de sair por menu, links internos e voltar/avançar. Continuar, Escape ou fechar mantêm campos/revisão-base; sair é descarte explícito, nunca salvamento/envio. Editor limpo não abre aviso. Fragmentos no mesmo endereço não desmontam o formulário e não bloqueiam.
- Gravação pendente impede saída e troca de aba; mensagem distingue operação não confirmada. Falha mantém formulário/alerta e proteção. Ações locais de substituir/fechar cotação também não são aceitas durante gravação/abertura. Confirmação de gravação não dispara navegação anteriormente tentada. Aviso nativo cobre recarga/fechamento conforme política do navegador.
- Roteador de dados preserva os endereços existentes e usa bloqueio padrão da biblioteca, com diálogo próprio. Erro de renderização tem mensagem em português sem detalhes técnicos. Radar, páginas operacionais, simulador, histórico e boletins carregam sob demanda com navegação visível durante a carga. Bundle principal reduzido de 467,17 para 424,39 kB; gzip de 141,50 para 133,02 kB. Não é medição de tempo nem do total de recursos de uma rota.
- Verificação: 115 testes unitários e 16 fluxos de navegador aprovados, incluindo carregamento sob demanda. Fluxo novo cobre menu/link, Escape, voltar repetidamente, saída aceita, avançar sem restaurar descarte, editor limpo, gravação pendente, falha preservada, recarga cancelada e largura móvel. Tipos/compilação/conferência de diferenças aprovados e imagem móvel inspecionada. Ambos os portais saudáveis e banco conectado.
- Alteração somente da interface, disponível no portal local; nenhuma migração, reinício da API, dado de teste no Supabase, publicação, commit ou push.

Limites: proteção específica antes de logout/troca de empresa, recuperação durável de rascunho, expiração de sessão e demais formulários continuam pendentes. Contrato/evidências em `COTACOES-NAVEGACAO.md`; LIC-60 permanece parcial.

## 07/10/2026 — busca conjunta de perfis (LIC-32)

- Seleção explícita de até 10 perfis ativos no gerenciador: alternativas sem duplicar editais, com indicação dos perfis correspondentes em cada cartão. Filtros adicionais refinam o conjunto. Aplicar substitui critérios anteriores e mantém ordenação/tamanho de página; criação durante combinação abre perfil independente vazio com aviso, sem copiar uma composição incompleta.
- Resumo mostra nomes em vez de IDs e permite remover só a combinação. Seleção local pode ser limpa e perfis pausados já selecionados podem ser desmarcados. Perfis indisponíveis não são silenciosamente descartados; consulta exige atualizar a escolha. Nenhuma seleção/pesquisa grava no perfil salvo, na empresa ou no Radar.
- Regras compartilhadas entre consulta livre e perfis, valores parametrizados, união em uma consulta e metadados apenas na página solicitada. Limiares de aderência por perfil respeitados; pontuação continua comercial, não uma avaliação técnica nem nova pontuação individual de perfil de busca. Resposta informa revisões utilizadas. Combinação recursiva dentro de perfil é rejeitada.
- Verificação: integração completa em banco local descartável aprovada, incluindo união, metadados, páginas, refinamento, IDs repetidos/maiúsculos/inválidos, pausa/retomada, limiares e isolamento empresarial. 115 testes unitários e 15 fluxos de navegador aprovados; teste conjunto ampliado aprovado novamente com correspondências no cartão. Tipos API/web, compilação e conferência de diferenças aprovados; imagem móvel inspecionada.
- API local atualizada por reinício direcionado do processo identificado. Sem nova migração, massa de testes no Supabase, publicação, commit, push, contratação ou mudança de limites comerciais.

Limites: alertas por perfil e validação com usuários/amostras reais continuam pendentes. Contrato e diferenças entre OR de perfis e AND de filtros em `BUSCA-CONJUNTA-PERFIS.md`.

## 07/10/2026 — filtros aplicados legíveis e rascunho protegido (LIC-32/55)

- Grupos de filtros aplicados ficam visíveis com opções adicionais recolhidas, com remoção individual por botão acessível. Textos longos têm prévia e valores completos em um detalhe de leitura; contagem ignora parâmetros de navegação e termos vazios sem efeito. Singular/plural do mesmo filtro são removidos juntos, sem restrições residuais escondidas.
- Remover mantém busca aplicada, demais filtros, ordenação, tamanho da página e referência ao perfil salvo, reiniciando a página. Não grava no perfil nem no cadastro empresarial. Limpar todos mantém busca aplicada/ordenação/tamanho de página e desvincula a seleção sem alterar o perfil original.
- Texto digitado ainda não buscado é preservado ao modificar filtros e não é enviado por “Limpar filtros”. Voltar/avançar sincroniza o campo com a busca aplicada. A regressão detectou uma corrida em retorno rápido pelo navegador; foi corrigida com restauração na navegação histórica, sem disparar essa restauração em mudanças comuns de filtros.
- Datas de publicação inválidas não são reescritas no resumo; zero e coerção numérica vazia já existente na API são explicitados. Combinações singular/plural mostram a conjunção real, não inventam união de critérios. Situação de prazo distingue dados coletados de disponibilidade oficial.
- Verificação final: 112 testes unitários e 14 fluxos de navegador aprovados, incluindo retorno rápido repetido e avançar, remoção pelo teclado, nenhuma gravação em perfil, parâmetros preservados e largura móvel. Imagem móvel inspecionada; tipos/compilação/conferência de diferenças aprovados. Bundle principal final: 464,52 kB / 140,74 kB gzip.
- Interface disponível no portal local, saúde dos dois portais/banco conferida. Sem migração, reinício de API, dados de teste no Supabase, publicação, commit, push ou contratação.

Limites: consulta conjunta de perfis e alertas por perfil continuam pendentes; nenhuma regra de relevância foi alterada. Contrato e comportamento em `BUSCA-FILTROS-APLICADOS.md`.

## 07/10/2026 — leitura compacta das oportunidades (LIC-55)

- Objetos longos têm prévia de até 280 caracteres por palavras e expansão/recolhimento no próprio cartão, sem nova consulta, mudança de filtros ou navegação. Textos curtos não ganham controle extra. Destaque de termos preservado; controle com estado/referência acessíveis.
- Situação literal informada pela fonte fica visível e independente dos prazos. Não se fabrica “recebendo propostas” porque uma data está no futuro. Situações longas têm prévia e texto completo sob demanda. Cancelamento não impede acompanhar no Radar.
- Abertura/encerramento identificados como datas de propostas e valor identificado como estimativa. Contexto recolhido explica coleta versus tempo real, proposta versus sessão de disputa, estimativa versus cotação/resultado e horários de Brasília. Sem orientação jurídica ou cálculo de prazo legal.
- Datas passadas/futuras/invertidas/inválidas têm avisos descritivos, sem transformar ausência em disponibilidade. Campos não informados continuam explícitos; valor zero preservado. Formatação compartilhada de data/valor evita erro/NaN em entradas inválidas.
- Verificação: 108 testes unitários e 13 fluxos de navegador aprovados; tipos/compilação/conferência de diferenças aprovados. Teste de leitura abrange expansão sem consulta, objeto longo/curto, Unicode, situação cancelada com prazo futuro, zero/ausência, datas inválidas, HTML literal sem execução e largura móvel/claro/escuro. Imagem móvel final inspecionada; atalho de navegação permanece fora da tela sem foco. Bundle principal final: 461,90 kB / 139,92 kB gzip.
- Mudanças de interface já disponíveis no servidor local. Ambos os portais responderam à saúde e banco conectado. Sem reinício de API, migração, coleta adicional, dados de teste no Supabase, publicação, commit, push ou contratação.

LIC-55 permanece parcial: validar a leitura com usuários/amostras reais e integrar CAPAG com fonte/evidência. Detalhes e limites em `OPORTUNIDADES-LEITURA.md`.

## 07/10/2026 — organização persistente do quadro (LIC-07)

- Cartões podem ser posicionados antes de outro na mesma etapa por arraste ou “Organizar posição”. Final refere-se à etapa inteira, mesmo com filtros/paginação. Inclusão e mudança de etapa entram no início; editar responsável/nota/tarefa não muda ordem. A lista mantém sua ordenação por atualização.
- Posições inteiras exatas, espaços entre vizinhos e reequilíbrio transacional quando necessário. Ordem/revisão compartilhadas por empresa; conflito obsoleto não grava e exige atualização explícita. Duas reordenações concorrentes: uma aceita, outra recusada. Mudança de revisão entre cargas adicionais recarrega, sem misturar ordens.
- Todos os caminhos de inclusão foram revistos: inclusão direta, tarefa a partir de análise, modelo de checklist e demonstração. Trava empresarial precede as demais travas nos caminhos que criam/reordenam participações. Reordenar não carrega históricos/catálogos nem altera a data comercial; registra um evento legível com autor. Repetir a mesma posição não incrementa revisão/histórico.
- Migração preserva a ordem anterior para registros sem posição e não redefine posições em novas inicializações. Ao acumular páginas, frontend agrupa por etapa e ordena exatamente por posição/ID, incluindo destaque previamente carregado fora da primeira página e valores superiores à precisão numérica comum.
- Verificação: integração em banco local descartável aprovada com ordem, ausência de reposicionamento na edição, final global, empate/reequilíbrio, conflito, gravações simultâneas, destino de outra empresa, migração e regressões. 106 testes unitários aprovados. 12 fluxos de navegador aprovados; teste específico final ampliado aprovado também com arraste sobre o próprio cartão (sem mudança) e revisão mudando durante carga adicional. Tipos/compilação aprovados; diálogo visual inspecionado. Bundle principal final: 459,95 kB / 139,30 kB gzip.
- API local reiniciada de forma direcionada, aplicando a migração idempotente no Supabase existente. Banco conectado e ambos os portais disponíveis. Nenhum dado de teste enviado ao Supabase; nenhuma publicação, commit, push ou contratação.

Limites documentados em `RADAR-ORDEM.md`: escolher vizinho simultaneamente ao mudar etapa e colunas personalizadas continuam pendentes; filtro não cria ordem individual e páginas não são snapshot imutável. Backlog mantém LIC-07 parcial, sem afirmar conclusão dessas extensões.

## 07/10/2026 — Radar paginado disponível no portal (LIC-06)

- Interface conectada à consulta paginada: 25 cartões por etapa, botão de carregar mais por coluna e 50 participações por página na lista. Quantidades, valores conhecidos e tarefas usam os totais completos dos filtros; encerradas não entram no resumo em andamento.
- Cartões acumulados são deduplicados; respostas de filtros anteriores são canceladas/ignoradas. Falha adicional preserva a coluna e permite tentar a mesma página. Trocas de filtros/visualização voltam à página inicial. Atualização em segundo plano preserva os detalhes abertos durante a espera; depois volta à carga inicial.
- Destaque pode acrescentar um único cartão fora da primeira página, sempre respeitando empresa/visibilidade/filtros. Teste de isolamento e ausência de correspondência aprovado no banco local. Não altera os totais.
- Verificação: integração da API em banco descartável aprovada; 12 testes de navegador aprovados, incluindo carregamento por coluna, falha/repetição, lista, filtros, resposta atrasada, arraste, responsável, tarefa e largura móvel. Tipos da API/interface, compilação e conferência de diferenças aprovados. Imagem móvel do Radar inspecionada. Bundle principal: 457,26 kB / 138,47 kB gzip.
- API local atualizada iniciada normalmente, aplicando índices idempotentes no Supabase existente, sem apagar dados. Os dois portais responderam à verificação de saúde; portal confirmou banco conectado. Nenhuma publicação, commit, push ou contratação.

Restam colunas personalizadas/posição manual (LIC-07), limitar tarefas/catálogos volumosos e tratar concorrência entre páginas além da deduplicação. Não se promete um snapshot imutável de resultados.

## 07/10/2026 — base de paginação do Radar (LIC-06, P0)

- Nova consulta paginada com filtros de texto literal, responsável, encerradas e alterações não conferidas. Quadro limita 25 cartões por etapa; lista limita 50; coluna pode consultar sua próxima página separadamente. Consulta anterior mantida para não alterar consumidores ainda não migrados.
- Totais por etapa e resumo filtrado independem da página; valores desconhecidos são contados e soma é explicitamente parcial, sem substituir ausência por zero. Identificadores selecionados restringem também a consulta de tarefas, sem carregar as de toda a empresa. Históricos continuam sob demanda.
- Ordenação por atualização e ID, índices empresariais por etapa/ordenação. Paginação por posição, sem promessa de snapshot imutável em edições concorrentes; integração deverá deduplicar IDs/recarregar após movimentações.
- Teste integrado local aprovado com 62 participações, três páginas por etapa, duas na lista, empate de data sem duplicação, totais, filtros, valores desconhecidos, parâmetros inválidos, isolamento e conferência de alterações. Regressões existentes de propostas/perfis/monitoramentos/checklists aprovadas na mesma execução. Verificação de tipos da API aprovada.

Esta rodada é a base da API; não muda ainda a tela do Radar. Próxima entrega: integrar carregamento por coluna/lista, totais e destaque, com teste de navegador. Servidores locais usados pelo usuário não foram interrompidos; nenhum Supabase real alterado nesta rodada.

## 07/10/2026 — conferência de conflito preservando o rascunho

- Após resposta de conflito ao salvar, conferência carregada sob demanda compara o rascunho com os campos comerciais da versão atual. Campos e condições nomeados em português, valores lado a lado, linhas identificadas por ID estável. Não serializa JSON nem custos internos.
- Consulta separada do contexto atual sinaliza mudança de empresa/edital durante a edição. Não troca fingerprint, revisão base, fontes ou preços automaticamente; não autoriza sobrescrita. Formulário permanece editável/preservado ao abrir e fechar conferência. Mudanças posteriores continuam sujeitas ao controle de concorrência no servidor.
- Diferenças exibidas em grupos de 30; ausência de diferenças comerciais não é declarada ausência de conflito de fonte/conferências. Cotação ainda não identificada consulta apenas contexto, sem solicitação desnecessária de lista ou versão.
- Verificação: 103 testes unitários aprovados, incluindo dois novos de comparação (decimais equivalentes, zero/vazio, adição/remoção de linhas, campos internos ignorados e ausência de mutação). Fluxo móvel de cotação aprovado com conflito 409, comparação de preço e preservação do rascunho ao fechar, sem nova gravação durante a conferência. Tipos e compilação aprovados; módulo separado de conferência com 5,30 kB / 2,20 kB gzip.

Mesclagem assistida e atualização de referências ainda pendentes; esta entrega permite comparar, não resolver automaticamente. Sem Supabase real/publicação.

## 07/10/2026 — consulta de versões anteriores ao histórico recente

- Histórico da cotação permite abrir versões pelo número quando há mais de 50 registros, sem carregar todos os corpos. Valida inteiro positivo e limite de consulta; estado antigo é somente leitura. Botão explícito retorna à versão atual para criar revisão.
- Consulta inexistente/falha mantém a versão anteriormente exibida. Não altera revisão atual, preços ou empresa dos snapshots. Evita promover uma versão antiga à atual por edição acidental.
- Fluxo de navegador ampliado aprovado com cenário de 51 revisões: abertura da versão 1 fora das 50 recentes, bloqueio de edição, número zero inválido, consulta inexistente preservando a tela e retorno à atual com edição habilitada. Os demais cenários de cotações continuam aprovados. Tipos e compilação aprovados.

Sem migrações ou Supabase real/publicação. Pendentes recuperação assistida de conflitos, lotes, navegação protegida, representantes e exportação.

## 07/10/2026 — interesses por perfil na cotação

- Seletor de perfil ativo e opção Só itens de interesse na seleção da cotação; exclusões têm prioridade. Sem escolha automática, sem remoção de itens/preços já selecionados quando filtro/perfil muda. Contagens limitadas à página consultada, não ao edital inteiro. Regras de lote continuam exigindo conferência manual.
- Correspondência por palavras inteiras sem acentos, compartilhada com a tela Itens e valores. Termos compilados por perfil, evitando normalização repetida por linha; pesquisa normalizada uma vez por renderização. Não infere equivalência técnica ou compatibilidade por CNAE/região/modalidade.
- Perfis pausados não são oferecidos; perfil sem termos não habilita o filtro. Falha de consulta mostra aviso com repetição e não bloqueia pesquisa/seleção manual.
- Verificação: 101 testes unitários aprovados (novo teste cobre acentos, palavras inteiras, exclusões, múltiplos termos e ausência de termos). Dois fluxos de navegador aprovados: cotação preserva seleção/preço ao ocultar item excluído; tela Itens e valores mantém seus filtros, destaques, sigilo e paginação. Tipos e compilação aprovados.

Sem alteração no Supabase real/publicação. Pendentes lotes, recuperação de conflitos, representantes e geração/exportação de documentos.

## 07/10/2026 — seleção em lote dos itens exibidos

- Selecionar/limpar itens exibidos na página da cotação, respeitando a pesquisa. Não seleciona outras páginas nem itens ocultos; linhas manuais preservadas. Inclusão ignora itens já escolhidos, sem sobrescrever seus preços ou dados comerciais.
- Inclusão em lote valida toda a seleção antes de alterar o rascunho: limite de 100, consulta atual, tamanho de descrição/unidade e quantidade válida. Falha preserva integralmente a seleção anterior, sem truncamento ou inclusão parcial. Limpar itens com dados comerciais preenchidos exige confirmação.
- Contagem de selecionados na página e total da cotação. Busca de seleção usa conjunto de números, sem percorrer todas as linhas para cada checkbox. Não infere lotes da contratação.
- Teste móvel ampliado aprovado: seleção atômica recusada por descrição longa, seleção posterior válida, limpeza filtrada mantendo itens de outra página e preço já preenchido. Fluxos anteriores de falha/reenvio, catálogo e versões continuam aprovados. Compilação aprovada; verificação de tipos executada junto ao fluxo.

Ainda pendentes perfil de interesses, lotes oficiais, recuperação de conflitos e exportação. Sem Supabase real/publicação.

## 07/10/2026 — catálogo comercial nas cotações

- Seletor de produtos por linha, carregado somente ao abrir, com pesquisa explícita e paginação. Consulta apenas o endpoint comercial com preço de venda; não consulta custos internos. Vincular produto e aplicar preço são ações separadas.
- Aplicação exige unidade normalizada compatível, periodicidade por unidade e preço informado no formato comercial. Bases mensais/unidades diferentes não são convertidas. Substituição de oferta já preenchida exige confirmação. Vincular ou remover vínculo preserva o preço manual e as informações da linha; editar preço/unidade desmarca aplicação automática.
- Nome do produto vinculado disponível na edição; versões reais preservam o nome comercial no snapshot. Vínculo não afirma equivalência técnica ao edital, explicitado na tela.
- Fluxo móvel de cotações aprovado novamente, incluindo catálogo sem consulta antecipada, preços inicialmente manuais, recusa/aceite de substituição, bloqueio de periodicidade/unidade/preço ausente, vínculo sem aplicação e gravação da revisão com sinalização correta. Verificação de tipos e compilação aprovadas. Seletor em módulo separado de 2,73 kB / 1,27 kB gzip.

Sem alterações no Supabase real ou publicação. Permanecem pendentes seleção em lote/perfil de interesses, lotes, recuperação assistida de conflitos, representantes e exportação.

## 07/10/2026 — montagem e consulta inicial de cotações

- Aba Cotações na oportunidade, carregada sob demanda, com seleção de itens oficiais por página e pesquisa local. Nada pré-selecionado; preços da oferta começam vazios. Itens/valores escolhidos permanecem entre páginas e pesquisas. Linhas manuais, marca, modelo, solução e condições comerciais disponíveis.
- Quantidades/preços digitados como strings; vírgula/ponto decimal aceitos sem separador de milhar. Cálculos em inteiros escalados, idênticos aos da API, inclusive valores grandes e arredondamento por linha. Zero permanece diferente de campo vazio; valores incompletos indicam total parcial.
- Falha de gravação preserva o rascunho e reutiliza a mesma intenção de gravação se o conteúdo não mudar. Versões salvas são somente leitura, com empresa preservada, autor, estado e histórico. Criar revisão reinicia as conferências; salvar nunca envia ao portal nem altera etapa automaticamente.
- Proteção de rascunho ao trocar abas/substituir cotação e aviso nativo ao fechar/recarregar. Proteção uniforme para outras rotas/voltar ainda pendente. Conflitos preservam dados e mostram motivo, sem atualizar contexto/revisão silenciosamente; recuperação assistida fica para próxima entrega.
- Verificação: 100 testes unitários aprovados, incluindo dois novos de valores; fluxo de navegador móvel aprovado para seleção paginada, sigilo, preço inicialmente vazio, precisão, zero, filtro, confirmação de descarte, falha/reenvio, leitura/revisão e ausência de transbordamento horizontal. Regressões de itens, histórico compacto e monitoramentos aprovadas (quatro fluxos nesta rodada). Teste integrado do backend em PostgreSQL descartável aprovado novamente, incluindo eventos por versão sem mudança automática de etapa.
- Compilação de produção aprovada: módulo de Cotações separado, 16,21 kB / 5,57 kB gzip; CSS 2,19 kB / 0,73 kB gzip. Verificação de tipos aprovada. Captura móvel inspecionada em `test-results/proposals-mobile.png`.

Ainda pendentes seletor de catálogo, ações por página/perfil, agrupamento de lotes, recuperação assistida de conflitos, representantes, geração de arquivos e envio/comprovante. Nenhuma migração/gravação no Supabase real, publicação ou alteração de credenciais nesta rodada.

## 06/10/2026 — base de cotações comerciais versionadas

- API e persistência de cotações por oportunidade, separadas por empresa, com até 100 itens/versão e 50 cotações/oportunidade (limites técnicos). Rascunho aceita campos ainda desconhecidos; revisão interna exige conferência de seleção/lotes, itens, condições e preço zero quando aplicável. Não há aprovação jurídica nem envio ao portal.
- Quantidade/preço em strings decimais normalizadas, até quatro casas; cálculos com inteiros escalados, arredondamento por linha a centavos e soma exata. Zero não é vazio. Unidade e prazo não são convertidos/inferidos silenciosamente.
- Referências PNCP são validadas contra a página consultada, seu instante e número do item. Referências sigilosas não expõem estimativas mesmo em cache inconsistente. Seleção duplicada do mesmo item oficial é bloqueada. Agrupamento de lotes permanece não confirmado: conferência manual explícita obrigatória para revisão.
- Versões preservam empresa, identificação/objeto do edital, critérios de revisão, dados comerciais do catálogo e referências de itens. Catálogo utiliza apenas preço de venda, com unidade/periodicidade compatíveis; custos, margens e campos internos não são aceitos no corpo comercial nem selecionados para snapshots/opções.
- Criar/repetir solicitação é idempotente; alteração de conteúdo com o mesmo identificador é rejeitada. Edições distintas concorrentes da mesma revisão produzem uma gravação e um conflito, sem perda silenciosa. Membros podem operar cotações, sem permissão para alterar cadastro empresarial.
- Cadastro/edital alterado durante edição bloqueia gravação com contexto antigo. Leitura de versão salva sinaliza alteração posterior de cadastro, fonte ou consulta de itens, preservando os dados originalmente usados. Auditoria e evento na participação integram a mesma transação; não duplicados em reenvio.
- Catálogo/referências consultados em lotes, sem consulta por linha. Hash da consulta de itens calculado uma vez por página, não por linha. Opções comerciais do catálogo são paginadas e não retornam custos internos. Históricos de versões preservados integralmente; consulta lista as últimas 50 e permite buscar uma revisão específica.
- Verificação: 98 testes unitários (incluindo quatro novos de precisão/validação) e teste integrado em PostgreSQL local descartável aprovados, cobrindo concorrência, idempotência, rollback, isolamento, sigilo, referências, snapshots e desatualização.

Esta entrega é a base de gravação, ainda sem interface de montagem ou geração de arquivos. Interface, busca/seleção de itens com estado entre páginas, exportação, representantes e registro de envio permanecem pendentes. Não representa transferência de cenários do simulador (LIC-58).

Migrações adicionam `commercial_proposals` e `commercial_proposal_versions`; somente validadas localmente. Nenhuma alteração ao Supabase real nesta rodada.

## 06/10/2026 — monitoramento de órgãos por CNPJ

- Botão Monitorar órgãos na busca abre página sob demanda. Cadastro/edição por administradores; consulta por membros. Nome, CNPJ validado, assuntos alternativos, exclusões e UFs opcionais. Separado do perfil comercial e dos perfis de busca.
- Usa exclusivamente CNPJ explícito do identificador PNCP das fontes integradas; não infere órgão pelo nome, UASG ou CNPJ da empresa. Correspondência lexical de palavras/frases sem acentos, não análise semântica. Exclusão tem prioridade; UF corresponde à unidade do órgão, não local de execução.
- Coleta de identificador novo verifica regras ativas e data de publicação posterior ao marco da regra. Edição/retomada reinicia marco; pausa preserva histórico. Datas desconhecidas e publicações anteriores não geram avisos; sem retroatividade, tempo real ou inclusão automática no radar.
- Resultado guarda revisão, nome, critérios, termos encontrados e trecho do objeto na coleta. Permite consultar mesmo após mudar/pausar regra. Origem, data de publicação, identificação na coleta e código interno apresentados com acesso à oportunidade.
- Consulta candidatos por CNPJ indexado; normalização do texto feita uma vez por edital. Correspondências e avisos inseridos em lotes na transação da coleta, sem consulta por monitoramento/empresa. Um aviso por empresa/edital, mesmo com regras sobrepostas. Avisos somente no portal, respeitando empresa/ambiente ativo, plano com busca e notificações habilitadas; não envia e-mail/WhatsApp.
- Limite técnico de 50 regras por empresa, 30 termos/exclusões por regra, nomes normalizados e travas para concorrência. Alterações antigas do formulário são rejeitadas; falha preserva rascunho. Históricos em páginas de 20, sem materializar todos os objetos/snapshots antes de paginar.
- Banco local valida CRUD/revisão, permissões, isolamento, coleta real simulada sem chamadas externas, exclusões/UF, datas antigas/ausentes, pausa/retomada, avisos únicos, preferências desativadas e preservação de critérios. Navegador valida criação/falha/rascunho, pausa, histórico, acesso somente leitura e largura móvel.
- Regressão: 94 testes unitários, dez fluxos de navegador, banco local e build aprovados. Tela em pacote separado de 8,04 kB (3,00 kB gzip), sem acrescentá-la ao carregamento inicial.

Migração adiciona `agency_watches` e `agency_watch_hits` com índices; validada somente no PostgreSQL local descartável. Sem alteração no Supabase real. LIC-04 permanece parcial até validar amostras de órgãos reais e ampliar cobertura de identificadores/fontes.

## 06/10/2026 — alterações pendentes e conferência da equipe

- Lista e quadro do radar destacam a quantidade de alterações ainda não conferidas e levam diretamente ao histórico. Filtro “Só alterações para conferir”, combinável com busca/responsável/etapas. Etapas encerradas continuam excluídas até selecionar sua inclusão; a legenda agora inclui corretamente também as ganhas.
- Histórico permite marcar cada alteração após confirmação explícita. Abrir a tela não registra conferência. Autor e data ficam visíveis; a marcação é compartilhada somente pelos membros da empresa e não indica aprovação jurídica nem atualiza a situação oficial.
- Gravação idempotente, auditoria e evento legível no histórico da participação na mesma transação, sem sobrescrever autor/data nem repetir eventos em reenvio. Requer oportunidade no radar, alteração pertencente ao edital e acesso ao contexto empresarial. Nenhum histórico da fonte é apagado.
- Mudanças posteriores permanecem pendentes por identificador próprio; não há marcação geral por data que possa esconder uma alteração concorrente. Outra empresa no mesmo edital público mantém sua própria conferência e não vê o autor da primeira.
- Contagens acrescentadas às consultas existentes do quadro, com índices por edital e chave composta da conferência, sem requisitar o histórico completo para cada cartão. Paginação de quadros grandes permanece pendente.
- Testes locais cobrem concorrência/idempotência, auditoria única, mudança posterior, relação edital/alteração, contexto sem radar e isolamento no mesmo edital público. Navegador cobre cancelamento, falha, nova tentativa, persistência, indicação/filtro do quadro e largura móvel.
- Regressão: 91 testes unitários, nove fluxos de navegador, banco local e build aprovados. Revisão visual ajustou o destaque para etiqueta âmbar compacta, evitando aumentar desnecessariamente a altura dos cartões.

Migração cria `opportunity_change_reviews`, validada somente em PostgreSQL local descartável. Nenhuma aplicação ao Supabase real nesta rodada.

## 06/10/2026 — leitura documental em segundo plano, progresso e avisos

- Solicitações concorrentes da mesma empresa/oportunidade compartilham a execução por trava transacional. Refazer a leitura continua explícito e preserva versões anteriores.
- Etapas reais persistidas: preparação, conferência, download, extração e gravação. Contagem informa anexos processados, não supõe leitura completa nem apresenta percentual inventado. Documentos não suportados continuam pendentes na cobertura.
- Resultado e aviso no portal são gravados juntos; identificador único evita aviso duplicado. Conclusão completa, conclusão com pendências e falha têm mensagens distintas. Preferência de avisos e empresa ativa respeitadas; sem novo envio de e-mail/WhatsApp.
- Execução interrompida é encerrada com motivo consultável. Versão do mecanismo e mudanças na fonte invalidam o resultado para revisão. Alteração dos bytes mantendo URL ainda exige nova leitura explícita.
- Teste integrado local verifica concorrência, resultado parcial honesto em demonstração, aviso único, isolamento, resultado persistido, mudanças da fonte/mecanismo e recuperação com avisos desativados. Novo fluxo de navegador verifica etapas, botão protegido e retorno à leitura salva sem nova solicitação.
- Regressão: 91 testes unitários, nove fluxos de navegador e build aprovados. Não representa validação de IA generativa/OCR: o mecanismo atual continua busca textual de evidências, com conferência humana.

Migração adiciona `edital_analyses.progress`, validada somente em PostgreSQL local descartável. Sem alteração ao Supabase real nesta rodada.

## 06/10/2026 — cadastro empresarial separado e identidade consistente

- Página Dados da empresa, carregada sob demanda, separada do perfil comercial e dos perfis de busca. Nome exibido e CNPJ continuam com uma fonte de dados única, compartilhada com o perfil comercial; razão social/fantasia, natureza/porte, contatos, endereço e inscrições ficam no cadastro empresarial.
- Administradores editam; membros consultam. Revisão otimista protege contra sobrescrever dados de uma outra edição. O perfil comercial também verifica a revisão ao alterar a identificação, mas mudanças apenas nos interesses preservam o cadastro empresarial.
- Consulta BrasilAPI/Minha Receita retorna prévia cadastral e fonte/data. Nenhum campo é selecionado automaticamente; somente os escolhidos substituem valores do formulário. Nada é salvo até confirmar o cadastro. Campos ausentes e inscrições previamente preenchidas são preservados.
- Não importa quadro societário, não infere representante/poderes, inscrições ou elegibilidade jurídica. Porte é apenas o informado no cadastro, não uma comprovação de benefício licitatório. Representantes/dados bancários permanecem tarefas separadas.
- Resposta de CNPJ limitada a 512 kB antes de interpretar JSON, host fixo, sem redirecionamentos e com timeout. Falha não altera cadastro. Referência de mapeamento: [documentação oficial BrasilAPI](https://github.com/BrasilAPI/BrasilAPI/blob/main/pages/docs/doc/cnpj.json).
- Auditoria registra autor e ação, sem copiar dados cadastrais ao log. Não gera/envia documentos ao salvar.
- Banco local: cadastro, CNPJ normalizado, preservação de interesses, identidade compartilhada, conflitos, isolamento de empresas e bloqueio de edição/consulta externa para membros aprovados. Navegador: prévia/seleção, formulário preservado em falha, dados não escolhidos intactos, visão somente leitura e responsividade aprovados.
- Regressão: 91 testes unitários (87 API + 4 CSV), oito fluxos no navegador e build aprovados. Cadastro empresarial em pacote sob demanda de 5,93 kB (2,48 kB gzip); pacote inicial 450,82 kB (136,26 kB gzip).

Migrações adicionam `organizations.company_details` e `organizations.company_revision`; validadas somente em PostgreSQL local descartável. Não aplicadas ao Supabase real nesta rodada. LIC-34 permanece parcial até completar histórico detalhado e o uso consistente desses dados nos documentos/propostas.

## 06/10/2026 — catálogo, custos e importação conferível

- Catálogo separa custo interno unitário de preço de venda unitário, com unidade e periodicidade. Campos são opcionais; ausência permanece distinta de zero. Cadastro/edição manual preservam esses valores, sem exportá-los automaticamente a propostas/simulações.
- Importação CSV UTF-8: até 1 MB, 200 itens e 30 colunas, com delimitador/formato numérico escolhidos explicitamente. Aspas, quebras de linha em células, BOM, limites e erro de estrutura tratados. Formato brasileiro `1.234` significa mil duzentos e trinta e quatro; selecione o formato decimal com ponto quando aplicável.
- Mapeamento sugerido por cabeçalhos conhecidos; campo genérico “Valor” não é adivinhado como custo/preço. Prévia detecta inválidos e duplicados por tipo/nome normalizado. Nada é selecionado/gravado automaticamente; usuário confirma a seleção. Duplicados nunca substituem o catálogo nesta versão.
- Interface e parser de importação carregados somente quando a pessoa abre a importação, evitando incluí-los no pacote inicial do portal.
- Confirmação transacional, inserção em lote e registro do autor/identificador/hash/resultado. Reenvio da mesma confirmação retorna o resultado anterior sem duplicar itens. Conflito com o catálogo atual bloqueia toda a seleção, sem importação parcial silenciosa.
- Escritas manuais compartilham trava da importação por empresa. Correção adicional: PATCH com campos omitidos não aplica defaults e não zera valores existentes.
- Aumento do limite JSON restrito a `/api/catalog/import`; restante da API mantém 200 kB.
- Teste integrado aprovado: importações simultâneas/idempotência, isolamento entre empresas, conflito sem gravação parcial, edição parcial preservando valores, zero e ausência. Teste de navegador aprovado: arquivo/mapeamento/prévia, escolha explícita, falha/reenvio mantendo confirmação, edição de custo e tela pequena. Quatro testes puros de CSV aprovados.
- Regressão final: 89 testes unitários (85 da API + 4 do CSV), sete fluxos no navegador e banco integrado aprovados. Build com importação em pacote separado de 9,48 kB (4,01 kB gzip); pacote inicial 450,49 kB (136,26 kB gzip). Revisão visual corrigiu o modal para não herdar o estilo dos indicadores da página.

Migrações locais adicionam quatro colunas em `catalog` e a tabela `catalog_imports`. Não aplicadas ao Supabase real nesta rodada. XLSX, extração de catálogos não estruturados e sugestão semântica de custos ainda não implementados; LIC-18 permanece parcial. O arquivo original não é armazenado; ficam os itens confirmados e os metadados da importação.

## 06/10/2026 — alterações legíveis e checklist na participação

- Alertas de novas alterações usam campos conhecidos, datas de Brasília, estimativas e contagens de documentos. Não concatenam mais JSON/URLs dos anexos. O registro original continua preservado no histórico; avisos antigos não foram reescritos.
- API de histórico inclui resumo derivado; comparação visual mostra nomes de arquivos, não seus endereços brutos. O link oficial segue disponível. Campos técnicos desconhecidos não são exibidos como explicação.
- Contagens/listas não comprovam alteração do conteúdo de arquivos. O aviso e a interface mantêm essa distinção; hash dos bytes ainda é pendente.
- Aba Documentação da participação passa a oferecer checklist de exigências, modelos existentes, vínculo com a biblioteca e conferência humana. Não restaura os cards “Preparação em andamento” ou “Seu próximo passo, sem complicar”.
- O checklist não consulta a API a cada 15 segundos. Atualiza por ação explícita, alteração registrada e retorno à janela; é carregado somente ao abrir a documentação.
- Históricos de alterações oficiais na participação usam o mesmo componente legível da visão geral. Comentários escritos pela equipe continuam preservados.
- Testes novos: resumos sem URLs/campos desconhecidos; diferenças com acesso à fonte; criação/vínculo documental; falha/conflito sem perda do formulário; responsividade.
- Verificação integrada ampliada para histórico e checklist, isolamento entre empresas, revisão concorrente e remoção de exigência.
- Resultado final: 85 testes unitários da API, seis fluxos de navegador e teste integrado com PostgreSQL local aprovados. TypeScript e build do portal aprovados; bundle principal 447,21 kB (135,06 kB gzip). O aumento vem do editor de checklist/modelos agora acessível e será considerado na divisão de carregamento por funcionalidade.

Nenhuma nova migração nesta rodada. A validação usa banco local descartável e respostas simuladas no navegador, não o Supabase real. Permanecem pendentes comparação de conteúdo, acompanhamento de mudanças ainda não conferidas e extração documental completa.

## 06/10/2026 — busca, perfis, radar e itens

### Entregas

- Revisão das 70 tarefas originais em `BACKLOG-EVOLUCAO.md`, preservando os identificadores e distinguindo atendimento parcial de conclusão.
- Gestão explícita de perfis: criar, editar, duplicar, pausar, reativar, aplicar e excluir. Modais com espaçamento, interesses e exclusões, vários portais/modalidades e tratamento de revisão concorrente. Pausar/excluir não remove editais ou participações.
- Busca por código Licitaro estável, sem fabricar códigos para dados sem identificador. Identificação de edital/UASG sem confundir código genérico de unidade com UASG. Dados brutos completos não são mais transferidos na consulta paginada.
- Destaque de palavras com tratamento de acentos, sem interpretar conteúdo externo como HTML; cópia do código e indicação de data da coleta na lista.
- Radar carregado em quatro consultas em lote, substituindo consultas adicionais por cartão. Detalhes continuam trazendo histórico; listagem não busca todos os eventos.
- Administrador define responsável padrão da empresa. Novas participações e tarefas recebem esse responsável se ativo; o histórico registra a regra. Inclusão repetida e participações existentes preservam seus responsáveis.
- Página inicial individual em Configurações: visão geral ou radar. Plano sem radar mantém acesso pela visão geral; escolher radar não esconde o link da visão geral.
- Itens oficiais em tabela compacta, adaptação móvel, descrições expansíveis, pesquisa por descrição/número/unidade e interesses/exclusões de perfil ativo. Sigilo e ausência permanecem distintos de zero; estimativa não é resultado nem preço comercial.
- Proteção contra resposta atrasada de consultas substituindo dados de uma página mais recente.
- Pesquisa de itens normaliza descrições uma vez por conjunto/perfil, não a cada tecla e para cada interesse. Formatadores numéricos são reutilizados.
- Teste integrado com banco PostgreSQL descartável e restrito a localhost. Encerramento gracioso no Windows evita worker órfão segurando o processo de teste.

### Verificação

- API: 83 testes unitários aprovados na rodada.
- Banco local: migrações repetíveis, códigos estáveis, isolamento de empresas, permissões, revisão concorrente, pausa/reativação, filtros múltiplos, atribuição automática, fallback de membro inativo, inclusão repetida, página inicial pessoal e fallback de plano. Execução completa encerrada com sucesso; base descartável removida.
- Navegador com dados simulados: guia inicial, gestão de perfis e falha sem perder formulário; busca e radar; preferência pessoal; tabela de itens, acentos, exclusões, sigilo, páginas, falhas e tela pequena.
- Checagem TypeScript do portal, API e console aprovada. Build de produção do portal aprovado: 1.625 módulos; JavaScript principal aproximadamente 432 kB (131 kB gzip), CSS 89,55 kB (18,84 kB gzip). Isso mede o pacote, não substitui teste de desempenho em dados reais.
- Histórico legível revisado em 390/768/1.440 px: comparação de datas e nomes de anexos, sem URLs/JSON técnico. As asserções antigas que exigiam registro bruto foram substituídas pelo comportamento aprovado pelo usuário.
- Capturas da tabela em computador/celular revisadas; tabela móvel sem scroll horizontal, legenda com largura corrigida e descrições completas acessíveis sob demanda. Testes sequenciais evitam disputa de recursos entre cinco navegadores.

### Migrações e ambiente

Verificações reproduzíveis: `npm run test:workflow:api` usa somente banco local descartável; `npm run test:workflow:browser` exige a interface de desenvolvimento em `localhost:5173` e simula as respostas da API. Os cinco fluxos passaram na execução final sequencial.

As novas colunas `search_profiles.active`, `organizations.default_tracking_owner_id` e `users.home_page` estão na migração idempotente de inicialização. Foram validadas somente no banco local descartável nesta rodada. Não foi executada migração contra o Supabase real; a API precisa ser reiniciada no ambiente desejado para aplicar o schema, ou usar o procedimento já documentado de migração.

Não houve publicação em EC2, contratação de serviços, commits, push ou uso de APIs pagas. A conexão de produção e seus segredos foram preservados. O servidor local usado nos testes de navegador é somente a interface com respostas simuladas nos testes; não comprova o funcionamento da API real conectada ao Supabase.

### Limites e próxima sequência

- Pesquisa/interesses dos itens cobrem explicitamente a página carregada, com no máximo 25 itens. Não há carregamento silencioso de toda contratação; busca global e lotes precisam de persistência/coleta revisada.
- Interesses são correspondência lexical, não avaliação técnica por IA. CAPAG não está integrada e não é inventada.
- Radar ainda retorna todas as participações da empresa; consultas em lote reduzem o custo, mas quadros muito grandes precisam de paginação.
- Alertas por perfil, posição manual/colunas, ZIP de anexos e mudanças por conteúdo de arquivo permanecem pendentes.
- Próxima frente: confiabilidade das alterações oficiais e acesso útil ao checklist/análise, depois cadastro empresarial e propostas.
- Preços, WhatsApp, IA externa, novos portais e automação de lances continuam dependentes das escolhas/avaliações previstas no backlog.
