# Radar — ordem persistente

Implementação de LIC-07 em 07/10/2026, mantendo paginação de LIC-06.

## Uso

- Arrastar pela alça sobre outro cartão da mesma etapa posiciona antes dele. Soltar no espaço livre da coluna coloca ao final da etapa inteira, não apenas dos cartões carregados.
- “Mais ações → Organizar posição” oferece a mesma função sem arraste: escolher um cartão carregado como destino ou o final da etapa. A tela informa que a ordem é compartilhada com a equipe, mesmo com filtros.
- Adicionar uma participação ou mudar sua etapa coloca o cartão no início da etapa de destino. Etapas encerradas e proposta enviada continuam usando a confirmação existente, sem realizar envio oficial.
- Editar responsável, observação, tarefa ou valor não reposiciona o cartão. A lista mantém ordenação por atualização; a ordem manual pertence ao quadro.

## Contrato e integridade

`POST /api/trackings/:id/order` exige acesso ao Radar. Corpo estrito: `stage` (etapa atual), `beforeId` (UUID de outro cartão na mesma etapa ou `null` para final), `revision` (inteiro decimal como string). Resposta: `trackingId`, `changed`, `orderRevision`. Não carrega histórias/tarefas/catálogos para reordenar.

Participação e destino precisam pertencer à empresa e estar visíveis. A revisão compartilhada da empresa muda ao criar uma participação, trocar etapa ou reordenar. Reordenação obsoleta retorna 409, sem gravação; o formulário mantém o destino em falhas comuns e exige atualizar o quadro em conflitos. Não reaplica automaticamente uma intenção contra uma ordem nova.

Posições `bigint` têm espaços e são calculadas sem ponto flutuante. Normalmente apenas um cartão é atualizado; quando não há espaço entre vizinhos, a etapa é reequilibrada na mesma transação. A trava da empresa precede a trava de participação; os caminhos de inclusão por análise/checklist seguem a mesma ordem. Uma alteração bem-sucedida gera evento com autor. Repetir a posição atual não cria evento nem revisão extra. Reordenar não muda a data comercial `updated_at`.

Migração inicial preserva a ordem anterior de atualização/ID para registros sem posição. Inicializações seguintes não sobrescrevem posições existentes. Demonstrações também recebem posições determinísticas. API retorna posições/revisão como strings para não perder precisão; ao acumular páginas, a tela ordena por posição exata, inclusive quando um destaque veio de fora da primeira página.

Se a revisão compartilhada mudou entre cargas adicionais, a interface recarrega a primeira página em vez de misturar ordens. Filtros podem esconder cartões entre origem/destino; a posição salva é global dentro da etapa, não uma ordenação particular do filtro.

## Limites

Não há colunas personalizadas ainda (LIC-53). Movimento entre etapas entra no início, não permite escolher simultaneamente um vizinho da nova etapa. Recarregar após mudança volta à carga inicial. As páginas não são um snapshot imutável, e alterações em tarefas/valores podem ocorrer entre consultas de totais e conteúdo. Não se promete tempo real entre usuários.

## Verificação

Banco local descartável: ordem após inclusão/reordenação, edição sem reposicionar, final da etapa, empate e reequilíbrio, revisão obsoleta, duas gravações concorrentes com uma vencedora, isolamento empresarial, parâmetros, destino em outra etapa, histórico e migração sem redefinir ordem. Navegador com respostas simuladas: formulário, falha preservando destino, arraste antes de cartão, recarregar mantendo posição, conflito com atualização explícita e regressões da paginação.
