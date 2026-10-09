/** Isolated runtime verification fixture. Never run against a production database. */
import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { createDatabase } from '../src/server/db/database.js';
import { migrate } from '../src/server/db/migrate.js';
import { seedCatalog } from '../src/server/db/seed.js';
import { FoundationService } from '../src/server/domain/service.js';
import { hashPassword } from '../src/server/security/crypto.js';
if (process.env.NODE_ENV === 'production' || process.env.DATABASE_URL) throw new Error('Verification fixtures require an isolated local database.');
const db = await createDatabase({ dataDir: './artifacts/runtime-db' });
const password = 'Browser-check-only-2026!';
try {
  await migrate(db); await seedCatalog(db);
  const ids = { core: randomUUID(), staff: randomUUID(), client: randomUUID() };
  await db.transaction({ core: true }, async tx => {
    for (const [id, email, role, name] of [[ids.core, 'verify-core@azuriya.local', 'super_admin', 'Verification Core'], [ids.staff, 'verify-owner@azuriya.local', null, 'Verification Owner'], [ids.client, 'verify-client@azuriya.local', null, 'Verification Client']]) {
      await tx.query('INSERT INTO users(id,email,password_hash,display_name,core_role) VALUES($1,$2,$3,$4,$5)', [id, email, await hashPassword(password), name, role]);
    }
  });
  const service = new FoundationService(db);
  const actor = { userId: ids.core, core: true, requestId: `verification_${randomUUID()}` };
  await service.createOrganization(actor, { name: 'Verification Capital', slug: 'verification-capital', business_type: 'hybrid', brand_name: 'Verification Capital', environment_name: 'Acceptance sandbox', environment_kind: 'sandbox', products: ['brokerage-crm', 'prop-crm', 'trading-hub'], plan: 'foundation', owner_email: 'verify-owner@azuriya.local' });
  await db.transaction({ core: true }, async tx => {
    const instances = (await tx.query<{ id: string; organization_id: string }>('SELECT id,organization_id FROM product_instances')).rows;
    for (const instance of instances) await tx.query('INSERT INTO client_memberships(id,user_id,organization_id,product_instance_id) VALUES($1,$2,$3,$4)', [randomUUID(), ids.client, instance.organization_id, instance.id]);
  });
  process.stdout.write('Isolated verification database prepared.\n');
} finally { await db.close(); }
