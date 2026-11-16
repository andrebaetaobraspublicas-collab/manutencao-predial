CREATE TABLE IF NOT EXISTS VersionRetention (
 entity_id CHAR(36) NOT NULL, version INT NOT NULL, tenant_id CHAR(36) NOT NULL,
 actor_id CHAR(36) NOT NULL, session_key CHAR(64) NULL, work_day CHAR(10) NOT NULL,
 protected BOOLEAN NOT NULL DEFAULT FALSE, created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 superseded_at DATETIME(3) NULL,
 PRIMARY KEY(entity_id,version), KEY retention_group(tenant_id,entity_id,session_key,work_day,version)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
