import type { TenantContext } from '../../../shared/types.js';

/** Canonical provider family slugs already used by the Integration Hub catalog. */
export const providerFamilies = ['metatrader-5', 'metatrader-4', 'tradelocker', 'ctrader'] as const;
export type ProviderFamily = typeof providerFamilies[number];
export type ProviderIdentifier = ProviderFamily | (string & { readonly __providerIdentifier?: never });

/** Provider capabilities are explicit operation declarations, never implicit interface methods. */
export const providerCapabilities = [
  'account.discovery',
  'account.balance',
  'account.equity',
  'symbol.discovery',
  'quote.subscribe',
  'candles.history',
  'order.submit',
  'order.cancel',
  'order.status',
  'position.open',
  'position.sync',
  'fills.history',
  'transactions.history',
  'connection.health',
  'reconciliation',
] as const;
export type ProviderCapability = typeof providerCapabilities[number];

export type ProviderHealthState = 'UNCONFIGURED' | 'DISCONNECTED' | 'CONNECTING' | 'HEALTHY' | 'DEGRADED' | 'UNAVAILABLE';
export type ProviderEnvironment = 'sandbox' | 'demo' | 'production';
export type ExactDecimal = string;

export interface ProviderInstanceScope {
  readonly organizationId: string;
  readonly brandId: string;
  readonly environmentId: string;
  readonly productInstanceId: string;
  /** The durable brokerage connection ID. Provider type alone is never an instance identity. */
  readonly connectionId: string;
}

/** Trusted scope is resolved by the existing tenancy/service layer before runtime registration. */
export interface ProviderInstanceContext {
  readonly scope: ProviderInstanceScope;
  readonly environment: ProviderEnvironment;
  readonly configuration: Readonly<Record<string, string>>;
}

export interface ProviderDescriptor {
  readonly id: ProviderIdentifier;
  readonly family: ProviderFamily | 'custom';
  readonly name: string;
  readonly category: 'trading_platform' | 'custom';
  readonly knownFamily: boolean;
  /** Family-level knowledge is separate from a configured, working connection. */
  readonly familyCapabilities: readonly ProviderCapability[];
  /** Capabilities actually implemented by this adapter definition. */
  readonly capabilities: readonly ProviderCapability[];
  readonly unavailableCapabilities: readonly ProviderCapability[];
  readonly connectorAvailable: boolean;
  readonly connectionMode: 'none' | 'request' | 'api_key' | 'oauth' | 'managed' | 'manual';
}

export interface ProviderRequiredConfiguration {
  readonly key: string;
  readonly description: string;
  readonly secret: boolean;
}

export interface ProviderAccount {
  readonly providerAccountId: string;
  readonly currency?: string;
}

export interface ProviderBalance {
  readonly providerAccountId: string;
  readonly currency: string;
  readonly balance: ExactDecimal;
  readonly equity: ExactDecimal;
}

export interface ProviderSymbol {
  readonly symbol: string;
  readonly baseCurrency?: string;
  readonly quoteCurrency?: string;
  readonly tickSize?: ExactDecimal;
}

export interface ProviderQuoteSubscription {
  unsubscribe(): Promise<void>;
}

export interface ProviderCandle {
  readonly symbol: string;
  readonly open: ExactDecimal;
  readonly high: ExactDecimal;
  readonly low: ExactDecimal;
  readonly close: ExactDecimal;
  readonly volume?: ExactDecimal;
  readonly openedAt: string;
}

export interface ProviderOrder {
  readonly providerOrderId: string;
  readonly providerAccountId: string;
  readonly status: string;
}

export interface ProviderPosition {
  readonly providerPositionId: string;
  readonly providerAccountId: string;
  readonly symbol: string;
  readonly volume: ExactDecimal;
}

export interface ProviderFill {
  readonly providerFillId: string;
  readonly providerAccountId: string;
  readonly price: ExactDecimal;
  readonly volume: ExactDecimal;
}

export interface ProviderTransaction {
  readonly providerTransactionId: string;
  readonly providerAccountId: string;
  readonly amount: ExactDecimal;
  readonly currency: string;
}

export interface ProviderOrderRequest {
  readonly providerAccountId: string;
  readonly symbol: string;
  readonly side: 'buy' | 'sell';
  readonly volume: ExactDecimal;
  readonly price?: ExactDecimal;
  readonly idempotencyKey: string;
}

/** Every future operation has a typed contract; there is intentionally no execute(string, ...). */
export interface ProviderOperations {
  discoverAccounts(): Promise<readonly ProviderAccount[]>;
  getBalance(accountId: string): Promise<ProviderBalance>;
  getEquity(accountId: string): Promise<ProviderBalance>;
  discoverSymbols(): Promise<readonly ProviderSymbol[]>;
  subscribeQuotes(symbols: readonly string[], onQuote: (quote: unknown) => void): Promise<ProviderQuoteSubscription>;
  getHistoricalCandles(symbol: string, from: string, to: string): Promise<readonly ProviderCandle[]>;
  submitOrder(request: ProviderOrderRequest): Promise<ProviderOrder>;
  cancelOrder(accountId: string, orderId: string, idempotencyKey: string): Promise<ProviderOrder>;
  getOrderStatus(accountId: string, orderId: string): Promise<ProviderOrder>;
  getOpenPositions(accountId: string): Promise<readonly ProviderPosition[]>;
  synchronizePositions(accountId: string): Promise<readonly ProviderPosition[]>;
  getHistoricalFills(accountId: string, from: string, to: string): Promise<readonly ProviderFill[]>;
  getAccountTransactions(accountId: string, from: string, to: string): Promise<readonly ProviderTransaction[]>;
  reconcile(accountId: string): Promise<void>;
}

