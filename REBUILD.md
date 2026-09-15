# Reconstrução da plataforma

Nome e identidade verbal provisórios. Este projeto é a reconstrução local do MVP de inteligência e gestão de licitações. A implementação mantém React, TypeScript e PostgreSQL, em um monólito modular.

## Critérios de entrega

- Autenticação e isolamento por empresa, perfil comercial e catálogo editável.
- Descoberta com busca, filtros e compatibilidade explicável, sem APIs pagas de IA.
- Acompanhamento com etapas, tarefas, responsáveis, prazos, documentos e histórico.
- Conectores oficiais com status honesto, coleta assíncrona e atualização dos editais.
- Interface executiva clara, azul-marinho e acentos violeta; responsiva e acessível.
- Verificação de build, testes de API e fluxos reais no navegador.

## Preservação

Os arquivos-fonte anteriores não estavam disponíveis no diretório no início desta reconstrução. Não serão removidos volumes Docker ou tabelas anteriores. A nova aplicação utiliza esquema PostgreSQL próprio para permitir recuperação e migração controlada dos dados anteriores.

## Limites do produto

O score usa regras e não substitui a leitura do edital. Envio de propostas/documentos aos portais oficiais, lances, assinatura e IA paga não são automatizados. A participação acontece no portal de origem, após revisão humana. Portais regionais sem conector validado não serão apresentados como integrados.
