# Licitaro — controle da evolução

Revisão inicial: 06/10/2026. Fonte: backlog consolidado fornecido pelo usuário nesta tarefa. Os identificadores LIC são preservados; os números não definem a ordem de execução.

Esta revisão distingue componentes existentes de entregas completas. A existência de uma tabela, botão ou serviço não comprova todos os critérios de aceite. As mudanças posteriores solicitadas pelo usuário prevalecem: orientação apenas no primeiro acesso; sem menu permanente de primeiros passos; sem os cards “Preparação em andamento” e “Seu próximo passo, sem complicar”; sem a caixa promocional da barra lateral.

Responsável técnico: Codex. Decisões de produto/comerciais: proprietário do Licitaro. Prazo: sem data fixada; execução por dependências e validação. Prioridades: P0 = confiabilidade do fluxo atual; P1 = redução de trabalho operacional; P2 = novos módulos; P3 = pesquisa ou etapa futura. “Precisa de melhoria” inclui atendimento parcial.

## Busca e relevância

| ID | Prioridade | Status | Evidência / próxima entrega |
|---|---|---|---|
| LIC-01 | P1 | Precisa de melhoria | Estados e municípios no perfil; filtros regionais. Falta distinguir sede do órgão e local de execução. |
| LIC-02 | P0 | Já atendida | CNAE sugere interesses revisáveis; cadastro manual e livre; aderência explicada. Confirmar com usuários reais. |
| LIC-03 | P1 | Não iniciada | Enquadramento e condições ME/EPP por item/lote precisam de modelo e evidências. |
| LIC-04 | P1 | Parcial | Monitoramentos por CNPJ explícito do identificador PNCP: assuntos alternativos, exclusões, UF da unidade do órgão, edição/pausa/retomada e revisão concorrente. Histórico paginado com regra/evidência da coleta e aviso único por edital/empresa. Sem tempo real ou retroatividade; falta validar cobertura com órgãos reais e expandir fontes sem identificador PNCP. |
| LIC-05 | P0 | Precisa de melhoria | Valor estimado e referências por item existem; separar resultado oficial e proposta comercial. |
| LIC-32 | P0 | Precisa de melhoria | CRUD, duplicação, pausa, revisão concorrente, regiões e múltiplos portais/modalidades. Filtros aplicados legíveis/removíveis, rascunho protegido. Busca conjunta de até 10 perfis ativos, resultados sem duplicação e identificação das correspondências; filtros adicionais refinam o conjunto sem gravar nos perfis. Integração local e navegador verificados. Falta validação com usuários/amostras reais; alertas por perfil não foram implementados. Contrato em BUSCA-CONJUNTA-PERFIS.md. |
| LIC-33 | P1 | Precisa de melhoria | Alertas e boletim da empresa existem; falta configurar por perfil e migrar a configuração anterior. |
| LIC-55 | P0 | Precisa de melhoria | Lista compacta, identificação, datas, estimativa, origem, código interno, destaque de termos e coleta. Objetos longos com prévia por palavras e expansão local acessível; situação literal da fonte independente de datas, sem inventar “recebendo propostas”. Abertura/encerramento identificados como propostas; avisos de prazo passado/futuro/inconsistente e ausência explícita de dados, preservando zero. Banco não alterado; navegador móvel/claro/escuro, precisão de prévia e regressões verificados. Falta validar leitura com usuários/amostras reais e integrar CAPAG com fonte/evidência. |
| LIC-56 | P1 | Precisa de melhoria | Portal, detalhes, radar sem duplicidade, destaque no quadro e cópia de código. Falta ZIP seguro dos anexos e tratamento de downloads parciais. |
| LIC-61 | P1 | Precisa de melhoria | Tabela PNCP paginada/cacheada, pesquisa local, descrição expansível, origem e estados ausentes/sigilosos preservados. Falta agregação/busca global e agrupamento de lotes com fonte verificada. |
| LIC-62 | P1 | Precisa de melhoria | Interesses e exclusões de perfil ativo aplicados aos itens da página; destaque sem confundir correspondência lexical com compatibilidade técnica. Falta cobertura global e lotes. |
| LIC-63 | P1 | Não iniciada | Feedback de relevância e ajuste explícito de contexto; não alterar regras silenciosamente. |

## Radar e rotina

