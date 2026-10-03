# Phase 3 shared broker contracts

These additive contracts are the agreement between the core, administrative engine, transport/storage, and frontend workers. Financial fields use `decimal.Decimal` in Go and decimal strings in JSON/TypeScript. IDs, tenant, revisions, creation/update times, and administrative actor metadata are assigned or validated by the server. Native execution remains simulated.

## Canonical domain records

All canonical broker records live in `State.Broker BrokerState`. `BrokerState` contains `Settings map[string]BrokerSettings` keyed by tenant, `Profiles map[string]BrokerProfile` keyed by immutable ID, `Groups map[string]TradingGroup`, `SymbolGroups map[string]SymbolGroup`, `ClientStatuses map[string]string` keyed by `tenant:user`, and `RolloverKeys map[string]RolloverCheckpoint` keyed by `position_id:local_rollover_date`. Each checkpoint captures the position, local date, effective swap plan, rollover timestamp, and signed amount.

The exact reusable reference fields are:

```go
type ProfileRefs struct {
    PricingProfileID string `json:"pricing_profile_id,omitempty"`
    CommissionPlanID string `json:"commission_plan_id,omitempty"`
    SwapPlanID string `json:"swap_plan_id,omitempty"`
    LeveragePlanID string `json:"leverage_plan_id,omitempty"`
    MarginProfileID string `json:"margin_profile_id,omitempty"`
    ExecutionProfileID string `json:"execution_profile_id,omitempty"`
    TradingSessionProfileID string `json:"trading_session_profile_id,omitempty"`
}
```

`BrokerProfile` contains `id`, `tenant_id`, `kind`, `name`, `description`, `status` (`ACTIVE` or `DISABLED`), `revision`, `created_at`, `updated_at`, and exactly one non-null pointer payload: `pricing`, `commission`, `swap`, `leverage`, `margin`, `execution`, or `session`. Kinds are `PRICING`, `COMMISSION`, `SWAP`, `LEVERAGE`, `MARGIN`, `EXECUTION`, and `SESSION`. The profile metadata uses Go fields `ID`, `TenantID`, `Kind`, `Name`, `Description`, `Status`, `Revision uint64`, `CreatedAt`, and `UpdatedAt`; payload fields use the capitalized names and the policy types below. `SymbolOverrides []BrokerProfileSymbolOverride` (`symbol_overrides`) supports unique `symbol` entries containing exactly one of `pricing`, `commission`, or `swap`, matching the parent kind. Other kinds reject this collection. Disabled profiles cannot be assigned or resolved; disabling a referenced profile is rejected by the administrative command.

| Payload / Go type | Exact JSON fields and semantics |
| --- | --- |
| `pricing` / `PricingPolicy` | `unit` (`PRICE` or `POINTS`), `bid_markup`, `ask_markup`, `minimum_spread`, `maximum_spread`. All four decimal values are nonnegative; zero maximum means uncapped. POINTS multiplies by instrument tick size. Resulting prices must be aligned to the instrument tick. |
| `commission` / `CommissionPolicy` | `mode` (`NONE`, `PER_LOT_PER_SIDE`, `PER_LOT_ROUND_TURN`), `amount`, `currency`. `amount` is nonnegative money per lot; currency must equal the supported account currency USD. NONE requires zero amount. |
| `swap` / `SwapPolicy` | `enabled`, `long_rate`, `short_rate`, `currency`, `timezone`, `rollover_time` (`HH:MM`), `triple_swap_day` (Sunday=0 through Saturday=6), `catch_up_days` (1 through 31). Rates are signed money per lot; USD is the account currency. |
| `leverage` / `LeveragePolicy` | `max_leverage` (positive decimal), `rules` array of `LeverageRule`. A rule has exactly one of `asset_class`, `symbol_group_id`, or `symbol`, and positive decimal `max_leverage`. Precedence is asset class, category, then explicit symbol. |
| `margin` / `MarginPolicy` | `margin_call_level`, `stop_out_level`, `stop_out_enabled`. Decimal percentages must be nonnegative, with margin call at or above stop-out. Equality is a breach. |
| `execution` / `ExecutionPolicy` | `latency_mode` (`NONE` or `FIXED`), `base_latency_ms` (integer 0 through 5000), `slippage_mode` (`NONE`). NONE requires zero latency. |
| `session` / `SessionPolicy` | `timezone`, `default_status` (`OPEN`, `CLOSE_ONLY`, `CLOSED`), `windows` array of `SessionWindow {day,start,end,status}`. Sunday=0 through Saturday=6; start is HH:MM, end may also be 24:00; end before/equal start denotes an overnight window into the following day. Overlap is rejected. |

