# Licitaro — produção em containers na EC2

## Arquitetura

- `nginx`: serve as interfaces compiladas e encaminha `/api/` para a API correta.
- `api`: portal cliente, coleta, análise, boletins e fila de e-mails.
- `console-api`: autenticação e operações exclusivas da gestão.
- `certbot`: emissão e renovação dos certificados, em container.
- PostgreSQL externo: Supabase, RDS ou servidor PostgreSQL administrado pelo operador.

Domínios: **app.licitaro.com.br** e **gestao.licitaro.com.br**. Apenas 80 e 443 são publicados. O banco, as APIs e o Docker socket não são publicados na internet. Não existe Nginx ou Certbot instalado no host neste roteiro. Docker Engine, Compose e Git são ferramentas do host.

Os arquivos são uma configuração inicial de produção. Antes de abrir para clientes, valide a imagem Linux, conexão real com o banco, emissão TLS, restauração de backup e isolamento entre empresas. Não há alta disponibilidade em uma EC2 única nem atualização sem interrupção. A pipeline não foi criada nesta etapa.

## 1. Banco externo

Use PostgreSQL, não Firestore/Realtime Database do Firebase: a aplicação usa SQL, transações, JSONB e advisory locks. No Supabase, prefira conexão direta; para EC2 IPv4 sem acesso ao endpoint direto, use **Session pooler na porta 5432**, nunca Transaction pooler (6543), por causa dos locks de sessão dos workers.

Crie um projeto/banco exclusivo para o Licitaro, preferencialmente próximo da região da EC2. Copie a URL no painel Connect. Restrinja a rede ao IP da EC2 quando o provedor permitir. Não use a chave pública/anon nem service_role como senha PostgreSQL. Não exponha o esquema `workspace_v2` pela Data API do Supabase. A aplicação acessa o banco somente pelo backend.

O usuário do banco precisa criar o esquema, tabelas e índices nas migrações atuais. Para esta primeira implantação, use uma credencial de banco dedicada ao projeto. A separação entre usuário de migração e usuário de execução é um endurecimento futuro.

TLS é obrigatório em produção, com verificação do certificado. Se necessário, baixe a CA indicada pelo provedor para `deploy/secrets/database-ca.pem` e configure `DATABASE_SSL_CA_FILE=/run/licitaro-secrets/database-ca.pem`. Esse arquivo precisa ser legível pelo usuário do container (UID 1000); CA pública não é chave privada. Não desative a verificação do certificado. Remova parâmetros `sslmode`, `sslrootcert` etc. da URL: o código configura SSL explicitamente para evitar sobrescrita pelo driver.

O limite de conexões configurado vale **por processo**. Com 6 em cada API são até 12 conexões, além de ferramentas externas. Monitore limites e uso do provedor. Confirme a conexão e as migrações antes de habilitar a coleta.

Referência: https://supabase.com/docs/guides/database/connecting-to-postgres

## 2. EC2 e DNS

1. Crie uma EC2 Ubuntu 24.04 x86_64. Sugestão inicial para piloto: 2 vCPU e 8 GB RAM, a ajustar por medição.
2. Use disco gp3 criptografado, orçamento/alertas de custo e Elastic IP.
3. Security Group: 80/443 públicos; SSH 22 só do seu IP, ou Systems Manager. Não libere 3000, 3001 ou 5432.
4. Instale Docker Engine e o plugin Compose pelo repositório oficial: https://docs.docker.com/engine/install/ubuntu/
5. Não instale Nginx/Certbot no host; se houver outro serviço ocupando 80/443, resolva o conflito antes.
6. Crie registros DNS A `app` e `gestao` apontando ao Elastic IP. Não crie AAAA sem IPv6 configurado. Para a primeira emissão, evite proxy CDN; mantenha DNS direto. Verifique também CAA caso exista.
7. Configure backup externo e monitoramento de espaço, saúde dos containers e validade do certificado.

## 3. GitHub e configuração

Faça commit dos arquivos deste diretório, Dockerfile, compose.prod.yml, .dockerignore, .gitattributes, .env.production.example e mudanças nas APIs. **Não faça commit de .env.production ou de credenciais.** Use Deploy Key GitHub somente leitura na EC2.

Na EC2, clone o repositório em `/opt/licitaro` (substitua a URL). Com um usuário autorizado a operar Docker:

```sh
git clone git@github.com:SEU_USUARIO/SEU_REPOSITORIO.git /opt/licitaro
cd /opt/licitaro
cp .env.production.example .env.production
chmod 600 .env.production
nano .env.production
```

Preencha DATABASE_URL e SMTP_ENCRYPTION_KEY; mantenha inicialmente SCHEDULER_ENABLED=false. A senha na URL deve ter caracteres especiais codificados para URL. Use apenas a URL PostgreSQL, não uma URL da API HTTP.

Para gerar a chave SMTP sem instalar Node no host:

```sh
docker run --rm node:24-bookworm-slim node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

Guarde o resultado no arquivo e em um gerenciador seguro. Se migrar SMTP criptografado já existente, preserve a chave antiga; gerar outra torna a senha anterior ilegível. Nunca utilize placeholders em produção. Os certificados e desafios ACME ficam em volumes Docker persistentes; segredos ficam fora das imagens.

Não copie variáveis do preview como LOCAL_PG_PORT ou Mailpit. A configuração dos domínios e a confiança em um único proxy já estão no Compose. Não publique as APIs diretamente nem mude TRUST_PROXY_HOPS sem revisar a topologia: o Nginx substitui os cabeçalhos de IP recebidos.

## 4. Primeira implantação

```sh
cd /opt/licitaro
sh deploy/scripts/deploy.sh
```

O script valida o Compose, compila as imagens e aguarda saúde dos serviços. Falha de saúde não faz rollback automático: examine os logs. No primeiro início, o Nginx só oferece os desafios ACME; login/API ficam indisponíveis até o HTTPS. Isso é intencional.

```sh
sh deploy/scripts/compose.sh logs --tail=100 api console-api nginx
```

As APIs executam migrações ao iniciar, serializadas por lock do banco. Em banco existente, faça backup antes. O deploy NÃO importa automaticamente o banco do computador. Para transferir dados, planeje dump/restore compatível com a versão de origem/destino e valide separadamente. Não copie os arquivos físicos de PostgreSQL entre versões.

## 5. Emitir HTTPS e ativar renovação

Somente depois dos dois DNS apontarem para a EC2 e a porta 80 estar acessível:

```sh
sh deploy/scripts/bootstrap-tls.sh SEU_EMAIL_REAL
```

O comando aceita os termos da Let's Encrypt, emite um certificado para os dois domínios, reinicia apenas o Nginx e liga o container de renovação. Escolha um e-mail operacional monitorado. Não repita emissões em loop: existem limites da autoridade certificadora.

```sh
sh deploy/scripts/compose.sh run --rm --entrypoint certbot certbot renew --dry-run
sh deploy/scripts/compose.sh logs --tail=100 certbot
curl --fail https://app.licitaro.com.br/api/health
curl --fail https://gestao.licitaro.com.br/api/health
```

O Certbot verifica renovação a cada 12 horas. Após renovação bem-sucedida, grava um marcador; o Nginx o verifica a cada minuto e recarrega o certificado. Nenhum container recebe o Docker socket. Falhas são registradas nos logs: configure monitoramento externo de expiração. O healthcheck do Nginx verifica apenas o processo HTTP, não a validade TLS.

Não execute `down -v`: isso apaga os volumes de certificados. Referência: https://eff-certbot.readthedocs.io/en/stable/using.html

## 6. Titular da gestão

Para um banco novo, cadastre sua conta real em https://app.licitaro.com.br/cadastro e confira o cadastro. No editor SQL privado do provedor, consulte somente seu usuário:

```sql
SELECT id, name, email FROM workspace_v2.users
WHERE email = 'SEU_EMAIL_REAL';
```

Coloque o UUID correto em PLATFORM_ADMIN_USER_ID e recrie a API da gestão:

```sh
sh deploy/scripts/compose.sh up -d --force-recreate console-api
```

Entre em https://gestao.licitaro.com.br com a credencial inicial. Depois da validação, limpe PLATFORM_ADMIN_USER_ID e repita o comando. O titular já persistido permanece. Não promova usuários apenas porque declaram possuir um e-mail. Se o banco restaurado já contém o titular, não recrie a conta.

Configure e teste o SMTP central no console. Ambos os processos compartilham a mesma chave. Preferências de alerta continuam individuais por empresa. Habilite a coleta somente após conferir o funcionamento:

```sh
# Após alterar SCHEDULER_ENABLED=true no arquivo:
sh deploy/scripts/compose.sh up -d api
```

## 7. Checklist obrigatório

- Login/logout dos dois portais, cookies HTTPS e recusa de sessão de cliente na gestão.
- Novo ambiente de teste, bloqueio e isolamento dos dados entre empresas.
- Perfil, busca, radar, upload/download e SMTP de teste.
- Reinício dos containers sem perda dos dados.
- Teste de renovação e validação externa dos dois domínios.
- Backup restaurado em banco de teste; retenção compatível com o plano do provedor.
- Revisão de logs: não compartilhar tokens de ativação, cookies ou credenciais.

Os documentos da biblioteca estão no PostgreSQL e devem estar cobertos pelo backup. Mantenha também cópia segura da chave SMTP e da configuração. Supabase não implica automaticamente que qualquer plano ofereça o backup/retencão que seu negócio precisa.

## 8. Atualização e pipeline futura

Após testar e versionar uma release, faça backup, obtenha a tag/commit desejado pelo Git, altere RELEASE_TAG e execute `sh deploy/scripts/deploy.sh`. Não é necessário `down`. Pode haver uma breve interrupção. Nginx resolve os nomes das APIs novamente após recriação dos containers.

Rollback requer imagem/código anterior e compatibilidade do esquema: trocar imagem NÃO desfaz migração. Não apague imagens antigas antes de validar a nova versão.

Próxima etapa: GitHub Actions executa testes, publica imagens com tag de commit em ECR/GHCR e solicita deploy com aprovação. A EC2 poderá usar pull/up em vez de compilar. Não há Watchtower, atualização automática nem credenciais AWS/GitHub embutidas neste pacote.

As tags base de Node/Nginx/Certbot estão declaradas; para releases controladas, fixe os digests das imagens Linux efetivamente testadas. Valide periodicamente atualizações de segurança.
