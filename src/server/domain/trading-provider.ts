import { AppError } from './errors.js';
import type { IntegrationAdapter, ProviderConnectionContext } from './integrations.js';

/** Decimal strings preserve provider precision; money is never represented as a float. */
export type Decimal = string;
export interface TradingAccount {
  provider_account_id: string; display_name: string; currency: string; group_id: string;
  leverage?: number; status: 'enabled' | 'disabled'; login?: string;
  provider_user_id?: string; external_reference?: string; provider_status?: string;
}
export interface AccountSnapshot {
  provider_account_id: string; currency: string; balance: Decimal; equity: Decimal;
  margin: Decimal; free_margin: Decimal; margin_level?: Decimal; observed_at: string;
}
export interface TradingOrder {
  provider_order_id: string; provider_account_id: string; symbol: string; side: 'buy' | 'sell';
  type: 'market' | 'limit' | 'stop' | 'stop_limit' | 'manual' | 'trailing_stop'; volume: Decimal; price?: Decimal;
  stop_loss?: Decimal; take_profit?: Decimal;
  status: 'pending' | 'filled' | 'partially_filled' | 'cancelled' | 'rejected'; created_at: string;
}
export interface TradingPosition {
  provider_position_id: string; provider_account_id: string; symbol: string; side: 'buy' | 'sell';
  volume: Decimal; open_price: Decimal; current_price?: Decimal; profit?: Decimal;
  stop_loss?: Decimal; take_profit?: Decimal; opened_at: string;
}
export interface TradingTrade {
  provider_trade_id: string; provider_account_id: string; provider_order_id?: string;
  provider_position_id?: string; symbol: string; side: 'buy' | 'sell'; volume: Decimal;
  price: Decimal; profit?: Decimal; commission?: Decimal; swap?: Decimal; executed_at: string;
}
export interface TradingSymbol {
  symbol: string; description: string; base_currency: string; quote_currency: string;
  digits: number; tick_size: Decimal; contract_size: Decimal;
  minimum_volume: Decimal; maximum_volume: Decimal; volume_step: Decimal;
}
export interface BalanceChange {
  provider_transaction_id: string; provider_account_id: string; currency: string;
  amount: Decimal; kind: 'deposit' | 'withdrawal' | 'adjustment' | 'realized_profit'; recorded_at: string;
}
export interface TradingHistory { trades: TradingTrade[]; balance_changes: BalanceChange[]; next_cursor?: string }
export interface TradingQuery { from?: string; to?: string; cursor?: string; limit?: number }
export interface ProviderCommand { idempotency_key: string; reason: string }
export interface CreateAccountCommand extends ProviderCommand {
  display_name: string; group_id: string; currency: string; leverage: number;
  /** Provisioning identity is carried only in memory; credentials belong in the vault. */
  provider_user_id?: string; account_type?: 'live' | 'demo'; client_email?: string; trader_password?: string;
  external_reference?: string; user_idempotency_key?: string;
}
export interface UpdateAccountCommand extends ProviderCommand { display_name?: string; group_id?: string; leverage?: number }
export interface AccountEvent {
  provider_account_id: string; kind: 'account.updated' | 'order.updated' | 'position.updated' | 'trade.created' | 'balance.updated';
  observed_at: string; sequence?: string; snapshot?: AccountSnapshot; order?: TradingOrder; position?: TradingPosition; trade?: TradingTrade;
}
export interface AccountEventSubscription { unsubscribe(): Promise<void> }
export interface TradingProviderOperations {
  createAccount(context: ProviderConnectionContext, input: CreateAccountCommand): Promise<TradingAccount>;
  getAccount(context: ProviderConnectionContext, accountId: string): Promise<TradingAccount>;
  updateAccount(context: ProviderConnectionContext, accountId: string, input: UpdateAccountCommand): Promise<TradingAccount>;
  enableAccount(context: ProviderConnectionContext, accountId: string, input: ProviderCommand): Promise<void>;
  disableAccount(context: ProviderConnectionContext, accountId: string, input: ProviderCommand): Promise<void>;
  resetAccount(context: ProviderConnectionContext, accountId: string, input: ProviderCommand): Promise<void>;
  setBalance(context: ProviderConnectionContext, accountId: string, amount: Decimal, input: ProviderCommand): Promise<AccountSnapshot>;
  adjustBalance(context: ProviderConnectionContext, accountId: string, amount: Decimal, input: ProviderCommand): Promise<AccountSnapshot>;
  setGroup(context: ProviderConnectionContext, accountId: string, groupId: string, input: ProviderCommand): Promise<TradingAccount>;
  setLeverage(context: ProviderConnectionContext, accountId: string, leverage: number, input: ProviderCommand): Promise<TradingAccount>;
  getBalance(context: ProviderConnectionContext, accountId: string): Promise<AccountSnapshot>;
  getEquity(context: ProviderConnectionContext, accountId: string): Promise<AccountSnapshot>;
  getMargin(context: ProviderConnectionContext, accountId: string): Promise<AccountSnapshot>;
  getOrders(context: ProviderConnectionContext, accountId: string, query?: TradingQuery): Promise<TradingOrder[]>;
  getPositions(context: ProviderConnectionContext, accountId: string): Promise<TradingPosition[]>;
  getTrades(context: ProviderConnectionContext, accountId: string, query?: TradingQuery): Promise<TradingTrade[]>;
  getHistory(context: ProviderConnectionContext, accountId: string, query?: TradingQuery): Promise<TradingHistory>;
  getSymbols(context: ProviderConnectionContext): Promise<TradingSymbol[]>;
  closePosition(context: ProviderConnectionContext, accountId: string, positionId: string, input: ProviderCommand & { volume?: Decimal }): Promise<void>;
  subscribeAccountEvents(context: ProviderConnectionContext, accountId: string, listener: (event: AccountEvent) => Promise<void>): Promise<AccountEventSubscription>;
}
export const tradingOperationCapabilities = {
  createAccount: 'account.create', getAccount: 'account.read', updateAccount: 'account.update',
  enableAccount: 'account.enable', disableAccount: 'account.disable', resetAccount: 'account.reset',
  setBalance: 'balance.set', adjustBalance: 'balance.adjust', setGroup: 'account.group.set', setLeverage: 'account.leverage.set',
  getBalance: 'balance.read', getEquity: 'equity.read', getMargin: 'margin.read', getOrders: 'orders.read',
  getPositions: 'positions.read', getTrades: 'trades.read', getHistory: 'history.read', getSymbols: 'symbols.read',
  closePosition: 'position.close', subscribeAccountEvents: 'account.events.subscribe',
} as const satisfies Record<keyof TradingProviderOperations, string>;
export type TradingCapability = typeof tradingOperationCapabilities[keyof typeof tradingOperationCapabilities];
/** A provider implements only its declared subset; catalog metadata alone never enables it. */
export interface TradingProviderAdapter extends IntegrationAdapter { trading: Partial<TradingProviderOperations> }
export function tradingOperation<K extends keyof TradingProviderOperations>(adapter: TradingProviderAdapter, operation: K): TradingProviderOperations[K] {
  const handler = adapter.trading[operation];
  if (!adapter.descriptor.connectorAvailable || !adapter.descriptor.capabilities.includes(tradingOperationCapabilities[operation]) || typeof handler !== 'function') {
    throw new AppError(422, 'PROVIDER_CAPABILITY_UNAVAILABLE', 'The provider does not have an available adapter for this operation.');
  }
  return handler as TradingProviderOperations[K];
}
