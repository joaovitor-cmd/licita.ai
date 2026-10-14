# Banco do Licitaro no Supabase

## Resultado da transferência inicial

Concluída em 28/09/2026, às 22h14 (Brasília): 36 tabelas e 104.295 registros conferidos, incluindo 44.300 oportunidades, 421 acompanhamentos e 1.680 tarefas. Usuários, senhas existentes e acesso administrativo foram preservados.

Backup confirmado: `.local/backups/supabase-2026-09-29T01-11-15.675Z`. O diretório anterior, terminado em `01-10-14.265Z`, contém o backup da tentativa interrompida pela comparação da ordem das colunas; essa tentativa não confirmou nenhuma gravação no destino.

Configurações local e de containers atualizadas. Portal local (`http://localhost:5173`) e console (`http://localhost:5174`) respondem; as APIs passaram pelos testes de saúde, e rotas privadas retornaram 401 sem autenticação. A API compilou sem erros. Login interativo com a senha do usuário ainda deve ser conferido pelo operador. A publicação na EC2 não faz parte desta transferência.

## Estrutura

O portal do cliente e o console de gestão usam o PostgreSQL do mesmo projeto Supabase, por meio das APIs do Licitaro. A autenticação existente permanece no Licitaro; esta migração não converte usuários para Supabase Auth.

As tabelas da aplicação ficam no schema `workspace_v2`. Os schemas internos de autenticação, armazenamento e outros serviços do Supabase não são substituídos. O navegador não recebe credenciais de banco, e os papéis `anon` e `authenticated` não têm acesso direto ao schema da aplicação. O isolamento entre empresas continua sendo aplicado pelas APIs do Licitaro.

## Configurações privadas

- `.env`: execução local, conectada ao banco remoto após a troca.
- `.env.production`: execução futura em containers.
- `deploy/secrets/database-ca.pem`: certificado público da autoridade certificadora fornecido pelo operador, usado para validar o servidor PostgreSQL.
- `DATABASE_SSL=true`: conexão TLS com validação obrigatória. Não desabilitar a verificação do certificado.
- `DATABASE_SSL_CA_FILE`: caminho absoluto local no `.env`; `/run/licitaro-secrets/database-ca.pem` nos containers.
- `DATABASE_POOL_MAX=6`: limite por processo de API; portal e console possuem pools separados.
- `SMTP_ENCRYPTION_KEY`: manter a mesma chave em todos os processos e nas futuras instalações.

O endpoint utilizado é o Session Pooler na porta 5432. Não substituir pelo Transaction Pooler sem revisar os workers que utilizam locks de sessão.

Arquivos de configuração privada, certificados em `deploy/secrets` e backups em `.local` estão ignorados pelo Git. Para hospedar, copiar `.env.production` e o certificado por um canal seguro para a EC2; o clone do GitHub sozinho não contém esses arquivos. A montagem do certificado já está prevista em `compose.prod.yml`.

## Transferência inicial

Requer Node.js 24 e dependências instaladas. Desligar APIs e workers conectados à origem durante a transferência.

```powershell
node --import tsx scripts/migrate-supabase.mjs
node --import tsx scripts/migrate-supabase.mjs --transfer
```

O primeiro comando apenas verifica a origem e o destino. O segundo:

1. Exige origem local, destino esperado e ausência completa do schema da aplicação no destino.
2. Gera cópia consistente dos registros em `.local/backups/supabase-<data>`, incluindo configurações de origem e chave SMTP disponível.
3. Preserva números, datas, JSON e campos binários sem conversão intermediária para números JavaScript.
4. Cria o schema em transação, importa os registros e compara quantidades e resumos de conteúdo por tabela.
5. Revalida as chaves estrangeiras e preserva os contadores das sequências antes de confirmar a transação.
6. Grava `transfer-result.json` somente após confirmação da gravação.

O script não troca `.env` automaticamente. Depois da troca para Supabase, ele recusa nova transferência, pois a origem já não é local. Não apagar o schema remoto para repetir a migração.

## Backup e retorno

O banco local em `.local/postgres` é preservado. Os backups JSONL contêm dados sensíveis, inclusive hashes de senhas e sessões; não os publicar, anexar a chamados ou subir ao GitHub. Esta cópia inicial não substitui uma política de backups recorrentes.

Se for necessário voltar ao banco local, parar os processos da aplicação antes de restaurar a configuração de origem guardada no backup, preservando a configuração remota atual em outro arquivo privado. O banco local representa o instante da migração: alterações feitas posteriormente no Supabase precisam ser reconciliadas antes de uma volta, para não perder dados.

Antes da produção, definir retenção e cópias recorrentes, validar uma restauração em ambiente separado e conferir limites do plano Supabase. O banco na nuvem não hospeda automaticamente o portal: a publicação na EC2 continua sendo uma etapa separada.
