# Roadmap para piloto comercial

Promessa: encontrar oportunidades relevantes e reduzir o trabalho para entender, decidir e preparar uma participação. Público inicial sugerido: 3–5 empresas de outsourcing de impressão, com acompanhamento próximo durante aproximadamente 30 dias. Este documento é um plano; não representa funcionalidades já entregues nem promessa de resultados.

## 1. Confiabilidade — etapa atual

- [x] Perfil, catálogo, radar e simulador inicial com persistência e isolamento entre empresas.
- [x] Coleta de PNCP/Compras.gov.br, retomada de páginas e sinalização de execução parcial.
- [x] Consulta automática e gradual de anexos, com preservação de documentos e aviso de falha.
- [x] Configuração SMTP por empresa com senha protegida, teste e limiar de aderência para novos alertas.
- [ ] Validar entrega no serviço real de teste do usuário, inclusive spam/remetente autorizado.
- [x] Fila persistente de notificações: tentativas, histórico por destinatário, falhas e reprocessamento controlado (validada localmente; SMTP real ainda pendente).
- [x] Resumo diário opcional para novos editais, horário de Brasília, destinatários administradores, prévia sem envio e geração no máximo uma vez por dia. Alertas operacionais continuam separados.
- [ ] Ensaiar recuperação/reinício, restauração de backup e acompanhamento de falhas de fonte.

## 2. Valor percebido pelo cliente

- [x] Leitura assistida inicial: trechos por tema com documento/página em PDFs de texto do PNCP, cobertura explícita, revisão humana e histórico por empresa/versão.
- [x] Jornada Entender → Avaliar → Preparar → Acompanhar, explicações progressivas e ações dentro da oportunidade.
- [ ] Resumo contextual completo de edital e anexos: interpretação de cláusulas, conflitos e tabelas. OCR, outros formatos e preenchimento revisado do simulador permanecem pendentes.
- [ ] Dados de outsourcing: equipamentos, volumes, franquias/excedentes, software, manutenção e atendimento.
- [x] Simulação vinculada ao edital e comparação de até três cenários com premissas manuais, isolados por empresa.
- [x] Franquias mensais separadas P&B/coloridas e cobrança de excedentes; custos sobre todas as páginas consumidas.
- [ ] Sensibilidade automática conservador/base/otimista, franquias compartilhadas e fluxo de caixa; revisão humana antes de decidir.
- [x] Checklist documental por oportunidade com vínculo manual à biblioteca, estados de conferência, notas e responsável/data; sem aprovação jurídica automática.
- [x] Plano de ação por tema com evidências e resumo de preparação, sem percentual de habilitação.
- [x] Motivos estruturados de resultados e descartes, informados pela equipe; texto livre preservado.
- [ ] Usar feedback de decisões para orientar curadoria das recomendações, com avaliação e controle do usuário.

## 3. Ambiente para clientes — antes do piloto externo

- [ ] Escolher hospedagem/domínio e custos com aprovação do responsável; HTTPS e serviço supervisionado 24h.
- [ ] Retirar banco e segredos do diretório sincronizado pelo OneDrive.
- [ ] SMTP central para recuperação de senha; gestão de segredos, backups e restauração testada.
- [ ] Revisão de acesso, segurança, privacidade, retenção e termos de uso; suporte e canal de incidentes.
- [ ] Configuração assistida e roteiro de teste do fluxo encontrar → entender → decidir → preparar.

## 4. Piloto e receita

- [ ] Convidar as primeiras empresas com autorização do responsável; não há convites enviados automaticamente.
- [ ] Avaliar relevância das recomendações, tempo de análise, dificuldades e uso recorrente.
- [ ] Conversa semanal com cada empresa e ajustes orientados pelos problemas observados.
- [ ] Validar proposta de piloto pago/plano inicial, limites de uso e preço com clientes; sem garantia de vencer licitações.
- [ ] Definir faturamento/cobrança e suporte antes da contratação.

## 5. Próximas melhorias — sequência acordada

