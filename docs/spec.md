# finance-os Specification

## Overview

finance-os is a local TypeScript CLI and primitive library that exposes Elijah’s personal finance state from Copilot Money and crypto sources. It is designed for agent use first: stable JSON output, predictable dry-run behavior for writes, graceful degradation for partial failures, and a documented failure contract.

Primary responsibilities:
- Read Copilot Money accounts, transactions, categories, budgets, monthly spend, and net worth
- Perform confirm-gated transaction and budget mutations
- Aggregate crypto holdings from Kraken, Gemini, and on-chain wallets
- Produce a finance snapshot markdown file for agent context
- Expose all of the above through a CLI at `finance`

Default design principles:
- Read primitives should degrade gracefully where possible
- Write primitives are dry-run by default and require `confirm=true` / `--confirm`
- Raw network and GraphQL failures should not leak out unwrapped from the client layer
- Partial crypto failure must not prevent other crypto sources from returning

## Auth model (Copilot + Firebase refresh, Kraken, Gemini, DeBank)

### Copilot Money
- API endpoint: `https://app.copilot.money/api/graphql`
- Auth token priority:
  1. `COPILOT_TOKEN` env var
  2. `~/.openclaw/secrets/copilot-token`
- The GraphQL client sends `Authorization: Bearer <token>`
- On HTTP 401:
  1. client calls `~/.openclaw/skills/finance/scripts/auth.sh --mode refresh`
  2. reloads token from disk
  3. retries the original request once
- If refresh fails, the client throws `CopilotError`
- If the token file is missing or empty, the client throws `CopilotError`

### Firebase refresh
- Refresh token file: `~/.openclaw/secrets/copilot-refresh-token`
- This token is consumed by `auth.sh --mode refresh`
- finance-os itself does not directly perform the Firebase exchange; it shells out to the auth helper

### Kraken
- Credentials loaded from env or `~/.openclaw/secrets/crypto-keys.env`
- Required keys:
  - `KRAKEN_API_KEY`
  - `KRAKEN_API_SECRET`
- Auth: HMAC-SHA512 signed private REST requests
- Missing keys do not crash the app; commands degrade with a readable configuration error

### Gemini
- Credentials loaded from env or `~/.openclaw/secrets/crypto-keys.env`
- Required keys:
  - `GEMINI_API_KEY`
  - `GEMINI_API_SECRET`
- Auth: base64 JSON payload + HMAC-SHA384 signature
- Missing keys do not crash the app; commands degrade with a readable configuration error

### DeBank / Rabby public API
- Used for EVM wallet token and chain balances
- No API key required
- Endpoint: `https://api.rabby.io/v1/user/token_list`
- Cached on disk per address for 30 minutes to reduce rate limiting

### Solana
- Uses public mainnet RPC
- Native SOL via `getBalance`
- SPL tokens via `getTokenAccountsByOwner`
- Jupiter token list used as best-effort metadata enrichment

## Primitives

## accounts

### `getAccounts(includeHidden?) → Account[]`

Shape:
```ts
{
  id,
  name,
  type,
  subType,
  balance,
  hasLiveBalance,
  isManual,
  mask,
  limit,
  color,
  isUserHidden,
  isUserClosed
}
```

Behavior:
- Reads Copilot `Accounts` query
- Returns `[]` if the request fails
- By default, filters out:
  - `isUserHidden === true`
  - `isUserClosed === true`
- If `includeHidden=true`, returns all accounts, including hidden and closed
- Missing numeric and nullable fields are normalized:
  - `balance` defaults to `0`
  - nullable strings default to `null`
  - booleans default to `false`

Errors:
- Underlying client throws `CopilotError` on auth/network/GraphQL failure
- Primitive catches and degrades to `[]`
- 401 is auto-retried once via token refresh before surfacing failure

### `getAccountBalances() → AccountBalance[]`

Shape:
```ts
{ id, name, balance, type, subType }
```

Behavior:
- Calls `getAccounts()`
- Maps to a simplified shape
- Sorts results by `type`
- Returns `[]` if accounts are unavailable

## transactions

### `getTransactions(opts?) → TransactionPage`

Shape:
```ts
{
  transactions: Array<{
    id,
    name,
    amount,
    date,
    accountId,
    categoryId,
    isReviewed,
    isPending,
    userNotes,
    recurringId,
    type,
    tags: Array<{ id, name, colorName }>
  }>,
  pageInfo: {
    hasNextPage,
    endCursor,
    hasPreviousPage,
    startCursor
  }
}
```

Supported options:
- `limit?: number` default `50`
- `after?: string`
- `unreviewed?: boolean`
- `categoryId?: string`
- `search?: string`
- `startDate?: string`
- `endDate?: string`

