# Conferência e atualização explícita das referências — LIC-60

## Fluxo

Durante a edição, use **Conferir referências da empresa e do edital**. Depois de uma falha por conflito, o mesmo painel abre por **Conferir versão atual sem descartar rascunho**. A consulta não altera nem salva a cotação.

O painel mostra a empresa do início da edição e a consultada agora, seus CNPJs e revisões, avisa sobre mudança de cadastro/edital e permite abrir cadastro e histórico de alterações em outras abas. Não pretende comparar todos os campos cadastrais ou interpretar os efeitos de uma retificação. Quando há cotação salva, mantém também a comparação comercial com a versão atual.

Depois da conferência, marque a confirmação e use **Usar referências conferidas**. Essa ação:

- Atualiza somente o contexto empresarial/fingerprint do edital usado na próxima tentativa de gravação.
- Preserva nome, itens, vínculos, quantidades, preços, marcas/modelos e condições comerciais.
- Reinicia as quatro conferências da proposta; atualizar referência não equivale a revisar os itens ou atender requisitos.
- Marca o formulário como alterado e reinicia a identidade de tentativa, sem enviar requisição de gravação.
- Não altera a versão-base, não incorpora mudanças comerciais de outra pessoa e não modifica versões anteriores.

Disponível somente para referência da mesma empresa. Falha de consulta impede aplicação; nova consulta exige nova confirmação. Se as fontes mudarem novamente ou outra pessoa já tiver gravado, a API continua recusando referência/revisão obsoleta. O rascunho permanece protegido, não é automaticamente rebaseado.

## Evidência e limites

`tests/proposal-references-browser.mjs` verifica contexto empresarial/edital alterado, confirmação obrigatória, consulta sem gravação, manutenção de preço/condições, reinício de conferências, versão-base 7 preservada apesar da consulta da versão 8, requestId novo, erro/retry, empresa divergente e largura móvel. A API de gravação e suas validações transacionais existentes não foram alteradas.

Ainda não há reconciliação de descrições/quantidades/itens da fonte, mesclagem concorrente, revalidação automática de bytes de arquivo, recuperação durável ou exportação Word/PDF. Atualizar contexto não resolve referência de item cujo cache mudou: a conferência específica continua exigida pela API. Não é autorização de envio nem verificação de conformidade técnica/jurídica.
