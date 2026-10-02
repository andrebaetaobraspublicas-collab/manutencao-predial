# ADR 0008 — Gestão global de contas e assinatura individual OrçaPro

Status: aceito. Data: 2026-10-02.

O usuário solicitou cadastro, senha, exclusão e controle manual/Stripe com interface semelhante à administração da manutenção. Confirmou contratações independentes por programa e cobrança OrçaPro por usuário.

## Decisão

Diretório de identidades e licenças é recurso global de administração, autorizado exclusivamente por ORCAPRO_ADMIN_USER_IDS no servidor. OWNER/ADMIN de organização não recebe essa capacidade. Esse é o escopo global explicitamente autorizado, como o catálogo no ADR 0007; não é uma exceção para dados operacionais. Todas as rotas de orçamentos continuam tenantId + ownerUserId autenticados, inclusive para administrador global. Corpo de cadastro não aceita tenantId; permite criar organização por nome/slug, ou usar organização autenticada do administrador.

Uma conta tem uma licença OrçaPro em OrcaproSubscription, independentemente do número de vínculos. Identidade/senha permanecem compartilhadas. TenantMembership.maintenanceAccess default true preserva manutenção existente; cadastro OrçaPro cria acesso false. Tenant CANCELED, estado de cobrança da manutenção, admite autenticação somente para conta OrçaPro existente gerenciada/contratada ou administrador explícito e força maintenanceAccess false. Organização SUSPENDED/DELETED bloqueia ambos. Isso não muda status comercial da manutenção nem permite entrada pela mera seleção de programa.

Novas contas administrativas recebem teste de 30 dias. Contas anteriores permanecem sem vencimento até definição explícita de licença. Administradores globais são protegidos contra redefinição/suspensão/exclusão administrativa neste módulo. Exclusão OrçaPro é recuperável, preservando histórico e eventual manutenção contratada; uma senha alterada encerra todas as sessões da identidade compartilhada.

Stripe usa customer individual separado e metadata product=ORCAPRO/userId/orcaproSubscriptionId. Endpoints próprios e o webhook comum verificado distinguem produtos antes de alterar assinatura. Assinatura raw-body validada, deduplicação transacional, locks e consulta ao recurso remoto atual evitam eventos antigos e duplicados. Checkout valida preço BRL/valor/intervalo e serializa uma sessão aberta por usuário. Versão otimista protege mudanças manuais.

Controle MANUAL é uma decisão de acesso, auditada com justificativa; não cancela fatura ou cobrança externa. Campos externos continuam sincronizados sem sobrescrever acesso manual. Retomar Stripe exige ação explícita SYNC. Cancelar/resumir renovação externa são ações separadas exibidas com confirmação na interface. Nenhum preço, segredo, compra ou cancelamento financeiro real é configurado pelo seed.

## Migração e rollback

Migration somente adiciona campos com defaults conservadores e três tabelas com FKs RESTRICT. Manter tabelas/histórico no rollback. Revisões anteriores ignoram maintenanceAccess: **antes de retornar a código antigo, suspender memberships das contas novas exclusivas OrçaPro (maintenanceAccess=false)** para evitar que o login antigo conceda manutenção. Preferir retornar à revisão que entende a separação. Não remover usuários, projetos ou tabelas para reverter UI. Restaurar backup somente mediante procedimento de recuperação, evitando sobrescrever trabalho posterior.

Testes MySQL/HTTP verificam autorização global, separação individual/produtos, senha e revogação, exclusão recuperável, versões concorrentes, preço, assinatura Stripe inválida, deduplicação e prevalência manual. Testes antigos de isolamento e cálculos permanecem obrigatórios.
