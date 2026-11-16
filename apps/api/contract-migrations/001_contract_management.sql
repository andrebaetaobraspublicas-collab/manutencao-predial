CREATE TABLE IF NOT EXISTS GcMigration (id VARCHAR(80) PRIMARY KEY, checksum CHAR(64) NOT NULL, applied_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3));
CREATE TABLE IF NOT EXISTS GcSource (
 id CHAR(36) PRIMARY KEY, tenant_id CHAR(36) NOT NULL, owner_id CHAR(36) NOT NULL,
 product VARCHAR(16) NOT NULL, project_id CHAR(36) NOT NULL, source_version INT NOT NULL,
 content_hash CHAR(64) NOT NULL, document_gz MEDIUMBLOB NOT NULL, created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 UNIQUE KEY gc_source_owner (tenant_id,owner_id,product,project_id,source_version,content_hash)
);
CREATE TABLE IF NOT EXISTS GcContract (
 id CHAR(36) PRIMARY KEY,tenant_id CHAR(36) NOT NULL,owner_id CHAR(36) NOT NULL,
 source_id CHAR(36) NOT NULL,name VARCHAR(240) NOT NULL,regime VARCHAR(24) NOT NULL,demo BOOLEAN NOT NULL DEFAULT TRUE,
 original_value DECIMAL(18,2) NOT NULL, baseline JSON NOT NULL,version INT NOT NULL DEFAULT 1,
 created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),archived_at DATETIME(3) NULL,
 UNIQUE KEY gc_demo_unique (tenant_id,owner_id,source_id,regime),KEY gc_owner (tenant_id,owner_id,updated_at),
 CONSTRAINT gc_contract_source FOREIGN KEY(source_id) REFERENCES GcSource(id)
);
CREATE TABLE IF NOT EXISTS GcAction (
 id CHAR(36) PRIMARY KEY,contract_id CHAR(36) NOT NULL,tenant_id CHAR(36) NOT NULL,owner_id CHAR(36) NOT NULL,
 version INT NOT NULL,kind VARCHAR(40) NOT NULL,payload JSON NOT NULL,request_hash CHAR(64) NOT NULL,
 created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 UNIQUE KEY gc_action_version (contract_id,version),KEY gc_action_owner (tenant_id,owner_id,contract_id),
 CONSTRAINT gc_action_contract FOREIGN KEY(contract_id) REFERENCES GcContract(id)
);
