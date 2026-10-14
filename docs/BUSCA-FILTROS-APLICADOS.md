# Busca — filtros aplicados visíveis

Complemento de LIC-32/LIC-55 em 07/10/2026.

- O painel mostra os grupos de filtros aplicados mesmo com opções adicionais fechadas: interesses, exclusões, estados, município, órgão, modalidades, portais, situação, aderência, limites de valor e datas de publicação.
- Cada grupo tem remoção individual acessível pelo teclado. As formas singular/plural de um mesmo filtro são removidas juntas, evitando deixar uma restrição oculta. Quando ambas estão na URL, o resumo informa “e também”, sem reinterpretar a interseção como união.
- Valores longos têm prévia de 64 caracteres; “Ver filtros completos” exibe todos os valores como texto, sem executar HTML. O número ao lado de filtros adicionais conta grupos efetivos, não parâmetros de navegação ou campos vazios sem efeito. Zero continua visível; parâmetros numéricos vazios presentes em URLs refletem a coerção existente da API para zero.
- Remover um grupo reinicia a página, mas preserva busca aplicada, demais filtros, ordenação, tamanho da página e referência ao perfil salvo. Não grava no perfil nem no cadastro empresarial.
- “Limpar filtros” mantém somente a busca já aplicada, ordenação e tamanho da página. Desvincula a seleção do perfil salvo, mas não o altera nem exclui.
- Digitar uma busca sem clicar em Buscar permanece um rascunho. Remover/limpar filtros não envia esse texto nem o substitui pelo texto aplicado. Buscar ou navegar no histórico para outra busca atualiza o campo conforme a busca aplicada.

Não implementa consulta conjunta de perfis, alertas por perfil ou novas regras de relevância. Ordenação/aderência continuam calculadas pelas regras existentes. O rótulo do filtro de prazo distingue dados coletados de confirmação de disponibilidade oficial.

Verificação: regras de agrupamento, parâmetros vazios, zero, datas inválidas sem reescrita, remoção/limpeza sem mutação da entrada e texto completo; navegador com rascunho não enviado, remoção pelo teclado, navegação voltar, manutenção de filtros/ordenamento, ausência de gravações no perfil e largura móvel. Nenhuma alteração de banco nesta entrega.
