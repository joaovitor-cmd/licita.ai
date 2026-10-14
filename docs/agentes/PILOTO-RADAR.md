# Piloto: filtros ativos do radar

- Autorização: frontend, testes pertinentes e documentação; sem backend, banco, credenciais, dependências, commit, push ou deploy.
- Fluxo: Orquestrador → UX/UI → Frontend → QA/Segurança, sequencial no chat atual.
- Problema: filtros espalhados na barra sem resumo explícito nem limpeza conjunta.
- Solução UX/UI: resumo de filtros ativos, remoção individual e limpar todos; reutilizar chips da busca; retornar foco à busca após remoção; alvos de toque de 44px e foco visível.
- Escopo: apps/web/src/pages/Radar.tsx, apps/web/src/workflow.css, tests/radar-filters-browser.mjs e este documento.
- Critérios: busca/responsável/encerradas/alterações visíveis no resumo; remoção altera apenas filtro escolhido; limpeza mantém visualização; mesmos nomes de parâmetros API; celular, claro/escuro e teclado verificados em API simulada.
- Contrato: apenas leitura do frontend existente; nenhuma mudança de API necessária.
- Estado inicial: alterações anteriores dos agentes/QA preservadas.
- Validação: em andamento; servidor Vite isolado sem .env/configuração/proxy, API totalmente simulada no navegador.
## Resultado e revisão QA/Segurança
- Typecheck do workspace web aprovado.
- Teste tests/radar-filters-browser.mjs aprovado: desktop 1440px e celular 390px, temas claro/escuro, resumo de quatro filtros, remoção individual de responsável por teclado preservando os demais, limpeza conjunta, reset de página e preservação da visualização em lista.
- Capturas das quatro combinações revisadas visualmente: chips legíveis, quebra de texto longo no celular e ausência de overflow horizontal.
- Foco retorna à busca após remoção e limpeza; botões têm nomes acessíveis e alvos de toque de 44px. Não equivale a auditoria completa de acessibilidade.
- Servidor de validação sem configuração Vite do projeto, sem .env e sem proxy. Middleware recusa API não interceptada; navegador simula todas as chamadas /api e bloqueia outros hosts. Servidor/browser encerrados e cache temporário removido.
- Contrato preservado: expressão de construção da query e nomes view, q, includeClosed, changesOnly, page, owner e highlight não alterados. Nenhuma alteração de backend necessária.
- Estilos novos limitados ao radar; componentes compartilhados não alterados.
- Limitações: validação visual com resultado vazio simulado; não cobre todas as interações do quadro, todos os tamanhos ou dados reais. Sem validação contra API real por escopo.
- Arquivos modificados nesta demanda: Radar.tsx, workflow.css, teste novo e este registro. Alterações anteriores preservadas.
- Sem Supabase, banco, credenciais, dependências, commit, push ou deploy.
- Estado: piloto concluído; pronto para revisão do usuário.
## Revisão visual solicitada pelo usuário
- Pedido: reduzir poluição visual e dispersão dos controles.
- Ajuste: somente título Meu radar, sem eyebrow ou descrição promocional; indicadores em faixa compacta com rótulos curtos; busca, responsável e opções agrupados à esquerda; quadro/lista separado à direita; estilos limitados ao radar, inclusive no tema escuro.
- Validação: typecheck web aprovado; teste visual isolado aprovado com perfil membro. Revalidação com administrador e asserções de compactação aprovada em desktop/celular, claro/escuro, mantendo teclado e contratos de filtros.
- A construção da query e os cálculos dos indicadores foram preservados; valores desconhecidos continuam explícitos e aviso de soma parcial mantido.
- Sem backend, Supabase, credenciais, dependências, commit, push ou deploy.
## Equilíbrio dos indicadores e correção do modal
- Pedido: revisão UX/UI da distribuição dos indicadores e modal de responsável padrão com aparência recortada.
- Decisão: três blocos compactos de mesma largura ao longo da área útil, com borda discreta e hierarquia rótulo/valor. Mantida a compactação do cabeçalho e agrupamento dos controles.
- Causa do acabamento do modal: modal-form tem padding inferior zero; RadarSettings usava button-row no lugar de modal-footer. Aplicado rodapé padrão e espaço inferior local de 24px, sem mudar componente compartilhado.
- Modal: descrição reduzida mantendo regra de atribuição de novas oportunidades e tarefas; participações existentes mantêm responsáveis.
- Escopo adicional: apps/web/src/pages/RadarSettings.tsx, estilos locais do radar e teste visual existente.
- Verificações: typecheck web e teste de navegador aprovados; modal aberto nos temas claro/escuro em 1440px/390px, mais janela baixa de 480px; botões com folga inferior >=16px, modal dentro do viewport, Escape e restauração do foco aprovados. Capturas revisadas.
- Limitação: dados simulados, sem gravação de configuração nem API real; não constitui auditoria completa de acessibilidade.
- Nenhuma alteração de backend, banco, credenciais, dependências, commit, push ou deploy.
## Menu lateral e rolagem horizontal
- Pedido: acabamento próprio da barra horizontal e menu lateral recolhível.
- Escopo adicional: apps/web/src/App.tsx, apps/web/src/pages/RadarBoard.tsx, workflow.css e teste isolado.
- Menu: alternância desktop entre 232px e 72px; nomes acessíveis e títulos dos links preservados; preferência local persistida, com tratamento de armazenamento indisponível. O seletor funcional de empresas permanece disponível no menu expandido. Mobile mantém painel e fechamento por Escape; recolhimento desktop não se aplica abaixo de 1021px.
- Quadro: scrollbar nativa fina, trilha e alça arredondadas, cores claro/escuro; região focável com nome acessível para rolagem por teclado. Aparência exata pode variar conforme navegador e configuração de scrollbars do sistema.
- Verificações: typecheck web aprovado; navegador isolado aprovado com cartão e valores simulados; rolagem por ArrowRight, estilo thin, aumento da área útil, links por teclado, persistência após reload, expansão e painel mobile/inert/Escape verificados nos dois temas.
- Captura do menu compacto revisada. Nenhum acesso a API real, Supabase, dependências, commit, push ou deploy.
- Alcance: portal cliente; console independente não alterado. Sem auditoria completa da navegação de todas as páginas.