Policy Go fields are the obvious exported snake-case equivalents: `Unit`, `BidMarkup`, `AskMarkup`, `MinimumSpread`, `MaximumSpread`; `Mode`, `Amount`, `Currency`; `Enabled`, `LongRate`, `ShortRate`, `Timezone`, `RolloverTime`, `TripleSwapDay int`, `CatchUpDays int`; `MaxLeverage`, `Rules []LeverageRule`; `MarginCallLevel`, `StopOutLevel`, `StopOutEnabled`; `LatencyMode`, `BaseLatencyMS int64`, `SlippageMode`; `DefaultStatus`, `Windows []SessionWindow`. `SessionWindow.Day` is int and times/status are strings. No nullable financial value appears inside a policy.

`TradingGroup` contains `id`, `tenant_id`, `name`, `description`, `status` (`ACTIVE` or `DISABLED`), the flattened `ProfileRefs`, `symbol_rules []SymbolRule`, `revision`, `created_at`, and `updated_at`. Its Go type embeds `ProfileRefs`; it stores `SymbolRules []SymbolRule`. A `SymbolRule` has exactly one of `symbol_group_id` or `symbol` plus flattened `ProfileRefs`. Duplicate selectors are rejected.

`SymbolGroup` contains `id`, `tenant_id`, `name`, `description`, flattened `ProfileRefs`, `revision`, `created_at`, and `updated_at`. Membership is canonical in `Instrument.SymbolGroupID` (`symbol_group_id`); administrative symbol-group detail may derive a `symbols` array. A symbol belongs to at most one category. `Instrument.ProfileOverrides ProfileRefs` uses `profile_overrides` for explicit instrument policies. This avoids storing competing category membership lists.

`BrokerSettings` contains `tenant_id`, `broker_name`, `base_currency` (`USD`), `default_trading_group_id`, `timezone`, `support_email`, `trading_enabled`, `revision`, `created_at`, and `updated_at`. Go uses `DefaultTradingGroupID`, `TradingEnabled bool`, and `Revision uint64`. Defaults permit existing simulated trading, use UTC/USD, and point to a durable default trading group.

`Account` adds `TradingGroupID string` (`trading_group_id,omitempty`) and `MaxLeverageOverride *decimal.Decimal` (`max_leverage_override,omitempty`). The existing `Leverage` remains an account maximum. `Position` adds `Economics *PositionEconomics` (`economics,omitempty`), `CommissionPaid decimal.Decimal` (`commission_paid`), and `SwapAccrued decimal.Decimal` (`swap_accrued`). `PositionEconomics` captures `contract_size`, `quote_currency`, `commission_plan_id`, `commission_plan_revision`, and the full `commission` policy when opening. Old positions lacking a snapshot fall back to their existing instrument specification and the no-charge legacy commission policy; initialization captures this fallback before edits.

`Fill` adds `commission` (positive charged amount), `commission_plan_id`, `commission_plan_revision`, `trading_group_id`, and `configuration_revision`. `Transaction` adds optional `fill_id`, `profile_id`, `actor_user_id`, `reason`, `reference`, `client_operation_id`, and `rollover_date`. Existing account owner delivery remains `Event.UserID`; new `Event.ActorUserID` / `ActorRole` may carry the authenticated staff actor independently. Administrative payloads include actor, before/after, target, and reason.

## Resolution and effective response

```go
func broker.Ensure(s *domain.State)
func broker.Resolve(s *domain.State, a domain.Account, i domain.Instrument, now time.Time) (domain.EffectiveConfiguration, error)
func broker.ValidateProfile(p domain.BrokerProfile) error
func broker.ValidateGroup(s *domain.State, g domain.TradingGroup) error
func broker.ValidateSymbolGroup(s *domain.State, g domain.SymbolGroup) error
func broker.ValidateSettings(s *domain.State, settings domain.BrokerSettings) error
```

`Ensure` initializes every missing collection, installs deterministic tenant defaults for all tenants found in accounts/instruments/settings, and snapshots legacy position economics. It never replaces existing groups/profiles/history. `Engine.New` calls it before serving operations; `State.Clone` carries all nested data without aliases.

Resolution order is platform policies, tenant default group, explicit account group, symbol category profile references, matching category rules from the selected account/default group, instrument profile overrides, then matching explicit symbol rules from the selected group. Every layer applies only nonempty IDs. Foreign-tenant/missing/wrong-kind references fail explicitly. An explicit account group replaces the selected group but inherits unassigned policy references from the tenant default group. Rule selector order is deterministic and does not depend on map iteration.

