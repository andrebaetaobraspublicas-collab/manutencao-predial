# Plano de rollback — contas e convites v0.6

Esta migration é aditiva, mas o rollback remove convites e tokens. Antes de reverter:

1. interrompa a API;
2. faça backup do MySQL;
3. confirme que não há convites pendentes nem redefinições em andamento;
4. restaure a versão v0.5 da aplicação;
5. remova, nesta ordem, as tabelas `AccountToken` e `TenantInvitation`;
6. remova `TenantMembership.sessionVersion`;
7. restaure o enum `AuditLog.action` aos valores da migration inicial;
8. execute o smoke test e um login completo.

Em produção, prefira restaurar o backup feito imediatamente antes do deploy quando qualquer etapa
da migration falhar. Não execute rollback destrutivo enquanto a API v0.6 estiver atendendo tráfego.
