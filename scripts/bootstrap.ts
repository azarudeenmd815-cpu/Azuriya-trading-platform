import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { createDatabase } from '../src/server/db/database.js';
import { migrate } from '../src/server/db/migrate.js';
import { seedCatalog } from '../src/server/db/seed.js';
import { hashPassword } from '../src/server/security/crypto.js';
import { email as emailSchema, password as passwordSchema } from '../src/server/api/validation.js';

const email = emailSchema.parse(process.env.CORE_BOOTSTRAP_EMAIL);
const password = passwordSchema.parse(process.env.CORE_BOOTSTRAP_PASSWORD);
const db = await createDatabase({ dataDir: process.env.DATA_DIR ?? './data/azuriya', url: process.env.DATABASE_URL });
try {
  await migrate(db); await seedCatalog(db);
  const hash = await hashPassword(password);
  await db.transaction({ core: true }, async tx => {
    const existing = await tx.query('SELECT id FROM users WHERE core_role=$1', ['super_admin']);
    if (existing.rows.length) throw new Error('Core is already bootstrapped. Use authenticated staff management.');
    const id = randomUUID();
    await tx.query('INSERT INTO users(id,email,password_hash,display_name,core_role) VALUES($1,$2,$3,$4,$5)', [id, email, hash, 'Core Administrator', 'super_admin']);
    await tx.query('INSERT INTO audit_events(id,actor_id,action,resource_type,resource_id,request_id,metadata) VALUES($1,$2,$3,$4,$5,$6,$7)', [randomUUID(), id, 'core.bootstrapped', 'user', id, `bootstrap_${randomUUID()}`, JSON.stringify({ bootstrap: true })]);
  });
  process.stdout.write('Core administrator created. Sign in using the email and password you configured.\n');
} finally { await db.close(); }
