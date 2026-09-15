# Licitaro — plataforma de inteligência comercial

Licitaro é a plataforma de descoberta e gestão de licitações, nesta reconstrução local v2 do MVP. Nome definido; símbolo visual ainda provisório. Interface executiva com temas claro e escuro, navegação azul-marinho e acentos violeta. React + TypeScript, API Node/Express e PostgreSQL em um monólito modular. Sem APIs pagas de IA.

## Experimentar

Para publicar em EC2 com Nginx, Certbot e APIs em containers, usando PostgreSQL externo, consulte [o guia de produção](deploy/README.md). O arquivo `compose.prod.yml` é independente do Compose de desenvolvimento.

Interface: **http://localhost:5173**. Escolha **Explorar demonstração** para testar o fluxo com dados fictícios, separados por empresa. Ou use **Criar workspace** para abrir sua própria conta e consultar editais reais. Não existe senha de administrador universal.

Para iniciar novamente no Windows, abra `Iniciar preview.cmd`, nesta pasta. Node.js 24+ é necessário. O script prepara o banco de desenvolvimento quando `.env` aponta para a porta 55432 e inicia API e interface.

Se o Windows bloquear a porta 55432, `LOCAL_PG_PORT=54329` no `.env` seleciona outra porta para o mesmo banco portátil. O ajuste só redireciona a conexão local de desenvolvimento originalmente configurada na porta 55432; não altera bancos remotos ou produção. Os dados continuam em `.local/postgres`. O iniciador também aproveita API/interface que já estejam ligadas.

## O que funciona

### Gestão de clientes, múltiplas empresas e estrutura de planos

O console administrativo fica em **http://localhost:5174**, com aplicação, API e autenticação independentes do portal dos clientes (5173). Inicie com `scripts/start-console.ps1` após ligar o banco. O endereço antigo `/gestao` apenas informa o novo acesso; a API pública não oferece rotas administrativas. O titular autorizado em `PLATFORM_ADMIN_USER_ID` é configurado uma única vez com sua senha atual; depois, as credenciais são independentes. Consulte [operação e segurança do console](docs/CONSOLE.md).

- Lista de empresas reais com busca e paginação de 20 registros; criação de empresa, plano atribuído e administrador inicial. Cadastro cria um ambiente lógico isolado no mesmo PostgreSQL, não uma instância física independente.
- E-mail existente recebe vínculo explícito à empresa, sem alterar sua senha. Para usuário novo, a gestão recebe uma única vez um link de definição de senha válido por 30 minutos. Compartilhe por canal seguro; não há e-mail de ativação automático. Recuperação posterior depende do SMTP de recuperação configurado.
- Inativação do ambiente preserva os dados, remove sessões de todas as empresas vinculadas, bloqueia novo acesso e cancela e-mails pendentes. Inativação de membro pela gestão afeta seus vínculos dentro desse ambiente, não outros clientes. O worker revalida empresa, ambiente, plano e membro antes de enviar. Ações/requisições já em andamento podem terminar. Gestão registra criação, concessão e mudanças de acesso no histórico administrativo.
- Seletor “Empresa ativa” mostra os vínculos ativos. Troca renova sessão e recarrega o portal, avisando outras abas. O navegador envia o contexto da empresa nas chamadas; o servidor rejeita contexto divergente para evitar salvar formulários antigos na empresa recém-selecionada. Perfil, catálogo, radar, documentos e simulações permanecem separados; oportunidades públicas continuam compartilhadas.
- Três planos editáveis permitem definir limite de empresas por ambiente (1–100) e optar por liberar apenas os módulos selecionados. O limite é aplicado no servidor; o seletor só aparece em planos com mais de uma empresa. Por compatibilidade, planos existentes começam com uma empresa e todos os recursos liberados, até a gestão ativar a seleção de funcionalidades. Cobrança não integrada.
- Ambiente é o cliente/assinatura; a empresa principal e as adicionais compartilham o plano, mas mantêm dados separados. A gestão pode inativar empresas adicionais, bloquear todo o ambiente e reativar acessos sem apagar dados. Redução de limite é recusada enquanto houver empresas ativas acima dele.
- Dashboard mensal: ambientes criados no mês, total de ambientes não arquivados, inclusões no radar e valor estimado dos editais por participação. Relatórios permitem período personalizado inclusivo em Brasília, paginação e CSV com empresa, CNPJ, data, órgão, identificadores, valor e status atual. Valores não são receita; dados desconhecidos não viram zero. Arquivamento preserva o histórico, e restauração mantém o ambiente bloqueado até liberação explícita.

