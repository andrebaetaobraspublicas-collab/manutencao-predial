# Implantação comercial OrçaPro Infraestrutura

Destino exclusivo: `orcaproinfra.com.br` e `api.orcaproinfra.com.br`, Hostinger Jeane. Não executar os workflows `promote-orcapro-production.yml` ou os scripts limitados aos domínios do OrçaPro existente.

## Configuração

Criar hospedagens novas para a raiz do domínio e para a API. Configurar somente os registros DNS do novo domínio e aguardar HTTPS válido. Criar dois bancos/usuários novos, sem conceder privilégios nos bancos anteriores:

- `u528277311_infra_auth`: migrations Prisma, contas e cobrança.
- `u528277311_infra_live`: cópia SICRO/PEM, orçamentos e histórico.

O arquivo privado do backend, fora de `public_html`, precisa conter:

```dotenv
INFRA_COMMERCIAL=true
INFRA_ENABLED=true
ORCAPRO_ENABLED=true
ORCAPRO_ONLY=true
DATABASE_URL=mysql://USUARIO_AUTH:SENHA_URL_ENCODED@HOST:3306/u528277311_infra_auth
INFRA_DATABASE_URL=mysql://USUARIO_LIVE:SENHA_URL_ENCODED@HOST:3306/u528277311_infra_live
WEB_BASE_URL=https://orcaproinfra.com.br
API_BASE_URL=https://api.orcaproinfra.com.br
CORS_ORIGINS=https://orcaproinfra.com.br
COOKIE_SECURE=true
JWT_ACCESS_SECRET=GERAR_NOVO_SEGREDO
INFRA_CSRF_SECRET=GERAR_NOVO_SEGREDO
INFRA_ADMIN_USER_IDS=UUID_ADMIN_MIGRADO
ORCAPRO_ADMIN_USER_IDS=UUID_ADMIN_MIGRADO
SEED_MAINTENANCE_ON_DEPLOY=false
ORCAPRO_SEED_ON_DEPLOY=false
ORCAPRO_STRIPE_MODE=LIVE
ORCAPRO_STRIPE_SECRET_KEY=""
ORCAPRO_STRIPE_WEBHOOK_SECRET=""
```

Configurar também SMTP, cookies e demais variáveis de autenticação conforme `.env.example`; segredos e sessões são novos, não são copiados de outro aplicativo. O frontend é compilado com `NEXT_PUBLIC_INFRA_ONLY=true`, `NEXT_PUBLIC_ORCAPRO_ONLY=false`, `NEXT_PUBLIC_API_URL=https://api.orcaproinfra.com.br/api/v1` e `HOSTINGER_STATIC_EXPORT=1`. Sem página comercial nesta etapa, cancelamento/logout retornam ao login Infraestrutura.

## Migração e verificação

1. Exportar o banco Infraestrutura de origem com `mysqldump --single-transaction --quick --hex-blob --skip-add-drop-table`, comprimir e conferir SHA-256 após a transferência privada. Não restaurar em banco preexistente ou diferente dos dois nomes acima.
2. Aplicar as migrations Prisma no banco AUTH vazio. Importar a cópia SQL somente no banco LIVE vazio. Nunca executar seeds de demonstração ou importação SINAPI nesse destino.
3. Importar somente as contas/tenants/memberships do fechamento de `InfraUser`, mantendo UUID, bcrypt, situação e vínculo original; não copiar sessões, tokens, clientes ou assinaturas Stripe dos outros programas. Conceder licenças locais manuais para contas migradas, sem cobrar automaticamente.
4. Conferir contagens por tabela, UUIDs, versões dos orçamentos e hashes dos snapshots SICRO/PEM. Verificar login, isolamento entre os três usuários migrados, restauração de versões, 27 referências, alteração de UF somente por confirmação, cronograma e regressão do motor.
5. Configurar chave restrita e webhook exclusivos. Cadastrar apenas os dois novos preços Infraestrutura, metadata `product=ORCAPRO_INFRA`; conferir cadastro online, Checkout, assinatura e retorno ao domínio próprio. A assinatura depende do webhook assinado.
6. Preservar as vendas diretas no painel: concessão manual, validade, suspensão, cadastro e redefinição de senha. Produtos novos: mensal R$599 e anual R$5.990. Não editar produtos/preços/assinaturas do OrçaPro anterior.
7. Programar backups privados dos dois bancos, retenção14dias, e worker de importação na nova API. Preservar o snapshot de origem até concluir o aceite.

O backup preparado em24/10 contém27 ciclos,3 usuários,3 projetos,42 versões,131 eventos Infraestrutura. Contagens representam a exportação desse momento e precisam ser comparadas ao destino; não garantem mudanças posteriores na origem. O aplicativo anterior continua disponível enquanto o novo destino não for homologado.
