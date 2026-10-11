# Ledger Reconciliation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a scoped, exact-decimal account cash ledger replay and read-only reconciliation service backed by immutable PostgreSQL entries.

**Architecture:** Migration 050 adds an immutable, tenant-scoped signed-entry table keyed by account, currency, and idempotency key, plus an explicitly non-authoritative stored balance projection. `BrokerageLedgerService` validates account ownership inside the existing transaction context, posts idempotently, aggregates posted cash entries with database-side `numeric` arithmetic, and compares against the projection when present.

**Tech Stack:** TypeScript, PostgreSQL/PGlite, Vitest, existing `Database` transactions and tenant RLS, exact decimal strings normalized to 8 fractional places.

**Spec:** W05 Cycle 1 ledger, P&L and margin operating contract.

## Global Constraints

- Do not modify applied migrations 001-021 or other workers' domains.
- Use only migration 050-059 for schema changes.
- Financial amounts remain exact decimal strings; no JavaScript floating-point arithmetic.
- Ledger entries are immutable; corrections use compensating entries.
- Tenant, account, product-instance, and currency boundaries are enforced by composite keys, RLS, and scoped queries.
- Reconciliation is read-only and never repairs a mismatch.

## Review Focus

- Duplicate idempotency keys with changed payloads must fail without a second cash effect; covered by ledger service tests.
- Pending, void, rejected, unrealized, and foreign-currency entries must not affect cash totals; covered by aggregation boundary tests.
- Cross-tenant and cross-account access must return the established not-found error without counts or balances; covered by isolation tests.
- Exact fractional replay and negative balances must remain stable across repeated calls; covered by deterministic decimal tests.
- Projection mismatches must report an exact signed difference without changing either record; covered by reconciliation tests.

### Task 1: Define failing ledger service tests

**Files:**
- Create: `tests/ledger.test.ts`
- Create: `src/server/brokerage/ledger.ts` (interface import only after RED)

- [ ] Write integration tests for posting, exact aggregation, idempotency, immutable entries, scope/currency isolation, and MATCHED/MISMATCHED/NOT_COMPARABLE reconciliation.
- [ ] Run the focused test and verify it fails because the service/schema is absent.

### Task 2: Add the ledger schema

**Files:**
- Create: `migrations/050_ledger_reconciliation.sql`

- [ ] Add immutable scoped ledger entries, scoped stored balance projections, composite account/currency foreign keys, sequence/indexes, RLS, grants, idempotency uniqueness, and immutable-entry triggers.
- [ ] Run the focused test to verify the schema loads and service failures move to missing implementation.

### Task 3: Implement the scoped exact-decimal service

**Files:**
- Create: `src/server/brokerage/ledger.ts`

- [ ] Implement `BrokerageLedgerService.postEntry`, `balance`, and `reconcile` with signed decimal strings, database-side exact aggregation, deterministic sequence metadata, idempotent insertion, scoped account validation, and structured errors.
- [ ] Run the focused tests until all ledger behaviors pass.

### Task 4: Verify repository checks

- [ ] Run `npm test -- tests/ledger.test.ts`.
- [ ] Run `npm test`, `npm run typecheck`, `npm run lint`, and `npm run build`.
- [ ] Inspect the working tree and record migration/API/security details for W01.