Testes: `tests/management.ts` e `tests/console-security.ts` validam provisionamento, isolamento, credenciais independentes, bloqueios e restauração. `tests/console-preview.ts` verifica navegação e temas com respostas simuladas; `tests/console-operations.ts` exercita operações e download CSV no navegador com registros temporários próprios, removidos ao final. `tests/management-reports.ts` valida os dados dos relatórios em transação revertida. Nenhum teste modifica credenciais reais. Definir a política de cadastro público dos clientes antes da hospedagem comercial; o console não tem cadastro público.

### Indicadores e prazo de participação

“Oportunidades disponíveis” conta somente registros com encerramento das propostas futuro, abertura já ocorrida (ou não informada) e sem indicação de cancelamento, suspensão, revogação, anulação, conclusão, encerramento, homologação, adjudicação, deserção ou fracasso. A regra é compartilhada com o filtro “abertas” e os gráficos de distribuição. Reflete a última informação importada, não uma verificação em tempo real do portal. Prazo ausente não permite confirmar disponibilidade. Registros encerrados continuam pesquisáveis na base histórica; o indicador não apaga oportunidades nem participações.

“Recomendadas para você” usa a mesma disponibilidade e o limiar `minScore` salvo nas configurações (60 apenas como padrão se ausente). Os links do painel aplicam os mesmos filtros, inclusive percentuais personalizados. “No radar” continua contando os registros adicionados pela empresa.

“Prazos próximos” conta participações não finalizadas com prazo nos próximos sete dias, separando vencidos. O prazo interno prevalece; sem ele, usa o encerramento das propostas. No detalhe, “Usar prazo oficial automaticamente” exibe a data/hora importada e mantém `deadline=null`, acompanhando futuras atualizações da fonte. Desmarcar permite data/hora interna em Brasília; reativar restaura o modo automático. Um prazo interno posterior ao oficial recebe aviso e não prorroga a disputa. A integração atual não fornece uma data separada e confirmada da sessão do pregão.

Teste integrado: `tests/dashboard-availability.ts`; regras unitárias em `availability.test.ts`.

### Mudanças e possíveis republicações

Na oportunidade, abra **Mudanças e relações** para consultar diferenças antes/depois de situação, prazo, dados e lista de anexos. O histórico começa com esta implementação, sem reconstrução retroativa nem preservação dos bytes dos arquivos. Datas são apresentadas em Brasília. Alteração de anexo não equivale a análise de impugnação ou parecer jurídico.

Em **Configurações → Acompanhamento de mudanças**, escolha tipos de aviso e permita portal/e-mail, respeitando também os canais gerais. E-mails são destinados aos administradores atuais; precisam do SMTP configurado/testado. Editais no radar são acompanhados independentemente da aderência. Histórico, evento e fila são gravados na mesma transação; atualizações idênticas não duplicam avisos e um novo ciclo de cancelamento pode gerar novo aviso. Desativação cancela e-mails pendentes pertinentes, e o worker reconfere a preferência antes de enviar; não garante interrupção de envio já iniciado.

Possíveis republicações começam com avisos **desativados**. Na coleta de um novo identificador PNCP, são examinados até 200 vínculos anteriores no radar, com publicação nos 366 dias anteriores e prazo vencido ou situação de cancelamento/suspensão. Exige mesmo CNPJ do órgão, modalidade e similaridade de termos do objeto de pelo menos 80%, com seis termos distintos mínimos. Guarda até três candidatos por empresa por nova publicação. Não é busca exaustiva ou retroativa. A equipe pode confirmar, descartar ou reabrir a conferência; isso não une editais nem adiciona a nova publicação ao radar. A tela mostra até 20 relações recentes por oportunidade/empresa.

Testes: `tests/source-changes.ts` (fixtures isoladas, fila em transação revertida, preferências, repetição, relações, acesso e interface), `change-rules.test.ts` e `change-delivery.test.ts`. Sem envio externo de e-mails nos testes. Comparação semântica de documentos e reconhecimento de impugnações dentro de PDFs continuam fora deste escopo.

### Leitura assistida e jornada guiada