## Remoção do cartão de empresa
- Cartão decorativo com avatar, nome e Workspace da empresa removido do menu, conforme imagem enviada pelo usuário; atalho compacto correspondente também removido.
- WorkspaceSelector preservado para planos com múltiplas empresas; typecheck web aprovado. Sem alteração de autenticação ou contexto da empresa.

## Responsividade ampla, controle na borda e notificações
- Pedidos: aproveitar largura ao reduzir zoom, botão na borda do menu e sino com contador vermelho/modal/destino do aviso.
- Kanban: removido limite de 1700px apenas na página radar; colunas flexíveis com mínimo 270px; todas as etapas cabem quando há espaço, mantendo scroll em áreas estreitas. Teste com viewport 2400px aprovado; não é automação do zoom nativo do Chrome.
- Menu: controle fixo na junção sidebar/conteúdo, centrado na borda expandida (232px) ou compacta (72px); setas de expandir/recolher; oculto em mobile.
- Notificações: contador vermelho de não lidas (99+ visual), modal com carregamento/erro/vazio/lista, leitura individual e coletiva usando endpoints existentes. Clique usa URL app-relative já fornecida pela API, fecha modal e navega; destinos externos rejeitados. Categorias como impugnação dependem de geração pelo backend existente, sem nova integração nesta demanda.
- Arquivos adicionais: apps/web/src/NotificationsModal.tsx; alterações em App.tsx, workflow.css e teste do radar. Backend preservado.
- Verificações: typecheck web aprovado; teste isolado em 1440/390px e claro/escuro aprovado; contador 2→1→0, leitura via PATCH, abertura sem navegação, destino com highlight, modal por Escape e viewport amplo verificados. Capturas revisadas.
- Sem API real, Supabase, banco, credenciais, dependências, commit, push ou deploy. Alterações anteriores preservadas.
## Notificações lidas e destino individual
- Modal mostra apenas não lidas; leitura individual/coletiva oculta avisos sem excluir histórico do banco.
- Adicionado botão individual Marcar como lida. Clique no aviso aguarda sucesso do PATCH antes de fechar/navegar; erro preserva aviso no modal.
- URL /app/radar?highlight=<UUID> agora abre /app/radar/<UUID>, mostrando apenas a participação relacionada. Links diretos /app/oportunidades/<id> e tab=mudancas preservados. Links externos rejeitados.
- Limitação: avisos agregados existentes de jobs.ts apontam apenas para /app/oportunidades?minScore=..., sem identificador de oportunidade. Permanecem agregados; converter requer contrato/backend, fora do escopo atual.
- Typecheck web e testes de destinos/modal aprovados (desktop/celular claro/escuro); confirmação 2→1→0 e ausência de aviso lido ao reabrir. Sem API real, dados, commit ou push.
## Simulador temporariamente desativado
- Solicitação: não utilizar simulador de viabilidade neste momento.
- Removidos item do menu e atalhos em oportunidade, participação, guia e preparação. Rota antiga /app/simulador redireciona ao radar; carregamento lazy removido.
- Resumo de preparação não exibe contagem ou incentivo para registrar simulações; sugestão que mencione simulação recebe orientação neutra de avaliação com a equipe.
- Código do módulo, dados e endpoints preservados para retomada futura. Isso desativa acesso pelo portal, não remove serviço de backend.
- Typecheck web aprovado; teste de navegador verifica ausência no menu, além da regressão de radar/notificações.
- Sem alteração de banco, credenciais, dependências, commit ou push.