- [x] Fundação da gestão comercial: provisionamento, vínculo de usuários a múltiplas empresas, troca de contexto, inativação/reativação de empresa e membro, auditoria de acessos e três rascunhos de planos sem restrições aplicadas.
- [x] Console independente (frontend 5174/API 3001 no preview), login e perfis próprios, menus laterais, indicadores mensais, relatórios por período e CSV; arquivamento recuperável, limite de empresas e funcionalidades por plano. Gestão removida da API cliente.
- [ ] Definir planos comercialmente; integrar cobrança e consolidar política de cadastro/convites antes da comercialização.
- [ ] Hospedagem com HTTPS, backups, restauração, monitoramento, gestão de segredos e revisão de segurança antes do piloto externo. Multiempresa atual usa isolamento lógico, não bancos físicos separados por cliente.

- [x] Base do histórico comparativo: snapshots de metadados e lista de anexos, avisos configuráveis por tipo/canal, possíveis republicações por critérios conservadores e conferência humana por empresa. Sem vínculo oficial presumido, sem fusão automática e sem reconstrução retroativa.
- [ ] Evoluir a comparação para conteúdo e versões dos arquivos, com armazenamento/retencão próprios e evidências por página; reconhecer impugnações com revisão humana. A base atual não compara bytes nem interpreta documentos semanticamente.

- [x] Modelos de checklist: dois roteiros iniciais, criação/edição/duplicação/arquivamento por empresa, cópia da preparação atual, seleção de itens e aplicação como cópias independentes. Controle de versão, isolamento, duplicatas e limites; estados/arquivos/prazos não são copiados.
- [x] Boletim diário configurável: interesses/aderência atuais, horário, destinatários, fila persistente e controle de repetição; validado localmente sem envio externo. Entrega real depende do teste SMTP já pendente na etapa 1.
- [x] Histórico comercial: período de entrada/responsável, resultados atuais, taxa ganhas/(ganhas+perdidas), valores previstos informados, motivos por resultado, grupos mensais e lista paginada. Não infere faturamento ou valor contratado a partir do estágio ganho.
- [ ] Inteligência de mercado focada em impressão: começar por contratações comparáveis com fonte/data e cobertura explícita. Normalizar equipamentos, volumes, duração, franquias, software e atendimento antes de comparar preços.
- [x] Base inicial: itens publicados por oportunidade PNCP, 25 por página, cache persistente com data/aviso de falha, unidade/quantidade e estimativas com quatro casas. Sigilo e ausência não viram preço zero. Sem benchmark, coleta de resultados ou comparação automática entre escopos.
- [ ] Próxima etapa dessa base: resultados por item, com cancelamentos e cadastro de reserva distinguidos; depois seleção assistida de referências comparáveis de impressão. Não usar estimativa como preço homologado.

## 6. Frentes estratégicas em descoberta — não implementadas

### WhatsApp

- [ ] Validar integração oficial, requisitos vigentes do provedor, consentimento/descadastro e destinatários autorizados.
- [ ] Preferências de aderência, eventos, horários e frequência; agrupar avisos para evitar excesso.
- [ ] Reutilizar conceitos da fila persistente com controle de tentativas, duplicatas, custos e estados de entrega próprios do canal.
- Dependências: escolha de provedor, configuração de conta, orçamento e validação de segurança. Não enviar mensagens nem contratar serviços nesta fase de planejamento.

### Análise com IA

- [ ] Evoluir da localização de trechos por regras para síntese contextual de edital e anexos, com evidência verificável por documento/página.
- [ ] Avaliar OCR, tabelas, exceções, retificações e conflitos entre documentos; sinalizar lacunas e incertezas.
- [ ] Sugerir tarefas, exigências e premissas de simulação, sempre com confirmação humana antes de aplicar.
- [ ] Criar conjunto de avaliação revisado por especialistas, controles contra instruções maliciosas nos anexos, limites de custo e regras de tratamento de dados pelo provedor.
- Dependências: escolha e avaliação do modelo/provedor, autorização de custos e revisão de privacidade. A leitura atual não é IA generativa nem parecer jurídico.

