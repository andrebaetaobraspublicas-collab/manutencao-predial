-- Add an explicit scenario dimension without copying source snapshots or
-- changing any existing contract identity, baseline, action or amount.
ALTER TABLE GcContract
 ADD COLUMN scenario_key VARCHAR(64) NOT NULL DEFAULT 'LEGACY',
 DROP INDEX gc_capture_unique,
 ADD UNIQUE KEY gc_capture_scenario_unique(tenant_id,owner_id,source_id,regime,demo,scenario_key);

-- Rollback: disable GESTAO_ENABLED and retain this additive column/index while
-- restoring the previous runtime. Do not restore the narrower unique index
-- once multiple scenarios exist, and never delete contracts to make it fit.
