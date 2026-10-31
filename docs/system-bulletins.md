# Informativos do sistema — somente desenvolvimento

## Arquitetura e limites
OrçaPro e Infraestrutura autenticam pelo mesmo `User` e `TenantMembership` no banco central. OrçaPro usa `OrcaproUserAccess`/assinatura individual; SICRO mantém `InfraUser.external_user_id` + tenant no banco separado. O diretório é consultado apenas pelo administrador global configurado em `ORCAPRO_ADMIN_USER_IDS`; OWNER/ADMIN de uma organização ou ADMIN local do Infraestrutura não concedem envio ao diretório inteiro. O histórico é filtrado pelo tenant autenticado. Não há relação com OS: este é um recurso administrativo dos produtos de engenharia, conforme ADRs 0007/0009.

Ativo exige conta e membership ativos e acesso ao produto (incluindo assinatura no OrçaPro). Inativos mantêm um vínculo de produto válido, mas não têm acesso ativo. Contas/exclusões lógicas são omitidas. Ambas as seleções são unidas por e-mail normalizado. Ausência de perfil SICRO não é presumida como cadastro nesse produto. Preferências existentes de notificação pertencem à manutenção, não há opt-out específico de informativos: por precaução, qualquer `NotificationPreference.emailEnabled=false` exclui a conta desses comunicados, sem alterar a preferência original. Não existe mecanismo adicional de descadastro a reaproveitar.

## Fluxo
Nos dois painéis administrativos: **Informativos do sistema** → assunto/conteúdo em texto simples → produtos/situação → **Gerar prévia e contar destinatários**. A prévia usa o mesmo template seguro do envio e não dispara mensagens. Editar qualquer campo invalida a confirmação. O teste vai somente ao e-mail atual da conta do administrador. O envio definitivo exige escrever `ENVIAR INFORMATIVO` e confirmar o público previamente conferido. Mudanças no público obrigam nova prévia. Nunca usar listas de clientes reais para homologação sem aprovação explícita do administrador.

## E-mail e processamento
Reutiliza `MailService` e Resend, com template escapado, identificação do produto e uma mensagem por destinatário. `SYSTEM_BULLETINS_ENABLED=true` habilita somente se `WEB_BASE_URL` for exatamente `https://gestaodepredios.com.br` ou `https://www.gestaodepredios.com.br`; os dois domínios comerciais sempre retornam 404 e não iniciam o processador. O frontend só mostra o menu após validação de capacidade pelo servidor.

Configurar no ambiente privado da API de desenvolvimento: `RESEND_API_KEY` (chave de envio da conta Resend), `EMAIL_FROM` (remetente do domínio verificado) e, opcionalmente, `EMAIL_TIMEOUT_MS` entre 1000 e 30000. A chave nunca fica no código, frontend, relatórios ou logs. Sem chave/remetente o envio fica bloqueado; não há falso sucesso por simulação. Limites de destinatários do plano ou domínio Resend devem ser conferidos na conta do provedor. O módulo não realiza compras nem contrata planos.

Segue o padrão de outbox MySQL já existente em Notifications, em tabelas próprias porque eventos e preferências existentes são de OS. Poll de 5 s enquanto a API estiver ativa; até 3 campanhas e 3 entregas por campanha/ciclo, 700 ms entre mensagens. Claim atômico com lease de 120 s, três tentativas para erro temporário, chave idempotente estável por entrega e janela máxima de 23 h. Reiniciar a API retoma pendências. Para períodos longos sem tráfego a Hostinger pode suspender o processo; o próximo acesso retoma o worker. Elegibilidade, preferências e hash do e-mail são revalidados antes de enviar. Troca de e-mail ou revogação de acesso gera SKIPPED. Não reenfileirar manualmente um envio aceito pelo provedor.

`SENT` significa aceito pela API do provedor, sem confirmação de leitura ou entrega na caixa postal. Histórico mostra contagens e códigos seguros de falha; não contém listas de e-mails, credenciais ou respostas brutas do provedor. Armazena comunicado, autor, produtos, hashes e IDs necessários à rastreabilidade. Rascunhos são preservados; não há purga automática.

## Implantação e reversão
Backup privado e comparação das tabelas existentes antes/depois. Migration `20261031140000_system_bulletins` acrescenta duas tabelas sem alterar usuários, projetos ou licenças. Executar `prisma migrate deploy`, publicar API e frontend só no desenvolvimento e habilitar o flag após a migration. Rollback: desabilitar o flag e restaurar o runtime/frontend anterior, mantendo as tabelas históricas; não apagar registros. Produção não participa desta implantação.


### SMTP Hostinger, exclusivo do desenvolvimento

Alternativa ao Resend: EMAIL_PROVIDER=smtp, SMTP_HOST=smtp.hostinger.com, SMTP_PORT=465 (TLS implícito) ou 587 (STARTTLS obrigatório), SMTP_USER=caixa completa, EMAIL_FROM=remetente autorizado, SMTP_PASSWORD_FILE=arquivo privado 0600 (ou SMTP_PASSWORD). Não usar ambas as alternativas de senha; o arquivo tem precedência. Certificados TLS são sempre verificados, debug do transportador fica desligado. SMTP é recusado nas origens comerciais mesmo com as variáveis presentes. O provedor Resend permanece o padrão nos demais ambientes.

SMTP não fornece a garantia idempotente da API Resend. Message-ID estável ajuda a rastrear, mas não comprova deduplicação. Somente rejeição SMTP temporária explícita (4xx) permite repetição automática. Timeout/falha de conexão após possível aceitação não é repetido; claim expirado SMTP fica marcado para revisão sem reenvio, evitando mensagens duplicadas. Verificação da conexão autentica sem enviar qualquer mensagem.
