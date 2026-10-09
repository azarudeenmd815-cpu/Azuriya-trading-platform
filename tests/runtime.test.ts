import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { buildApp } from '../src/server/app.js';
import { createDatabase } from '../src/server/db/database.js';

it('serves the built SPA fallback while preserving API and health errors', async () => {
  const webRoot = await mkdtemp(join(tmpdir(), 'azuriya-static-'));
  const db = await createDatabase();
  await writeFile(join(webRoot, 'index.html'), '<!doctype html><title>Azuriya runtime regression</title>');
  const app = await buildApp({ db, origin: 'http://localhost', production: false, webRoot });
  try {
    await app.ready();
    for (const url of ['/login', '/core/organizations', '/portal/assigned/profile']) {
      const response = await app.inject(url);
      expect(response.statusCode).toBe(200);
      expect(response.headers['content-type']).toContain('text/html');
      expect(response.body).toContain('Azuriya runtime regression');
    }
    for (const url of ['/api/v1/missing', '/health/missing']) {
      const response = await app.inject(url);
      expect(response.statusCode).toBe(404);
      expect(response.json().error.code).toBe('NOT_FOUND');
    }
    expect((await app.inject({ method: 'POST', url: '/missing' })).statusCode).toBe(404);
  } finally { await app.close(); await db.close(); await rm(webRoot, { recursive: true, force: true }); }
});