Behavior:
- Builds a Copilot `TransactionFilter` from options
- Uses first-page forward pagination only
- If `transactions` is missing, returns an empty page
- If `edges` is missing, returns `transactions: []` with normalized empty pageInfo
- Maps absent booleans/nullable fields to safe defaults

Errors:
- Primitive catches request failures and returns an empty page
- Network/auth/GraphQL failures are wrapped by the client as `CopilotError`

### `getUnreviewed() → Transaction[]`

Behavior:
- Calls `getTransactions({ unreviewed: true, limit: 100 })`
- Returns only the `transactions` array
- Returns `[]` on failure

### `searchTransactions(query) → Transaction[]`

Behavior:
- Fetches the most recent 200 transactions via `getTransactions({ limit: 200 })`
- Filters client-side by matching `query` against `name` and `userNotes` (case-insensitive)
- Copilot API has no server-side search; this is the best available approach
- Returns only the `transactions` array
- Returns `[]` on failure or no matches

## categories

### `getCategories(includeExcluded?) → Category[]`

Actual implementation signature is `getCategories(opts?)`, where spend/budget loading can be toggled for internal use.

Shape:
```ts
{ id, name, colorName, isExcluded, isRolloverDisabled, parentId? }
```

Behavior:
- Loads top-level Copilot categories and flattens `childCategories`
- Child categories receive `parentId`
- Returns excluded categories too; callers decide whether to filter
- Returns `[]` on failure

### `getSpendingByCategory(month?) → SpendingByCategory[]`

Shape:
```ts
{ categoryId, categoryName, budgeted, actual, remaining, month }
```

Behavior:
- Loads categories with spend + budget
- Resolves values from `current` when the month matches, otherwise from `histories`
- Includes categories where either actual spend is non-zero or a budget exists
- `budgeted` is `resolvedAmount` when present, else raw budget `amount`, else `null`
- `remaining = budgeted - actual` when budget exists, else `null`
- Returns `[]` on failure

## budgets

### `getBudgetStatus(month?) → BudgetStatus[]`

Shape:
```ts
{ categoryId, categoryName, budgeted, actual, remaining, isOverBudget, month }
```

Behavior:
- Loads categories with spend + budget
- Skips categories where `isExcluded === true`
- Includes only categories with non-zero budget or non-zero spend
- Recurses into child categories
- Sort order:
  1. over-budget categories first
  2. most over-budget first
  3. remaining categories by actual spend descending
- Returns `[]` when no budgets exist for the month
- Returns `[]` on failure

### `getMonthlySpend(month?) → MonthlySpend`

Shape:
```ts
{ total, budgeted, remaining, month }
```

Behavior:
- Tries `monthlySpending` aggregate query first
- Matches the requested `YYYY-MM` against `date.startsWith(month)`
- Falls back to aggregate `Spends` query when monthly aggregate is unavailable
- If neither path yields data, returns:
```ts
{ total: 0, budgeted: null, remaining: null, month }
```

## networth

### `getCurrentNetworth() → NetworthEntry | null`

Shape:
```ts
{ date, assets, debt, net }
```

Behavior:
- Calls `getNetworthHistory()`
- Returns the most recent entry after date sort
- Returns `null` when history is empty or unavailable

### `getNetworthHistory(limit?) → NetworthEntry[]`

Actual implementation accepts an optional `timeframe`, not a numeric limit.

Behavior:
- Calls Copilot `networthHistory`
- Maps `net = assets - debt`
- Sorts ascending by `date`
- Returns `[]` on failure

## write (all dry-run by default, confirm=true to execute)

### `setCategory(txId, categoryId, confirm) → void`

Behavior:
- `confirm=false`: prints dry-run message only
- `confirm=true`:
  1. finds transaction metadata by transaction id
  2. resolves required `itemId` + `accountId`
  3. calls `EditTransaction` mutation with `{ categoryId }`
- Throws if the transaction cannot be found or item metadata cannot be resolved

### `markReviewed(txId, confirm) → void`

Behavior:
- `confirm=false`: dry-run only
- `confirm=true`: resolves transaction metadata and calls `EditTransaction` with `{ isReviewed: true }`

### `setNotes(txId, notes, confirm) → void`

Behavior:
- `confirm=false`: dry-run only
- `confirm=true`: resolves transaction metadata and calls `EditTransaction` with `{ userNotes: notes }`

### `bulkMarkReviewed(txIds, confirm) → void`

