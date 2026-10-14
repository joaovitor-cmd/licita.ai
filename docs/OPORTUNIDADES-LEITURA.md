# Oportunidades — leitura compacta e origem explícita

Entrega de LIC-55 em 07/10/2026.

- Objetos com mais de 280 caracteres têm uma prévia que prioriza a última palavra completa e indica continuação. “Ler objeto completo” abre o texto armazenado no próprio cartão; “Recolher objeto” retorna à prévia. Não faz nova consulta nem muda filtros/página. Textos curtos não têm botão extra. O link do objeto continua abrindo os detalhes do edital.
- O controle tem estado acessível e referência ao conteúdo, e o destaque de termos permanece nas duas versões. A prévia respeita caracteres Unicode; o texto completo não é substituído por resumo de IA nem reescrito.
- Situação da última coleta é o texto fornecido pela fonte. Uma data futura não gera o rótulo “recebendo propostas” e cancelamento não impede acompanhar o processo no Radar. Situações longas têm prévia de 120 caracteres e texto completo em “Sobre os dados deste edital”.
- Avisos de data falam somente do início/final informado para propostas. Datas invertidas/inválidas pedem conferência; não há diagnóstico jurídico nem classificação oficial deduzida. Datas ausentes continuam desconhecidas. O valor é identificado como estimativa do órgão; zero não é tratado como ausência. Valores/datas inválidos não derrubam a formatação da tela.
- Contexto recolhido explica coleta versus tempo real, abertura de propostas versus sessão de disputa, estimativa versus cotação/resultado e horário de Brasília. A semântica de abertura foi conferida nos conectores locais (`dataAberturaProposta` e `dataAberturaPropostaPncp`).

Verificações: testes de regras para prévia/Unicode/limites, datas e zero/ausência; navegador com objetos longos/curtos, expansão/recolhimento sem consulta, situação cancelada com prazo futuro, ausência de campos, situação longa, HTML literal sem execução e largura móvel nos temas claro/escuro. Regressão de busca/Radar e demais fluxos do portal, verificação de tipos e compilação.

Não há alteração de banco, coleta adicional, CAPAG inventada ou atualização em tempo real nesta entrega. Os dados apresentados continuam sendo os armazenados na última coleta; validação de leitura com usuários reais e integração de CAPAG permanecem pendentes.
