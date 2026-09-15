# SMTP central do Licitaro

O titular do console configura o envio em `/email`. As rotas GET/PUT `/api/management/email-settings` e POST `/api/management/email-settings/test` existem apenas no processo do console e exigem OWNER. Clientes, administradores de ambientes, ADMIN e VIEWER do console não acessam as credenciais. O teste envia somente ao e-mail da sessão do titular, com limite de 3 tentativas por 15 minutos por IP.

O armazenamento é um registro único em `platform_email_settings`, sem vínculo com a exclusão de uma empresa. A senha usa AES-256-GCM e contexto `platform`; nunca é devolvida à interface. Ambos os processos precisam compartilhar `SMTP_ENCRYPTION_KEY` em produção. Em desenvolvimento usam a mesma chave local existente. Salvar registra auditoria sem conteúdo das credenciais e invalida o teste anterior.

Alertas, boletins e recuperação de senha passam pelo serviço central. Preferências, destinatários e permissões de cada ambiente continuam sendo avaliados nos fluxos existentes. Nenhuma lista de destinatários é compartilhada. Depois de salvar, enviar o teste para habilitar o transporte. A aceitação pelo servidor não garante entrega na caixa de entrada.

Sem registro central, o SMTP configurado por variáveis de ambiente permanece como fallback. Com registro central desativado ou ainda não testado, o envio fica suspenso, sem fallback silencioso. Alterações não exigem reiniciar o serviço. Por enquanto, salvar uma troca de provedor pausa envios até o novo teste; não existe promoção de configuração de teste separada da configuração ativa.

Na base local desta implementação havia zero registros em `email_settings`. A tabela antiga foi preservada, mas não é mais utilizada para envio. Em outra instalação com configurações antigas, selecionar explicitamente o provedor central antes de migrar; não copiar ciphertext diretamente, pois o contexto criptográfico mudou. Credenciais de ambientes distintos não devem ser promovidas automaticamente.

Validação atual: `tests/platform-smtp.ts` e `tests/platform-smtp-browser.ts`, com transporte e dados simulados, sem disparos reais. O antigo roteiro `tests/smtp-settings.ts` foi substituído pelo roteiro central. Testes históricos que inserem diretamente em `email_settings` não representam mais a configuração de transporte em produção.