Behavior:
- Empty list prints `No transactions to mark reviewed.`
- `confirm=false`: prints dry-run summary and does not mutate
- `confirm=true`:
  - calls `BulkEditTransactions` once per transaction id
  - uses `filter: { id: txId }`
  - accumulates success/failure counts
  - prints final summary
- Individual transaction failures do not abort the entire loop

### `setBudget(categoryId, amount, month, confirm) → void`

Behavior:
- Validates `month` format as `YYYY-MM`
- Validates `amount` is a non-negative finite number
- `confirm=false`: prints dry-run summary and does not mutate
- `confirm=true`: calls `SetBudgetAmount` / `setCategoryBudget` mutation with:
```ts
{
  categoryId,
  month,
  input: { amount }
}
```
- Throws if the mutation returns no category/budget payload

## categories-write (all dry-run by default, confirm=true to execute)

### `createCategory(name, opts?, confirm?) → CategoryResult | null`

Shape:
```ts
{ id, name, colorName, isExcluded }
```

Opts: `{ colorName?: string, isExcluded?: boolean }`

Behavior:
- `confirm=false`: prints dry-run message, returns null
- `confirm=true`: calls `CreateCategory` mutation
- Throws `CopilotError` on failure

### `editCategory(id, opts?, confirm?) → CategoryResult | null`

Opts: `{ name?: string, colorName?: string, isExcluded?: boolean }`

Behavior:
- `confirm=false`: dry-run only
- `confirm=true`: calls `EditCategory` mutation
- Throws `CopilotError` on failure

### `deleteCategory(id, confirm?) → void`

Behavior:
- `confirm=false`: dry-run only
- `confirm=true`: calls `DeleteCategory` mutation
- Throws `CopilotError` on failure

## holdings

### `getHoldings() → Holding[]`

Shape:
```ts
{
  security: { currentPrice, lastUpdate, symbol, name, type, id },
  metrics: { averageCost, totalReturn, costBasis },
  accountId, quantity, itemId, id
}
```

Behavior:
- Returns all investment holdings
- Returns `[]` on failure
- Null fields normalized to safe defaults

### `getAggregatedHoldings(timeFrame?) → AggregatedHolding[]`

Shape:
```ts
{ security: { currentPrice, symbol, name, type, id }, change, value }
```

Behavior:
- Accepts optional `TimeFrame`: `ONE_MONTH | THREE_MONTHS | SIX_MONTHS | ONE_YEAR | ALL`
- Returns `[]` on failure

## investments

### `getInvestmentPerformance(timeFrame?) → PerformanceEntry[]`

Shape: `{ date, performance }`

Behavior:
- Returns array of date/performance pairs
- Accepts optional `TimeFrame`
- Returns `[]` on failure

### `getInvestmentBalance(timeFrame?) → BalanceEntry[]`

Shape: `{ id, date, balance }`

Behavior:
- Returns array of investment balance history
- Accepts optional `TimeFrame`
- Returns `[]` on failure

### `getInvestmentAllocation() → AllocationEntry[]`

Shape: `{ percentage, amount, type, id }`

Behavior:
- Returns investment allocation breakdown
- Returns `[]` on failure

## tags

### `getTags() → Tag[]`

Shape: `{ id, name, colorName }`

Behavior:
- Returns all user tags
- Returns `[]` on failure

### `createTag(name, opts?, confirm?) → Tag | null`

Opts: `{ colorName?: string }`

Behavior:
- `confirm=false`: dry-run, returns null
- `confirm=true`: calls `CreateTag` mutation
- Throws `CopilotError` on failure

### `editTag(id, opts?, confirm?) → Tag | null`

Opts: `{ name?: string, colorName?: string }`

Behavior:
- `confirm=false`: dry-run
- `confirm=true`: calls `EditTag` mutation

### `deleteTag(id, confirm?) → void`

Behavior:
- `confirm=false`: dry-run
- `confirm=true`: calls `DeleteTag` mutation

## recurring

### `getRecurrings() → Recurring[]`

Shape:
```ts
{
  id, name, frequency, state, nextPaymentAmount, nextPaymentDate, categoryId,
  rule: { nameContains, minAmount, maxAmount, days } | null,
  payments: Array<{ amount, isPaid, date }>
}
```

Behavior:
- Returns all recurring transactions (active and inactive)
- Returns `[]` on failure

### `getRecurringMetrics(id) → RecurringKeyMetrics | null`

Shape: `{ averageTransactionAmount, totalSpent, period }`

Behavior:
- Returns key metrics for a specific recurring
- Returns `null` on failure

## account-history

### `getBalanceHistory(itemId, accountId, timeFrame?) → BalanceHistoryEntry[]`

Shape: `{ date, balance }`

