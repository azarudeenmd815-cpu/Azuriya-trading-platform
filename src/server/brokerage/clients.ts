import { createHash, randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { Database, Executor } from '../db/database.js';
import type { Row, TenantContext } from '../../shared/types.js';
import { AppError } from '../domain/errors.js';
import { recordEvent, scopeValues, scopeWhere } from './common.js';

export const clientStatuses = ['lead','invited','registered','onboarding','kyc_pending','kyc_review','active','restricted','suspended','closed','rejected'] as const;
export type ClientStatus = typeof clientStatuses[number];
export const clientTransitions: Record<ClientStatus, readonly ClientStatus[]> = {
  lead: ['invited','registered','onboarding','rejected','closed'], invited: ['registered','onboarding','rejected','closed'],
  registered: ['onboarding','restricted','closed'], onboarding: ['kyc_pending','active','restricted','rejected','closed'],
  kyc_pending: ['kyc_review','active','onboarding','rejected','closed'], kyc_review: ['active','onboarding','restricted','rejected','closed'],
  active: ['restricted','suspended','closed'], restricted: ['active','onboarding','suspended','closed'],
  suspended: ['active','restricted','closed'], rejected: ['onboarding','closed'], closed: [],
};
const name = z.string().trim().min(1).max(200);
const country = z.string().regex(/^[A-Z]{2}$/);
const email = z.email().max(320).transform(value => value.trim().toLowerCase());
const date = z.iso.date().refine(value => value <= new Date().toISOString().slice(0,10), 'Birth date cannot be in the future.');
const profileFields = { full_name: name.optional(), country: country.nullable().optional(), residence_country: country.nullable().optional(), birth_date: date.nullable().optional(), client_type: z.enum(['individual','corporate']).optional(), preferred_currency: z.string().regex(/^[A-Z]{3}$/).optional() };
export const clientCreateSchema = z.object({ ...profileFields, full_name: name, email, source: z.string().trim().min(1).max(120).optional(), referral_source: z.string().trim().max(200).nullable().optional(), assigned_staff_id: z.uuid().nullable().optional() }).strict();
export const clientPatchSchema = z.object({ ...profileFields, email: email.optional(), source: z.string().trim().min(1).max(120).optional(), risk_level: z.enum(['low','normal','high']).optional(), assigned_staff_id: z.uuid().nullable().optional() }).strict().refine(value => Object.keys(value).length>0, 'Provide a profile change.');
export const profileSchema = z.object(profileFields).strict().refine(value => Object.keys(value).length>0, 'Provide a profile change.');
export const clientListSchema = z.object({ search: z.string().trim().max(200).optional(), status: z.enum(clientStatuses).optional(), kyc_status: z.enum(['not_started','required','submitted','in_review','additional_information','approved','rejected','expired']).optional(), country: country.optional(), client_type: z.enum(['individual','corporate']).optional(), assigned_staff_id: z.uuid().optional(), source: z.string().max(120).optional(), tag_id: z.uuid().optional(), registered_from: z.iso.datetime().optional(), registered_to: z.iso.datetime().optional(), limit: z.coerce.number().int().min(1).max(100).default(25), offset: z.coerce.number().int().min(0).max(1000000).default(0), sort: z.enum(['created_at','full_name','client_number','status']).default('created_at'), direction: z.enum(['asc','desc']).default('desc') }).strict();
export const pageSchema = z.object({ limit: z.coerce.number().int().min(1).max(100).default(25), offset: z.coerce.number().int().min(0).max(1000000).default(0) }).strict();
export const tagSchema = z.object({ name: z.string().trim().min(1).max(80), color: z.string().regex(/^#[a-f0-9]{6}$/i).optional() }).strict();
export const tagPatchSchema = tagSchema.partial().extend({ archived: z.boolean().optional() }).strict().refine(value => Object.keys(value).length>0);
export const noteSchema = z.object({ text: z.string().trim().min(1).max(10000), category: z.string().trim().min(1).max(60).optional(), visibility: z.enum(['staff','private']).optional(), pinned: z.boolean().optional() }).strict();
export const notePatchSchema = noteSchema.partial().strict().refine(value => Object.keys(value).length>0);
export const assignmentRoles = ['account_manager','compliance_reviewer','support_owner'] as const;
export const taskSchema = z.object({ client_id: z.uuid().nullable().optional(), owner_id: z.uuid().nullable().optional(), title: name, notes: z.string().max(5000).optional(), due_at: z.iso.datetime().nullable().optional(), priority: z.enum(['low','normal','high','urgent']).optional() }).strict();
export const taskPatchSchema = taskSchema.omit({ client_id: true }).partial().extend({ status: z.enum(['open','in_progress','completed','cancelled']).optional() }).strict().refine(value => Object.keys(value).length>0);
export const taskListSchema = pageSchema.extend({ status: z.enum(['open','in_progress','completed','cancelled']).optional(), client_id: z.uuid().optional(), owner_id: z.uuid().optional(), search: z.string().trim().max(200).optional(), sort: z.enum(['created_at','due_at','title','status']).default('due_at'), direction: z.enum(['asc','desc']).default('asc') }).strict();
const distinct = <T extends z.ZodType>(item: T, max: number) => z.array(item).max(max).refine(values => new Set(values).size===values.length, 'Duplicate values are not allowed.');
export const settingsSchema = z.object({ allowed_countries: distinct(country,250).optional(), restricted_countries: distinct(country,250).optional(), allowed_client_types: distinct(z.enum(['individual','corporate']),2).min(1).optional(), minimum_age: z.number().int().min(0).max(100).optional(), require_kyc: z.boolean().optional(), allow_account_requests: z.boolean().optional(), onboarding_steps: distinct(z.enum(['identity','terms','profile','verification','eligibility']),5).min(1).optional() }).strict().refine(value => Object.keys(value).length>0);
export const documentSchema = z.object({ document_type: z.enum(['terms','privacy','disclosure']), version: z.string().trim().min(1).max(80), title: name, content: z.string().min(1).max(100000).refine(value => value.trim().length>0), required: z.boolean().optional(), active: z.boolean().optional() }).strict();
export const documentPatchSchema = z.object({ active: z.boolean().optional(), required: z.boolean().optional() }).strict().refine(value => Object.keys(value).length>0);
export const consentSchema = z.object({ document_id: z.uuid(), document_hash: z.string().regex(/^[a-f0-9]{64}$/) }).strict();
type Settings = { allowed_countries: string[]; restricted_countries: string[]; allowed_client_types: string[]; minimum_age: number; require_kyc: boolean; allow_account_requests: boolean; onboarding_steps: string[] };
export const defaultBrokerageSettings: Settings = { allowed_countries: [], restricted_countries: [], allowed_client_types: ['individual','corporate'], minimum_age: 18, require_kyc: true, allow_account_requests: true, onboarding_steps: ['identity','terms','profile','verification','eligibility'] };
export function eligibleClient(client: Record<string, unknown>, settings: Pick<Settings,'allowed_countries'|'restricted_countries'|'allowed_client_types'|'minimum_age'|'require_kyc'>, consentsComplete = true, now = new Date()) {
  const reasons: string[] = []; const residence = String(client.residence_country || client.country || '');
  if (!residence) reasons.push('country_required');
  else if (settings.restricted_countries.includes(residence) || (settings.allowed_countries.length && !settings.allowed_countries.includes(residence))) reasons.push('country_restricted');
  if (!settings.allowed_client_types.includes(String(client.client_type))) reasons.push('client_type_restricted');
  if (settings.minimum_age>0 && client.client_type!=='corporate') {
    if (!client.birth_date) reasons.push('birth_date_required');
    else { const birth = new Date(String(client.birth_date)); let age = now.getUTCFullYear()-birth.getUTCFullYear(); if (now.getUTCMonth()<birth.getUTCMonth() || (now.getUTCMonth()===birth.getUTCMonth() && now.getUTCDate()<birth.getUTCDate())) age--; if (!Number.isFinite(birth.getTime()) || age<settings.minimum_age) reasons.push('minimum_age'); }
  }
  if (settings.require_kyc && client.kyc_status!=='approved') reasons.push('kyc_required');
  if (['restricted','suspended','closed','rejected'].includes(String(client.status))) reasons.push('client_restricted');
  if (!consentsComplete) reasons.push('consent_required');
  return { eligible: reasons.length===0, reasons };
}
function publicProfile(client: Row | null): Row | null {
  if (!client) return null;
  const fields = ['id','client_number','full_name','email','user_id','status','onboarding_status','country','residence_country','birth_date','client_type','preferred_currency','kyc_status','created_at','updated_at','activated_at','closed_at'];
  return Object.fromEntries(fields.map(field => [field,client[field]])) as Row;
}
function conflict(error: unknown, code: string, message: string): never { if ((error as { code?: string }).code==='23505') throw new AppError(409,code,message); throw error; }
export class BrokerageClientsService {
  constructor(private db: Database) {}
  private async find(tx: Executor, scope: TenantContext, id: string, lock = false): Promise<Row> {
    const client = (await tx.query<Row>(`SELECT *,birth_date::text AS birth_date FROM brokerage_clients WHERE ${scopeWhere()} AND id=$5${lock ? ' FOR UPDATE' : ''}`, [...scopeValues(scope),id])).rows[0];
    if (!client) throw new AppError(404,'NOT_FOUND','The client was not found in this workspace.'); return client;
  }
  private async staff(tx: Executor, scope: TenantContext, staffId: string | null | undefined) {
    if (!staffId) return;
    const member = (await tx.query(`SELECT m.id FROM staff_memberships m JOIN users u ON u.id=m.user_id WHERE m.organization_id=$1 AND m.user_id=$2 AND m.status='active' AND u.status='active' AND u.core_role IS NULL AND (m.environment_id IS NULL OR m.environment_id=$3) AND (m.product_instance_id IS NULL OR m.product_instance_id=$4) LIMIT 1`, [scope.organizationId,staffId,scope.environmentId,scope.productInstanceId])).rows[0];
    if (!member) throw new AppError(422,'STAFF_SCOPE_MISMATCH','Select an active staff member authorized for this workspace.');
  }
  private async patch(tx: Executor, scope: TenantContext, table: string, id: string, input: Record<string, unknown>, extras = ''): Promise<Row> {
    const entries = Object.entries(input).filter(([,value]) => value!==undefined);
    if (!entries.length && !extras) throw new AppError(422,'EMPTY_UPDATE','Provide a change.');
    const assignments = entries.map(([key], index) => `${key}=$${index+6}`);
    const result = await tx.query<Row>(`UPDATE ${table} SET ${[...assignments,'updated_at=now()',...(extras ? [extras] : [])].join(',')} WHERE ${scopeWhere()} AND id=$5 RETURNING ${table==='brokerage_clients' ? '*,birth_date::text AS birth_date' : '*'}`, [...scopeValues(scope),id,...entries.map(([,value]) => value)]);
    if (!result.rows[0]) throw new AppError(404,'NOT_FOUND','The record was not found in this workspace.'); return result.rows[0];
  }
  async create(scope: TenantContext, raw: z.input<typeof clientCreateSchema>): Promise<Row> {
    const input = clientCreateSchema.parse(raw);
    try { return await this.db.transaction(scope, async tx => {
      await this.staff(tx,scope,input.assigned_staff_id);
      const id = randomUUID(); const number = `CLI-${randomUUID().replaceAll('-','').slice(0,12).toUpperCase()}`;
      const client = (await tx.query<Row>('INSERT INTO brokerage_clients(id,organization_id,brand_id,environment_id,product_instance_id,client_number,full_name,email,country,residence_country,birth_date,client_type,preferred_currency,source,referral_source,assigned_staff_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16) RETURNING *,birth_date::text AS birth_date', [id,...scopeValues(scope),number,input.full_name,input.email,input.country ?? null,input.residence_country ?? null,input.birth_date ?? null,input.client_type ?? 'individual',input.preferred_currency ?? 'USD',input.source ?? 'manual',input.referral_source ?? null,input.assigned_staff_id ?? null])).rows[0];
      if (input.assigned_staff_id) {
        await this.assignment(tx,scope,id,'account_manager',input.assigned_staff_id);
        await recordEvent(tx,scope,'brokerage.client.assignment_changed','brokerage_client',id,{ role: 'account_manager',staff_id: input.assigned_staff_id });
      }
      await recordEvent(tx,scope,'brokerage.client.created','brokerage_client',id,{ status: 'lead' }); return client;
    }); } catch (error) { conflict(error,'CLIENT_EXISTS','A client with this email already exists in this workspace.'); }
  }
  async list(scope: TenantContext, raw: z.input<typeof clientListSchema> = {}) {
    const query = clientListSchema.parse(raw);
    return this.db.transaction(scope, async tx => {
      const values: unknown[] = [...scopeValues(scope)]; const conditions = [scopeWhere('c')];
      const add = (sql: string, value: unknown) => { values.push(value); conditions.push(sql.replaceAll('?',`$${values.length}`)); };
      if (query.search) add(`(c.id::text ILIKE ? OR c.client_number ILIKE ? OR c.full_name ILIKE ? OR c.email ILIKE ? OR EXISTS(SELECT 1 FROM brokerage_accounts a WHERE a.organization_id=c.organization_id AND a.brand_id=c.brand_id AND a.environment_id=c.environment_id AND a.product_instance_id=c.product_instance_id AND a.client_id=c.id AND (a.external_login ILIKE ? OR a.account_number ILIKE ?)))`,`%${query.search.replace(/[\\%_]/g, '\\$&')}%`);
      for (const field of ['status','kyc_status','country','client_type','assigned_staff_id','source'] as const) if (query[field]) add(`c.${field}=?`,query[field]);
      if (query.tag_id) add('EXISTS(SELECT 1 FROM brokerage_client_tags t WHERE t.organization_id=c.organization_id AND t.brand_id=c.brand_id AND t.environment_id=c.environment_id AND t.product_instance_id=c.product_instance_id AND t.client_id=c.id AND t.tag_id=?)',query.tag_id);
      if (query.registered_from) add('c.created_at>=?',query.registered_from);
      if (query.registered_to) add('c.created_at<=?',query.registered_to);
      const where = conditions.join(' AND '); const total = Number((await tx.query<{ total: string }>(`SELECT count(*) AS total FROM brokerage_clients c WHERE ${where}`,values)).rows[0].total);
      const data = (await tx.query<Row>(`SELECT c.*,c.birth_date::text AS birth_date FROM brokerage_clients c WHERE ${where} ORDER BY c.${query.sort} ${query.direction},c.id ${query.direction} LIMIT $${values.length+1} OFFSET $${values.length+2}`, [...values,query.limit,query.offset])).rows;
      return { data,pagination: { total,limit: query.limit,offset: query.offset } };
    });
  }
  async get(scope: TenantContext, id: string): Promise<Row> {
    return this.db.transaction(scope, async tx => {
      const client = await this.find(tx,scope,id);
      const tags = (await tx.query<Row>(`SELECT t.id,t.name,t.color,t.archived_at FROM brokerage_tags t JOIN brokerage_client_tags a ON a.tag_id=t.id AND a.organization_id=t.organization_id AND a.brand_id=t.brand_id AND a.environment_id=t.environment_id AND a.product_instance_id=t.product_instance_id WHERE ${scopeWhere('t')} AND a.client_id=$5 ORDER BY t.name`,[...scopeValues(scope),id])).rows;
      const assignments = (await tx.query<Row>(`SELECT id,role,staff_id,assigned_by,created_at FROM brokerage_staff_assignments WHERE ${scopeWhere()} AND client_id=$5 ORDER BY role`,[...scopeValues(scope),id])).rows;
      return { ...client,tags,assignments };
    });
  }
  async update(scope: TenantContext, id: string, raw: z.input<typeof clientPatchSchema>): Promise<Row> {
    const input = clientPatchSchema.parse(raw);
    try { return await this.db.transaction(scope, async tx => {
      const current = await this.find(tx,scope,id,true);
      // Identity email is Core-owned after linking; prevent CRM email from changing who can claim a profile.
      if (input.email && current.user_id && input.email!==current.email) throw new AppError(422,'LINKED_EMAIL_IMMUTABLE','Change the email through the identity security workflow.');
      await this.staff(tx,scope,input.assigned_staff_id);
      const changedEligibility = ['full_name','country','residence_country','birth_date','client_type'].some(key => input[key as keyof typeof input]!==undefined && String(input[key as keyof typeof input] ?? '')!==String(current[key] ?? ''));
      const client = await this.patch(tx,scope,'brokerage_clients',id,{ ...input,...(changedEligibility && (current.kyc_status==='approved' || current.status==='active') ? { kyc_status: 'required',status: ['restricted','suspended','closed','rejected'].includes(String(current.status)) ? current.status : 'onboarding',onboarding_status: 'in_progress' } : {}) });
      if (input.assigned_staff_id!==undefined) {
        await this.assignment(tx,scope,id,'account_manager',input.assigned_staff_id);
        await recordEvent(tx,scope,'brokerage.client.assignment_changed','brokerage_client',id,{ role: 'account_manager',previous_staff_id: current.assigned_staff_id,staff_id: input.assigned_staff_id });
      }
      await recordEvent(tx,scope,'brokerage.client.updated','brokerage_client',id,{ fields: Object.keys(input),previous_status: current.status,status: client.status,previous_kyc_status: current.kyc_status,kyc_status: client.kyc_status }); return client;
    }); } catch (error) { conflict(error,'CLIENT_EXISTS','A client with this email already exists in this workspace.'); }
  }
  private async readSettings(tx: Executor, scope: TenantContext): Promise<Settings> {
    const stored = (await tx.query<Settings>(`SELECT allowed_countries,restricted_countries,allowed_client_types,minimum_age,require_kyc,allow_account_requests,onboarding_steps FROM brokerage_settings WHERE ${scopeWhere()}`,scopeValues(scope))).rows[0];
    return stored ?? { ...defaultBrokerageSettings };
  }
  private async consentComplete(tx: Executor, scope: TenantContext, clientId: string): Promise<boolean> {
    return !(await tx.query(`SELECT d.id FROM brokerage_consent_documents d WHERE ${scopeWhere('d')} AND d.active AND d.required AND NOT EXISTS(SELECT 1 FROM brokerage_consents c WHERE c.organization_id=d.organization_id AND c.brand_id=d.brand_id AND c.environment_id=d.environment_id AND c.product_instance_id=d.product_instance_id AND c.client_id=$5 AND c.document_id=d.id AND c.document_hash=d.document_hash) LIMIT 1`, [...scopeValues(scope),clientId])).rows[0];
  }
  async changeStatus(scope: TenantContext, id: string, status: ClientStatus, reason: string): Promise<Row> {
    z.enum(clientStatuses).parse(status); z.string().trim().min(3).max(1000).parse(reason);
    return this.db.transaction(scope,async tx => {
      const current = await this.find(tx,scope,id,true);
      if (!clientTransitions[current.status as ClientStatus]?.includes(status)) throw new AppError(409,'INVALID_STATE_TRANSITION',`Client status cannot change from ${current.status} to ${status}.`);
      if (status==='active') {
        const evaluation = eligibleClient({ ...current,status: 'active' },await this.readSettings(tx,scope),await this.consentComplete(tx,scope,id));
        if (!evaluation.eligible) throw new AppError(422,'CLIENT_INELIGIBLE','Complete the configured onboarding requirements before activation.',evaluation.reasons);
      }
      const extras = status==='active' ? "activated_at=COALESCE(activated_at,now()),onboarding_status='complete'" : status==='closed' ? 'closed_at=now()' : '';
      const client = await this.patch(tx,scope,'brokerage_clients',id,{ status },extras);
      await recordEvent(tx,scope,'brokerage.client.status_changed','brokerage_client',id,{ previous_status: current.status,status,reason }); return client;
    });
  }
  async activity(scope: TenantContext, id: string, raw: z.input<typeof pageSchema> = {}) {
    const query = pageSchema.parse(raw);
    return this.db.transaction(scope,async tx => {
      await this.find(tx,scope,id);
      const values = [...scopeValues(scope),id];
      const clause = `${scopeWhere()} AND (resource_type='brokerage_client' AND resource_id=$5 OR metadata->>'client_id'=$5)`;
      const total = Number((await tx.query<{ total: string }>(`SELECT count(*) AS total FROM audit_events WHERE ${clause}`,values)).rows[0].total);
      const data = (await tx.query<Row>(`SELECT id,actor_id,action,resource_type,resource_id,metadata,created_at FROM audit_events WHERE ${clause} ORDER BY created_at DESC,id DESC LIMIT $6 OFFSET $7`,[...values,query.limit,query.offset])).rows;
      return { data,pagination: { total,limit: query.limit,offset: query.offset } };
    });
  }
  async tags(scope: TenantContext): Promise<Row[]> { return this.db.transaction(scope,async tx => (await tx.query<Row>(`SELECT * FROM brokerage_tags WHERE ${scopeWhere()} ORDER BY archived_at NULLS FIRST,name LIMIT 500`,scopeValues(scope))).rows); }
  async createTag(scope: TenantContext, raw: z.input<typeof tagSchema>): Promise<Row> {
    const input = tagSchema.parse(raw);
    try { return await this.db.transaction(scope,async tx => {
      const tag = (await tx.query<Row>('INSERT INTO brokerage_tags(id,organization_id,brand_id,environment_id,product_instance_id,name,color) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING *',[randomUUID(),...scopeValues(scope),input.name,input.color ?? '#1677FF'])).rows[0];
      await recordEvent(tx,scope,'brokerage.tag.created','brokerage_tag',String(tag.id)); return tag;
    }); } catch (error) { conflict(error,'TAG_EXISTS','A tag with this name already exists.'); }
  }
  async updateTag(scope: TenantContext, id: string, raw: z.input<typeof tagPatchSchema>): Promise<Row> {
    const { archived,...input } = tagPatchSchema.parse(raw);
    try { return await this.db.transaction(scope,async tx => {
      const tag = await this.patch(tx,scope,'brokerage_tags',id,{ ...input,...(archived!==undefined ? { archived_at: archived ? new Date().toISOString() : null } : {}) });
      await recordEvent(tx,scope,'brokerage.tag.updated','brokerage_tag',id,{ archived }); return tag;
    }); } catch (error) { conflict(error,'TAG_EXISTS','A tag with this name already exists.'); }
  }
  async tagClient(scope: TenantContext, clientId: string, tagId: string, assign: boolean) {
    return this.db.transaction(scope,async tx => {
      await this.find(tx,scope,clientId,true);
      const tag = (await tx.query<Row>(`SELECT * FROM brokerage_tags WHERE ${scopeWhere()} AND id=$5`,[...scopeValues(scope),tagId])).rows[0];
      if (!tag || (assign && tag.archived_at)) throw new AppError(422,'TAG_UNAVAILABLE','Select an active tag in this workspace.');
      if (assign) await tx.query('INSERT INTO brokerage_client_tags(organization_id,brand_id,environment_id,product_instance_id,client_id,tag_id,assigned_by) VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT DO NOTHING',[...scopeValues(scope),clientId,tagId,scope.userId]);
      else await tx.query(`DELETE FROM brokerage_client_tags WHERE ${scopeWhere()} AND client_id=$5 AND tag_id=$6`,[...scopeValues(scope),clientId,tagId]);
      await recordEvent(tx,scope,assign ? 'brokerage.client.tag_assigned' : 'brokerage.client.tag_removed','brokerage_client',clientId,{ tag_id: tagId }); return { assigned: assign };
    });
  }
  async notes(scope: TenantContext, clientId: string): Promise<Row[]> {
    return this.db.transaction(scope,async tx => { await this.find(tx,scope,clientId); return (await tx.query<Row>(`SELECT n.*,u.display_name AS author_name FROM brokerage_notes n JOIN users u ON u.id=n.author_id WHERE ${scopeWhere('n')} AND n.client_id=$5 AND n.deleted_at IS NULL AND (n.visibility='staff' OR n.author_id=$6) ORDER BY n.pinned DESC,n.created_at DESC LIMIT 500`,[...scopeValues(scope),clientId,scope.userId])).rows; });
  }
  async noteHistory(scope: TenantContext, clientId: string, noteId: string): Promise<Row[]> {
    return this.db.transaction(scope,async tx => {
      await this.find(tx,scope,clientId);
      const note = (await tx.query<Row>(`SELECT author_id,visibility,deleted_at FROM brokerage_notes WHERE ${scopeWhere()} AND client_id=$5 AND id=$6`,[...scopeValues(scope),clientId,noteId])).rows[0];
      const author = note?.author_id===scope.userId;
      if (!note || (note.visibility==='private' && !author) || (note.deleted_at && !author && !scope.permissions.includes('staff.write'))) throw new AppError(404,'NOT_FOUND','The note history was not found.');
      // Historical private content stays private even after the current note is shared.
      return (await tx.query<Row>(`SELECT r.*,u.display_name AS editor_name FROM brokerage_note_revisions r JOIN users u ON u.id=r.editor_id WHERE ${scopeWhere('r')} AND r.note_id=$5 AND (r.visibility='staff' OR $6::boolean) ORDER BY r.created_at DESC,r.id DESC LIMIT 500`,[...scopeValues(scope),noteId,author])).rows;
    });
  }
  async noteHistories(scope: TenantContext, clientId: string, raw: z.input<typeof pageSchema> = {}) {
    const query = pageSchema.parse(raw);
    return this.db.transaction(scope,async tx => {
      await this.find(tx,scope,clientId);
      const joins = 'FROM brokerage_note_revisions r JOIN brokerage_notes n ON n.id=r.note_id AND n.organization_id=r.organization_id AND n.brand_id=r.brand_id AND n.environment_id=r.environment_id AND n.product_instance_id=r.product_instance_id';
      const where = `${scopeWhere('n')} AND n.client_id=$5 AND (n.visibility='staff' OR n.author_id=$6) AND (r.visibility='staff' OR n.author_id=$6) AND (n.deleted_at IS NULL OR n.author_id=$6 OR $7::boolean)`;
      const values = [...scopeValues(scope),clientId,scope.userId,scope.permissions.includes('staff.write')];
      const total = Number((await tx.query<{ total: string }>(`SELECT count(*) AS total ${joins} WHERE ${where}`,values)).rows[0].total);
      const data = (await tx.query<Row>(`SELECT r.*,n.author_id,a.display_name AS author_name,e.display_name AS editor_name ${joins} JOIN users a ON a.id=n.author_id JOIN users e ON e.id=r.editor_id WHERE ${where} ORDER BY r.created_at DESC,r.id DESC LIMIT $8 OFFSET $9`,[...values,query.limit,query.offset])).rows;
      return { data,pagination: { total,limit: query.limit,offset: query.offset } };
    });
  }
  private async revision(tx: Executor, scope: TenantContext, note: Row, deleted = false) {
    await tx.query('INSERT INTO brokerage_note_revisions(id,organization_id,brand_id,environment_id,product_instance_id,note_id,editor_id,category,text,visibility,pinned,deleted) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)',[randomUUID(),...scopeValues(scope),note.id,scope.userId,note.category,note.text,note.visibility,note.pinned,deleted]);
  }
  async createNote(scope: TenantContext, clientId: string, raw: z.input<typeof noteSchema>): Promise<Row> {
    const input = noteSchema.parse(raw);
    return this.db.transaction(scope,async tx => {
      await this.find(tx,scope,clientId);
      const note = (await tx.query<Row>('INSERT INTO brokerage_notes(id,organization_id,brand_id,environment_id,product_instance_id,client_id,author_id,text,category,visibility,pinned) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *',[randomUUID(),...scopeValues(scope),clientId,scope.userId,input.text,input.category ?? 'general',input.visibility ?? 'staff',input.pinned ?? false])).rows[0];
      await this.revision(tx,scope,note); await recordEvent(tx,scope,'brokerage.note.created','brokerage_note',String(note.id),{ client_id: clientId }); return note;
    });
  }
  private async editableNote(tx: Executor, scope: TenantContext, clientId: string, id: string) {
    await this.find(tx,scope,clientId);
    const note = (await tx.query<Row>(`SELECT * FROM brokerage_notes WHERE ${scopeWhere()} AND client_id=$5 AND id=$6 AND deleted_at IS NULL FOR UPDATE`,[...scopeValues(scope),clientId,id])).rows[0];
    if (!note || (note.visibility==='private' && note.author_id!==scope.userId)) throw new AppError(404,'NOT_FOUND','The note was not found.');
    if (note.author_id!==scope.userId && !scope.permissions.includes('staff.write')) throw new AppError(403,'NOTE_AUTHOR_REQUIRED','Only the author or a tenant staff administrator can change this note.'); return note;
  }
  async updateNote(scope: TenantContext, clientId: string, id: string, raw: z.input<typeof notePatchSchema>): Promise<Row> {
    const input = notePatchSchema.parse(raw);
    return this.db.transaction(scope,async tx => { await this.editableNote(tx,scope,clientId,id); const note = await this.patch(tx,scope,'brokerage_notes',id,input); await this.revision(tx,scope,note); await recordEvent(tx,scope,'brokerage.note.updated','brokerage_note',id,{ client_id: clientId }); return note; });
  }
  async deleteNote(scope: TenantContext, clientId: string, id: string): Promise<Row> {
    return this.db.transaction(scope,async tx => { const note = await this.editableNote(tx,scope,clientId,id); await this.revision(tx,scope,note,true); await this.patch(tx,scope,'brokerage_notes',id,{ deleted_at: new Date().toISOString() }); await recordEvent(tx,scope,'brokerage.note.deleted','brokerage_note',id,{ client_id: clientId }); return { id,deleted: true }; });
  }
  private async assignment(tx: Executor, scope: TenantContext, clientId: string, role: typeof assignmentRoles[number], staffId: string | null) {
    await this.staff(tx,scope,staffId);
    if (staffId) await tx.query('INSERT INTO brokerage_staff_assignments(id,organization_id,brand_id,environment_id,product_instance_id,client_id,staff_id,assigned_by,role) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT(organization_id,brand_id,environment_id,product_instance_id,client_id,role) DO UPDATE SET staff_id=excluded.staff_id,assigned_by=excluded.assigned_by,updated_at=now()',[randomUUID(),...scopeValues(scope),clientId,staffId,scope.userId,role]);
    else await tx.query(`DELETE FROM brokerage_staff_assignments WHERE ${scopeWhere()} AND client_id=$5 AND role=$6`,[...scopeValues(scope),clientId,role]);
  }
  async assign(scope: TenantContext, clientId: string, role: typeof assignmentRoles[number], staffId: string | null): Promise<Row[]> {
    z.enum(assignmentRoles).parse(role); z.uuid().nullable().parse(staffId);
    return this.db.transaction(scope,async tx => { await this.find(tx,scope,clientId,true); await this.assignment(tx,scope,clientId,role,staffId); if (role==='account_manager') await this.patch(tx,scope,'brokerage_clients',clientId,{ assigned_staff_id: staffId }); await recordEvent(tx,scope,'brokerage.client.assignment_changed','brokerage_client',clientId,{ role,staff_id: staffId }); return (await tx.query<Row>(`SELECT * FROM brokerage_staff_assignments WHERE ${scopeWhere()} AND client_id=$5 ORDER BY role`,[...scopeValues(scope),clientId])).rows; });
  }
  async tasks(scope: TenantContext, raw: z.input<typeof taskListSchema> = {}) {
    const query = taskListSchema.parse(raw);
    return this.db.transaction(scope,async tx => { const values: unknown[] = [...scopeValues(scope)]; const conditions = [scopeWhere()]; for (const field of ['status','owner_id','client_id'] as const) if (query[field]) { values.push(query[field]); conditions.push(`${field}=$${values.length}`); } if (query.search) { values.push(`%${query.search.replace(/[\\%_]/g,'\\$&')}%`); conditions.push(`title ILIKE $${values.length}`); } const where = conditions.join(' AND '); const total = Number((await tx.query<{ total: string }>(`SELECT count(*) AS total FROM brokerage_tasks WHERE ${where}`,values)).rows[0].total); const data = (await tx.query<Row>(`SELECT * FROM brokerage_tasks WHERE ${where} ORDER BY ${query.sort} ${query.direction} NULLS LAST,created_at DESC,id DESC LIMIT $${values.length+1} OFFSET $${values.length+2}`,[...values,query.limit,query.offset])).rows; return { data,pagination: { total,limit: query.limit,offset: query.offset } }; });
  }
  async createTask(scope: TenantContext, raw: z.input<typeof taskSchema>): Promise<Row> {
    const input = taskSchema.parse(raw);
    return this.db.transaction(scope,async tx => { if (input.client_id) await this.find(tx,scope,input.client_id); await this.staff(tx,scope,input.owner_id); const task = (await tx.query<Row>('INSERT INTO brokerage_tasks(id,organization_id,brand_id,environment_id,product_instance_id,client_id,owner_id,created_by,title,notes,due_at,priority) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *',[randomUUID(),...scopeValues(scope),input.client_id ?? null,input.owner_id ?? null,scope.userId,input.title,input.notes ?? '',input.due_at ?? null,input.priority ?? 'normal'])).rows[0]; await recordEvent(tx,scope,'brokerage.task.created','brokerage_task',String(task.id),{ client_id: input.client_id }); return task; });
  }
  async updateTask(scope: TenantContext, id: string, raw: z.input<typeof taskPatchSchema>): Promise<Row> {
    const input = taskPatchSchema.parse(raw);
    return this.db.transaction(scope,async tx => { const current = (await tx.query<Row>(`SELECT * FROM brokerage_tasks WHERE ${scopeWhere()} AND id=$5 FOR UPDATE`,[...scopeValues(scope),id])).rows[0]; if (!current) throw new AppError(404,'NOT_FOUND','The task was not found.'); await this.staff(tx,scope,input.owner_id); const task = await this.patch(tx,scope,'brokerage_tasks',id,input,input.status ? (input.status==='completed' ? 'completed_at=now()' : 'completed_at=NULL') : ''); await recordEvent(tx,scope,'brokerage.task.updated','brokerage_task',id,{ client_id: current.client_id,status: input.status }); return task; });
  }
  async settings(scope: TenantContext, raw?: z.input<typeof settingsSchema>): Promise<Settings> {
    const input = raw ? settingsSchema.parse(raw) : undefined;
    return this.db.transaction(scope,async tx => { const current = await this.readSettings(tx,scope); if (!input) return current; const next = { ...current,...input }; await tx.query('INSERT INTO brokerage_settings(organization_id,brand_id,environment_id,product_instance_id,allowed_countries,restricted_countries,allowed_client_types,minimum_age,require_kyc,allow_account_requests,onboarding_steps,updated_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) ON CONFLICT(organization_id,brand_id,environment_id,product_instance_id) DO UPDATE SET allowed_countries=excluded.allowed_countries,restricted_countries=excluded.restricted_countries,allowed_client_types=excluded.allowed_client_types,minimum_age=excluded.minimum_age,require_kyc=excluded.require_kyc,allow_account_requests=excluded.allow_account_requests,onboarding_steps=excluded.onboarding_steps,updated_by=excluded.updated_by,updated_at=now()',[...scopeValues(scope),JSON.stringify(next.allowed_countries),JSON.stringify(next.restricted_countries),JSON.stringify(next.allowed_client_types),next.minimum_age,next.require_kyc,next.allow_account_requests,JSON.stringify(next.onboarding_steps),scope.userId]); await recordEvent(tx,scope,'brokerage.settings.updated','brokerage_settings',scope.productInstanceId,{ fields: Object.keys(input) }); return next; });
  }
  async documents(scope: TenantContext, activeOnly = false): Promise<Row[]> { return this.db.transaction(scope,async tx => (await tx.query<Row>(`SELECT * FROM brokerage_consent_documents WHERE ${scopeWhere()}${activeOnly ? ' AND active' : ''} ORDER BY document_type,created_at DESC LIMIT 500`,scopeValues(scope))).rows); }
  async createDocument(scope: TenantContext, raw: z.input<typeof documentSchema>): Promise<Row> {
    const input = documentSchema.parse(raw);
    try { return await this.db.transaction(scope,async tx => { await tx.query("SELECT pg_advisory_xact_lock(hashtextextended('brokerage-document:' || $1 || ':' || $2,0))",[scope.productInstanceId,input.document_type]); if (input.active!==false) await tx.query(`UPDATE brokerage_consent_documents SET active=false,updated_at=now() WHERE ${scopeWhere()} AND document_type=$5 AND active`,[...scopeValues(scope),input.document_type]); const document = (await tx.query<Row>('INSERT INTO brokerage_consent_documents(id,organization_id,brand_id,environment_id,product_instance_id,document_type,version,title,content,document_hash,required,active,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING *',[randomUUID(),...scopeValues(scope),input.document_type,input.version,input.title,input.content,createHash('sha256').update(input.content).digest('hex'),input.required ?? true,input.active ?? true,scope.userId])).rows[0]; await recordEvent(tx,scope,'brokerage.consent_document.published','brokerage_consent_document',String(document.id),{ document_type: input.document_type,version: input.version,document_hash: document.document_hash }); return document; }); } catch (error) { conflict(error,'DOCUMENT_VERSION_EXISTS','Publish a new version; document versions are immutable.'); }
  }
  async updateDocument(scope: TenantContext, id: string, raw: z.input<typeof documentPatchSchema>): Promise<Row> {
    const input = documentPatchSchema.parse(raw);
    return this.db.transaction(scope,async tx => { const current = (await tx.query<Row>(`SELECT * FROM brokerage_consent_documents WHERE ${scopeWhere()} AND id=$5 FOR UPDATE`,[...scopeValues(scope),id])).rows[0]; if (!current) throw new AppError(404,'NOT_FOUND','The document was not found.'); await tx.query("SELECT pg_advisory_xact_lock(hashtextextended('brokerage-document:' || $1 || ':' || $2,0))",[scope.productInstanceId,current.document_type]); if (input.active) await tx.query(`UPDATE brokerage_consent_documents SET active=false,updated_at=now() WHERE ${scopeWhere()} AND document_type=$5 AND id<>$6 AND active`,[...scopeValues(scope),current.document_type,id]); const document = await this.patch(tx,scope,'brokerage_consent_documents',id,input); await recordEvent(tx,scope,'brokerage.consent_document.updated','brokerage_consent_document',id,{ ...input }); return document; });
  }
  private async own(tx: Executor, scope: TenantContext, lock = false): Promise<Row | null> { return (await tx.query<Row>(`SELECT *,birth_date::text AS birth_date FROM brokerage_clients WHERE ${scopeWhere()} AND user_id=$5${lock ? ' FOR UPDATE' : ''}`,[...scopeValues(scope),scope.userId])).rows[0] ?? null; }
  async profile(scope: TenantContext): Promise<Row | null> { return this.db.transaction(scope,async tx => publicProfile(await this.own(tx,scope))); }
  async saveProfile(scope: TenantContext, raw: z.input<typeof profileSchema>): Promise<Row> {
    const input = profileSchema.parse(raw);
    return this.db.transaction(scope,async tx => {
      const identity = (await tx.query<{ email: string; display_name: string }>(`SELECT u.email,u.display_name FROM users u JOIN client_memberships m ON m.user_id=u.id JOIN product_instances i ON i.id=m.product_instance_id AND i.organization_id=m.organization_id WHERE u.id=$5 AND u.status='active' AND u.core_role IS NULL AND m.status='active' AND i.organization_id=$1 AND i.brand_id=$2 AND i.environment_id=$3 AND i.id=$4`,[...scopeValues(scope),scope.userId])).rows[0];
      if (!identity) throw new AppError(403,'CLIENT_ACCESS_DENIED','An active client membership is required.');
      await tx.query("SELECT pg_advisory_xact_lock(hashtextextended('brokerage-profile:' || $1 || ':' || $2,0))",[scope.productInstanceId,identity.email]);
      let current = await this.own(tx,scope,true);
      let previous = current;
      if (!current) {
        current = (await tx.query<Row>(`SELECT *,birth_date::text AS birth_date FROM brokerage_clients WHERE ${scopeWhere()} AND email=$5 FOR UPDATE`,[...scopeValues(scope),identity.email])).rows[0] ?? null;
        previous = current;
        if (current?.user_id && current.user_id!==scope.userId) throw new AppError(409,'CLIENT_IDENTITY_CONFLICT','This brokerage profile is already linked to another identity.');
        if (current) {
          if (['restricted','closed','rejected','suspended'].includes(String(current.status))) throw new AppError(403,'CLIENT_PROFILE_RESTRICTED','Contact support to resume this profile.');
          current = await this.patch(tx,scope,'brokerage_clients',String(current.id),{ user_id: scope.userId,...input,status: 'onboarding',onboarding_status: 'in_progress' });
        } else {
          if (!input.full_name) throw new AppError(422,'CLIENT_NAME_REQUIRED','Provide your full name to start onboarding.');
          const id = randomUUID(); const number = `CLI-${randomUUID().replaceAll('-','').slice(0,12).toUpperCase()}`;
          current = (await tx.query<Row>("INSERT INTO brokerage_clients(id,organization_id,brand_id,environment_id,product_instance_id,user_id,client_number,full_name,email,status,onboarding_status,country,residence_country,birth_date,client_type,preferred_currency,source) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,'onboarding','in_progress',$10,$11,$12,$13,$14,'client_portal') RETURNING *,birth_date::text AS birth_date",[id,...scopeValues(scope),scope.userId,number,input.full_name,identity.email,input.country ?? null,input.residence_country ?? null,input.birth_date ?? null,input.client_type ?? 'individual',input.preferred_currency ?? 'USD'])).rows[0];
        }
      } else {
        if (['restricted','closed','rejected','suspended'].includes(String(current.status))) throw new AppError(403,'CLIENT_PROFILE_RESTRICTED','Contact support to update this profile.');
        // An approved/active profile changing eligibility fields must be reviewed again.
        const sensitive = ['full_name','country','residence_country','birth_date','client_type'] as const;
        const changed = sensitive.some(key => input[key]!==undefined && String(input[key] ?? '')!==String(current![key] ?? ''));
        current = await this.patch(tx,scope,'brokerage_clients',String(current.id),{ ...input,...(changed && (current.kyc_status==='approved' || current.status==='active') ? { kyc_status: 'required',status: 'onboarding',onboarding_status: 'in_progress' } : {}) });
      }
      await recordEvent(tx,scope,'brokerage.client.profile_saved','brokerage_client',String(current.id),{ fields: Object.keys(input),previous_status: previous?.status ?? null,status: current.status,previous_kyc_status: previous?.kyc_status ?? null,kyc_status: current.kyc_status }); return publicProfile(current)!;
    });
  }
  async acceptConsent(scope: TenantContext, raw: z.input<typeof consentSchema>, metadata: { ip_address?: string; user_agent?: string }): Promise<Row> {
    const input = consentSchema.parse(raw);
    return this.db.transaction(scope,async tx => { const client = await this.own(tx,scope,true); if (!client) throw new AppError(422,'CLIENT_PROFILE_REQUIRED','Complete your profile before accepting business documents.'); const document = (await tx.query<Row>(`SELECT * FROM brokerage_consent_documents WHERE ${scopeWhere()} AND id=$5 AND active FOR SHARE`,[...scopeValues(scope),input.document_id])).rows[0]; if (!document) throw new AppError(404,'NOT_FOUND','The current document was not found.'); if (document.document_hash!==input.document_hash) throw new AppError(409,'CONSENT_DOCUMENT_CHANGED','Read the current document before accepting it.'); const prior = (await tx.query<Row>(`SELECT * FROM brokerage_consents WHERE ${scopeWhere()} AND client_id=$5 AND document_id=$6`,[...scopeValues(scope),client.id,document.id])).rows[0]; if (prior) return prior; const consent = (await tx.query<Row>('INSERT INTO brokerage_consents(id,organization_id,brand_id,environment_id,product_instance_id,client_id,user_id,document_id,document_type,version,document_hash,accepted_content,request_id,ip_address,user_agent) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15) RETURNING *',[randomUUID(),...scopeValues(scope),client.id,scope.userId,document.id,document.document_type,document.version,document.document_hash,document.content,scope.requestId,metadata.ip_address ?? null,metadata.user_agent?.slice(0,500) ?? null])).rows[0]; await recordEvent(tx,scope,'brokerage.client.consent_accepted','brokerage_client',String(client.id),{ document_id: document.id,document_type: document.document_type,version: document.version,document_hash: document.document_hash }); return consent; });
  }
  async onboarding(scope: TenantContext) {
    return this.db.transaction(scope,async tx => { const client = await this.own(tx,scope); const settings = await this.readSettings(tx,scope); const documents = (await tx.query<Row>(`SELECT id,document_type,version,title,content,document_hash,required FROM brokerage_consent_documents WHERE ${scopeWhere()} AND active ORDER BY document_type`,scopeValues(scope))).rows; const consents = client ? (await tx.query<Row>(`SELECT id,document_id,document_type,version,document_hash,accepted_at FROM brokerage_consents WHERE ${scopeWhere()} AND client_id=$5 ORDER BY accepted_at DESC`,[...scopeValues(scope),client.id])).rows : []; const consentComplete = documents.filter(document => document.required).every(document => consents.some(consent => consent.document_id===document.id && consent.document_hash===document.document_hash)); const profileComplete = Boolean(client?.full_name && (client.residence_country || client.country) && (client.client_type==='corporate' || !settings.minimum_age || client.birth_date)); const eligibility = client ? eligibleClient(client,settings,consentComplete) : { eligible: false,reasons: ['profile_required'] }; const completed: Record<string, boolean> = { identity: true,terms: consentComplete,profile: profileComplete,verification: !settings.require_kyc || client?.kyc_status==='approved',eligibility: eligibility.eligible }; return { profile: publicProfile(client),settings,documents,consents,eligibility,steps: settings.onboarding_steps.map(key => ({ key,complete: completed[key] ?? false })) }; });
  }
}
