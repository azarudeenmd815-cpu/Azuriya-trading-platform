import type { TenantContext } from '../../shared/types.js';
import type { Decimal } from '../domain/trading-provider.js';

/** A PSP owns payment execution. The CRM owns the durable request and observation. */
export interface PaymentIntent {
  reference: string; status: 'created'|'pending'|'processing'|'requires_action'|'completed'|'failed'|'cancelled'|'reversed';
  amount: Decimal; currency: string; observed_at: string;
  action?: { kind: 'redirect'; url: string; expires_at: string };
}
export type PaymentResult = PaymentIntent | { status: 'unavailable'; reason: string };
export interface PaymentProvider {
  readonly slug: string; readonly available: boolean;
  createPayment(scope: TenantContext, input: { request_id: string; amount: Decimal; currency: string; idempotency_key: string }): Promise<PaymentResult>;
  getPayment(scope: TenantContext, reference: string): Promise<PaymentResult>;
  cancelPayment(scope: TenantContext, input: { reference: string; idempotency_key: string }): Promise<PaymentResult>;
  refundPayment(scope: TenantContext, input: { reference: string; amount: Decimal; reason: string; idempotency_key: string }): Promise<PaymentResult>;
  handleWebhook(scope: TenantContext, input: { body: Uint8Array; signature: string; received_at: string }): Promise<{ provider_event_id: string; payment: PaymentIntent } | { status: 'unavailable'; reason: string }>;
}
/** No catalog flag or credentials alone can turn a missing adapter into execution. */
export class UnavailablePaymentProvider implements PaymentProvider {
  readonly available = false;
  constructor(readonly slug: string) {}
  private unavailable() { return { status:'unavailable' as const,reason:'The payment adapter is not implemented; no payment or balance movement was executed.' }; }
  async createPayment() { return this.unavailable(); }
  async getPayment() { return this.unavailable(); }
  async cancelPayment() { return this.unavailable(); }
  async refundPayment() { return this.unavailable(); }
  async handleWebhook() { return this.unavailable(); }
}