Abra uma oportunidade → **Entender e conferir → Analisar anexos disponíveis**. A tarefa continua no servidor e o resultado mostra cobertura por documento, trechos por tema com página do PDF e orientação sobre o que conferir. Se não houver anexos, atualize a oportunidade primeiro. Não há varredura retroativa automática de toda a base.

O leitor inicial busca menções por regras de texto, sem IA generativa ou parecer jurídico. Os oito temas são objeto, equipamentos/volumes, franquias, software, atendimento, condições comerciais, habilitação e disputa/prazos. Uma menção não comprova exigência, ausência ou atendimento. Tabelas, relações entre itens e cláusulas precisam de conferência humana. Documentos baixados não são executados nem enviados a um serviço de IA.

Somente downloads HTTPS diretos dos endpoints oficiais de arquivos do PNCP são aceitos. Não seguimos redirecionamentos nem URLs arbitrárias. Limites: 12 anexos, 10 MB por arquivo, 150 páginas e 800 mil caracteres por PDF, 120 segundos por tarefa; outros arquivos e páginas sem texto suficiente permanecem pendentes. PDFs são processados em subprocesso com tempo/heap limitados e sem herdar credenciais da aplicação; isso não substitui isolamento de segurança do sistema operacional em produção. Leitura textual de uma página não comprova extração completa de imagens/tabelas nela.

Cada empresa pode marcar temas como Ainda vou conferir / Precisa de atenção / Revisei este tema e registrar notas. Novas leituras não reutilizam automaticamente revisões; as 20 versões mais recentes podem ser consultadas na interface. Revisões ficam ligadas à versão correspondente. Alterações nos metadados ou na lista de anexos invalidam a revisão exibida. Mudança de bytes na mesma URL só é percebida numa nova leitura; confira retificações na fonte. O trabalhador persistente roda junto da API; tarefas interrompidas são sinalizadas para nova solicitação. A jornada não envia propostas/lances e não representa as fases legais de todos os regimes de contratação.

Testes: `tests/edital-analysis.ts` (fila, isolamento, evidência sintética, revisão, versão, acessibilidade claro/escuro e celular); `tests/analysis-preview.ts` (PDF público real, somente leitura); testes unitários de segurança/extração. OCR, análise semântica completa e transferência revisada de valores ao simulador são próximas etapas.

### Itens e valores publicados no PNCP

Na oportunidade real, abra **Itens e valores**. A consulta carrega somente a página solicitada (25 itens), com quantidade, unidade publicada, estimativa unitária/total e situação na fonte. Mantém até quatro casas decimais para valores como custo por página; orçamento sigiloso não é apresentado como zero. Ausência de valor não é preço zero.

As páginas ficam no PostgreSQL por oportunidade e são reaproveitadas por uma hora. Depois disso, a próxima abertura consulta a fonte; se ela falhar, a cópia anterior permanece visível com aviso e horário. Não há atualização em segundo plano ou contagem total presumida. Uma página cheia habilita a próxima, que pode estar vazia; limite de 400 páginas/10.000 itens. Uma consulta limita tempo a 15 segundos e resposta a 2 MB, sem redirecionamentos ou URLs fornecidas pelo usuário.

