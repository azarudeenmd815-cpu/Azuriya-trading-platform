import { randomUUID } from 'node:crypto';
import type { Actor, Row } from '../../shared/types.js';
import type { Database } from '../db/database.js';
import { AppError } from '../domain/errors.js';
import { hashPassword } from './crypto.js';

export class IdentityService {
  constructor(private db: Database) {}
  async createUser(actor: Actor, input: { email: string; password: string; display_name: string; core_role?: 'super_admin' }): Promise<Row> {
    if (!actor.core) throw new AppError(403, 'CORE_ACCESS_REQUIRED', 'Core administration is required.');
    const id = randomUUID();
    const hash = await hashPassword(input.password);
    return this.db.transaction({ core: true }, async tx => {
      const { rows } = await tx.query<Row>('INSERT INTO users(id,email,password_hash,display_name,core_role) VALUES($1,$2,$3,$4,$5) RETURNING id,email,display_name,core_role,status,created_at', [id, input.email.toLowerCase(), hash, input.display_name, input.core_role ?? null]);
      await tx.query('INSERT INTO audit_events(id,actor_id,action,resource_type,resource_id,request_id,metadata) VALUES($1,$2,$3,$4,$5,$6,$7)', [randomUUID(), actor.userId, 'user.created', 'user', id, actor.requestId, JSON.stringify({ core_staff: Boolean(input.core_role) })]);
      await tx.query('INSERT INTO outbox_events(id,event_type,payload) VALUES($1,$2,$3)', [randomUUID(), 'user.created', JSON.stringify({ user_id: id })]);
      return rows[0];
    });
  }
  async assignClient(actor: Actor, input: { user_id: string; product_instance_id: string }): Promise<Row> {
    if (!actor.core) throw new AppError(403, 'CORE_ACCESS_REQUIRED', 'Core administration is required.');
    return this.db.transaction({ core: true }, async tx => {
      const instance = (await tx.query<{ organization_id: string; brand_id: string; environment_id: string }>('SELECT organization_id,brand_id,environment_id FROM product_instances WHERE id=$1 AND status=$2', [input.product_instance_id, 'active'])).rows[0];
      if (!instance) throw new AppError(404, 'INSTANCE_NOT_FOUND', 'Product instance does not exist.');
      const user = (await tx.query<{ id: string; core_role: string | null }>('SELECT id,core_role FROM users WHERE id=$1 AND status=$2', [input.user_id, 'active'])).rows[0];
      if (!user) throw new AppError(404, 'USER_NOT_FOUND', 'User does not exist.');
      if (user.core_role) throw new AppError(403, 'SEPARATE_CLIENT_IDENTITY_REQUIRED', 'Core staff accounts cannot be assigned customer access. Use a separate customer identity.');
      const id = randomUUID();
      const { rows } = await tx.query<Row>('INSERT INTO client_memberships(id,organization_id,user_id,product_instance_id) VALUES($1,$2,$3,$4) RETURNING id,organization_id,user_id,product_instance_id,status', [id, instance.organization_id, input.user_id, input.product_instance_id]);
      await tx.query('INSERT INTO audit_events(id,organization_id,brand_id,environment_id,product_instance_id,actor_id,action,resource_type,resource_id,request_id,metadata) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)', [randomUUID(), instance.organization_id, instance.brand_id, instance.environment_id, input.product_instance_id, actor.userId, 'client_membership.created', 'client_membership', id, actor.requestId, JSON.stringify({ user_id: input.user_id })]);
      return rows[0];
    });
  }
  async assignStaff(actor: Actor, input: { user_id: string; product_instance_id: string; role_id: string }): Promise<Row> {
    if (!actor.core) throw new AppError(403, 'CORE_ACCESS_REQUIRED', 'Core administration is required.');
    return this.db.transaction({ core: true }, async tx => {
      const instance = (await tx.query<{ organization_id: string; brand_id: string; environment_id: string }>(`SELECT i.organization_id,i.brand_id,i.environment_id FROM product_instances i JOIN organizations o ON o.id=i.organization_id JOIN brands b ON b.id=i.brand_id JOIN environments e ON e.id=i.environment_id JOIN products p ON p.id=i.product_id JOIN product_subscriptions s ON s.id=i.subscription_id WHERE i.id=$1 AND i.status='active' AND o.status='active' AND b.status='active' AND e.status='active' AND p.status='active' AND s.status='active'`, [input.product_instance_id])).rows[0];
      if (!instance) throw new AppError(422, 'INSTANCE_UNAVAILABLE', 'Assign staff to an active product instance.');
      const user = (await tx.query<{ id: string; core_role: string | null }>("SELECT id,core_role FROM users WHERE id=$1 AND status='active'", [input.user_id])).rows[0];
      if (!user) throw new AppError(422, 'USER_NOT_FOUND', 'Staff must be an existing active user.');
      if (user.core_role) throw new AppError(403, 'SEPARATE_STAFF_IDENTITY_REQUIRED', 'Core staff accounts cannot be assigned business access. Use a separate business identity.');
      const role = (await tx.query<{ id: string }>('SELECT id FROM roles WHERE id=$1 AND organization_id=$2', [input.role_id, instance.organization_id])).rows[0];
      if (!role) throw new AppError(422, 'SCOPE_MISMATCH', 'Assign a role owned by this product instance organization.');
      const id = randomUUID();
      const { rows } = await tx.query<Row>('INSERT INTO staff_memberships(id,organization_id,user_id,role_id,environment_id,product_instance_id) VALUES($1,$2,$3,$4,$5,$6) RETURNING id,organization_id,user_id,role_id,environment_id,product_instance_id,status,created_at', [id, instance.organization_id, input.user_id, input.role_id, instance.environment_id, input.product_instance_id]);
      await tx.query('INSERT INTO audit_events(id,organization_id,brand_id,environment_id,product_instance_id,actor_id,action,resource_type,resource_id,request_id,metadata) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb)', [randomUUID(), instance.organization_id, instance.brand_id, instance.environment_id, input.product_instance_id, actor.userId, 'staff.added', 'staff_memberships', id, actor.requestId, JSON.stringify({ user_id: input.user_id, role_id: input.role_id })]);
      await tx.query('INSERT INTO outbox_events(id,organization_id,event_type,payload) VALUES($1,$2,$3,$4::jsonb)', [randomUUID(), instance.organization_id, 'staff.added', JSON.stringify({ resource_type: 'staff_memberships', resource_id: id, request_id: actor.requestId })]);
      return rows[0];
    });
  }
}
