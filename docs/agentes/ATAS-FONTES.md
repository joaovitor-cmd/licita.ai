# Atas e confiabilidade entre fontes

Demanda de 14/10/2026: implementar a sequência sugerida e preparar commit local. Autorizados código, testes, schema aditivo e documentação; sem banco remoto, credenciais, dependências, push ou deploy. Commit inclui também as melhorias acumuladas desta conversa em documentos, radar, notificações, responsividade e operação dos agentes.

## Critérios e implementação
- Consolidação pela chave PNCP preservada. Última observação de cada fonte com data informada, consulta, decisão e snapshot público normalizado; conteúdo sem data comparável ou divergente na mesma data não sobrescreve. Novidades com versão posterior preservam campos ausentes conhecidos (inclusive zero), sem alegar origem recente de cada campo. Histórico só para snapshot aceito alterado.
- Detalhe da oportunidade: painel compacto Atualizações por fonte, motivo humano, datas separadas, divergências destacadas e link externo seguro. Consulta manual remonta as observações. Não há comparação do conteúdo dos bytes dos anexos, detecção específica de impugnação ou resolução manual de conflitos nesta entrega.
- Atas de registro de preços: cadastro manual, número, órgão, título, PDF já cadastrado, oportunidade opcional, responsável, vigência, itens/fornecedor e notas; precisão mantida em strings. Não é consumo, saldo contratado ou receita. Biblioteca PDF original permanece separada.
- Lista paginada, detalhe e histórico por empresa, escrita ADMIN, leitura para membros, revisão concorrente; arquivamento preserva dados. API oferece restauração. Vigência civil inclusiva, alertas internos em 30 dias e vencimento, sem e-mail ou importação automática de atas.
- Schema aditivo em price-record-schema.ts e source-reconciliation-schema.ts. Validado em PostgreSQL temporário. Nenhuma migração foi executada pelo agente no Supabase/RDS; o ambiente real precisa receber schema/código por procedimento aprovado.

## Coordenação e evidências
- Orquestrador: integração/backend de atas, endpoints, schema e QA temporário. Backend (subagente QA): reconciliação e teste de integração. UX/UI: painel de fontes e navegador isolado. Frontend: módulo de atas e navegador isolado.
- Oito testes puros de reconciliação, calendário e precisão passaram. Typecheck portal/API/console passou na integração inicial; API recompilada pelo QA.
- QA com banco local descartável passou: regressões de perfis/radar/propostas/documentos, atas CRUD/precisão/vínculos/isolamento/permissões/revisão/histórico/alertas/arquivamento/restauração, reconciliação das duas fontes e visibilidade de demonstrações.
- Navegador atas: 8 combinações 390/1440, claro/escuro, ADMIN/MEMBER, CRUD, falha 409 preservando formulário, PDF, teclado, destaque, vigência Brasília e sem overflow. Capturas móvel escuro e desktop claro inspecionadas. Painel de fontes: 4 combinações, decisões, dados ausentes, vazio, erro/retry, links seguros e HTML inerte; teclado e overflow verificados.
- Revisão independente encontrou bloqueio da fila por candidatos inelegíveis e aviso perdido na restauração; corrigidos e teste integrado aprovado. Falhas de teste anteriores: seletores com asterisco obrigatório, POST esperado 200 em vez de 201 e empate submilissegundo entre retomada de monitoramento e publicação; fixtures corrigidas sem enfraquecer comportamento.
- Limitações: sem homologação real, e-mail de atas, OCR, detecção universal de alterações ou registro automático de atas da fonte. Histórico de eventos guarda snapshots, mas a interface exibe descrição/autor/data, sem comparação completa de versões de arquivo. Modelos Word anteriores ainda têm inspeção visual no Word pendente.

## Retomada
Implantação/migração real e push exigem solicitação específica. Conectores de novos portais dependem de acesso/API; nenhuma integração adicional é ativada nesta entrega.

- PDF vinculado a ata ativa ou arquivada não pode ser excluído silenciosamente pela biblioteca: retorna 409 e orienta remover o vínculo explicitamente primeiro. Histórico de snapshots não substitui versionamento completo de arquivos.
