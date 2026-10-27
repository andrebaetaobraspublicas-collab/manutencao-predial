import { config } from 'dotenv';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { connectInfra, safeFailure } from './infraestrutura-import-lib.mjs';

// One-time migration into an EMPTY identity database. Never upsert an existing
// account or import a customer/subscription from another commercial product.
config({ path: process.env.INFRA_ENV_FILE || '../../.env', override: false, quiet: true });
let primary, catalog;
try {
  if (process.env.INFRA_COMMERCIAL !== 'true'
    || new URL(process.env.DATABASE_URL).pathname !== '/u528277311_infra_auth'
    || new URL(process.env.INFRA_DATABASE_URL).pathname !== '/u528277311_infra_live') throw new Error('Target is not an isolated Infraestrutura database.');
  const directory = resolve(process.argv[2] || '');
  const manifest = JSON.parse(await readFile(resolve(directory, 'manifest.json'), 'utf8'));
  const bytes = await readFile(resolve(directory, 'identity.json'));
  if (createHash('sha256').update(bytes).digest('hex') !== manifest.files['identity.json'].sha256) throw new Error('Identity checksum mismatch.');
  const data = JSON.parse(bytes);
  const require = createRequire(import.meta.url);
  const { PrismaService } = require('../dist/prisma/prisma.service.js');
  primary = new PrismaService(); catalog = connectInfra();
  if (await primary.user.count() || await primary.tenant.count() || await primary.orcaproSubscription.count()) throw new Error('Identity target is not empty. No account was replaced.');
  const profiles = await catalog.query('SELECT external_user_id,tenant_id,status,deleted_at FROM InfraUser');
  if (profiles.length !== data.memberships.length || data.users.length !== manifest.identities) throw new Error('Identity closure mismatch.');
  for (const profile of profiles) if (!data.users.some(u => u.id === profile.external_user_id) || !data.memberships.some(m => m.userId === profile.external_user_id && m.tenantId === profile.tenant_id)) throw new Error('Missing linked identity.');
  await primary.$transaction(async db => {
    for (const original of data.tenants) {
      const tenant = { ...original, stripeCustomerId: null };
      if (tenant.settings == null) delete tenant.settings;
      await db.tenant.create({ data: tenant });
    }
    for (const user of data.users) await db.user.create({ data: user });
    for (const membership of data.memberships) await db.tenantMembership.create({ data: { ...membership, maintenanceAccess: false, sessionVersion: membership.sessionVersion + 1 } });
    for (const user of data.users) {
      const profile = profiles.find(p => p.external_user_id === user.id);
      await db.orcaproUserAccess.create({ data: { userId: user.id, managed: true, enabled: profile.status === 'ACTIVE' && !profile.deleted_at, updatedByUserId: user.id } });
      await db.orcaproSubscription.create({ data: { userId: user.id, tenantId: profile.tenant_id, status: 'MANUAL_CONTRACT', billingSource: 'MANUAL' } });
    }
  }, { timeout: 60000 });
  // No password, personal profile, token, or external payment ID is logged.
  console.log(JSON.stringify({ importedUsers: data.users.length, memberships: data.memberships.length, manualLicences: data.users.length, externalBillingCopied: false }));
} catch (error) {
  console.error(safeFailure(error, 'Infraestrutura identity import failed; do not restore over another database.'));
  process.exitCode = 1;
} finally {
  if (catalog) await catalog.end();
  if (primary) await primary.$disconnect();
}
