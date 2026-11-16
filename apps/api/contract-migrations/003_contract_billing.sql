CREATE TABLE IF NOT EXISTS GcBillingAccount (
 tenant_id CHAR(36) NOT NULL,owner_id CHAR(36) NOT NULL,
 customer_id VARCHAR(100) NOT NULL,subscription_id VARCHAR(100) NULL,
 status VARCHAR(30) NOT NULL DEFAULT 'incomplete',current_period_end DATETIME(3) NULL,
 cancel_at_period_end BOOLEAN NOT NULL DEFAULT FALSE,risk_blocked BOOLEAN NOT NULL DEFAULT FALSE,
 checkout_request_id CHAR(36) NULL,checkout_id VARCHAR(100) NULL,checkout_expires_at DATETIME(3) NULL,
 updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 PRIMARY KEY(tenant_id,owner_id),UNIQUE KEY gc_billing_customer(customer_id),UNIQUE KEY gc_billing_subscription(subscription_id)
);
CREATE TABLE IF NOT EXISTS GcBillingEvent (
 id VARCHAR(100) PRIMARY KEY,tenant_id CHAR(36) NOT NULL,owner_id CHAR(36) NOT NULL,
 type VARCHAR(100) NOT NULL,payload_hash CHAR(64) NOT NULL,stripe_created BIGINT NOT NULL,
 processed_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 KEY gc_billing_event_owner(tenant_id,owner_id,processed_at)
);
