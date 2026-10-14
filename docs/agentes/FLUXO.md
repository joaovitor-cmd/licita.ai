# Encaminhamento de demandas

Estes perfis são instruções de atuação no Codex, não processos independentes ou agentes já executando em segundo plano. Por padrão uma demanda é executada sequencialmente no chat atual. Subagentes ou execução paralela dependem de autorização explícita; os perfis não concedem essa autorização.

| Tipo de demanda | Sequência de papéis |
| --- | --- |
| Jornada, texto ou interação | Orquestrador → UX/UI → Frontend, se necessário → QA/Segurança |
| Correção frontend sem mudança de jornada | Orquestrador → Frontend → QA/Segurança |
| Regra de API ou persistência | Orquestrador → Backend → QA/Segurança |
| Funcionalidade ponta a ponta | Orquestrador → UX/UI → contrato entre Backend e Frontend → Backend/Frontend em sequência → QA/Segurança |
| Diagnóstico ou revisão | Orquestrador → papel pertinente em somente leitura → QA/Segurança conforme risco |
| Hospedagem ou migração RDS | Registrar demanda para etapa de arquitetura; não executar como parte de outra demanda |

## Como iniciar
O usuário descreve objetivo e limites. O Orquestrador consulta AGENTS.md e docs/AGENTES.md, seleciona os perfis necessários e preenche o modelo DEMANDA.md em um arquivo autorizado. Definir quais arquivos serão editados antes de implementar; escolher a sequência conforme dependências de contrato.

## Transferência entre papéis
Cada papel deixa na demanda: resultado, arquivos, decisões, contratos, critérios atendidos, verificações realizadas e pendências. O próximo papel recebe essa evidência sem presumir testes aprovados. O Orquestrador mantém um responsável por arquivo e resolve divergências antes de editar; não usa paralelismo automaticamente.

## Revisão e fechamento
QA/Segurança compara critérios de aceite com código e evidências. Achados críticos, como vazamento, acesso entre empresas ou gravação em banco real no QA, impedem conclusão até correção ou decisão explícita do usuário. O Orquestrador comunica impacto de pendências e encerra apenas o escopo efetivamente concluído. Commit, push e deploy permanecem sujeitos à autorização específica.

## Exemplo de pedido
“Melhore a apresentação dos filtros do radar no portal, reutilizando os componentes atuais. Pode editar apenas frontend e documentação da demanda. Não altere API, banco ou dependências. Valide os tipos e indique o que ainda precisa de teste visual.”

Fluxo esperado: Orquestrador delimita os arquivos; UX/UI define interação e estados; Frontend implementa; QA/Segurança revisa critérios e contexto da empresa; entrega informa verificação visual pendente se não houve navegador isolado. O exemplo não é autorização para executar essa mudança agora.