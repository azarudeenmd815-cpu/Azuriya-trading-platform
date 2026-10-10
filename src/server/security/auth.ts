import { randomUUID, timingSafeEqual } from 'node:crypto';
import type { FastifyReply, FastifyRequest } from 'fastify';
import type { Database } from '../db/database.js';
import { AppError } from '../domain/errors.js';
import { hashPassword, hashSecret, newSecret, verifyPassword } from './crypto.js';
import { MfaService } from './mfa.js';

export interface UserRecord { id: string; email: string; display_name: string; core_role: string | null; status: string; password_hash: string; mfa_required: boolean }
export interface ApiPrincipal { id: string; organization_id: string; brand_id: string; environment_id: string; product_instance_id: string; product_slug?: string; scopes: string[]; created_by: string }
export interface Principal { user: Omit<UserRecord, 'password_hash'>; kind: 'session' | 'api'; key?: ApiPrincipal; sessionId?: string }
export class Auth {
  private cache = new WeakMap<FastifyRequest, Principal>();
  private dummyHash: Promise<string> = hashPassword(newSecret());
  readonly mfa: MfaService;
  constructor(private db: Database, private production: boolean, private origin: string, private requireCoreMfa = production) { this.mfa = new MfaService(db); }
  async mfaRequired(user: Omit<UserRecord, 'password_hash'>): Promise<boolean> {
    if (user.mfa_required || (this.requireCoreMfa && user.core_role)) return true;
    return this.db.transaction({ core: true }, async tx => Boolean((await tx.query(`SELECT sp.product_instance_id FROM security_policies sp JOIN staff_memberships m ON m.organization_id=sp.organization_id JOIN product_instances i ON i.id=sp.product_instance_id WHERE m.user_id=$1 AND m.status='active' AND i.status='active' AND(m.environment_id IS NULL OR m.environment_id=sp.environment_id) AND(m.product_instance_id IS NULL OR m.product_instance_id=sp.product_instance_id) AND(sp.require_staff_mfa OR sp.role_ids ? m.role_id::text OR sp.user_ids ? m.user_id::text) LIMIT 1`, [user.id])).rows[0]));
  }

