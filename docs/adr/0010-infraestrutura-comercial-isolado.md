# ADR 0010 — Implantação comercial independente do OrçaPro Infraestrutura

Status: implementação em preparação em 24/10/2026, conforme solicitação do proprietário.

O destino final escolhido pelo proprietário é `sistema.orcaobras.com.br`, já provisionado na Hostinger da Jeane e ainda sem DNS. A API nova usará `api.orcaobras.com.br`. A proposta anterior de registrar outro domínio foi substituída. `orcaproobras.com.br`, `sistema.orcaproobras.com.br`, sua API, seus bancos, produtos/preços/assinaturas Stripe e seus deployments não são alterados por esta entrega.

O frontend usa `NEXT_PUBLIC_INFRA_ONLY=true`, `NEXT_PUBLIC_ORCAPRO_ONLY=false` e a API exclusiva `api.orcaobras.com.br`. A API usa `INFRA_COMMERCIAL=true`. O modo anterior compartilhado em desenvolvimento continua com esse sinalizador ausente. Nenhuma fórmula do motor SICRO é modificada.

Dois bancos novos e exclusivos preservam a arquitetura existente: `u528277311_orcaproinfra_auth` para identidades e cobrança; `u528277311_orcaproinfra_live` para SICRO, projetos, versões e auditoria Infraestrutura. O primeiro usa as migrations Prisma existentes, inicialmente vazias, e reaproveita os modelos `OrcaproPlan/Subscription/UserAccess/StripeEvent` como infraestrutura de cobrança dessa instância. Esses nomes físicos não representam conexão com o OrçaPro anterior. O segundo recebe cópia integral do banco Infraestrutura de desenvolvimento. Não há conexão de produção com o diretório de identidades do André ou com bancos do OrçaPro comercial.

Somente as contas, organizações e vínculos referenciados por `InfraUser` são migrados para o diretório novo. UUIDs e hashes bcrypt são preservados; sessões, tokens e vínculos de cobrança dos outros produtos não são copiados. Memberships novos ficam com `maintenanceAccess=false`. Contas migradas recebem controle manual, preservando seu acesso. Novas contratações online começam sem acesso pago e dependem de webhook assinado. O painel administrativo conserva cadastro, redefinição de senha e controle manual.

O proprietário adiou expressamente a integração Stripe para uma segunda etapa. Nesta entrega não criar produtos/preços/webhooks, não configurar chaves e não habilitar cadastro público de assinantes. O acesso usa o controle administrativo manual no novo banco, incluindo validade e suspensão. A reutilização das telas administrativas e dos modelos de assinatura permite introduzir cobrança futura sem copiar recursos comerciais do OrçaPro anterior. Os valores previstos para a etapa futura são R$599/mês e R$5.990/ano em dois produtos novos; não constituem cobrança configurada.

O guard de projetos valida perfil Infraestrutura, licença individual, tenant e proprietário. A consulta de assinatura continua acessível para retomar pagamento vencido; ser OWNER na organização não concede administração global. A autorização é aplicada no backend, inclusive para chamadas diretas. Os endpoints SINAPI e de orçamento OrçaPro são recusados nesse modo comercial.

Rollback: desativar somente os novos runtimes, preservar os dois novos bancos e backups e retornar seu frontend anterior. Nunca restaurar, substituir ou remover dados nos bancos/site dos outros produtos. O DNS do domínio e o provisionamento das novas credenciais são pré-requisitos externos; código preparado não equivale a sistema publicado.
