CREATE TABLE IF NOT EXISTS GcMember (
 contract_id CHAR(36) NOT NULL,tenant_id CHAR(36) NOT NULL,user_id CHAR(36) NOT NULL,
 role VARCHAR(16) NOT NULL,granted_by CHAR(36) NOT NULL,updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 PRIMARY KEY(contract_id,user_id),KEY gc_member_tenant(tenant_id,user_id),
 CONSTRAINT gc_member_contract FOREIGN KEY(contract_id) REFERENCES GcContract(id)
);
ALTER TABLE GcAction ADD COLUMN actor_id CHAR(36) NULL;
ALTER TABLE GcContract DROP INDEX gc_demo_unique, ADD UNIQUE KEY gc_capture_unique(tenant_id,owner_id,source_id,regime,demo);
CREATE TABLE IF NOT EXISTS GcAdministrativeAudit (
 id CHAR(36) PRIMARY KEY,contract_id CHAR(36) NOT NULL,tenant_id CHAR(36) NOT NULL,actor_id CHAR(36) NOT NULL,
 kind VARCHAR(40) NOT NULL,details JSON NOT NULL,created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 KEY gc_admin_audit_contract(tenant_id,contract_id),CONSTRAINT gc_admin_audit_fk FOREIGN KEY(contract_id) REFERENCES GcContract(id)
);
CREATE TABLE IF NOT EXISTS GcStorageAccount (tenant_id CHAR(36) PRIMARY KEY);
CREATE TABLE IF NOT EXISTS GcBlob (
 storage_key VARCHAR(180) PRIMARY KEY,tenant_id CHAR(36) NOT NULL,size_bytes INT NOT NULL,
 created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),KEY gc_blob_tenant(tenant_id)
);
CREATE TABLE IF NOT EXISTS GcAttachment (
 id CHAR(36) PRIMARY KEY,contract_id CHAR(36) NOT NULL,tenant_id CHAR(36) NOT NULL,uploaded_by CHAR(36) NOT NULL,
 file_name VARCHAR(255) NOT NULL,media_type VARCHAR(100) NOT NULL,size_bytes INT NOT NULL,content_hash CHAR(64) NOT NULL,
 storage_key VARCHAR(180) NOT NULL,created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 KEY gc_attachment_contract(tenant_id,contract_id),CONSTRAINT gc_attachment_contract_fk FOREIGN KEY(contract_id) REFERENCES GcContract(id)
);
CREATE TABLE IF NOT EXISTS GcImport (
 id CHAR(36) PRIMARY KEY,tenant_id CHAR(36) NOT NULL,user_id CHAR(36) NOT NULL,file_name VARCHAR(255) NOT NULL,
 content_hash CHAR(64) NOT NULL,storage_key VARCHAR(180) NOT NULL,original_storage_key VARCHAR(180) NOT NULL,
 media_type VARCHAR(100) NOT NULL,size_bytes INT NOT NULL,mapping JSON NULL,mapping_hash CHAR(64) NULL,
 confirmed_contract_id CHAR(36) NULL,confirmed_action_id CHAR(36) NULL,created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),expires_at DATETIME(3) NOT NULL,
 KEY gc_import_owner(tenant_id,user_id,expires_at)
);