export interface ProviderHealthSignal {
  readonly status: 'healthy' | 'degraded' | 'unavailable';
  /** Safe, bounded diagnostic text. It must never contain credentials or raw provider payloads. */
  readonly diagnostic?: string;
}

export type ProviderErrorCode =
  | 'CONFIGURATION_MISSING'
  | 'UNSUPPORTED_OPERATION'
  | 'AUTHENTICATION_REJECTED'
  | 'TRANSPORT_FAILURE'
  | 'TIMEOUT'
  | 'RATE_LIMITED'
  | 'PROVIDER_UNAVAILABLE'
  | 'DUPLICATE_PROVIDER'
  | 'INVALID_DESCRIPTOR'
  | 'UNKNOWN_PROVIDER'
  | 'INSTANCE_ALREADY_REGISTERED'
  | 'UNKNOWN_INSTANCE'
  | 'SHUTDOWN'
  | 'UNEXPECTED_FAILURE';

export class ProviderAdapterError extends Error {
  readonly name = 'ProviderAdapterError';
  readonly statusCode: number;
  constructor(
    readonly code: ProviderErrorCode,
    message = 'Provider operation failed.',
    readonly retryable = false,
    readonly diagnostic?: string,
  ) {
    super(message);
    this.statusCode = code === 'UNKNOWN_PROVIDER' || code === 'UNKNOWN_INSTANCE' ? 404 : code === 'DUPLICATE_PROVIDER' || code === 'INSTANCE_ALREADY_REGISTERED' ? 409 : ['CONFIGURATION_MISSING', 'UNSUPPORTED_OPERATION', 'INVALID_DESCRIPTOR'].includes(code) ? 422 : 503;
  }
}

export function unsupportedOperation(operation: ProviderCapability): never {
  throw new ProviderAdapterError('UNSUPPORTED_OPERATION', `Provider operation ${operation} is not implemented.`, false, operation);
}

export interface ProviderAdapterInstance {
  initialize(): Promise<void>;
  healthCheck(): Promise<ProviderHealthSignal>;
  shutdown(): Promise<void>;
  readonly operations: Partial<ProviderOperations>;
}

export interface ProviderAdapterDefinition {
  readonly descriptor: ProviderDescriptor;
  readonly implementationVersion: string;
  readonly requiredConfiguration: readonly ProviderRequiredConfiguration[];
  readonly create: (context: ProviderInstanceContext) => ProviderAdapterInstance;
  /** Configuration validation belongs to the adapter and may inspect secrets without logging them. */
  readonly isConfigured?: (configuration: Readonly<Record<string, string>>) => boolean;
}

export function scopeKey(scope: ProviderInstanceScope): string {
  const parts = [scope.organizationId, scope.brandId, scope.environmentId, scope.productInstanceId, scope.connectionId];
  if (parts.some((part) => typeof part !== 'string' || !part || part.length > 200 || part.includes(String.fromCharCode(0)) || /[\r\n]/.test(part))) {
    throw new ProviderAdapterError('UNKNOWN_INSTANCE', 'The provider instance scope is invalid.');
  }
  // Preserve field boundaries so attacker-controlled delimiters cannot alias
  // two distinct tenant/connection scopes in the in-memory registry.
  return JSON.stringify(parts);
}

export function sanitizeDiagnostic(value: unknown, secrets: Readonly<Record<string, string>> = {}): string | undefined {
  if (typeof value !== 'string') return undefined;
  let normalized = value
    .replace(/[\r\n\t]/g, ' ')
    .replace(/(password|secret|token|authorization|api[-_ ]?key|credential)\s*["']?\s*[:=]\s*["']?\s*(?:bearer\s+)?["']?\s*[^\s,;}'"]+["']?/gi, '$1=[REDACTED]')
    .replace(/(authorization)\s+(?:bearer\s+)?[^\s,;]+/gi, '$1=[REDACTED]');
  for (const secret of Object.values(secrets)) {
    if (secret.length > 0) normalized = normalized.split(secret).join('[REDACTED]');
  }
  return normalized.slice(0, 160);
}

export function classifyProviderError(error: unknown): ProviderAdapterError {
  if (error instanceof ProviderAdapterError) return error;
  return new ProviderAdapterError('UNEXPECTED_FAILURE', 'Provider operation failed unexpectedly.');
}

/** Kept as a structural helper so callers can pass an existing authenticated TenantContext safely. */
export function scopeFromTenant(context: TenantContext, connectionId: string): ProviderInstanceScope {
  return { organizationId: context.organizationId, brandId: context.brandId, environmentId: context.environmentId, productInstanceId: context.productInstanceId, connectionId };
}
