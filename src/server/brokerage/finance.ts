import { randomBytes, randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { Page, Row, TenantContext } from '../../shared/types.js';
import type { Database, Executor } from '../db/database.js';
import { AppError } from '../domain/errors.js';
import { serializable } from '../domain/utils.js';
import { decryptSecret, encryptSecret } from '../security/crypto.js';
import { recordEvent, scopeValues, scopeWhere } from './common.js';
import { boundDatabase,enqueueOperation,loadConnector } from '../connectors/connection-service.js';

const uuid = z.string().uuid();
const currency = z.string().regex(/^[A-Z]{3}$/);
export const exactAmount = z.string().regex(/^(?:0|[1-9]\d{0,19})(?:\.\d{1,8})?$/).refine(value => /[1-9]/.test(value), 'Amount must be greater than zero.');
const label = z.string().trim().min(1).max(120);
const reason = z.string().trim().min(1).max(1000);
const reference = z.string().trim().min(1).max(200);
export const destinationSchema = z.object({
  beneficiary: label, account_number: z.string().trim().min(4).max(80).optional(),
  iban: z.string().trim().min(8).max(40).optional(), bank_name: label.optional(),
  routing_number: z.string().trim().min(2).max(40).optional(),
  wallet_address: z.string().trim().min(8).max(200).optional(), network: label.optional(),
}).strict().refine(value => Boolean(value.account_number || value.iban || value.wallet_address), 'A bank account, IBAN or wallet address is required.');
export const paymentMethodSchema = z.object({
  name: label, kind: z.enum(['manual','provider']), provider_id: uuid.optional(),
  currencies: z.array(currency).min(1).max(30).refine(values => new Set(values).size === values.length),
  deposit_enabled: z.boolean().default(true), withdrawal_enabled: z.boolean().default(true), enabled: z.boolean().default(true),
}).strict().refine(value => value.kind === 'provider' ? Boolean(value.provider_id) : !value.provider_id, 'Provider methods require a provider; manual methods must not have a provider.');
export const depositSchema = z.object({ client_id: uuid.optional(), account_id: uuid, payment_method_id: uuid, amount: exactAmount, currency }).strict();
export const withdrawalSchema = depositSchema.extend({ destination: destinationSchema }).strict();
export const transferSchema = z.object({ client_id: uuid.optional(), source_account_id: uuid, destination_account_id: uuid, amount: exactAmount, currency }).strict().refine(value => value.source_account_id !== value.destination_account_id, 'Select different source and destination accounts.');
export const paymentStatusSchema = z.object({ status: z.enum(['review','approved','processing','requires_action','completed','paid','rejected','cancelled','failed','reversed']), reason, reference: reference.optional() }).strict();
export const reviewSchema = z.object({ decision: z.enum(['clear','reject']), reason }).strict();
export const financeSettingsSchema = z.object({ maker_checker_required: z.boolean(), referral_window_hours: z.number().int().min(1).max(8760) }).strict();
export const partnerApplicationSchema = z.object({ client_id: uuid.optional(), campaign: label.optional() }).strict();
export const partnerStatusSchema = z.object({ status: z.enum(['review','approved','active','suspended','rejected','closed']), reason }).strict();
export const attributionSchema = z.object({ client_id: uuid.optional(), referral_code: z.string().regex(/^[A-Z0-9]{8,32}$/), source: label.optional(), campaign: label.optional() }).strict();
const percentage = z.string().regex(/^(?:0|[1-9]\d?)(?:\.\d{1,8})?$|^100(?:\.0{1,8})?$/);
export const commissionPlanSchema = z.object({
  name: label, kind: z.enum(['cpa','revenue_share','per_lot','hybrid']), currency,
  configuration: z.object({ cpa_amount: exactAmount.optional(), revenue_share_percent: percentage.optional(), per_lot_amount: exactAmount.optional() }).strict(),
  enabled: z.boolean().default(true),
}).strict().refine(value => value.kind === 'cpa' ? Boolean(value.configuration.cpa_amount) : value.kind === 'revenue_share' ? Boolean(value.configuration.revenue_share_percent) : value.kind === 'per_lot' ? Boolean(value.configuration.per_lot_amount) : Object.keys(value.configuration).length >= 2, 'Provide the decimal rate configuration for this plan.');
export const accrualSchema = z.object({ partner_id: uuid, commission_plan_id: uuid, client_id: uuid.optional(), amount: exactAmount, currency, source_reference: reference, reason }).strict();
export const payoutSchema = z.object({ partner_id: uuid.optional(), accrual_ids: z.array(uuid).min(1).max(100).refine(values => new Set(values).size === values.length), destination: destinationSchema }).strict();
export const financeListSchema = z.object({ search:z.string().max(200).optional(), sort:z.string().max(40).optional(), direction:z.enum(['asc','desc']).default('desc'), limit: z.coerce.number().int().min(1).max(100).default(25), offset: z.coerce.number().int().min(0).max(1000000).default(0), status: z.string().max(40).optional(), client_id: uuid.optional(), currency: currency.optional() }).strict();
type FinanceList = z.input<typeof financeListSchema>;
type PaymentKind = 'deposit'|'withdrawal'|'transfer';
type Destination = z.infer<typeof destinationSchema>;
type PaymentRow = { id: string; client_id: string; kind: PaymentKind; account_id: string; destination_account_id: string|null; payment_method_id: string|null; amount: string; currency: string; status: string; created_by: string; reviewed_by: string|null; review_decision: string|null; approved_by: string|null; processed_by: string|null; destination_encrypted: string|null; destination_summary: string|null; external_reference: string|null; created_at: string; updated_at: string };
type PayoutRow = Omit<PaymentRow,'client_id'|'kind'|'account_id'|'destination_account_id'|'payment_method_id'> & { partner_id: string };
const paymentColumns = 'id,client_id,kind,account_id,destination_account_id,payment_method_id,amount::text,currency,status,destination_summary,created_by,reviewed_by,review_decision,reviewed_at,approved_by,processed_by,external_reference,last_reason,payment_action_url,payment_action_expires_at,provider_payment_reference,funding_status,external_processing_state,CASE WHEN EXISTS(SELECT 1 FROM brokerage_payment_methods m JOIN brokerage_connections b ON b.id=m.connection_id WHERE m.id=brokerage_payment_requests.payment_method_id AND b.connector_version IS NOT NULL) THEN \'provider\' ELSE \'manual\' END AS execution_mode,created_at,updated_at';
const payoutColumns = 'id,partner_id,amount::text,currency,status,destination_summary,created_by,reviewed_by,review_decision,reviewed_at,approved_by,processed_by,external_reference,last_reason,created_at,updated_at';
const transactionColumns = 'id,client_id,request_id,kind,amount::text,currency,status,account_id,destination_account_id,reference,created_at';
const paymentTransitions: Record<string,Record<string,string[]>> = {
  deposit: { pending:['processing','requires_action','cancelled','failed'], processing:['completed','requires_action','failed','cancelled'], requires_action:['processing','failed','cancelled'], provider_pending:['requires_action','failed','cancelled'], completed:['reversed'] },
  withdrawal: { requested:['review','cancelled','rejected'], review:['approved','rejected','cancelled'], approved:['processing','cancelled'], processing:['paid','failed'], failed:['cancelled'] },
  transfer: { provider_pending:['cancelled','rejected'] },
};
const payoutTransitions = paymentTransitions.withdrawal;
function missing(): never { throw new AppError(404,'NOT_FOUND','The requested resource does not exist in this scope.'); }
function stateError(): never { throw new AppError(409,'INVALID_TRANSITION','This workflow does not permit the requested state change.'); }
function rowValue(row: unknown): Row { return serializable(row) as Row; }
function destinationSummary(destination: Destination): string {
  const identifier = destination.account_number || destination.iban || destination.wallet_address || '';
  return `${destination.wallet_address ? 'Wallet' : 'Bank'} ending ${identifier.slice(-4)}`;
}
function cleanPayment(row: PaymentRow|PayoutRow): Row {
  const safe = { ...row } as Record<string,unknown>; delete safe.destination_encrypted; return rowValue(safe);
}
function requiredReference(value?: string) { if (!value) throw new AppError(422,'PAYMENT_REFERENCE_REQUIRED','An independently confirmed offline payment reference is required.'); }
function makerChecker(row: {created_by:string;reviewed_by:string|null}, scope: TenantContext, enabled: boolean, approval=false) {
  if (enabled && (row.created_by === scope.userId || (approval && row.reviewed_by === scope.userId))) throw new AppError(403,'MAKER_CHECKER_REQUIRED','A separate staff member must perform this finance decision.');
}

export { UnavailablePaymentProvider, type PaymentProvider } from './providers.js';

export class BrokerageFinanceService {
  constructor(private readonly db: Database, private readonly encryptionKey = process.env.SECRET_ENCRYPTION_KEY) {}
  private key(): string {
    if (!this.encryptionKey || Buffer.from(this.encryptionKey,'base64').length !== 32) throw new AppError(503,'DESTINATION_VAULT_UNAVAILABLE','Configure the credential encryption key before collecting payout destinations.');
    return this.encryptionKey;
  }
  private encryptDestination(scope: TenantContext, clientId: string, requestId: string, purpose: string, destination: Destination) {
    return encryptSecret(JSON.stringify({version:1,scope:scopeValues(scope),client_id:clientId,request_id:requestId,purpose,destination}),this.key());
  }
  private decryptDestination(scope: TenantContext, clientId: string, requestId: string, purpose: string, envelope: string): Destination {
    try {
      const decoded = JSON.parse(decryptSecret(envelope,this.key())) as {version:number;scope:unknown;client_id:string;request_id:string;purpose:string;destination:unknown};
      if (decoded.version !== 1 || JSON.stringify(decoded.scope) !== JSON.stringify(scopeValues(scope)) || decoded.client_id !== clientId || decoded.request_id !== requestId || decoded.purpose !== purpose) throw new Error('Scope mismatch');
      return destinationSchema.parse(decoded.destination);
    } catch { throw new AppError(422,'DESTINATION_AUTHENTICATION_FAILED','The destination envelope does not authenticate in this scope.'); }
  }
  private async client(tx: Executor, scope: TenantContext, clientId?: string, own=false) {
    const params = [...scopeValues(scope)];
    const clause = own ? 'user_id=$5' : 'id=$5';
    params.push(own ? scope.userId : clientId ?? '');
    const row = (await tx.query<{id:string;user_id:string|null;status:string;created_at:string}>(`SELECT id,user_id,status,created_at FROM brokerage_clients WHERE ${scopeWhere()} AND ${clause} FOR UPDATE`,params)).rows[0];
    if (!row || (own && clientId && row.id !== clientId)) missing(); return row;
  }
  private async account(tx: Executor, scope: TenantContext, accountId: string, clientId: string, requestedCurrency: string) {
    const row = (await tx.query<{id:string;status:string;currency:string;account_type:string}>(`SELECT id,status,currency,account_type FROM brokerage_accounts WHERE ${scopeWhere()} AND id=$5 AND client_id=$6 FOR UPDATE`,[...scopeValues(scope),accountId,clientId])).rows[0];
    if (!row) missing();
    if (row.status !== 'active' || row.account_type !== 'live' || row.currency !== requestedCurrency) throw new AppError(422,'ACCOUNT_INELIGIBLE','Finance requests require an active live account in the requested currency.');
    return row;
  }
  private async settingsIn(tx: Executor, scope: TenantContext) {
    return (await tx.query<{maker_checker_required:boolean;referral_window_hours:number}>(`SELECT maker_checker_required,referral_window_hours FROM brokerage_finance_settings WHERE ${scopeWhere()}`,scopeValues(scope))).rows[0] ?? {maker_checker_required:true,referral_window_hours:720};
  }
  async settings(scope: TenantContext) { return this.db.transaction(scope,tx=>this.settingsIn(tx,scope)); }
  async updateSettings(scope: TenantContext, input: unknown) {
    const value=financeSettingsSchema.parse(input);
    return this.db.transaction(scope,async tx=>{
      await tx.query(`INSERT INTO brokerage_finance_settings(organization_id,brand_id,environment_id,product_instance_id,maker_checker_required,referral_window_hours) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(organization_id,brand_id,environment_id,product_instance_id) DO UPDATE SET maker_checker_required=EXCLUDED.maker_checker_required,referral_window_hours=EXCLUDED.referral_window_hours,updated_at=now()`,[...scopeValues(scope),value.maker_checker_required,value.referral_window_hours]);
      await recordEvent(tx,scope,'brokerage.finance.settings_changed','finance_settings',scope.productInstanceId,value); return value;
    });
  }
  async paymentMethods(scope: TenantContext, own=false) {
    return this.db.transaction(scope,async tx=>({data:(await tx.query<Row>(`SELECT id,name,kind,provider_id,currencies,deposit_enabled,withdrawal_enabled,enabled,created_at FROM brokerage_payment_methods WHERE ${scopeWhere()} ${own?'AND enabled=true':''} ORDER BY name`,scopeValues(scope))).rows}));
  }
  async savePaymentMethod(scope: TenantContext, input: unknown, id?: string) {
    const value=paymentMethodSchema.parse(input);
    return this.db.transaction(scope,async tx=>{
      if(id){
        const current=(await tx.query<{kind:string;provider_id:string|null}>(`SELECT kind,provider_id FROM brokerage_payment_methods WHERE ${scopeWhere()} AND id=$5 FOR UPDATE`,[...scopeValues(scope),id])).rows[0];if(!current)missing();
        const used=(await tx.query('SELECT id FROM brokerage_payment_requests WHERE payment_method_id=$1 LIMIT 1',[id])).rows.length;
        if(used&&(current.kind!==value.kind||current.provider_id!==(value.provider_id??null)))throw new AppError(409,'PAYMENT_METHOD_IN_USE','Create a new method to change the execution strategy after payment requests exist.');
      }
      const values=[...scopeValues(scope),id??randomUUID(),value.name,value.kind,value.provider_id??null,JSON.stringify(value.currencies),value.deposit_enabled,value.withdrawal_enabled,value.enabled,scope.userId];
      const row=(await tx.query<Row>(id
        ? `UPDATE brokerage_payment_methods SET name=$6,kind=$7,provider_id=$8,currencies=$9::jsonb,deposit_enabled=$10,withdrawal_enabled=$11,enabled=$12,updated_at=now() WHERE ${scopeWhere()} AND id=$5 RETURNING id,name,kind,provider_id,currencies,deposit_enabled,withdrawal_enabled,enabled`
        : 'INSERT INTO brokerage_payment_methods(organization_id,brand_id,environment_id,product_instance_id,id,name,kind,provider_id,currencies,deposit_enabled,withdrawal_enabled,enabled,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10,$11,$12,$13) RETURNING id,name,kind,provider_id,currencies,deposit_enabled,withdrawal_enabled,enabled',
        id?values.slice(0,12):values)).rows[0];
      if(!row)missing();
      await recordEvent(tx,scope,id?'brokerage.payment_method.changed':'brokerage.payment_method.created','payment_method',String(row.id),{kind:value.kind,enabled:value.enabled}); return rowValue(row);
    });
  }
  private async observe(tx: Executor, scope: TenantContext, payment: PaymentRow, status: string, ref?: string) {
    await tx.query('INSERT INTO brokerage_transactions(id,organization_id,brand_id,environment_id,product_instance_id,client_id,request_id,kind,amount,currency,status,account_id,destination_account_id,reference,actor_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9::numeric,$10,$11,$12,$13,$14,$15)',[randomUUID(),...scopeValues(scope),payment.client_id,payment.id,status==='reversed'?'refund':payment.kind,payment.amount,payment.currency,status,payment.account_id,payment.destination_account_id,ref??null,scope.userId]);
  }
  async createPayment(scope: TenantContext, kind: PaymentKind, input: unknown, own=false): Promise<Row> {
    const value=kind==='withdrawal'?withdrawalSchema.parse(input):kind==='transfer'?transferSchema.parse(input):depositSchema.parse(input);
    return this.db.transaction(scope,async tx=>{
      const client=await this.client(tx,scope,value.client_id,own);
      if(client.status!=='active')throw new AppError(422,'CLIENT_INELIGIBLE','Finance requests require an active client.');
      const sourceId='source_account_id' in value?value.source_account_id:value.account_id;
      await this.account(tx,scope,sourceId,client.id,value.currency);
      const targetId='destination_account_id' in value?value.destination_account_id:null;
      if(targetId)await this.account(tx,scope,targetId,client.id,value.currency);
      let method: {id:string;kind:string;currencies:string[];deposit_enabled:boolean;withdrawal_enabled:boolean}|undefined;
      if('payment_method_id' in value){
        method=(await tx.query<typeof method>(`SELECT id,kind,currencies,deposit_enabled,withdrawal_enabled FROM brokerage_payment_methods WHERE ${scopeWhere()} AND id=$5 AND enabled=true FOR UPDATE`,[...scopeValues(scope),value.payment_method_id])).rows[0];
        if(!method || !method.currencies.includes(value.currency) || (kind==='deposit'?!method.deposit_enabled:!method.withdrawal_enabled))throw new AppError(422,'PAYMENT_METHOD_INELIGIBLE','The selected method does not accept this request and currency.');
      }
      const id=randomUUID(); const destination=kind==='withdrawal'?withdrawalSchema.parse(input).destination:undefined;
      const status=kind==='transfer'||(kind==='deposit'&&method?.kind==='provider')?'provider_pending':kind==='withdrawal'?'requested':'pending';
      const row=(await tx.query<PaymentRow>('INSERT INTO brokerage_payment_requests(id,organization_id,brand_id,environment_id,product_instance_id,client_id,kind,account_id,destination_account_id,payment_method_id,amount,currency,status,destination_encrypted,destination_summary,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::numeric,$12,$13,$14,$15,$16) RETURNING *',[id,...scopeValues(scope),client.id,kind,sourceId,targetId,method?.id??null,value.amount,value.currency,status,destination?this.encryptDestination(scope,client.id,id,'withdrawal',destination):null,destination?destinationSummary(destination):null,scope.userId])).rows[0];
      row.amount=(await tx.query<{amount:string}>('SELECT amount::text FROM brokerage_payment_requests WHERE id=$1',[id])).rows[0].amount;
      await this.observe(tx,scope,row,status);
      await recordEvent(tx,scope,`brokerage.${kind}.requested`,kind,id,{client_id:client.id,amount:row.amount,currency:value.currency,status,provider_execution:false}); return cleanPayment(row);
    });
  }
  private async payment(tx: Executor, scope: TenantContext, id: string, kind: PaymentKind, own=false) {
    const row=(await tx.query<PaymentRow>(`SELECT *,amount::text FROM brokerage_payment_requests WHERE ${scopeWhere()} AND id=$5 AND kind=$6 FOR UPDATE`,[...scopeValues(scope),id,kind])).rows[0];
    if(!row)missing(); if(own)await this.client(tx,scope,row.client_id,true); return row;
  }
  async listPayments(scope: TenantContext, kind: PaymentKind|'transactions', query: FinanceList={}, own=false): Promise<Page> {
    const filter=financeListSchema.parse(query);
    return this.db.transaction(scope,async tx=>{
      const params:unknown[]=[...scopeValues(scope)];let where=scopeWhere();
      if(kind!=='transactions'){params.push(kind);where+=` AND kind=$${params.length}`;}
      if(own){const client=await this.client(tx,scope,filter.client_id,true);params.push(client.id);where+=` AND client_id=$${params.length}`;}
      else if(filter.client_id){params.push(filter.client_id);where+=` AND client_id=$${params.length}`;}
      if(filter.status){params.push(filter.status);where+=` AND status=$${params.length}`;}
      if(filter.currency){params.push(filter.currency);where+=` AND currency=$${params.length}`;}
      if(filter.search){params.push(`%${filter.search.replace(/[\\%_]/g,'\\$&')}%`);where+=` AND (id::text ILIKE $${params.length} OR ${kind==='transactions'?'reference':'external_reference'} ILIKE $${params.length})`;}
      const table=kind==='transactions'?'brokerage_transactions':'brokerage_payment_requests';
      const total=(await tx.query<{total:string}>(`SELECT count(*)::text total FROM ${table} WHERE ${where}`,params)).rows[0].total;
      params.push(filter.limit,filter.offset);
      const order=['created_at','status','amount','currency'].includes(filter.sort??'')?filter.sort:'created_at';
      const clientName=own?'':`,(SELECT c.full_name FROM brokerage_clients c WHERE ${scopeWhere('c')} AND c.id=${table}.client_id) AS client_name`;
      const rows=(await tx.query<Row>(`SELECT ${kind==='transactions'?transactionColumns:paymentColumns}${clientName} FROM ${table} WHERE ${where} ORDER BY ${order} ${filter.direction},id ${filter.direction} LIMIT $${params.length-1} OFFSET $${params.length}`,params)).rows;
      return {data:serializable(rows),pagination:{total:Number(total),limit:filter.limit,offset:filter.offset}};
    });
  }
  async reviewPayment(scope: TenantContext, kind: PaymentKind, id: string, input: unknown) {
    const value=reviewSchema.parse(input);
    return this.db.transaction(scope,async tx=>{
      const row=await this.payment(tx,scope,id,kind);
      if(kind==='transfer'||!['pending','requires_action','processing','requested','review'].includes(row.status))stateError();
      makerChecker(row,scope,(await this.settingsIn(tx,scope)).maker_checker_required);
      if(row.reviewed_by)throw new AppError(409,'REVIEW_ALREADY_RECORDED','A clearance decision has already been recorded.');
      const status=value.decision==='reject'?'rejected':kind==='withdrawal'?'review':row.status;
      const updated=(await tx.query<PaymentRow>('UPDATE brokerage_payment_requests SET reviewed_by=$1,review_decision=$2,reviewed_at=now(),status=$3,last_reason=$4,updated_at=now() WHERE id=$5 RETURNING *,amount::text',[scope.userId,value.decision,status,value.reason,id])).rows[0];
      if(status!==row.status)await this.observe(tx,scope,updated,status);
      await recordEvent(tx,scope,`brokerage.${kind}.reviewed`,kind,id,{client_id:row.client_id,decision:value.decision,reason:value.reason,status});return cleanPayment(updated);
    });
  }
  async changePaymentStatus(scope: TenantContext, kind: PaymentKind, id: string, input: unknown, own=false) {
    const value=paymentStatusSchema.parse(input);
    return this.db.transaction(scope,async tx=>{
      const row=await this.payment(tx,scope,id,kind,own);
      if(own&&value.status!=='cancelled')throw new AppError(403,'CLIENT_FINANCE_DECISION_DENIED','Clients may only cancel an eligible pending request.');
      if(!(paymentTransitions[kind][row.status]??[]).includes(value.status))stateError();if(kind==='deposit'&&value.status==='cancelled'&&row.payment_method_id){const mapped=(await tx.query<{connection_id:string|null}>(`SELECT m.connection_id FROM brokerage_payment_methods m JOIN brokerage_connections b ON b.id=m.connection_id WHERE m.id=$1 AND b.connector_version IS NOT NULL`,[row.payment_method_id])).rows[0];if(mapped?.connection_id){const connection=await loadConnector(boundDatabase(tx),scope,mapped.connection_id);await enqueueOperation(tx,scope,connection,'payment.cancel','payment',row.id);await recordEvent(tx,scope,'brokerage.deposit.cancellation_requested','deposit',row.id,{client_id:row.client_id});return cleanPayment(row);}}
      const settings=await this.settingsIn(tx,scope);
      if(['approved','processing','completed','paid','reversed'].includes(value.status)&&!own)makerChecker(row,scope,settings.maker_checker_required,value.status==='approved');
      if(['approved','completed','paid'].includes(value.status)&&(row.review_decision!=='clear'||!row.reviewed_by))throw new AppError(409,'REVIEW_REQUIRED','A clear finance review is required before this decision.');
      let methodKind='manual';
      if(row.payment_method_id)methodKind=(await tx.query<{kind:string}>('SELECT kind FROM brokerage_payment_methods WHERE id=$1',[row.payment_method_id])).rows[0]?.kind??'provider';
      if(methodKind==='provider'&&['processing','completed','paid','reversed'].includes(value.status))throw new AppError(409,'PAYMENT_PROVIDER_UNAVAILABLE','The payment connector is unavailable; no provider payment was executed.');
      if(['completed','paid','reversed'].includes(value.status))requiredReference(value.reference);
      if(value.status==='paid'&&!row.approved_by)throw new AppError(409,'APPROVAL_REQUIRED','A withdrawal must be approved before payment is acknowledged.');
      const updated=(await tx.query<PaymentRow>('UPDATE brokerage_payment_requests SET status=$1,last_reason=$2,external_reference=COALESCE($3,external_reference),approved_by=CASE WHEN $1=\'approved\' THEN $4 ELSE approved_by END,processed_by=CASE WHEN $1 IN(\'processing\',\'completed\',\'paid\',\'reversed\') THEN $4 ELSE processed_by END,updated_at=now() WHERE id=$5 RETURNING *,amount::text',[value.status,value.reason,value.reference??null,scope.userId,id])).rows[0];
      if(kind==='withdrawal'&&value.status==='approved')await tx.query("UPDATE brokerage_payment_requests SET external_processing_state='external_processing_required' WHERE id=$1",[id]);
      await this.observe(tx,scope,updated,value.status,value.reference);
      await recordEvent(tx,scope,`brokerage.${kind}.${value.status}`,kind,id,{client_id:row.client_id,amount:row.amount,currency:row.currency,status:value.status,reason:value.reason,manual_reference:value.reference??null,provider_execution:false});return cleanPayment(updated);
    });
  }
  async paymentDestination(scope: TenantContext, id: string) {
    return this.db.transaction(scope,async tx=>{
      const row=await this.payment(tx,scope,id,'withdrawal');
      if(!row.destination_encrypted)missing();
      const destination=this.decryptDestination(scope,row.client_id,id,'withdrawal',row.destination_encrypted);
      await recordEvent(tx,scope,'brokerage.withdrawal.destination_accessed','withdrawal',id,{client_id:row.client_id});
      return {destination};
    });
  }
  async applyPartner(scope: TenantContext, input: unknown, own=false) {
    const value=partnerApplicationSchema.parse(input);
    return this.db.transaction(scope,async tx=>{
      const client=await this.client(tx,scope,value.client_id,own);
      if(['restricted','suspended','closed','rejected'].includes(client.status))throw new AppError(422,'CLIENT_INELIGIBLE','This client cannot apply for a partnership.');
      const id=randomUUID();const code=randomBytes(8).toString('hex').toUpperCase();
      const row=(await tx.query<Row>('INSERT INTO brokerage_partners(id,organization_id,brand_id,environment_id,product_instance_id,client_id,referral_code,campaign,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *',[id,...scopeValues(scope),client.id,code,value.campaign??null,scope.userId])).rows[0];
      await recordEvent(tx,scope,'brokerage.partner.applied','partner',id,{client_id:client.id,status:'applicant'});return rowValue({...row,referral_link:`/portal/${scope.productInstanceId}/ib?ref=${code}`});
    });
  }
  async changePartnerStatus(scope: TenantContext, id: string, input: unknown) {
    const value=partnerStatusSchema.parse(input);
    const transitions:Record<string,string[]>={applicant:['review','rejected'],review:['approved','rejected'],approved:['active','suspended','closed'],active:['suspended','closed'],suspended:['active','closed']};
    return this.db.transaction(scope,async tx=>{
      const row=(await tx.query<{status:string;created_by:string}>(`SELECT status,created_by FROM brokerage_partners WHERE ${scopeWhere()} AND id=$5 FOR UPDATE`,[...scopeValues(scope),id])).rows[0];
      if(!row)missing();if(!(transitions[row.status]??[]).includes(value.status))stateError();
      if(value.status==='approved'&&(await this.settingsIn(tx,scope)).maker_checker_required&&row.created_by===scope.userId)throw new AppError(403,'MAKER_CHECKER_REQUIRED','A separate staff member must approve this partner.');
      const updated=(await tx.query<Row>(`UPDATE brokerage_partners SET status=$1,approved_by=CASE WHEN $1='approved' THEN $2 ELSE approved_by END,updated_at=now() WHERE id=$3 RETURNING *`,[value.status,scope.userId,id])).rows[0];
      await recordEvent(tx,scope,`brokerage.partner.${value.status}`,'partner',id,{status:value.status,reason:value.reason});return rowValue(updated);
    });
  }
  async attributeReferral(scope: TenantContext, input: unknown, own=false) {
    const value=attributionSchema.parse(input);
    return this.db.transaction(scope,async tx=>{
      const client=await this.client(tx,scope,value.client_id,own);
      const partner=(await tx.query<{id:string;client_id:string}>(`SELECT id,client_id FROM brokerage_partners WHERE ${scopeWhere()} AND referral_code=$5 AND status='active' FOR UPDATE`,[...scopeValues(scope),value.referral_code])).rows[0];
      if(!partner)throw new AppError(422,'REFERRAL_UNAVAILABLE','The referral code is not active in this brokerage.');
      if(partner.client_id===client.id)throw new AppError(422,'SELF_REFERRAL_DENIED','Partners cannot refer themselves.');
      const settings=await this.settingsIn(tx,scope);
      const window=(await tx.query<{eligible:boolean}>('SELECT $1::timestamptz+($2::integer*interval \'1 hour\')>=now() AS eligible',[client.created_at,settings.referral_window_hours])).rows[0].eligible;
      if(!window)throw new AppError(409,'ATTRIBUTION_WINDOW_CLOSED','The first-touch referral attribution window has closed.');
      const id=randomUUID();const row=(await tx.query<Row>('INSERT INTO brokerage_referrals(id,organization_id,brand_id,environment_id,product_instance_id,client_id,partner_id,referral_code,source,campaign,attributed_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *',[id,...scopeValues(scope),client.id,partner.id,value.referral_code,value.source??null,value.campaign??null,scope.userId])).rows[0];
      await recordEvent(tx,scope,'brokerage.referral.attributed','referral',id,{client_id:client.id,partner_id:partner.id,rule:'first_touch'});return rowValue(row);
    });
  }
  async saveCommissionPlan(scope: TenantContext, input: unknown, id?: string) {
    const value=commissionPlanSchema.parse(input);
    return this.db.transaction(scope,async tx=>{
      if(id&&!(await tx.query(`SELECT id FROM brokerage_commission_plans WHERE ${scopeWhere()} AND id=$5 FOR UPDATE`,[...scopeValues(scope),id])).rows[0])missing();
      if(id&&(await tx.query(`SELECT id FROM brokerage_commission_accruals WHERE ${scopeWhere()} AND commission_plan_id=$5 LIMIT 1`,[...scopeValues(scope),id])).rows.length)throw new AppError(409,'PLAN_IN_USE','Create a new plan version after a plan has produced immutable accruals.');
      const values=[...scopeValues(scope),id??randomUUID(),value.name,value.kind,value.currency,JSON.stringify(value.configuration),value.enabled,scope.userId];
      const row=(await tx.query<Row>(id
        ? `UPDATE brokerage_commission_plans SET name=$6,kind=$7,currency=$8,configuration=$9::jsonb,enabled=$10,updated_at=now() WHERE ${scopeWhere()} AND id=$5 RETURNING *`
        :'INSERT INTO brokerage_commission_plans(organization_id,brand_id,environment_id,product_instance_id,id,name,kind,currency,configuration,enabled,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10,$11) RETURNING *',id?values.slice(0,10):values)).rows[0];
      if(!row)missing();await recordEvent(tx,scope,id?'brokerage.commission_plan.changed':'brokerage.commission_plan.created','commission_plan',String(row.id),{kind:value.kind,currency:value.currency,configuration:value.configuration,enabled:value.enabled});return rowValue(row);
    });
  }
  async assignPartnerPlan(scope: TenantContext, id: string, planId: string) {
    uuid.parse(planId);
    return this.db.transaction(scope,async tx=>{
      const plan=(await tx.query(`SELECT id FROM brokerage_commission_plans WHERE ${scopeWhere()} AND id=$5 AND enabled=true FOR UPDATE`,[...scopeValues(scope),planId])).rows[0];if(!plan)missing();
      const row=(await tx.query<Row>(`UPDATE brokerage_partners SET commission_plan_id=$5,updated_at=now() WHERE ${scopeWhere()} AND id=$6 RETURNING *`,[...scopeValues(scope),planId,id])).rows[0];if(!row)missing();
      await recordEvent(tx,scope,'brokerage.partner.plan_assigned','partner',id,{commission_plan_id:planId});return rowValue(row);
    });
  }
  async createAccrual(scope: TenantContext, input: unknown) {
    const value=accrualSchema.parse(input);
    return this.db.transaction(scope,async tx=>{
      const partner=(await tx.query<{id:string;commission_plan_id:string|null}>(`SELECT id,commission_plan_id FROM brokerage_partners WHERE ${scopeWhere()} AND id=$5 AND status='active' FOR UPDATE`,[...scopeValues(scope),value.partner_id])).rows[0];
      if(!partner)missing();if(partner.commission_plan_id!==value.commission_plan_id)throw new AppError(422,'COMMISSION_PLAN_MISMATCH','Select the active plan assigned to this partner.');
      const plan=(await tx.query<{currency:string}>(`SELECT currency FROM brokerage_commission_plans WHERE ${scopeWhere()} AND id=$5 AND enabled=true FOR UPDATE`,[...scopeValues(scope),value.commission_plan_id])).rows[0];
      if(!plan||plan.currency!==value.currency)throw new AppError(422,'COMMISSION_CURRENCY_MISMATCH','The accrual currency must match the plan.');
      if(value.client_id){
        const referral=(await tx.query(`SELECT id FROM brokerage_referrals WHERE ${scopeWhere()} AND partner_id=$5 AND client_id=$6`,[...scopeValues(scope),value.partner_id,value.client_id])).rows[0];if(!referral)throw new AppError(422,'REFERRAL_REQUIRED','This client must have an immutable referral to the partner.');
      }
      const id=randomUUID();const row=(await tx.query<Row>('INSERT INTO brokerage_commission_accruals(id,organization_id,brand_id,environment_id,product_instance_id,partner_id,commission_plan_id,client_id,amount,currency,source_reference,reason,recorded_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9::numeric,$10,$11,$12,$13) RETURNING *,amount::text',[id,...scopeValues(scope),value.partner_id,value.commission_plan_id,value.client_id??null,value.amount,value.currency,value.source_reference,value.reason,scope.userId])).rows[0];
      await recordEvent(tx,scope,'brokerage.commission.accrued','commission_accrual',id,{partner_id:value.partner_id,amount:String(row.amount),currency:value.currency,source_reference:value.source_reference,origin:'manual_evidence'});return rowValue(row);
    });
  }
  async listPartners(scope: TenantContext, resource:'partners'|'referrals'|'commission-plans'|'accruals'|'payouts', query:FinanceList={}, own=false):Promise<Page> {
    const filter=financeListSchema.parse(query);
    const tables={'partners':'brokerage_partners','referrals':'brokerage_referrals','commission-plans':'brokerage_commission_plans','accruals':'brokerage_commission_accruals','payouts':'brokerage_partner_payouts'};
    return this.db.transaction(scope,async tx=>{
      const params:unknown[]=[...scopeValues(scope)];let where=scopeWhere();
      if(own){
        const client=await this.client(tx,scope,filter.client_id,true);
        if(resource==='partners'){params.push(client.id);where+=` AND client_id=$${params.length}`;}
        else {const partner=(await tx.query<{id:string}>(`SELECT id FROM brokerage_partners WHERE ${scopeWhere()} AND client_id=$5`,[...scopeValues(scope),client.id])).rows[0];if(!partner)return {data:[],pagination:{total:0,limit:filter.limit,offset:filter.offset}};params.push(partner.id);where+=` AND partner_id=$${params.length}`;}
      }else if(filter.client_id&&['partners','referrals','accruals'].includes(resource)){params.push(filter.client_id);where+=` AND client_id=$${params.length}`;}
      if(filter.status&&['partners','payouts'].includes(resource)){params.push(filter.status);where+=` AND status=$${params.length}`;}
      if(filter.currency&&['commission-plans','accruals','payouts'].includes(resource)){params.push(filter.currency);where+=` AND currency=$${params.length}`;}
      if(filter.search){params.push(`%${filter.search.replace(/[\\%_]/g,'\\$&')}%`);const fields=resource==='partners'?['referral_code','campaign']:resource==='referrals'?['referral_code','source','campaign']:resource==='commission-plans'?['name']:resource==='accruals'?['source_reference']:['external_reference'];where+=` AND (id::text ILIKE $${params.length} OR ${fields.map(field=>`${field} ILIKE $${params.length}`).join(' OR ')})`;}
      const total=(await tx.query<{total:string}>(`SELECT count(*)::text total FROM ${tables[resource]} WHERE ${where}`,params)).rows[0].total;
      params.push(filter.limit,filter.offset);const columns=resource==='payouts'?payoutColumns:resource==='accruals'?'*,amount::text':'*';
      const allowedSort=resource==='commission-plans'?['created_at','name','kind','currency']:resource==='partners'?['created_at','status']:resource==='referrals'?['created_at']:resource==='accruals'?['created_at','amount','currency']:['created_at','status','amount','currency'];const order=allowedSort.includes(filter.sort??'')?filter.sort:'created_at';
      const clientName=own||resource==='commission-plans'?'':resource==='payouts'?`,(SELECT c.full_name FROM brokerage_clients c JOIN brokerage_partners p ON p.organization_id=c.organization_id AND p.brand_id=c.brand_id AND p.environment_id=c.environment_id AND p.product_instance_id=c.product_instance_id AND p.client_id=c.id WHERE ${scopeWhere('c')} AND p.id=brokerage_partner_payouts.partner_id) AS client_name`:` ,(SELECT c.full_name FROM brokerage_clients c WHERE ${scopeWhere('c')} AND c.id=${tables[resource]}.client_id) AS client_name`;
      const rows=(await tx.query<Row>(`SELECT ${columns}${clientName} FROM ${tables[resource]} WHERE ${where} ORDER BY ${order} ${filter.direction},id ${filter.direction} LIMIT $${params.length-1} OFFSET $${params.length}`,params)).rows;
      return {data:serializable(rows),pagination:{total:Number(total),limit:filter.limit,offset:filter.offset}};
    });
  }
  async ownIb(scope: TenantContext) {
    return this.db.transaction(scope,async tx=>{
      const client=await this.client(tx,scope,undefined,true);
      const partner=(await tx.query<Row>(`SELECT id,client_id,status,referral_code,campaign,commission_plan_id,created_at FROM brokerage_partners WHERE ${scopeWhere()} AND client_id=$5`,[...scopeValues(scope),client.id])).rows[0];
      const attribution=(await tx.query<Row>(`SELECT id,referral_code,source,campaign,created_at FROM brokerage_referrals WHERE ${scopeWhere()} AND client_id=$5`,[...scopeValues(scope),client.id])).rows[0]??null;
      if(!partner)return {partner:null,attribution,referrals:[],accruals:[],plan:null};
      // A partner sees safe referral identifiers, never the referred client's personal information.
      const referrals=(await tx.query<Row>(`SELECT id,client_id,source,campaign,created_at FROM brokerage_referrals WHERE ${scopeWhere()} AND partner_id=$5 ORDER BY created_at DESC LIMIT 100`,[...scopeValues(scope),partner.id])).rows;
      const accruals=(await tx.query<Row>(`SELECT a.id,a.amount::text,a.currency,a.created_at,NOT EXISTS(SELECT 1 FROM brokerage_payout_allocations p WHERE p.accrual_id=a.id AND p.released_at IS NULL) AS available FROM brokerage_commission_accruals a WHERE ${scopeWhere('a')} AND a.partner_id=$5 ORDER BY a.created_at DESC LIMIT 100`,[...scopeValues(scope),partner.id])).rows;
      const plan=partner.commission_plan_id?(await tx.query<Row>(`SELECT id,name,kind,currency,configuration FROM brokerage_commission_plans WHERE ${scopeWhere()} AND id=$5`,[...scopeValues(scope),partner.commission_plan_id])).rows[0]??null:null;
      return serializable({partner:{...partner,referral_link:`/portal/${scope.productInstanceId}/ib?ref=${partner.referral_code}`},attribution,referrals,accruals,plan});
    });
  }
  async createPayout(scope: TenantContext, input: unknown, own=false) {
    const value=payoutSchema.parse(input);
    return this.db.transaction(scope,async tx=>{
      let partnerId=value.partner_id;
      if(own){const client=await this.client(tx,scope,undefined,true);const partner=(await tx.query<{id:string}>(`SELECT id FROM brokerage_partners WHERE ${scopeWhere()} AND client_id=$5 AND status='active' FOR UPDATE`,[...scopeValues(scope),client.id])).rows[0];if(!partner)missing();if(partnerId&&partnerId!==partner.id)missing();partnerId=partner.id;}
      if(!partnerId)throw new AppError(422,'PARTNER_REQUIRED','Select a partner.');
      const partner=(await tx.query<{id:string;client_id:string}>(`SELECT id,client_id FROM brokerage_partners WHERE ${scopeWhere()} AND id=$5 AND status='active' FOR UPDATE`,[...scopeValues(scope),partnerId])).rows[0];if(!partner)missing();
      // Ordered row locks plus a unique active allocation prevent simultaneous double claims.
      const accruals=(await tx.query<{id:string;currency:string}>(`SELECT id,currency FROM brokerage_commission_accruals WHERE ${scopeWhere()} AND partner_id=$5 AND id=ANY($6::uuid[]) ORDER BY id`,[...scopeValues(scope),partnerId,value.accrual_ids])).rows;
      if(accruals.length!==value.accrual_ids.length||new Set(accruals.map(row=>row.currency)).size!==1)throw new AppError(422,'ACCRUAL_SELECTION_INVALID','Select available accruals for this partner in one currency.');
      const allocated=(await tx.query('SELECT id FROM brokerage_payout_allocations WHERE accrual_id=ANY($1::uuid[]) AND released_at IS NULL',[value.accrual_ids])).rows;
      if(allocated.length)throw new AppError(409,'ACCRUAL_ALREADY_ALLOCATED','An accrual is already reserved for another payout.');
      const amount=(await tx.query<{amount:string}>('SELECT sum(amount)::text AS amount FROM brokerage_commission_accruals WHERE id=ANY($1::uuid[])',[value.accrual_ids])).rows[0].amount;
      if(!exactAmount.safeParse(amount).success)throw new AppError(422,'PAYOUT_AMOUNT_LIMIT','The selected accrual total exceeds the supported exact decimal amount limit.');
      const id=randomUUID();const row=(await tx.query<PayoutRow>('INSERT INTO brokerage_partner_payouts(id,organization_id,brand_id,environment_id,product_instance_id,partner_id,amount,currency,destination_encrypted,destination_summary,created_by) VALUES($1,$2,$3,$4,$5,$6,$7::numeric,$8,$9,$10,$11) RETURNING *,amount::text',[id,...scopeValues(scope),partnerId,amount,accruals[0].currency,this.encryptDestination(scope,partner.client_id,id,'partner_payout',value.destination),destinationSummary(value.destination),scope.userId])).rows[0];
      for(const accrualId of value.accrual_ids)await tx.query('INSERT INTO brokerage_payout_allocations(id,organization_id,brand_id,environment_id,product_instance_id,payout_id,accrual_id) VALUES($1,$2,$3,$4,$5,$6,$7)',[randomUUID(),...scopeValues(scope),id,accrualId]);
      await recordEvent(tx,scope,'brokerage.payout.requested','partner_payout',id,{partner_id:partnerId,amount,currency:row.currency,accrual_count:value.accrual_ids.length});return cleanPayment(row);
    });
  }
  private async payout(tx:Executor,scope:TenantContext,id:string,own=false) {
    const row=(await tx.query<PayoutRow>(`SELECT *,amount::text FROM brokerage_partner_payouts WHERE ${scopeWhere()} AND id=$5 FOR UPDATE`,[...scopeValues(scope),id])).rows[0];if(!row)missing();
    if(own){const partner=(await tx.query<{client_id:string}>('SELECT client_id FROM brokerage_partners WHERE id=$1',[row.partner_id])).rows[0];if(!partner)missing();await this.client(tx,scope,partner.client_id,true);}return row;
  }
  async reviewPayout(scope:TenantContext,id:string,input:unknown) {
    const value=reviewSchema.parse(input);
    return this.db.transaction(scope,async tx=>{
      const row=await this.payout(tx,scope,id);
      if(!['requested','review'].includes(row.status)||row.reviewed_by)stateError();
      makerChecker(row,scope,(await this.settingsIn(tx,scope)).maker_checker_required);
      const status=value.decision==='clear'?'review':'rejected';
      const updated=(await tx.query<PayoutRow>('UPDATE brokerage_partner_payouts SET reviewed_by=$1,review_decision=$2,reviewed_at=now(),status=$3,last_reason=$4,updated_at=now() WHERE id=$5 RETURNING *,amount::text',[scope.userId,value.decision,status,value.reason,id])).rows[0];
      if(status==='rejected')await tx.query('UPDATE brokerage_payout_allocations SET released_at=now() WHERE payout_id=$1 AND released_at IS NULL',[id]);
      await recordEvent(tx,scope,'brokerage.payout.reviewed','partner_payout',id,{decision:value.decision,status,reason:value.reason});return cleanPayment(updated);
    });
  }
  async changePayoutStatus(scope:TenantContext,id:string,input:unknown,own=false) {
    const value=paymentStatusSchema.parse(input);
    return this.db.transaction(scope,async tx=>{
      const row=await this.payout(tx,scope,id,own);
      if(own&&value.status!=='cancelled')throw new AppError(403,'CLIENT_FINANCE_DECISION_DENIED','Clients may only cancel an eligible pending request.');
      if(!(payoutTransitions[row.status]??[]).includes(value.status))stateError();
      if(['approved','processing','paid'].includes(value.status)){
        makerChecker(row,scope,(await this.settingsIn(tx,scope)).maker_checker_required,value.status==='approved');
        if(row.review_decision!=='clear'||!row.reviewed_by)throw new AppError(409,'REVIEW_REQUIRED','A clear payout review is required.');
      }
      if(value.status==='paid'){requiredReference(value.reference);if(!row.approved_by)throw new AppError(409,'APPROVAL_REQUIRED','Approve this payout before acknowledging payment.');}
      const updated=(await tx.query<PayoutRow>(`UPDATE brokerage_partner_payouts SET status=$1,last_reason=$2,external_reference=COALESCE($3,external_reference),approved_by=CASE WHEN $1='approved' THEN $4 ELSE approved_by END,processed_by=CASE WHEN $1 IN('processing','paid') THEN $4 ELSE processed_by END,updated_at=now() WHERE id=$5 RETURNING *,amount::text`,[value.status,value.reason,value.reference??null,scope.userId,id])).rows[0];
      if(['cancelled','rejected'].includes(value.status))await tx.query('UPDATE brokerage_payout_allocations SET released_at=now() WHERE payout_id=$1 AND released_at IS NULL',[id]);
      await recordEvent(tx,scope,`brokerage.payout.${value.status}`,'partner_payout',id,{partner_id:row.partner_id,amount:row.amount,currency:row.currency,reason:value.reason,manual_reference:value.reference??null,provider_execution:false});return cleanPayment(updated);
    });
  }
  async payoutDestination(scope:TenantContext,id:string) {
    return this.db.transaction(scope,async tx=>{
      const row=await this.payout(tx,scope,id);const partner=(await tx.query<{client_id:string}>('SELECT client_id FROM brokerage_partners WHERE id=$1',[row.partner_id])).rows[0];if(!partner||!row.destination_encrypted)missing();
      const destination=this.decryptDestination(scope,partner.client_id,id,'partner_payout',row.destination_encrypted);
      await recordEvent(tx,scope,'brokerage.payout.destination_accessed','partner_payout',id,{partner_id:row.partner_id});return {destination};
    });
  }
}