  async login(request: FastifyRequest, reply: FastifyReply, email: string, password: string) {
    this.validateOrigin(request);
    const { rows } = await this.db.query<UserRecord>('SELECT id,email,display_name,core_role,status,password_hash,mfa_required FROM users WHERE email=$1', [email]);
    const user = rows[0];
    const valid = await verifyPassword(password, user?.password_hash ?? await this.dummyHash);
    if (!user || !valid || user.status !== 'active') throw new AppError(401, 'INVALID_CREDENTIALS', 'Email or password is incorrect.');
    const enrolled = await this.mfa.enrolled(user.id);
    if (enrolled || await this.mfaRequired(user)) {
      const challenge = process.env.SECRET_ENCRYPTION_KEY ? await this.mfa.challenge(user.id, request.hostname, enrolled ? 'login' : 'enroll') : { enrollment_required: true, provider_unavailable: true };
      throw new AppError(403, 'MFA_REQUIRED', 'Complete MFA verification or enrollment to sign in.', [challenge]);
    }
    return this.createSession(request, reply, user);
  }
  async createSession(request: FastifyRequest, reply: FastifyReply, user: UserRecord, mfaVerified = false) {
    if (user.status !== 'active') throw new AppError(401, 'INVALID_CREDENTIALS', 'The identity is unavailable.');
    const token = newSecret();
    const csrf = newSecret();
    const id = randomUUID();
    await this.db.transaction({ core: true }, async tx => {
      await tx.query('DELETE FROM sessions WHERE user_id=$1 AND expires_at < now()', [user.id]);
      await tx.query('INSERT INTO sessions(id,user_id,token_hash,csrf_hash,expires_at,origin_host,mfa_verified_at) VALUES($1,$2,$3,$4,$5,$6,$7)', [id, user.id, hashSecret(token), hashSecret(csrf), new Date(Date.now() + 8 * 3600_000).toISOString(), request.hostname, mfaVerified ? new Date().toISOString() : null]);
      await tx.query('INSERT INTO audit_events(id,actor_id,action,resource_type,resource_id,request_id,metadata) VALUES($1,$2,$3,$4,$5,$6,$7)', [randomUUID(), user.id, 'session.created', 'session', id, request.id, JSON.stringify({})]);
    });
    const options = { path: '/', httpOnly: true, sameSite: 'strict' as const, secure: this.production, maxAge: 8 * 3600 };
    reply.setCookie('azuriya_session', token, options).setCookie('azuriya_csrf', csrf, options);
    reply.header('Cache-Control', 'no-store');
    return { data: { user: this.safeUser(user), csrf_token: csrf } };
  }
  async authenticate(request: FastifyRequest): Promise<Principal> {
    const existing = this.cache.get(request);
    if (existing) return existing;
    const authorization = request.headers.authorization;
    let principal: Principal;
    if (authorization) {
      if (!/^Bearer az[ks]_[A-Za-z0-9_-]{40,}$/.test(authorization)) throw new AppError(401, 'UNAUTHENTICATED', 'A valid API credential is required.');
      const secret = authorization.slice(7);
      const serviceAccount = secret.startsWith('azs_');
      const table = serviceAccount ? 'service_accounts' : 'api_keys';
      const key = await this.db.transaction({ core: true }, async tx => {
        const result = await tx.query<ApiPrincipal>(`SELECT k.id,k.organization_id,k.brand_id,k.environment_id,k.product_instance_id,p.slug AS product_slug,k.scopes,k.created_by FROM ${table} k JOIN users u ON u.id=k.created_by JOIN organizations o ON o.id=k.organization_id JOIN product_instances i ON i.id=k.product_instance_id JOIN brands b ON b.id=i.brand_id JOIN environments e ON e.id=i.environment_id JOIN products p ON p.id=i.product_id JOIN product_subscriptions s ON s.id=i.subscription_id LEFT JOIN api_applications a ON a.id=k.application_id AND a.organization_id=k.organization_id WHERE k.secret_hash=$1 AND k.revoked_at IS NULL AND (k.expires_at IS NULL OR k.expires_at>now()) AND u.status='active' AND u.core_role IS NULL AND o.status='active' AND b.status='active' AND e.status='active' AND p.status='active' AND i.status='active' AND s.status='active' ${serviceAccount ? "AND k.status='active'" : ''} AND(k.application_id IS NULL OR(a.status='active' AND a.brand_id=k.brand_id AND a.environment_id=k.environment_id AND a.product_instance_id=k.product_instance_id AND a.scopes @> k.scopes))`, [hashSecret(secret)]);
        if (result.rows[0]) await tx.query(`UPDATE ${table} SET last_used_at=now() WHERE id=$1`, [result.rows[0].id]);
        return result.rows[0];
      });
      if (!key) throw new AppError(401, 'UNAUTHENTICATED', 'API credential is invalid, expired, or revoked.');
      const users = await this.db.query<UserRecord>('SELECT id,email,display_name,core_role,status,mfa_required FROM users WHERE id=$1', [key.created_by]);
      principal = { kind: 'api', user: this.safeUser(users.rows[0]), key };
    } else {
      const token = request.cookies.azuriya_session;
      if (!token) throw new AppError(401, 'UNAUTHENTICATED', 'Sign in to continue.');
      const { rows } = await this.db.query<UserRecord & { session_id: string; mfa_verified_at: string | null }>(`SELECT u.id,u.email,u.display_name,u.core_role,u.status,u.mfa_required,s.id as session_id,s.mfa_verified_at FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=$1 AND s.origin_host=$2 AND s.expires_at>now() AND u.status='active'`, [hashSecret(token), request.hostname]);
      if (!rows[0]) throw new AppError(401, 'UNAUTHENTICATED', 'Session has expired. Sign in again.');
      if (!rows[0].mfa_verified_at && (await this.mfaRequired(rows[0]) || await this.mfa.enrolled(rows[0].id))) {
        await this.db.query('DELETE FROM sessions WHERE id=$1', [rows[0].session_id]);
        throw new AppError(403, 'MFA_REQUIRED', 'This account requires an MFA provider before the session can continue.');
      }
      principal = { kind: 'session', user: this.safeUser(rows[0]), sessionId: rows[0].session_id };
      await this.db.query('UPDATE sessions SET last_seen_at=now() WHERE id=$1', [principal.sessionId]);
    }
    this.cache.set(request, principal);
    return principal;
  }
  async mutation(request: FastifyRequest): Promise<Principal> {
    const principal = await this.authenticate(request);
    if (principal.kind === 'api') return principal;
    this.validateOrigin(request);
    const csrf = request.headers['x-csrf-token'];
    const { rows } = await this.db.query<{ csrf_hash: string }>('SELECT csrf_hash FROM sessions WHERE id=$1', [principal.sessionId]);
    if (typeof csrf !== 'string' || !rows[0] || !timingSafeEqual(Buffer.from(hashSecret(csrf)), Buffer.from(rows[0].csrf_hash))) throw new AppError(403, 'CSRF_INVALID', 'A valid request token is required. Refresh and try again.');
    return principal;
  }
  async logout(request: FastifyRequest, reply: FastifyReply) {
    const principal = await this.mutation(request);
    if (principal.kind !== 'session') throw new AppError(403, 'SESSION_REQUIRED', 'This action requires a signed-in user.');
    await this.db.query('DELETE FROM sessions WHERE id=$1', [principal.sessionId]);
    reply.clearCookie('azuriya_session', { path: '/' }).clearCookie('azuriya_csrf', { path: '/' });
    return { data: { signed_out: true } };
  }
  validateOrigin(request: FastifyRequest) {
    const origin = request.headers.origin;
    if (origin && origin !== (request.trustedOrigin ?? this.origin)) throw new AppError(403, 'ORIGIN_FORBIDDEN', 'This origin is not authorized.');
    if (request.headers['sec-fetch-site'] === 'cross-site') throw new AppError(403, 'ORIGIN_FORBIDDEN', 'Cross-site mutations are not authorized.');
  }
  safeUser(user: Omit<UserRecord, 'password_hash'>): Omit<UserRecord, 'password_hash'> {
    return { id: user.id, email: user.email, display_name: user.display_name, core_role: user.core_role, status: user.status, mfa_required: user.mfa_required };
  }
}
