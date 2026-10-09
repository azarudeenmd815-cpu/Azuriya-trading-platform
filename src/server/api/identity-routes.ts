import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { Database } from '../db/database.js';
import type { Auth, UserRecord } from '../security/auth.js';
import { verifyPassword } from '../security/crypto.js';
import { AppError } from '../domain/errors.js';
const token = z.string().regex(/^[A-Za-z0-9_-]{43}$/); const code = z.string().min(6).max(24);
export function registerIdentityRoutes(app: FastifyInstance, db: Database, auth: Auth, requireCoreMfa: boolean) {
  app.post('/api/v1/auth/mfa/setup', async request => { auth.validateOrigin(request); const input = z.object({ challenge_token: token }).strict().parse(request.body); return { data: await auth.mfa.setup(input.challenge_token, request.hostname) }; });
  app.post('/api/v1/auth/mfa/verify', async (request, reply) => {
    auth.validateOrigin(request); const input = z.object({ challenge_token: token, code }).strict().parse(request.body);
    const result = await auth.mfa.verifyChallenge(input.challenge_token, request.hostname, input.code, request.id);
    const user = (await db.query<UserRecord>('SELECT * FROM users WHERE id=$1', [result.userId])).rows[0];
    const session = await auth.createSession(request, reply, user, true);
    return { data: { ...session.data, recovery_codes: result.recovery_codes } };
  });
  app.get('/api/v1/auth/security', async request => { const principal = await auth.authenticate(request); if (principal.kind !== 'session') throw new AppError(403, 'SESSION_REQUIRED', 'Use a user session.'); return { data: { mfa_enabled: await auth.mfa.enrolled(principal.user.id), mfa_required: await auth.mfaRequired(principal.user) } }; });
  app.post('/api/v1/auth/mfa/enroll', async request => {
    const principal = await auth.mutation(request); const input = z.object({ password: z.string().max(256) }).strict().parse(request.body);
    if (principal.kind !== 'session') throw new AppError(403, 'SESSION_REQUIRED', 'Use a user session.');
    const user = (await db.query<UserRecord>('SELECT * FROM users WHERE id=$1', [principal.user.id])).rows[0];
    if (!await verifyPassword(input.password, user.password_hash)) throw new AppError(401, 'REAUTHENTICATION_FAILED', 'The current password is incorrect.');
    if (await auth.mfa.enrolled(user.id)) throw new AppError(409, 'MFA_ALREADY_ENABLED', 'MFA is already enabled.');
    return { data: await auth.mfa.challenge(user.id, request.hostname, 'enroll') };
  });
  for (const action of ['disable', 'recovery'] as const) app.post(`/api/v1/auth/mfa/${action}`, async request => {
    const principal = await auth.mutation(request); const input = z.object({ password: z.string().max(256), code }).strict().parse(request.body);
    if (principal.kind !== 'session') throw new AppError(403, 'SESSION_REQUIRED', 'Use a user session.');
    if (action === 'disable' && (await auth.mfaRequired(principal.user) || (requireCoreMfa && principal.user.core_role))) throw new AppError(403, 'MFA_POLICY_REQUIRED', 'The active security policy requires MFA.');
    const user = (await db.query<UserRecord>('SELECT * FROM users WHERE id=$1', [principal.user.id])).rows[0];
    if (!await verifyPassword(input.password, user.password_hash)) throw new AppError(401, 'REAUTHENTICATION_FAILED', 'The current password is incorrect.');
    return { data: await auth.mfa.manage(user.id, input.code, action === 'disable', request.id) };
  });
}