### Máquina de lances e interação com portais

- [ ] Investigar viabilidade e autorização de integração por portal, começando por um único destino; não assumir disponibilidade de API ou permissão para automação.
- [ ] Separar consulta de sessão, preparação/envio de proposta ou documentos e execução de lances em escopos próprios.
- [ ] Definir autorização explícita por disputa, limites de preço por item/lote, confirmação de configuração, parada de emergência, auditoria e tratamento de falhas/duplicatas.
- [ ] Validar primeiro em ambiente de teste autorizado, sem lances reais; ampliar apenas com segurança operacional comprovada.
- Complexidade e risco elevados: uma ação pode gerar compromisso comercial. Não é parte do simulador atual nem autorização para operar portais de clientes.

### RFPs privadas e rede de compradores/fornecedores

Hipótese: aproveitar o perfil e o catálogo dos fornecedores para distribuir demandas privadas relevantes no mesmo ambiente das oportunidades públicas. Uma RFP é uma solicitação de proposta; não é necessário reproduzir o rito de uma licitação pública.

**Posicionamento:** licitações públicas atendem a jornada B2G; uma empresa comprando de outra caracteriza B2B, mesmo quando a compradora é cliente final. B2C só se aplica ao atendimento de pessoas físicas e fica como hipótese separada, sem escopo aprovado.

- [ ] Entrevistar compradores e fornecedores de outsourcing de impressão antes de desenvolver um marketplace amplo. Validar o que impede compradores de publicar demandas e fornecedores de responder.
- [ ] Proposta inicial para compradores: briefing guiado, modelo de demanda, convite a fornecedores e propostas comparáveis. Testar publicação gratuita ou piloto assistido como hipóteses de aquisição, não como política comercial já definida.
- [ ] Proposta inicial para fornecedores: oportunidades privadas compatíveis com região/catálogo, requisitos claros, prazo e canal organizado para esclarecimentos e resposta; sem promessa de volume de leads.
- [ ] Piloto restrito a impressão: captar algumas demandas reais autorizadas e convidar fornecedores compatíveis, evitando um catálogo amplo sem compradores ativos.
- [ ] Jornada compradora: criar rascunho → definir critérios, anexos e prazo → escolher convidados/visibilidade → publicar → esclarecer dúvidas → comparar propostas → registrar decisão e encerramento.
- [ ] Jornada fornecedora: receber recomendação identificada como RFP privada → avaliar → preparar → enviar proposta com confirmação → acompanhar resposta. Envio interno de RFP é distinto de submissão a portal público.
- [ ] Reutilizar cadastro, catálogo, notificações, tarefas e simulador quando fizer sentido, mas criar permissões próprias: comprador só acessa respostas à sua demanda; fornecedores não veem propostas rivais, documentos internos ou custos/margens de outros usuários.
- [ ] Definir quem pode ver cada demanda/anexo, acesso de convidados, prazo de resposta, versões, retirada de proposta, identidade das organizações, moderação, denúncias e retenção. Não compartilhar automaticamente biblioteca privada ou simulações internas.
- [ ] Medir demandas válidas publicadas, tempo até primeira proposta, respostas qualificadas por demanda, conclusão e recorrência dos compradores. Contagem de fornecedores cadastrados, sozinha, não valida o produto.
- [ ] Testar monetização só após validar valor: assinatura do fornecedor, recursos de compras para empresas ou outro modelo transparente. Não cobrar, vender contatos ou implementar comissão sem decisão comercial explícita.

## Outras expansões

- Outras integrações oficiais e fontes regionais conforme demanda comprovada.
- Submissão de propostas/documentos somente mediante integração autorizada, confirmação humana e controles próprios.

Próximo incremento sugerido: inteligência de mercado focada em impressão, começando pela verificação de dados e comparabilidade. As frentes estratégicas acima são planejamento, não implementação ou compromisso de prazo. O preview local não equivale a uma versão certificada para produção.
