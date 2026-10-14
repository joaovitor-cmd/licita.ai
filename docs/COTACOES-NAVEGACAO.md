# Cotações — proteção da navegação (LIC-60)

## Comportamento

Uma cotação alterada bloqueia a saída por links internos, menu, navegação programática e voltar/avançar do navegador quando o endereço de caminho ou consulta muda. O diálogo permite continuar editando ou sair sem salvar. Continuar, fechar, Escape ou cancelar a navegação preservam o componente montado, os campos e a revisão-base. Sair não envia nem salva automaticamente e não apaga versões persistidas.

Um editor sem alterações não abre confirmação. Alterações somente de fragmento (`#...`) não bloqueiam; o formulário não é desmontado. A troca entre abas do edital mantém sua confirmação existente; durante gravação, outras abas ficam desabilitadas. Ações locais de substituir/fechar cotação também não são aceitas durante gravação ou abertura pendente.

Enquanto a gravação aguarda resposta, o diálogo de saída explica que a operação ainda não foi confirmada e não oferece descarte. A pessoa pode voltar à cotação. Falha de gravação mantém os campos e a proteção; confirmação de gravação não executa automaticamente uma tentativa de navegação anterior.

Atualização da página, fechamento da aba e navegação fora do aplicativo usam o aviso nativo do navegador, sujeito à política e à interação prévia do usuário. Não há garantia de aviso após encerramento forçado, falha do navegador, expiração da sessão ou erro de renderização. Não se promete recuperação de rascunho em novo carregamento: nenhum preço/cadastro comercial é gravado automaticamente em armazenamento local.

## Implementação

O portal usa o roteador de dados da versão instalada (React Router 7.18.3), preservando a árvore de endereços existente. O bloqueio é feito pelo mecanismo [useBlocker documentado pelo React Router](https://reactrouter.com/api/hooks/useBlocker), com confirmação própria; o mecanismo não substitui `beforeunload` para carregamento completo. O limite de erro da raiz apresenta mensagem em português sem expor detalhes técnicos/stack na tela.

Radar, páginas operacionais (catálogo/documentos/perfil/fontes/conta), simulador, histórico comercial e boletins são carregados sob demanda, compartilhando arquivos quando necessário. A estrutura de navegação continua visível durante o carregamento. Tamanho do bundle principal: 424,39 kB / 133,02 kB gzip; antes desta rodada, 467,17 kB / 141,50 kB gzip. Não é uma medição de tempo de carregamento nem do total de recursos: a tela escolhida ainda baixa suas dependências.

## Evidência e limites

`tests/proposal-navigation-browser.mjs` cobre saída por menu e link de retorno, cancelamento/Escape, voltar repetidamente, saída explicitamente aceita, avançar sem restaurar formulário descartado, editor limpo, gravação pendente, abas indisponíveis, falha preservando campos, layout móvel e recarga cancelada pelo aviso nativo. Requisições simuladas; nenhum dado real é alterado.

### Saída da conta e troca de empresa

A cotação registra somente o estado de edição/gravação em um coordenador em memória, sem transferir seus campos ou preços. Saída da conta e troca de empresa consultam esse estado antes da requisição: cancelar não envia nada; enquanto a cotação salva, essas ações são recusadas. Troca de empresa continua pedindo confirmação mesmo sem rascunho; saída de conta limpa não ganha aviso desnecessário.

Após confirmação explícita, campos/abas e novas mudanças de contexto ficam bloqueados durante a requisição. Falha anterior à confirmação do servidor preserva o contexto/formulário e reativa a proteção. Somente sucesso confirmado permite finalizar logout ou recarregar a nova empresa, sem repetir o aviso nativo de descarte. Uma falha de armazenamento do navegador não pode restaurar visualmente a empresa antiga após troca confirmada; a aba atual ainda recarrega. Nesse caso, outras abas podem precisar de atualização manual.

`tests/proposal-departure-browser.mjs` verifica cancelamento sem requisição, falha mantendo conta/empresa/formulário, campos e abas bloqueados durante logout pendente, reativação do bloqueio após falha, troca confirmada sem segundo aviso de recarga, logout chegando ao login e recusa de ambas as ações durante gravação da cotação. Todas as respostas são simuladas.

Esta proteção é da cotação comercial. Não estende automaticamente o bloqueio a outros formulários. Expiração involuntária da sessão não pode ser impedida para manter edição autenticada. Recuperação durável de rascunho e tratamento de mudanças empresariais iniciadas em outra aba continuam pendentes.