Behavior:
- Returns balance history for a specific account
- Requires both `itemId` and `accountId`
- Accepts optional `TimeFrame`
- Returns `[]` on failure

## transactions-write (all dry-run by default)

### `createTransaction(opts, confirm?) → { id, name, amount, date } | null`

Opts: `{ accountId, itemId, amount, name, date }`

Behavior:
- `confirm=false`: dry-run, returns null
- `confirm=true`: calls `CreateTransaction` mutation
- Throws `CopilotError` on failure

### `deleteTransaction(itemId, accountId, id, confirm?) → void`

Behavior:
- `confirm=false`: dry-run
- `confirm=true`: calls `DeleteTransaction` mutation

## export

### `exportTransactions(filter?) → ExportResult | null`

Shape: `{ url, expiresAt }`
Filter: `{ startDate?, endDate? }`

Behavior:
- Returns a download URL for transaction export
- Returns `null` on failure or empty URL

### `exportTransactionsByMonth(month) → ExportResult | null`

Behavior:
- Convenience wrapper that converts `YYYY-MM` to date range
- Delegates to `exportTransactions()`

## summary

### `getTransactionSummary(filter?) → TransactionSummary | null`

Shape: `{ transactionsCount, totalNetIncome, totalIncome, totalSpent }`
Filter: `{ startDate?, endDate? }`

Behavior:
- Returns aggregate transaction statistics
- Returns `null` on failure

### `getTransactionSummaryByMonth(month) → TransactionSummary | null`

Behavior:
- Convenience wrapper that converts `YYYY-MM` to date range

## connections

### `refreshAllConnections() → ConnectionStatus[]`

Shape: `{ status, itemId, institutionName, institutionId }`

Behavior:
- Triggers a refresh of all financial connections
- Returns status array
- Returns `[]` on failure

## crypto

### `getCryptoSnapshot() → CryptoSnapshot`

Shape:
- `exchanges: { kraken, gemini, krakenError?, geminiError? }`
- `onchain: OnchainSnapshot`
- `summary: { totalUsd, byAsset, exchangeUsd, onchainUsd, topHoldings }`

Behavior:
- Never throws by design
- Each source is attempted independently
- Missing configuration becomes a per-source error string, not a global crash
- Prices are enriched from CoinGecko where possible
- Stablecoins are treated as `$1`
- Asset totals are merged across exchanges and wallets

### Exchanges
- Kraken balances come from private `/0/private/Balance`
- Gemini balances come from `/v1/balances`
- Failures are isolated per exchange

### OnchainSnapshot
Behavior:
- EVM balances loaded from DeBank/Rabby public API
- SOL native + SPL token balances loaded from Solana RPC and Jupiter token metadata
- Dust tokens under $1 are filtered out
- `errors` contains partial-source errors without failing the whole snapshot

## CLI Commands

### Read commands
- `finance accounts [--json]`
- `finance balances [--json]`
- `finance transactions [--limit N] [--unreviewed] [--search TEXT] [--json]`
- `finance categories [--json]`
- `finance spending [--month YYYY-MM] [--json]`
- `finance budget [--month YYYY-MM] [--json]`
- `finance networth [--history] [--json]`
- `finance snapshot [--print]`
- `finance doctor [--json]`

### Investment commands
- `finance holdings [--aggregated] [--timeframe 1M|3M|6M|1Y|ALL] [--json]`
- `finance performance [--timeframe 1M|3M|6M|1Y|ALL] [--json]`
- `finance allocation [--json]`

### Tag commands
- `finance tags [--json]`
- `finance tag create <name> [--color <colorName>] [--confirm]`
- `finance tag edit <id> --name <new-name> [--confirm]`
- `finance tag delete <id> [--confirm]`

### Recurring commands
- `finance recurring [--json]`
- `finance recurring <id> --metrics [--json]`

### Account history
- `finance account-history <account-id> [--timeframe 1M|3M|6M|1Y|ALL] [--json]`

### Category management (dry-run by default)
- `finance category create <name> [--color <colorName>] [--excluded] [--confirm]`
- `finance category edit <id> --name <new-name> [--color <colorName>] [--excluded] [--confirm]`
- `finance category delete <id> [--confirm]`

### Transaction management (dry-run by default)
- `finance transaction create --account <id> --amount <n> --name <name> --date <YYYY-MM-DD> [--confirm]`
- `finance transaction delete <tx-id> [--confirm]`

### Export & summary
- `finance export [--month YYYY-MM]`
- `finance summary [--month YYYY-MM] [--json]`

### Connections
- `finance refresh [--json]`