After all reference layers select their final profile, matching per-symbol overrides replace that profile's pricing/commission/swap payload. The selected leverage policy's asset-class rule is applied before its category rule and then its symbol rule. Seeded `Instrument.DefaultLeverage` supplies platform fallback only when no configured leverage rule exists; it does not permanently cap an explicit leverage plan. Effective leverage is the minimum of the resolved plan/rule, `Account.Leverage`, and the optional account override. Instrument-specific leverage plans can supply explicit caps. No account pricing override exists.

`EffectiveConfiguration` has `account_id`, `symbol`, `trading_group_id`, `trading_group_revision`, flattened effective `ProfileRefs`, `profile_revisions map[string]uint64`, `effective_leverage`, `session_status`, `pricing`, `commission`, `swap`, `margin`, `execution`, and `session`. Go embeds `ProfileRefs` and uses corresponding policy value fields plus `ProfileRevisions`. The profile-revision map keys are the seven JSON reference field names. Resolution metadata names the final profile for each kind. Tenant settings revision and group/profile revisions supply deterministic provenance; effective values remain server authoritative.

```go
func (e *Engine) AccountQuotes(ctx context.Context, id domain.Identity, accountID string) ([]domain.Quote, error)
func (e *Engine) EffectiveConfiguration(ctx context.Context, id domain.Identity, accountID, symbol string) (domain.EffectiveConfiguration, error)
func (e *Engine) ClientActive(id domain.Identity) error
func (e *Engine) ProcessRollover(ctx context.Context, now time.Time) error
```

Administrative effective views call `broker.Resolve` on a snapshot after capability/account/tenant checks. `ClientActive` checks broker membership overrides without disclosing another tenant. Account quote methods also enforce existing owner authorization. Legacy `ClientQuotes(tenantID)` remains available with default tenant pricing; reference quote state/candles remain unchanged. Account-specific quote events contain `AccountID` and owner delivery scope; transport filters them accordingly.

## Economic and lifecycle rules

Opening and closing PER_LOT_PER_SIDE commissions are `quantity * amount`. Round-turn charges `quantity * amount` only at opening. Each charge has a positive fill commission value and a negative immutable COMMISSION transaction with updated balance. Close cost uses saved opening commission terms; partial close uses its executed quantity. Gross `RealizedPnL` retains existing semantics; server ledger/report projections expose costs separately. Pretrade and previews deduct known opening commission along with spread loss and required margin. Risk sizing accounts for known entry/exit commission in estimated stop loss.

Order preview adds `estimated_commission`, `estimated_close_commission`, `estimated_swap`, `effective_leverage`, and `session_status`. Close preview adds `estimated_commission` and `estimated_net_pnl`. Existing preview financial fields retain their meanings and JSON string representation.

Rollover computes the named timezone's local date/time with explicit timezone validation and bounded catch-up. A position must open strictly before a boundary. Each due boundary adds signed `quantity * applicable_side_rate * multiplier`; multiplier is 3 on the local triple day, otherwise 1. Current committed remaining quantity is used, and each durable position/date checkpoint is written atomically with SWAP transaction, position/account updates, audit, and publication. A zero amount still records a checkpoint. Disabled swap accrues nothing. No checkpoint is created before its boundary. Catch-up bounds are disclosed in operating documentation.

Margin equality is a breach; compare `equity * 100` directly to `used_margin * threshold`. Zero exposure is NORMAL. Margin-call entry/recovery events only occur when the margin state changes. Enabled stop-out also treats nonpositive equity with exposure as a breach. It closes worst floating P&L first, then oldest opening time, then ID; revalue after each full close and continue until strictly above stop-out or no exposure. Each system close passes simulated mode, HEDGING/USD, legal quantity, fresh valid quote, instrument exit permission, and OPEN/CLOSE_ONLY session checks. Unavailable exits remain for the next executable tick. SUSPENDED accounts permit these system reductions; owner commands remain blocked. CLOSED accounts cannot be set while open positions or pending orders remain.

Session CLOSED blocks executions/triggering and modifying executable protection/entries. CLOSE_ONLY permits manual/protective/system reductions and protection maintenance but blocks new exposure. Suspended membership blocks owner commands including cancel; logout remains available. READ_ONLY permits exposure reduction; account/group/settings restrictions are applied consistently in previews, placement, modifications, and pending trigger checks. System protective/forced exits do not create new exposure and preserve the same ledger/audit transaction boundary.

Structural symbol edits (contract/currency/tick/quantity semantics) are rejected with open positions or executable pending orders. Financial snapshots and immutable historical fills prevent later policy edits changing old economics. Configuration changes commit before account quote/configuration refresh events are emitted. Transport/frontend requests always use server effective policies and exact decimal values.