| ID | Prioridade | Status | Evidência / próxima entrega |
|---|---|---|---|
| LIC-06 | P0 | Precisa de melhoria | Lista/quadro, responsável, pendência e valor. Paginação integrada: 25 por etapa/50 na lista, carregar mais independente, filtros no servidor e totais completos/parcialidade de valores. Deduplicação, cancelamento de respostas antigas, recuperação de falhas e destaque fora da primeira página. Ordem manual persistente com revisão compartilhada: mudanças entre cargas reiniciam a consulta. API em banco local e navegador: páginas/filtros/movimentos/responsável/tarefas/móvel verificados. Restam colunas e limitar tarefas/catálogos grandes; páginas mutáveis não são snapshot. |
| LIC-07 | P0 | Precisa de melhoria | Ordem persistente na mesma etapa por arraste ou formulário; final global da etapa, posições exatas com reequilíbrio transacional e eventos com autor. Alterar responsável/nota não reposiciona; revisão compartilhada impede sobrescrita concorrente. Inclusões/trocas entram no início. Banco local e navegador verificam falhas, concorrência, empate, migração e recarga. Falta escolher simultaneamente posição na etapa de destino e validar uso por equipe real; colunas personalizadas separadas em LIC-53. |
| LIC-08 | P1 | Já atendida | Responsável padrão por empresa; atribui somente novas participações/tarefas, registra regra e ignora membro inativo. Transferência manual existente. Testes de banco e navegador aprovados. |
| LIC-09 | P1 | Precisa de melhoria | Observações, tarefa, responsável e resultado pelo quadro. Melhorar pendências e prazos oficiais versus internos. |
| LIC-53 | P2 | Não iniciada | Colunas personalizadas com mapeamento para etapas comerciais; depende de posição persistente e regras de exclusão. |
| LIC-54 | P1 | Já atendida | Página inicial pessoal: visão geral ou radar, com fallback para planos sem radar e acesso direto à visão geral. Testes de banco e navegador aprovados. |

## Atualizações e histórico oficial

| ID | Prioridade | Status | Evidência / próxima entrega |
|---|---|---|---|
| LIC-10 | P0 | Precisa de melhoria | Reconciliação conservadora entre PNCP/Compras.gov: versão antiga rejeitada, divergência sem data comparável preservada e observações por fonte exibidas. Falta auditoria com amostras reais, comparação de bytes de anexos e novos conectores. |
| LIC-11 | P0 | Precisa de melhoria | Histórico antes/depois e conferência existentes; snapshots por fonte com data informada/consultada e divergência visível, sem eventos fictícios. Campos ausentes preservados podem ter origem anterior. Falta conteúdo binário de anexos e resolução manual de conflitos. |
| LIC-12 | P2 | Não iniciada | Registro manual de prazo e origem pode preceder automação. Cálculo depende de validação especializada. |
| LIC-13 | P1 | Precisa de melhoria | Histórico comercial/interno e mudanças existem. Integrar atas e resultados oficiais até finalização. |
| LIC-14 | P1 | Precisa de melhoria | Relações sugeridas e critérios de evidência existentes. Completar conferência e diferenciação de republicação/similaridade. |

## Empresa e planos

| ID | Prioridade | Status | Evidência / próxima entrega |
|---|---|---|---|
| LIC-23 | P1 | Precisa de melhoria | Empresas, contextos, permissões e limites técnicos existem. Validar redução de plano sem perda de dados. |
| LIC-24 | P3 | Não iniciada | Depende de preços, períodos e provedor definidos pelo proprietário. |
| LIC-34 | P1 | Precisa de melhoria | Cadastro empresarial separado: razão social/fantasia, natureza/porte, contatos, endereço e inscrições. Consulta CNPJ com seleção explícita e confirmação; identidade compartilhada protegida contra edições antigas. Falta histórico detalhado de campos e vínculo com documentos/propostas. |
| LIC-35 | P2 | Não iniciada | Logo/timbrado e prévia; depende da infraestrutura de documentos gerados. |
| LIC-36 | P2 | Não iniciada | Representantes múltiplos e comprovação de poderes; depende do cadastro empresarial. |
| LIC-37 | P2 | Não iniciada | Dados bancários restritos, revisão e histórico; depende dos documentos que os utilizarão. |
| LIC-38 | P3 | Precisa de melhoria | Limite técnico de 50 perfis existe; limite comercial por plano depende de definição de produto. |

## Documentos

