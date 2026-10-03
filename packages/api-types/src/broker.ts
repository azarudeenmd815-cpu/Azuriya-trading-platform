import type { Decimal, User, TradingAccount, Instrument, Position, Order, Fill, AccountTransaction, AuditEvent } from "./index";
/** Version 1 broker contracts. Financial quantities remain decimal strings. */
export type BrokerCapability = "broker.read" | "clients.read" | "clients.update" | "accounts.read" | "accounts.create" | "accounts.update" | "accounts.balance_adjust" | "symbols.read" | "symbols.write" | "groups.read" | "groups.write" | "pricing.read" | "pricing.write" | "risk.read" | "risk.write" | "dealer.read" | "reports.read" | "audit.read" | "tenant.settings.read" | "tenant.settings.write";
export interface AdminSession { user: User; capabilities: BrokerCapability[]; execution_mode: "SIMULATED_INTERNAL"; }
export type ProfileKind = "PRICING" | "COMMISSION" | "SWAP" | "LEVERAGE" | "MARGIN" | "EXECUTION" | "SESSION";
export type SessionStatus = "OPEN" | "CLOSE_ONLY" | "CLOSED";
export interface ProfileRefs { pricing_profile_id?: string; commission_plan_id?: string; swap_plan_id?: string; leverage_plan_id?: string; margin_profile_id?: string; execution_profile_id?: string; trading_session_profile_id?: string; }
export interface PricingPolicy { unit: "PRICE" | "POINTS"; bid_markup: Decimal; ask_markup: Decimal; minimum_spread: Decimal; maximum_spread: Decimal; }
export interface CommissionPolicy { mode: "NONE" | "PER_LOT_PER_SIDE" | "PER_LOT_ROUND_TURN"; amount: Decimal; currency: "USD"; }
export interface SwapPolicy { enabled: boolean; long_rate: Decimal; short_rate: Decimal; currency: "USD"; timezone: string; rollover_time: string; triple_swap_day: number; catch_up_days: number; }
export type LeverageRule = ({ asset_class: string; symbol_group_id?: never; symbol?: never } | { symbol_group_id: string; asset_class?: never; symbol?: never } | { symbol: string; asset_class?: never; symbol_group_id?: never }) & { max_leverage: Decimal };
export interface LeveragePolicy { max_leverage: Decimal; rules: LeverageRule[]; }
export interface MarginPolicy { margin_call_level: Decimal; stop_out_level: Decimal; stop_out_enabled: boolean; }
export interface ExecutionPolicy { latency_mode: "NONE" | "FIXED"; base_latency_ms: number; slippage_mode: "NONE"; }
export interface SessionWindow { day: number; start: string; end: string; status: SessionStatus; }
export interface SessionPolicy { timezone: string; default_status: SessionStatus; windows: SessionWindow[]; }
export type BrokerProfileSymbolOverride = { symbol: string } & ({ pricing: PricingPolicy; commission?: never; swap?: never } | { commission: CommissionPolicy; pricing?: never; swap?: never } | { swap: SwapPolicy; pricing?: never; commission?: never });
export interface BrokerRecord { id: string; tenant_id: string; name: string; description: string; revision: number; created_at: string; updated_at: string; }
export interface BrokerProfile extends BrokerRecord { kind: ProfileKind; status: "ACTIVE" | "DISABLED"; pricing?: PricingPolicy; commission?: CommissionPolicy; swap?: SwapPolicy; leverage?: LeveragePolicy; margin?: MarginPolicy; execution?: ExecutionPolicy; session?: SessionPolicy; symbol_overrides?: BrokerProfileSymbolOverride[]; }
export type SymbolRule = ProfileRefs & ({ symbol: string; symbol_group_id?: never } | { symbol_group_id: string; symbol?: never });
export interface TradingGroup extends BrokerRecord, ProfileRefs { status: "ACTIVE" | "DISABLED"; symbol_rules: SymbolRule[]; }
export interface SymbolGroup extends BrokerRecord, ProfileRefs { symbols?: string[]; }
export interface BrokerSettings { tenant_id: string; broker_name: string; base_currency: "USD"; default_trading_group_id: string; timezone: string; support_email: string; trading_enabled: boolean; revision: number; created_at: string; updated_at: string; }
export interface EffectiveConfiguration extends ProfileRefs { account_id: string; symbol: string; trading_group_id: string; trading_group_revision: number; profile_revisions: Record<string, number>; effective_leverage: Decimal; session_status: SessionStatus; pricing: PricingPolicy; commission: CommissionPolicy; swap: SwapPolicy; margin: MarginPolicy; execution: ExecutionPolicy; session: SessionPolicy; }
export interface BrokerMember extends User { name: string; status: "ACTIVE" | "SUSPENDED"; created_at: string; updated_at: string; }
export interface BrokerClient extends BrokerMember { account_count: number; last_activity?: string; }
export interface BrokerAccount extends TradingAccount { trading_group_id?: string; max_leverage_override?: Decimal | null; }
export interface BrokerInstrument extends Instrument { symbol_group_id?: string; profile_overrides?: ProfileRefs; revision?: number; }
export interface BrokerExposure { symbol: string; long_quantity: Decimal; short_quantity: Decimal; net_quantity: Decimal; long_notional: Decimal; short_notional: Decimal; net_notional: Decimal; notional_currency: string; unrealized_client_pnl: Decimal; number_of_long_positions: number; number_of_short_positions: number; number_of_accounts: number; }
export interface BrokerRiskAccount { account: BrokerAccount; client_email: string; open_positions: number; margin_utilization: Decimal; risk_status: string; }
export interface BrokerDashboard { execution_mode: string; currency: string; clients: number; active_accounts: number; open_positions: number; pending_orders: number; total_balance: Decimal; total_equity: Decimal; client_floating_pnl: Decimal; margin_call_accounts: number; top_exposures: BrokerExposure[]; recent_actions: AuditEvent[]; updated_at: string; }
export interface BrokerClientDetail { client: BrokerClient; accounts: BrokerAccount[]; memberships: BrokerMember[]; activity: AuditEvent[]; }
export interface BrokerAccountDetail { account: BrokerAccount; client?: BrokerMember; positions: Position[]; orders: Order[]; fills: Fill[]; transactions: AccountTransaction[]; audit: AuditEvent[]; effective: EffectiveConfiguration[]; }
export interface CreateBrokerAccount { user_id: string; name: string; mode: "PROP_SIMULATED" | "BROKER_DEMO"; currency: "USD"; position_mode: "HEDGING"; trading_group_id: string; initial_balance: Decimal; leverage: Decimal; max_leverage_override?: Decimal; status?: string; reason?: string; }
export interface BalanceOperation { type: "CREDIT" | "DEPOSIT" | "DEBIT" | "WITHDRAWAL" | "ADJUSTMENT"; amount: Decimal; currency: string; reason: string; reference: string; client_operation_id: string; }
