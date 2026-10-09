import type { Database } from '../db/database.js';
import type { OutboxEvent } from '../domain/outbox-worker.js';
import { ResendEmailProvider, type EmailProvider, type InvitationEmail } from '../domain/invitations.js';
import { decryptSecret } from '../security/crypto.js';
import { AppError } from '../domain/errors.js';

export const templateVariables = ['business_name', 'client_name', 'client_number', 'event', 'status', 'support_email'] as const;
export function validateTemplate(text: string): void {
  const stripped = text.replace(/\{\{\s*([a-z_]+)\s*\}\}/g, (_match, variable: string) => {
    if (!templateVariables.includes(variable as typeof templateVariables[number])) throw new AppError(422, 'TEMPLATE_VARIABLE_INVALID', 'Choose a supported message variable.');
    return '';
  });
  if (/[{}]/.test(stripped)) throw new AppError(422, 'TEMPLATE_SYNTAX_INVALID', 'Templates support simple named variables only.');
}
export function renderTemplate(text: string, values: Record<string, string>): string {
  validateTemplate(text);
  return text.replace(/\{\{\s*([a-z_]+)\s*\}\}/g, (_match, variable: string) => (values[variable] ?? '').replace(/[\r\n]/g, ' '));
}
export function brokerageEmailHandler(db: Database, provider: EmailProvider = new ResendEmailProvider(), key = process.env.SECRET_ENCRYPTION_KEY) {
  return async (event: OutboxEvent) => {
    if (!key || typeof event.payload.encrypted_message !== 'string') throw new Error('BROKERAGE_EMAIL_UNAVAILABLE');
    const message = JSON.parse(decryptSecret(event.payload.encrypted_message, key)) as InvitationEmail & { organization_id: string; brand_id: string; environment_id: string; product_instance_id: string; user_id: string };
    if (message.organization_id !== event.organization_id) throw new Error('EMAIL_SCOPE_MISMATCH');
    const valid = await db.transaction({ organizationId: message.organization_id, brandId: message.brand_id, environmentId: message.environment_id, productInstanceId: message.product_instance_id }, async tx => (await tx.query(`SELECT c.id FROM brokerage_clients c JOIN client_memberships m ON m.user_id=c.user_id AND m.organization_id=c.organization_id AND m.product_instance_id=c.product_instance_id JOIN users u ON u.id=c.user_id JOIN product_instances i ON i.id=c.product_instance_id JOIN brands b ON b.id=c.brand_id JOIN environments e ON e.id=c.environment_id JOIN organizations o ON o.id=c.organization_id JOIN product_subscriptions s ON s.id=i.subscription_id WHERE c.organization_id=$1 AND c.brand_id=$2 AND c.environment_id=$3 AND c.product_instance_id=$4 AND c.user_id=$5 AND u.email=$6 AND m.status='active' AND u.status='active' AND i.status='active' AND b.status='active' AND e.status='active' AND o.status='active' AND s.status='active'`, [message.organization_id, message.brand_id, message.environment_id, message.product_instance_id, message.user_id, message.to])).rows[0]);
    if (valid) await provider.send(message, event.id);
  };
}