### Budget write subcommand
- `finance budget set <category-id> <amount> [--month YYYY-MM] [--confirm]`

### Transaction write commands (legacy)
- `finance set-category <tx-id> <category-id> [--confirm]`
- `finance mark-reviewed <tx-id> [--confirm]`
- `finance set-notes <tx-id> <notes...> [--confirm]`
- `finance mark-all-reviewed [--confirm]`

### Crypto commands
- `finance crypto [--json]`
- `finance crypto kraken [--json]`
- `finance crypto gemini [--json]`
- `finance crypto wallet [--json]`
- `finance crypto summary [--json]`

### CLI output contract
- `--json` returns machine-readable JSON only
- non-JSON commands write user-readable text to stdout
- invalid usage exits via `fatal()` with stderr message and non-zero exit

## `finance doctor`

Checks:
1. Copilot token / authenticated GraphQL access
2. Firebase refresh token file presence
3. Kraken API connectivity
4. Gemini API connectivity
5. DeBank EVM wallet connectivity/cache status
6. Solana RPC reachability

Text output:
```text
finance-os doctor
─────────────────────────────────
✓ Copilot Money    authenticated (14 accounts)
✓ Firebase token   refresh token present
✓ Kraken           11 assets
✓ Gemini           3 assets
✓ DeBank (EVM)     cached (23 min old) — 3 addresses
✓ Solana RPC       reachable
─────────────────────────────────
All checks passed
```

JSON output:
```json
{
  "ok": true,
  "checks": [
    {
      "key": "copilot",
      "label": "Copilot Money",
      "ok": true,
      "message": "authenticated (14 accounts)",
      "meta": { "accounts": 14 }
    }
  ]
}
```

## Error handling contract

- All client-layer transport/auth/GraphQL errors are wrapped as `CopilotError`
- Read primitives generally catch and degrade to empty/null shapes rather than throwing
- Write primitives throw on mutation failures or invalid inputs
- 401 triggers one auto-refresh attempt, then hard error
- Network failures surface from the client as `CopilotError` with actionable text
- Crypto sources degrade independently (Kraken down ≠ Gemini down)
- CLI top-level command handler converts thrown errors into `fatal()` stderr output

## Stale accounts

- `STALE_ACCOUNT_IDS` lives in `context-loader.ts`
- These accounts are excluded from snapshot totals and explicitly flagged in markdown output
- Current stale account:
  - Bilt `...8248` / account id `Og0xjkaM0EiKwZMKmj9DtbjRNPzz0MUPJkDxx9`
  - Reason: Bilt 2.0 migration / Column Bank transition

## Double-counting prevention

Copilot Money may include crypto exchange accounts (Kraken, Gemini) as connected accounts.
Since finance-os also queries these exchanges directly via their APIs, this would double-count
crypto balances in the net worth snapshot.

Fix: In `context-loader.ts`, when calculating `totalAssets` and `totalDebt`, accounts whose
`institutionId` starts with `crypto_exchange_` are excluded from the Copilot-side totals.
Crypto balances are instead sourced solely from the dedicated crypto layer.

## Environment Variables

All hardcoded paths are overridable via environment variables for portability:

| Variable | Default | Description |
|---|---|---|
| `FINANCE_OS_TOKEN_PATH` | `~/.openclaw/secrets/copilot-token` | Copilot bearer token file |
| `FINANCE_OS_CRYPTO_KEYS` | `~/.openclaw/secrets/crypto-keys.env` | Crypto API keys env file |
| `FINANCE_OS_SNAPSHOT_PATH` | `~/.openclaw/workspace/memory/finance-snapshot.md` | Snapshot output path |
| `FINANCE_OS_AUTH_SCRIPT` | `~/.openclaw/skills/finance/scripts/auth.sh` | Auth script path |
| `FINANCE_OS_CACHE_DIR` | `~/.openclaw/cache/finance` | DeBank disk cache directory |
| `FINANCE_OS_REFRESH_TOKEN_PATH` | `~/.openclaw/secrets/copilot-refresh-token` | Firebase refresh token path |
| `FINANCE_OS_QUIET` | — | Set to `1` to suppress warning output to stderr |
| `COPILOT_TOKEN` | — | Override bearer token directly (skip file) |

## Caching

### DeBank
- 24-hour disk cache (previously 30 minutes; increased to reduce rate-limit risk)
- Path: `~/.openclaw/cache/finance/debank-{address}.json`
- Cache contains `{ tokens, fetchedAt }`
- Fresh cache is preferred over making a new network request

### CoinGecko prices
- 5-minute in-memory cache
- Shared process-local cache only
- Used for crypto price enrichment and Solana valuation
