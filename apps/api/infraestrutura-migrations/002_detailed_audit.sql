-- Additive indexes only. All existing audit rows and business records are retained.
CREATE INDEX infra_audit_page ON InfraAudit(created_at,id);
CREATE INDEX infra_audit_actor ON InfraAudit(user_id,created_at,id);