| ID | Prioridade | Status | Evidência / próxima entrega |
|---|---|---|---|
| LIC-15 | P1 | Precisa de melhoria | Biblioteca, checklist, estados de conferência e modelos reutilizáveis acessíveis na aba Documentação da participação, sem restaurar os cards removidos. Falta extração completa e integração de declarações. |
| LIC-43 | P2 | Precisa de melhoria | 16 modelos próprios Word em Arial, seleção e ZIP. Textos genéricos e campos explícitos; falta versionamento, desativação, modelos específicos e revisão formal. Inspeção visual no Word pendente. |
| LIC-44 | P2 | Precisa de melhoria | Word para preencher externamente e upload do PDF final; editor opcional preenche nome/CNPJ e imprime PDF após conferência. Falta contexto completo de empresa/oportunidade/representante e timbrado. |
| LIC-45 | P2 | Precisa de melhoria | Editor bloqueia campos pendentes/vazio e exige conferência; condições não presumidas nos modelos. Falta persistir revisor, versão e estados documentais. |
| LIC-46 | P2 | Não iniciada | Declarações geradas vinculadas ao checklist; depende de LIC-43/44/45. |
| LIC-47 | P2 | Precisa de melhoria | Editor opcional e rascunhos em memória preservados ao trocar/fechar/voltar. Falta persistência e gestão de modelos personalizados por oportunidade. |
| LIC-48 | P3 | Não iniciada | Provedor, tratamento de dados e limites precisam ser definidos antes de redação por IA externa. |
| LIC-49 | P2 | Precisa de melhoria | Documentos selecionáveis e ZIP único com originais preservados, nomes portáveis e erro sem pacote parcial. Falta ordenação, revisão consolidada e PDF único; não confundir com anexos oficiais. |

## Catálogo, itens e propostas

| ID | Prioridade | Status | Evidência / próxima entrega |
|---|---|---|---|
| LIC-16 | P1 | Precisa de melhoria | Itens oficiais e leitura textual existem; faltam tabelas de documentos, lotes e conferência de extração. |
| LIC-17 | P2 | Não iniciada | Comparação técnica documentada; correspondência de palavras atual não atende este critério. |
| LIC-18 | P2 | Precisa de melhoria | CSV UTF-8 com mapeamento sugerido/revisável, prévia, duplicidades, seleção explícita e gravação atômica/idempotente. Custo interno, preço de venda, unidade e periodicidade separados. Falta XLSX/outros formatos e interpretação assistida de planilhas não estruturadas. |
| LIC-19 | P1 | Adiada | Simulador retirado do uso atual por decisão do usuário; código/dados preservados. Retomada depende de revisão das premissas. |
| LIC-57 | P1 | Parcial | API e aba Cotações com seleção PNCP individual/em lote por página exibida, pesquisa e filtro de interesses por perfil ativo com exclusões; itens manuais, preços decimais exatos e preservação entre páginas/filtros. Inclusão em lote valida todos antes de aplicar; limpar preços preenchidos pede confirmação e preserva outras páginas. Seletor comercial do catálogo sob demanda: vínculo separado da aplicação de preço de venda, compatibilidade e confirmação. Estimativa/custo não vira oferta. Falta extração/conferência de lotes da contratação; correspondência lexical não comprova equivalência técnica. |
| LIC-58 | P2 | Adiada | Integração com proposta adiada enquanto o simulador não for retomado. |
| LIC-59 | P2 | Parcial | Tela de condições comerciais explícitas e empresa proponente preservada por versão; revisão requer cadastro e conferências. Sem padrões genéricos inferidos. Representantes, timbrado e geração Word/PDF ainda pendentes. |
| LIC-60 | P2 | Parcial | Versões imutáveis, rascunho/revisão interna, autor, auditoria, idempotência e proteção contra concorrência. Histórico recente/por número e revisão somente da atual. Falha preserva formulário; edição reinicia conferências. Comparação com a atual; atualização explícita das referências da mesma empresa/edital preserva campos comerciais, reinicia conferências e não muda revisão-base nem salva automaticamente. API continua recusando revisão/itens obsoletos. Navegação/menu/histórico e logout/troca de empresa protegem alterações; cancelar não envia requisição, falha restaura edição/proteção e gravação pendente impede saída/troca de aba. Sucesso de contexto confirmado não repete descarte. Faltam recuperação durável, contexto iniciado em outra aba, mesclagem/reconciliação de itens, exportação e registro de envio/comprovante; salvar não envia. Contratos em COTACOES-NAVEGACAO.md e COTACOES-REFERENCIAS.md. |

## Análise assistida

