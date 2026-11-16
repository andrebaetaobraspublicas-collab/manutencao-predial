-- Apply only to the standalone Gestão Contratual database. No source DDL.
CREATE TABLE GcSourceIdentity (
 tenant_id CHAR(36) NOT NULL, user_id CHAR(36) NOT NULL,
 product ENUM('ORCAPRO','INFRA') NOT NULL,
 source_user_id CHAR(36) NOT NULL, source_tenant_id CHAR(36) NOT NULL,
 verified_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 PRIMARY KEY(tenant_id,user_id,product),
 UNIQUE KEY source_identity(product,source_user_id,source_tenant_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
