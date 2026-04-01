---
name: finance
description: "Finance OS skill — read and write access to Copilot Money data (accounts, transactions, budgets, net worth) plus crypto holdings from Kraken, Gemini, and on-chain wallets (ETH + SOL). Builds a finance snapshot for agent context. Use when Elijah asks about money, spending, budgets, crypto portfolio, or financial state. NOT for making trades or moving money."
owner:
  - Elijah
  - Bob
tags:
  - finance
  - crypto
  - copilot
  - budgets
  - spending
visibility: private
---

# Finance OS Skill

Load this skill when Elijah asks about: spending, budgets, transactions, accounts, net worth, categorizing transactions, reviewing transactions, crypto holdings, or anything related to his personal finances.

## Setup

### Copilot Money Token
The JWT lives at `~/.openclaw/secrets/copilot-token`. If API calls return 401, the token has expired and Elijah needs to refresh it:

1. Open `app.copilot.money` in browser (already logged in)
2. DevTools → Network → filter for `graphql` → copy the `Authorization` header value (strip "Bearer ")
3. `echo "NEW_TOKEN" > ~/.openclaw/secrets/copilot-token && chmod 600 ~/.openclaw/secrets/copilot-token`

### Crypto Keys (optional)
Edit `~/.openclaw/secrets/crypto-keys.env`:
- **Kraken:** `kraken.com/u/security/api` → Permissions: Query Funds, Query Ledger Entries (read-only)
- **Gemini:** `exchange.gemini.com/settings/api` → Role: Auditor (read-only)
- **Wallet:** Public addresses only (ETH + SOL) — no seed phrase, no private key

## Context Loader

Run `finance snapshot` at the start of any session where Elijah might ask about finances. This writes `memory/finance-snapshot.md` which is auto-read by Bob's heartbeat.

```bash
~/.openclaw/skills/finance/finance snapshot --print
```

The snapshot includes: account balances, this month's spending vs budget, net worth, unreviewed transaction count, and crypto holdings.

## Primitives Reference

### `finance accounts`
List all Copilot-connected accounts with balances.

```bash
~/.openclaw/skills/finance/finance accounts --json
```

Returns: `[{ id, name, type, subType, balance, hasLiveBalance, isManual, mask, limit }]`

Use when: Elijah asks what accounts he has, total assets, checking/savings balances.

### `finance balances`
Simplified account list sorted by type.

```bash
~/.openclaw/skills/finance/finance balances --json
```

Returns: `[{ name, balance, type, subType }]`

Use when: quick balance check, comparing account types.

### `finance transactions`
List recent transactions with filtering options.

```bash
~/.openclaw/skills/finance/finance transactions --json
~/.openclaw/skills/finance/finance transactions --limit 20 --json
~/.openclaw/skills/finance/finance transactions --unreviewed --json
~/.openclaw/skills/finance/finance transactions --search "Netflix" --json
```

Flags:
- `--limit N` — number of transactions (default: 50)
- `--unreviewed` — only transactions not yet reviewed
- `--search TEXT` — filter by merchant name
- `--json` — machine-readable output

Returns: `[{ id, name, amount, date, accountId, categoryId, isReviewed, isPending, userNotes, tags }]`

Use when: Elijah asks about recent spending, specific purchases, pending transactions.

### `finance spending`
Spending by category for a month.

```bash
~/.openclaw/skills/finance/finance spending --json
~/.openclaw/skills/finance/finance spending --month 2026-03 --json
```

Returns: `[{ categoryId, categoryName, budgeted, actual, remaining, month }]`

Use when: "How much have I spent on dining?", "What's my top spending category?", "Am I over budget anywhere?"

### `finance budget`
Budget status per category — shows over/under for the month.

```bash
~/.openclaw/skills/finance/finance budget --json
~/.openclaw/skills/finance/finance budget --month 2026-03 --json
```

Returns: `{ budgets: [{ categoryId, categoryName, budgeted, actual, remaining, isOverBudget, month }], monthly: { total, budgeted, remaining, month } }`

Use when: "What's my budget status?", "Am I on track this month?", "Show me what I'm over budget on."

### `finance networth`
Current net worth snapshot (most recent entry).

```bash
~/.openclaw/skills/finance/finance networth --json
~/.openclaw/skills/finance/finance networth --history --json
```

Returns: `{ date, assets, debt, net }` or array for history.

Use when: "What's my net worth?", "How am I doing financially overall?"

### `finance snapshot`
Full financial context snapshot — writes to `memory/finance-snapshot.md`.

```bash
~/.openclaw/skills/finance/finance snapshot
~/.openclaw/skills/finance/finance snapshot --print
```

`--print` also prints the snapshot to stdout after writing.

Use when: starting a finance-related session, heartbeat context refresh, Elijah wants a full financial summary.