| ID | Prioridade | Status | Evidência / próxima entrega |
|---|---|---|---|
| LIC-64 | P0 | Parcial | Fila em segundo plano, solicitações concorrentes compartilhadas, etapas reais persistidas, resultado salvo e aviso único de conclusão/falha respeitando preferência no portal. Recuperação de execução interrompida. Falta processamento generativo/OCR e escala de múltiplos trabalhadores. |
| LIC-65 | P0 | Parcial | Leitura persistida, versões, referência documental e invalidação por mudança da fonte ou versão do mecanismo. Arquivo alterado mantendo a mesma URL ainda exige nova leitura explícita; não há revalidação automática dos bytes. |
| LIC-66 | P0 | Precisa de melhoria | PDF isolado, trechos/páginas, cobertura e falhas. OCR e classificação confiável de capa/TR/edital ainda faltam. |
| LIC-67 | P1 | Precisa de melhoria | Leitura atual por regras e temas, sem API paga de IA. Relatório contextual completo ainda não está implementado. |
| LIC-68 | P1 | Precisa de melhoria | Conferência por tema e tarefas ligadas a evidências. Reorganizar as ações sem cards permanentes de preparação. |
| LIC-69 | P1 | Precisa de melhoria | Exportação da leitura salva existente. Rever apresentação, evidências e desatualização no documento. |
| LIC-70 | P3 | Não iniciada | Unidade de consumo e cotas comerciais de IA dependem da escolha do mecanismo/provedor. |

## Jurídico e pós-licitação

| ID | Prioridade | Status | Evidência / próxima entrega |
|---|---|---|---|
| LIC-39 | P2 | Não iniciada | Cadastro de demandas, estados e histórico; aproveitar estrutura comum de oportunidade/empresa. |
| LIC-40 | P2 | Não iniciada | Formulários por tipo; conteúdo específico depende de revisão especializada. |
| LIC-41 | P2 | Não iniciada | Minutas próprias revisadas/versionadas; depende dos modelos e da infraestrutura documental. |
| LIC-42 | P2 | Não iniciada | Registro de prazo/fonte, protocolo e resposta; distinguir eventos e não calcular cabimento automaticamente. |
| LIC-50 | P2 | Precisa de melhoria | Cadastro manual de atas de registro de preços com PDF privado, oportunidade opcional, órgão, itens/fornecedor/preços, vigência, responsável e histórico; ADMIN altera, membros consultam, revisão concorrente e arquivamento preservam dados. Outros tipos, importação oficial e versões completas de arquivos não incluídos. |
| LIC-51 | P2 | Não iniciada | Extração como rascunho conferível; depende de LIC-50 e da leitura documental. |
| LIC-52 | P2 | Precisa de melhoria | Responsável, vigência e alertas internos 30 dias/vencimento, deduplicação, renovação, arquivamento/restauração. Falta agenda, e-mail, documentos posteriores e controle de pedidos/consumo/execução. |

## Automação e portais

| ID | Prioridade | Status | Evidência / próxima entrega |
|---|---|---|---|
| LIC-20 | P1 | Precisa de melhoria | Coleta, boletins, filas e lembretes existem; centralizar regras e falhas de execução. |
| LIC-21 | P0 | Já atendida | Guia ancorado, dispensável e persistido por usuário no primeiro acesso. Retomada automática/menu foram removidos por decisão posterior. |
| LIC-22 | P3 | Não iniciada | Provedor, custos e destinatários verificados dependem de escolha do proprietário. |
| LIC-25 | P3 | Não iniciada | Estudo do acesso oficial ao Pregão Online Banrisul. |
| LIC-26 | P3 | Não iniciada | Estudo da cobertura e acesso oficial do Compras RS. |
| LIC-27 | P3 | Não iniciada | Confirmar portal/serviço do Banco do Brasil e meios oficiais de integração. |
| LIC-28 | P3 | Não iniciada | Confirmar portal Cidade de Compras e acesso permitido. |
| LIC-29 | P1 | Precisa de melhoria | PNCP e Compras.gov existentes; novas fontes dependem de estudos aprovados. |
| LIC-30 | P3 | Não iniciada | Fora da implementação até avaliação jurídica/técnica e regras por portal. |
| LIC-31 | P3 | Não iniciada | Estudo de acompanhamento de sessões, conexão e permissões antes de implementação. |

## Sequência de execução

1. Confiabilidade de busca/perfis/radar, códigos, consultas em lote, responsáveis e página inicial.
2. Itens em tabela e interesses por perfil; páginas pequenas e cache com origem explícita.
3. Atualizações oficiais e apresentação das diferenças; acesso útil à análise e checklist.
4. Catálogo e cadastro empresarial necessários para proposta/declarações.
5. Propostas/documentos versionados; geração com dados revisados.
6. Jurídico e atas, com cadastro e histórico antes de automação documental.
7. Alertas por perfil e central de automações sobre regras já estáveis.
8. Portais, WhatsApp, cobrança e IA externa conforme escolhas/viabilidade.

RFPs privadas e inteligência de mercado comparativa permanecem trilhas posteriores. EC2/publicação e recuperação operacional foram adiadas pelo usuário. Cada rodada registra testes, limitações e migrações no diário de execução.
