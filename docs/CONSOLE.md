# Console administrativo independente

O console possui aplicação própria em `apps/console` (5174 no preview) e processo API próprio em `apps/api/src/console-index.ts` (3001). O código de design compartilhado não compartilha login. O banco ainda é compartilhado; isto não equivale a isolamento completo de infraestrutura.

## Operação

- Inicie o banco e o portal com o fluxo de preview existente; depois execute `scripts/start-console.ps1`. Builds e verificações incluem a aplicação console.
- Dashboard: ambientes não arquivados criados no mês, total não arquivado, inclusões no radar no mês e soma do valor estimado publicado por inclusão. Período em Brasília. Não é receita nem confirmação de envio de proposta; o mesmo edital pode aparecer em mais de uma empresa.
- Relatórios: período inclusivo escolhido na tela, paginação no banco, status comercial atual e CSV com empresa/CNPJ/data/órgão/identificadores/valor. Datas são de inclusão no radar, não datas de ganho/perda. Valores ausentes não são tratados como zero. Dados arquivados continuam no relatório, identificados.
- Exportação limitada a 10.000 registros por solicitação; acima do limite, reduza o período. Nenhum truncamento silencioso. CSV com proteção contra fórmulas.
- Exclusão de ambiente é arquivamento recuperável, com bloqueio e revogação de sessões; restauração volta bloqueada. Exclusão permanente não foi implementada. Requisições e envios já iniciados podem terminar.

## Identidades administrativas

`console_admins`, `console_sessions` e `console_invites` são independentes dos usuários, sessões e recuperação de senha dos clientes. O titular indicado em `PLATFORM_ADMIN_USER_ID` é copiado uma única vez, incluindo o hash da senha atual, por autorização explícita do responsável. O bootstrap não redefine senha nem reativa acesso em reinícios. Depois disso, recuperação de senha no portal não altera a credencial do console.

Proprietário (OWNER) gerencia acessos; administrador (ADMIN) gerencia operação e planos; consulta (VIEWER) acessa somente leituras e relatórios. A tela não pode inativar/rebaixar o proprietário. Não há cadastro público. Convites expiram em 30 minutos, são de uso único e devem ser compartilhados por canal seguro; não há envio automático de e-mail. Recuperação do proprietário exige procedimento operacional autorizado, não a recuperação pública do cliente.

Cookies host-only e HttpOnly, nome independente, SameSite Strict e Secure em produção. Sessão administrativa expira em 8 horas ou 30 minutos sem chamadas. A origem é validada separadamente; mutações exigem Origin e JSON. A API do console não executa coletores nem expõe documentos e rotas do cliente.

## Antes de publicar

Hospedar o console e sua API em origem/processo separados do produto. Não encaminhar /management ou /console-auth pela API pública. Configurar CONSOLE_ORIGIN HTTPS exclusivo; o cookie de produção usa prefixo __Host-. Manter API interna atrás de proxy próprio, restrição de rede/VPN quando possível, gestão de segredos, logs sem tokens, backups e restauração testados. MFA e revisão independente de segurança ainda são pendências antes da exposição administrativa pública. Separar processos e sessões reduz superfícies compartilhadas, mas não garante invulnerabilidade ou isolamento de banco.