Esta é uma base para inteligência comercial, **não uma comparação de preços homologados**. Quando o PNCP informa resultado existente, a interface avisa que ele ainda não está integrado. Em impressão, confira unidade, franquia, equipamentos, insumos, prazo e SLA antes de comparar. Consultas em demonstrações não buscam itens reais. Contrato verificado no [manual oficial do PNCP](https://pncp.gov.br/manual/pt-br/latest/singlehtml/), seção de consulta de itens.

Testes: `tests/procurement-items.ts` (API de acesso e interface com dados controlados), `procurement-items.test.ts` (normalização/limites) e, opcionalmente com rede, `tests/procurement-items-live.ts` (uma publicação pública e reutilização da página salva).

### Histórico comercial e indicadores

No menu **Histórico comercial**, filtre por período de entrada no radar e responsável. O relatório mostra o estado atual desse grupo: abertas, ganhas, perdidas, descartadas, tarefas pendentes, valores previstos informados e motivos classificados pela equipe. A etapa filtra somente a lista paginada (25 por página); os indicadores mantêm o denominador completo do período/responsável.

- Taxa de ganhos = ganhas / (ganhas + perdidas), sem incluir descartes e etapas abertas. Sem resultados, não apresenta percentual. Não prevê vitórias futuras.
- Valores são os previstos pela equipe, sem substituir ausências pelo orçamento do órgão. Valor de oportunidade ganha não equivale a contrato ou receita recebida; ausências de valor são contadas separadamente de zero.
- Até 24 meses de entrada no radar, com resultados atuais por grupo; não inventa datas de encerramento dos registros antigos. Limites de data usam Brasília.
- Classificação opcional do motivo em cada participação encerrada: preço/margem, documentação, capacidade técnica, prazo, região, estratégia, concorrência ou outro. Texto livre permanece preservado; não é classificado automaticamente. Mudar a etapa limpa a classificação anterior se uma nova não for explicitamente informada.
- Consulta agregada e paginação no banco, com isolamento por empresa e snapshot consistente. Testes em `tests/commercial.ts` e `commercial-rules.test.ts`.

### Boletim diário configurável

Em **Configurações → Boletim diário de oportunidades**, o administrador escolhe horário de Brasília e todos ou alguns administradores destinatários. Desativado por padrão; ativação exige conta real, SMTP disponível/testado e canal de e-mail habilitado. A prévia é somente leitura e não envia mensagens (quando desativado, usa registros das últimas 24h).

- Substitui o e-mail por coleta de novos editais pelo resumo diário. Avisos no portal e alertas de prazo, validade e mudanças do radar permanecem separados.
- Avalia registros novos na base desde a ativação/última verificação com perfil, catálogo e aderência mínima atuais. Não reenvia registros já avaliados quando o perfil muda; não é uma busca retroativa. Oportunidades com prazo conhecido encerrado são excluídas.
- Até 2.000 registros por verificação, com cursor por data de criação e UUID preservando microssegundos. Excedentes ficam para a próxima verificação e a limitação é explícita. Não equivale a coleta exaustiva das fontes.
- No máximo uma geração por dia de Brasília, com estado persistido e enfileiramento transacional. Sem novidades, registra verificação sem enviar e-mail. Servidor desligado não executa agendamento; ao retomar, consulta o período ainda não avaliado, sem emitir um boletim por dia perdido.
- E-mail apresenta até 20 oportunidades e link para a lista completa, paginada em 25 itens. Histórico mostra as últimas 30 verificações, inclusive vazias. Estados de entrega ficam no histórico de e-mail; aceitação SMTP não comprova caixa de entrada.
- Desativação ou remoção de destinatário cancela envios pendentes do boletim; o worker reconfere acesso antes de enviar. Não é possível garantir cancelamento de um envio já em andamento. Reativação começa dos registros novos daquele momento.
- Testes de geração em transação revertida, sem envio real; testes de API, isolamento, paginação, fuso, cursor e interface claro/escuro/celular em `tests/digests.ts`, `digest-rules.test.ts` e `digest-delivery.test.ts`. Entrega real no SMTP do usuário continua pendente de validação.

### Modelos reutilizáveis de checklist

Na oportunidade, abra **Modelos de checklist — reutilize sua preparação**. Há dois roteiros de tarefas sugeridos: participação inicial e outsourcing de impressão. Eles não presumem documentos obrigatórios.

- Criar, duplicar, editar e arquivar modelos da empresa; até 100 modelos ativos, 60 itens por modelo e 200 caracteres por título. Modelos da empresa são compartilhados apenas dentro dela. Os roteiros iniciais podem ser personalizados salvando uma cópia.
- Salvar a preparação atual copia somente títulos/tipos de tarefas e exigências, consultados novamente no servidor; não copia arquivos, notas, responsáveis, prazos, evidências ou conferências.
- Prévia e seleção de itens antes de aplicar. Cópias novas começam pendentes e são editáveis na participação/checklist. Edições e arquivamento do modelo não modificam cópias existentes.
- Aplicação transacional, uma vez por versão/modelo/oportunidade; duplicatas por tipo e título normalizado são preservadas, inclusive estados existentes. O limite documental de 100 itens não permite aplicação parcial silenciosa.
- Histórico registra modelo, versão, seleção e contagens. Tarefas iniciam o radar quando necessário. Modelos não certificam atendimento ao edital; valide cada exigência documental antes de aplicá-la.
- Testes: `npx tsx --test tests/checklist-templates.ts` e `checklist-rules.test.ts`.

### Plano de ação e preparação documental

- No topo da oportunidade, resumo de temas não revisados, itens documentais pendentes, tarefas e simulações vinculadas. Ausência de exigências cadastradas não equivale a ausência de pendências. Cobertura incompleta e leitura desatualizada continuam explícitas; não há percentual de habilitação ou chance de ganhar.
- Cada tema com evidências de uma leitura atual permite confirmar e criar uma tarefa ou exigência documental, preservando trechos, páginas e versão de origem. Uma ação de cada tipo por tema/versão evita duplicatas; tarefas iniciam o radar quando necessário. Responsáveis e prazos são definidos na participação. O link ao simulador não preenche valores automaticamente.
- Checklist manual por oportunidade (até 100 exigências), com vínculo a arquivos privados da própria empresa e estados falta providenciar, vinculado/aguardando conferência, conferido e precisa atualizar. Registra notas, responsável pela conferência e data. Troca de arquivo exige confirmação humana; remoção do arquivo, vencimento ou mudança de versão aparecem como pendências. Alterações simultâneas usam revisão para evitar sobrescrita silenciosa.
- Remover uma exigência não remove o arquivo da biblioteca. Conferência não substitui validação técnica/jurídica. Arquivos alterados na origem mantendo o mesmo endereço ainda precisam de nova leitura/conferência.
- Testes: `npx tsx --test tests/preparation.ts` (ações idempotentes, isolamento, vínculo, revisão, vencimento, remoção, acessibilidade claro/escuro e celular) e `preparation-rules.test.ts`.

### Incremento: anexos, aderência e viabilidade

- Anexos ausentes são consultados automaticamente ao abrir o detalhe, com preservação dos dados em caso de falha. Uma fila gradual também consulta editais abertos sem anexos a cada 30 segundos. Não significa que toda a base será enriquecida imediatamente; há limites de concorrência e nova tentativa, e a fonte pode não disponibilizar documentos.
- Em Configurações, a aderência mínima (0–100%) controla os próximos avisos de novos editais, tanto no portal quanto por e-mail. O canal exige SMTP configurado e testado; os destinatários são os administradores da empresa. Os novos alertas entram em fila persistente com histórico paginado por destinatário. Falhas temporárias têm até três tentativas por ciclo; resultado incerto exige confirmação manual para evitar duplicação. “Aceito pelo SMTP” não comprova entrega na caixa de entrada. Não há criação retroativa de alertas anteriores à ativação.
- Busca e pontuação reconhecem equivalências controladas de outsourcing de impressão e algumas variações de singular/plural. Não é interpretação semântica geral por IA.
- Simulador disponível no menu e no detalhe do edital/radar: volumes P&B/coloridos, franquias mensais separadas, preços de excedentes e custos unitários, receita fixa, equipamentos, operação, tributos e margem-alvo. Cenários são salvos por empresa, podem ser vinculados ao edital e comparados (até três). A franquia não acumula entre meses nem compensa cores; custos incidem em todas as páginas utilizadas. Cenários antigos continuam calculados por página, com franquia zero. O valor publicado não é convertido automaticamente em receita. Fluxo de caixa, franquias compartilhadas e reajustes ainda não estão modelados.
- Testes do incremento: `npm exec -- tsx --test tests/iteration-two.ts` (API e preview ligados).

- Cadastro, login, logout, sessão persistente e recuperação de senha por SMTP configurável.
- Empresas isoladas, administradores e membros. Adição de pessoas com senha inicial; convite de contas existentes é uma próxima etapa.
- Perfil comercial salvo e editável: segmentos, UFs, cidades, palavras-chave, exclusões, modalidades e faixa de valor.
- Catálogo de produtos/serviços: cadastro, edição, desativação e exclusão, categorias e palavras-chave.
- Busca, filtros, ordenação, paginação e páginas detalhadas de editais; pontuação explicável por regras.
- Painel com oportunidades, recomendações, negócios no radar, prazos, valor potencial, distribuição por estado/modalidade e histórico.
- Radar em quadro ou lista, etapas, responsável, prazo interno, valor previsto, resultado e notas.
- Checklist editável por participação, responsáveis e prazos por tarefa, comentários e histórico persistente.
- Dossiê exportável em Markdown com dados do edital, tarefas, notas, histórico e links. Não é uma proposta enviada.
- Biblioteca privada de documentos com vencimento, upload, download e exclusão. PDF/DOCX/XLSX/PNG/JPG; 10 MB por arquivo e 100 MB por empresa no ambiente local.
- Notificações dentro da plataforma; e-mail opcional. Avisos de alteração em editais acompanhados e de prazos/validade durante o processamento dos jobs.
- PNCP e Compras.gov.br por APIs oficiais; paginação, consolidação por número de controle, limites de execução, retomada por cursor, tratamento de resultado parcial e revisão individual dos editais no radar.
- Registro de erros das fontes, health check e auditoria básica de mutações autenticadas.
- Administração global separada, habilitada somente por UUID de usuário explicitamente configurado no servidor.

## Coleta e cobertura

A tela **Fontes de dados** executa as coletas em segundo plano. A seleção de UFs vem do perfil comercial. PNCP é nacional e pode conter publicações federais, estaduais e municipais; não deve ser tratado como fonte exclusivamente federal.

A implementação atual de PNCP busca propostas abertas com horizonte de 90 dias e atualizações de pregão eletrônico, concorrências, dispensa e credenciamento. Compras.gov.br consulta pregão, dispensa e concorrência na janela recente. Cada fonte tem limites e cobertura próprios. Portais independentes de RS, SC, PR e PA estão identificados como planejados — não como integrações prontas.

Cada execução tem orçamento de páginas/tempo. Se houver páginas pendentes ou falha, o resultado é **Parcial** ou **Falhou**, com mensagem. O cursor das consultas não concluídas fica salvo; a próxima execução retoma a coleta. Consultas já gravadas não são perdidas. A paginação externa é mutável e não oferece snapshot transacional: a plataforma não promete captura exaustiva ou instantânea de toda publicação do país.

Editais no radar são revistos independentemente da data de publicação, com limites e prioridade aos menos recentemente revisados. O detalhe tem **Atualizar dados e anexos** para conferência individual. Mudanças relevantes geram histórico com valores anteriores/novos e notificação. Quando a fonte informa versão temporal, uma versão anterior não substitui uma mais recente.

O monitoramento recorrente depende de `SCHEDULER_ENABLED=true` e do servidor permanecer ligado. O intervalo é definido por `SYNC_INTERVAL_MINUTES` (mínimo 15). Não há monitoramento com o computador desligado nem serviço cloud contratado.

Neste preview local, o monitoramento está configurado para executar a cada **60 minutos**, enquanto a API estiver em execução. Consulte **Fontes de dados** para conferir o estado e o resultado de cada coleta; limites da fonte podem produzir execuções parciais.

Contratos oficiais consultados: [PNCP](https://pncp.gov.br/api/consulta/v3/api-docs), [Compras.gov.br](https://dadosabertos.compras.gov.br/v3/api-docs), [documentos do PNCP](https://pncp.gov.br/manual/pt-br/latest/contratacao/consultar_todos_documentos_de_uma_contratacao.html).

## Banco e preservação da versão anterior

Os arquivos-fonte anteriores não estavam disponíveis no diretório original, e o Docker Desktop apresentou falha de inicialização em um socket interno do Windows. Não foram apagados volumes, bancos ou tabelas da versão anterior. Uma tentativa de renomear o socket temporário falhou sem alterar o arquivo.

O preview usa um PostgreSQL portátil, **somente para desenvolvimento**, em `.local/postgres`, porta **55432**. Os dados da reconstrução ficam no schema `workspace_v2`. A alternativa com Docker está em `compose.yaml`, usando outro volume e a porta 5432. Copie e configure `.env.example` ao optar por Docker.

**Os dados antigos não foram migrados.** É necessário recuperar acesso ao Docker/backup original, inventariar os dados e executar migração controlada. A reconstrução não deve ser descrita como restauração do banco anterior.

O diretório atual está no OneDrive. Não use sincronização de arquivos de um banco em execução como estratégia de backup e não execute o mesmo cluster em duas máquinas. Para uso continuado, mova o ambiente para uma pasta local não sincronizada e faça backups consistentes com `pg_dump`.

## Configuração

### E-mail configurável pela empresa

Em **Configurações → Serviço de e-mail da empresa**, administradores podem salvar servidor, porta, TLS, usuário, senha de aplicativo e remetente. Salvar exige novo teste antes da ativação. O teste envia somente para o usuário autenticado; aceitação pelo SMTP não garante chegada à caixa de entrada. A demonstração não permite salvar credenciais nem enviar mensagens.

A senha é protegida com AES-256-GCM, vinculada à empresa e nunca devolvida pela API. Em produção, `SMTP_ENCRYPTION_KEY` deve conter uma chave aleatória de 32 bytes em Base64, guardada em um gerenciador de segredos. Em desenvolvimento, a chave fica em `.local/smtp-key.bin`: preserve-a com segurança; perder a chave exige recadastrar as senhas. Não publique nem sincronize esse arquivo como mecanismo de backup de produção. Criptografia não substitui controle de acesso ao computador.

Servidores externos usam TLS e portas 465/587/2525. Endereços privados são bloqueados; localhost é permitido somente no desenvolvimento. O serviço por empresa atende aos alertas, enquanto a recuperação de senha continua usando o SMTP central do servidor. Os testes em `tests/smtp-settings.ts` usam apenas SMTP local e contas QA removidas ao final.

`.env` é local e está ignorado pelo controle de versão. Exemplos de opções estão em `.env.example`.

- `DATABASE_URL`: conexão PostgreSQL. Credenciais de desenvolvimento devem ser substituídas antes de qualquer publicação.
- `APP_URL`, `WEB_ORIGIN`: endereço da interface/origens autorizadas.
- `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_FROM`: envio de e-mail. Sem SMTP não haverá entrega, e a interface informa isso. O teste de recuperação usa um servidor SMTP exclusivamente local, sem envio externo.
- `PLATFORM_ADMIN_USER_ID`: UUID de uma conta já existente e conferida pelo operador. Não concedemos acesso global com base em um e-mail informado no cadastro. Em branco, a administração global permanece bloqueada.
- `SCHEDULER_ENABLED`, `SYNC_INTERVAL_MINUTES`: coleta periódica enquanto a API estiver ligada.

API escuta em `127.0.0.1:3000`; interface de desenvolvimento em `127.0.0.1:5173`. O proxy da interface encaminha `/api` para a API.

## Verificação

```text
npm install
npm run typecheck
npm run build
npm test
npm run test:integration
npm run test:browser
npm exec -- tsx --test tests/password-recovery.ts tests/sync-storage.ts
node tests/accessibility.mjs
```

API e banco devem estar rodando para os testes de integração. Os testes de navegador usam uma instalação local do Chrome. Capturas ficam em `test-results/`. Testes geram empresas QA/demonstração, sem usar contas reais do usuário; alguns ambientes de demonstração permanecem para inspeção.

`node tests/sync-live.mjs` é uma verificação opcional com rede: cria uma organização técnica e consulta editais públicos reais. Não faz envio de propostas. `SYNC_SOURCE=pncp` seleciona PNCP e `TEST_REFRESH=true` também confere anexos.

## Limites e preparação para produção

Esta é uma versão local funcional do MVP, não uma certificação de prontidão para produção. Antes de publicar: HTTPS, implantação/reinício supervisionado, SMTP real, backups/restauração testados, observabilidade, teste de carga, retenção de dados/demo, gestão de acesso, tratamento de dados/LGPD e revisão de segurança independente. A busca usa índices, contagem, filtros e paginação no PostgreSQL; a aplicação recebe somente a página solicitada. Ordenação por aderência e limiar são calculados no banco quando necessários; as explicações são montadas apenas para a página. O rate limit atual é por processo.

### Operação da fila de e-mails

O trabalhador local roda junto da API, a cada cinco segundos, com exclusão mútua no banco. Reiniciar preserva a fila. Um envio interrompido durante a transmissão fica com resultado incerto, nunca é reenviado automaticamente. Configuração ausente ou não testada bloqueia a mensagem; desativar o canal ou remover o acesso administrativo do destinatário cancela o envio ainda pendente. Mensagens bloqueadas são verificadas novamente em até quinze minutos ou podem ser recolocadas na fila pelo administrador após testar o SMTP. Tentativas automáticas temporárias aguardam um e cinco minutos. Reprocessamento manual mantém o histórico e abre um novo ciclo de até três tentativas. A API precisa permanecer ligada; computador desligado não envia alertas.

Validação local: `tests/email-outbox.ts`, `tests/email-history.ts` e `tests/simulator-linked.ts`, além dos testes unitários. Os testes de e-mail usam dados isolados, sem mensagens externas.

Arquivos são entregues como download autenticado, não executados, mas não passam por antivírus. A pontuação não é análise jurídica/técnica completa nem garantia de habilitação. Não implementamos submissão de documentos ou propostas nos portais, lances, assinatura, IA paga, RFPs privadas, CRM, Cailun ou marketplace. Essas capacidades exigem contratos de integração, autorização, revisão humana e etapas próprias de produto.
