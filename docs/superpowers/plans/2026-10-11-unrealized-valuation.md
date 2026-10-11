# Unrealized P&L and Equity Valuation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a read-only exact-decimal snapshot calculator for supported linear positions and compose complete account equity from the integrated Cycle 1 cash balance when canonical position, instrument, quote, and currency inputs are available.

**Architecture:** The implementation is a pure module at `src/server/brokerage/valuation.ts`. It accepts caller-supplied, already-authorized snapshots, validates position/instrument/quote compatibility, values each position with bid for longs and ask for shorts, aggregates only complete same-currency results, and composes equity from a supplied Cycle 1 ledger balance. It deliberately does not create persistence, routes, migrations, conversion, stale-price policy, or position lifecycle state.

**Tech Stack:** TypeScript, BigInt-backed decimal arithmetic, Vitest.

**Spec:** Cycle 2 W05 unrealized P&L and equity valuation requirements supplied in the worker instruction.

## Global Constraints

- Reuse Cycle 1 ledger balance semantics; never recalculate ledger postings in this module.
- Never represent financial values with JavaScript floating-point arithmetic.
- Preserve tenant/account boundaries supplied by the caller and fail closed on mismatched snapshots.
- Do not modify W04, W06, shared database schemas, or immutable ledger history.
- Do not invent currency conversion or a stale-price threshold.

## Review Focus

- Closing-side bid/ask choice and short sign: covered by long/short profitable and losing tests.
- Open exposure and closed/partial positions: covered by partial and fully closed tests.
- Precision and final monetary normalization: covered by fractional and repeated component tests.
- Incomplete market data and currency mismatch: covered by missing/unverified quote and cross-currency tests.
- Equity double counting and side effects: covered by cash-plus-P&L and input immutability tests.

### Task 1: Specify the pure valuation contract with failing tests

**Files:**
- Create: `tests/valuation.test.ts`

**Interfaces:**
- Consumes the planned `valuePosition`, `valueAccount`, and `composeEquity` exports.
- Produces executable assertions for exact-decimal position P&L, account completeness, and equity composition.

- [ ] **Step 1: Write tests for supported long/short valuation, precision, exposure, unsupported inputs, currency boundaries, and read-only behavior.**
- [ ] **Step 2: Run `npm test -- --run tests/valuation.test.ts` and record the expected missing-module failure (or the sandbox startup failure if Vitest cannot spawn esbuild).**

### Task 2: Implement exact-decimal snapshot valuation

**Files:**
- Create: `src/server/brokerage/valuation.ts`

**Interfaces:**
- `valuePosition(position, instrument, quote): PositionValuation` returns `VALUED`, `INCOMPLETE`, `UNSUPPORTED`, or `INVALID` with an exact eight-decimal monetary result only for valid supported inputs.
- `valueAccount(input): AccountValuation` returns a complete total only when every eligible position is valued in the account currency; otherwise it returns an explicit incomplete/unsupported result and no partial total.
- `composeEquity(input): EquityValuation` adds the supplied Cycle 1 cash balance to a complete account unrealized total and returns no equity for incomplete valuation.

- [ ] **Step 1: Add strict decimal parsing, BigInt arithmetic, final eight-place half-away-from-zero formatting, and metadata validation helpers.**
- [ ] **Step 2: Implement position validation and linear long/short formulas using remaining quantity, contract multiplier, and executable quote side.**
- [ ] **Step 3: Implement account aggregation with deterministic position order, same-currency checks, explicit quote/unsupported outcomes, and no partial totals.**
- [ ] **Step 4: Implement equity composition from supplied cash balance without ledger writes or duplicate realized/fee components.**

### Task 3: Verify the bounded feature

**Files:**
- Modify only the files above if verification reveals defects.

- [ ] **Step 1: Run focused valuation tests and the complete test command; report exact sandbox failures without mislabeling them as passes.**
- [ ] **Step 2: Run `npm run typecheck`, `npm run lint`, and `npm run build`; record exit status and output.**
- [ ] **Step 3: Inspect `git diff --check`, `git status --short`, and changed paths to confirm no migration or other-worker files changed.**
- [ ] **Step 4: Record the missing W04/W06/W01 contracts required before wiring this pure calculator to authoritative account-level reads in the handoff.**