### `finance set-category <tx-id> <cat-id>`
Set the category on a transaction. **Dry-run by default.**

```bash
~/.openclaw/skills/finance/finance set-category tx-abc123 cat-xyz789          # dry-run
~/.openclaw/skills/finance/finance set-category tx-abc123 cat-xyz789 --confirm # execute
```

Get category IDs from `finance categories --json`. Get transaction IDs from `finance transactions --json`.

Use when: Elijah asks to categorize a transaction, fix a miscategorized charge.

### `finance mark-reviewed <tx-id>`
Mark a single transaction as reviewed. **Dry-run by default.**

```bash
~/.openclaw/skills/finance/finance mark-reviewed tx-abc123          # dry-run
~/.openclaw/skills/finance/finance mark-reviewed tx-abc123 --confirm # execute
```

### `finance set-notes <tx-id> <notes>`
Add notes to a transaction. **Dry-run by default.**

```bash
~/.openclaw/skills/finance/finance set-notes tx-abc123 "Split with Mike" --confirm
```

### `finance mark-all-reviewed`
Bulk mark all unreviewed transactions as reviewed. **Dry-run by default.**

```bash
~/.openclaw/skills/finance/finance mark-all-reviewed          # shows count, no action
~/.openclaw/skills/finance/finance mark-all-reviewed --confirm # executes bulk review
```

Use when: Elijah says "mark everything reviewed", "clear the review queue."

### `finance categories`
List all spending categories with IDs.

```bash
~/.openclaw/skills/finance/finance categories --json
```

Returns: `[{ id, name, colorName, isExcluded, parentId? }]`

Use when: need category IDs for set-category, understanding category hierarchy.

### `finance crypto`
Crypto holdings from all configured sources (Kraken, Gemini, on-chain wallets).

```bash
~/.openclaw/skills/finance/finance crypto --json
~/.openclaw/skills/finance/finance crypto kraken --json
~/.openclaw/skills/finance/finance crypto gemini --json
~/.openclaw/skills/finance/finance crypto wallet --json
~/.openclaw/skills/finance/finance crypto summary --json
```

Gracefully degrades — returns empty/error per source if not configured or keys expired.

## Common Workflows

**"How much have I spent this month?"**
→ `finance spending --json` — gives per-category breakdown

**"What's my net worth?"**
→ `finance networth --json`

**"Show me unreviewed transactions"**
→ `finance transactions --unreviewed --json`

**"Categorize transaction X as Y"**
→ 1. `finance categories --json` to find category ID
→ 2. `finance set-category <tx-id> <cat-id> --confirm`

**"Mark all reviewed"**
→ `finance mark-all-reviewed` (dry-run first), then `finance mark-all-reviewed --confirm`

**"Am I on budget this month?"**
→ `finance budget --json` — shows budgeted vs actual, flags overages

**"What are my balances?"**
→ `finance balances --json`

**"Show me my full financial picture"**
→ `finance snapshot --print`

**"How's my crypto doing?"**
→ `finance crypto summary --json`

## Token Expiry

The Copilot JWT expires periodically (typically 30-90 days). Signs of expiry:
- All API calls return `[unavailable]` in snapshot
- Phase 1+2 status file says "401 on all API calls"

When expired, tell Elijah: "Your Copilot token expired. Open app.copilot.money → DevTools → Network → copy the Authorization header → paste to me and I'll update the token file."

## Architecture

```
~/.openclaw/skills/finance/
  SKILL.md                    ← this file
  finance                     ← executable wrapper script
  src/
    client.ts                 ← GraphQL client (JWT auth, reads from secrets)
    queries.ts                ← All GQL query strings
    context-loader.ts         ← builds finance-snapshot.md (includes crypto)
    cli.ts                    ← CLI router
    primitives/
      accounts.ts             ← getAccounts, getAccountBalances
      transactions.ts         ← getTransactions, getUnreviewed, searchTransactions
      categories.ts           ← getCategories, getSpendingByCategory
      budgets.ts              ← getBudgetStatus, getMonthlySpend
      networth.ts             ← getNetworthHistory, getCurrentNetworth
      write.ts                ← setCategory, markReviewed, setNotes (confirm-gated)
    crypto/
      config.ts               ← reads ~/.openclaw/secrets/crypto-keys.env
      kraken.ts               ← Kraken REST + HMAC-SHA512 auth
      gemini.ts               ← Gemini REST + HMAC-SHA384 auth
      onchain.ts              ← ETH (Blockscout) + SOL (public RPC)
      index.ts                ← CryptoSnapshot aggregator
  tests/
    fixtures/                 ← scrubbed response fixtures (no real data)
    primitives.test.ts        ← 34 unit tests, all offline
  dist/                       ← compiled JS (run `npm run build` to rebuild)
```
