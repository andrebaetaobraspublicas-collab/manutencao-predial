-- Independent development database only. Additive; never remove history on rollback.
CREATE TABLE IF NOT EXISTS GcSaasPlan (
 id CHAR(36) PRIMARY KEY,code VARCHAR(50) NOT NULL,name VARCHAR(100) NOT NULL,
 billing_interval VARCHAR(8) NOT NULL,price_brl DECIMAL(12,2) NOT NULL,
 stripe_price_id VARCHAR(100) NULL,active BOOLEAN NOT NULL DEFAULT TRUE,version INT NOT NULL DEFAULT 1,
 created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 UNIQUE KEY gc_saas_plan_code(code),UNIQUE KEY gc_saas_plan_price(stripe_price_id)
);
CREATE TABLE IF NOT EXISTS GcSaasUser (
 id CHAR(36) PRIMARY KEY,membership_id CHAR(36) NOT NULL,tenant_id CHAR(36) NOT NULL,user_id CHAR(36) NOT NULL,
 role VARCHAR(16) NOT NULL DEFAULT 'USER',status VARCHAR(16) NOT NULL DEFAULT 'ACTIVE',
 billing_source VARCHAR(8) NOT NULL DEFAULT 'STRIPE',manual_status VARCHAR(24) NULL,manual_period_end DATETIME(3) NULL,
 plan_id CHAR(36) NULL,version INT NOT NULL DEFAULT 1,deleted_at DATETIME(3) NULL,
 created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 UNIQUE KEY gc_saas_member(membership_id),UNIQUE KEY gc_saas_owner(tenant_id,user_id),KEY gc_saas_user_status(status,role),
 CONSTRAINT gc_saas_plan_fk FOREIGN KEY(plan_id) REFERENCES GcSaasPlan(id)
);
CREATE TABLE IF NOT EXISTS GcSaasAudit (
 id CHAR(36) PRIMARY KEY,tenant_id CHAR(36) NOT NULL,actor_id CHAR(36) NOT NULL,
 kind VARCHAR(64) NOT NULL,entity_id VARCHAR(100) NOT NULL,details JSON NOT NULL,
 created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 KEY gc_saas_audit_time(created_at,id),KEY gc_saas_audit_actor(actor_id,created_at),KEY gc_saas_audit_kind(kind,created_at)
);
CREATE TABLE IF NOT EXISTS GcSaasSetting (
 name VARCHAR(30) PRIMARY KEY,title VARCHAR(160) NOT NULL,body TEXT NOT NULL,
 published BOOLEAN NOT NULL DEFAULT FALSE,version INT NOT NULL DEFAULT 1,
 updated_by CHAR(36) NOT NULL,updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
);
ALTER TABLE GcBillingAccount ADD COLUMN version INT NOT NULL DEFAULT 1,
 ADD COLUMN checkout_price_id VARCHAR(100) NULL, ADD COLUMN checkout_profile_version INT NULL;
