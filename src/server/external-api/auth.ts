import type { FastifyRequest } from 'fastify';
import { AppError } from '../domain/errors.js';
import type { Auth, ApiPrincipal } from '../security/auth.js';

export const EXTERNAL_SCOPES = ['accounts:read'] as const;
export type ExternalScope = typeof EXTERNAL_SCOPES[number];

export interface ExternalAuthContext extends ApiPrincipal {
  credentialId: string;
  scopes: ExternalScope[];
}

/** External routes have a separate Bearer-only boundary; cookies never authenticate them. */
export async function authenticateExternal(request: FastifyRequest, auth: Auth, required?: ExternalScope): Promise<ExternalAuthContext> {
  const authorization = request.headers.authorization;
  if (typeof authorization !== 'string' || !/^Bearer\s+azk_[A-Za-z0-9_-]{40,}$/.test(authorization)) {
    throw new AppError(401, 'UNAUTHENTICATED', 'A valid external API credential is required.');
  }
  const principal = await auth.authenticate(request);
  if (principal.kind !== 'api' || !principal.key) throw new AppError(401, 'UNAUTHENTICATED', 'A valid external API credential is required.');
  if (principal.key.product_slug !== 'brokerage-crm') throw new AppError(404, 'RESOURCE_UNAVAILABLE', 'The requested external API resource is unavailable.');
  const scopes = principal.key.scopes.filter((scope): scope is ExternalScope => (EXTERNAL_SCOPES as readonly string[]).includes(scope));
  const context = { ...principal.key, credentialId: principal.key.id, scopes };
  if (required) requireExternalScope(context, required);
  return context;
}

export function requireExternalScope(context: ExternalAuthContext, scope: ExternalScope): void {
  if (!context.scopes.includes(scope)) throw new AppError(403, 'SCOPE_REQUIRED', 'The credential does not grant the required scope.');
}
