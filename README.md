# Finance OS

Personal finance CLI engine — a unified interface for Copilot Money data and crypto holdings, designed to run as an [OpenClaw](https://openclaw.com) skill.

Aggregates bank accounts, transactions, budgets, net worth, and crypto portfolio (Kraken, Gemini, on-chain ETH + SOL) into a single CLI with structured JSON output suitable for agent consumption.

## Setup

### Prerequisites

- Node.js 20+
- TypeScript 5+

### Install

```bash
git clone https://github.com/elijahmuraoka/finance-os.git
cd finance-os
npm install
npm run build
```

### Authentication

#### Copilot Money Token

The CLI reads a JWT from `~/.openclaw/secrets/copilot-token`. To obtain one:

1. Open `app.copilot.money` in your browser (logged in)
2. DevTools → Network → filter for `graphql` → copy the `Authorization` header value (strip `"Bearer "`)
3. Save it:
   ```bash
   echo "YOUR_TOKEN" > ~/.openclaw/secrets/copilot-token
   chmod 600 ~/.openclaw/secrets/copilot-token
   ```

The token expires periodically (30-90 days). When expired, all API calls return `[unavailable]`.

#### Crypto Keys (optional)

Create `~/.openclaw/secrets/crypto-keys.env` with API credentials:

- **Kraken** — API key + private key (permissions: Query Funds, Query Ledger Entries — read-only)
- **Gemini** — API key + secret (role: Auditor — read-only)
- **Wallet** — Public addresses only (ETH + SOL). No seed phrases, no private keys.

See `scripts/auth.sh` for the auth helper workflow.

## CLI Commands

### Core Finance

| Command | Description |
|---------|-------------|
| `finance accounts [--json]` | List all connected accounts with balances |
| `finance balances [--json]` | Simplified balance list sorted by type |
| `finance transactions [--limit N] [--unreviewed] [--search TEXT] [--json]` | List/filter recent transactions |
| `finance categories [--json]` | List all spending categories with IDs |
| `finance spending [--month YYYY-MM] [--json]` | Spending by category for a month |
| `finance budget [--month YYYY-MM] [--json]` | Budget status per category (over/under) |
| `finance networth [--json] [--history]` | Current net worth or historical trend |
| `finance snapshot [--print]` | Full financial context snapshot |

### Write Operations (dry-run by default)

| Command | Description |
|---------|-------------|
| `finance set-category <tx-id> <cat-id> [--confirm]` | Set category on a transaction |
| `finance mark-reviewed <tx-id> [--confirm]` | Mark a transaction as reviewed |
| `finance set-notes <tx-id> <notes> [--confirm]` | Add notes to a transaction |
| `finance mark-all-reviewed [--confirm]` | Bulk mark all unreviewed as reviewed |

### Crypto

| Command | Description |
|---------|-------------|
| `finance crypto [--json]` | Full snapshot from all configured sources |
| `finance crypto kraken [--json]` | Kraken balances only |
| `finance crypto gemini [--json]` | Gemini balances only |
| `finance crypto wallet [--json]` | On-chain ETH + SOL balances |
| `finance crypto summary [--json]` | Top holdings aggregated across sources |

## Architecture

```
src/
  cli.ts                    — CLI router (command parsing, dispatch)
  client.ts                 — GraphQL client (JWT auth, reads token from secrets)
  queries.ts                — All GraphQL query strings for Copilot Money API
  context-loader.ts         — Builds finance-snapshot.md (includes crypto)
  primitives/
    accounts.ts             — getAccounts, getAccountBalances
    transactions.ts         — getTransactions, getUnreviewed, searchTransactions
    categories.ts           — getCategories, getSpendingByCategory
    budgets.ts              — getBudgetStatus, getMonthlySpend
    networth.ts             — getNetworthHistory, getCurrentNetworth
    write.ts                — setCategory, markReviewed, setNotes (confirm-gated)
  crypto/
    config.ts               — Reads ~/.openclaw/secrets/crypto-keys.env
    kraken.ts               — Kraken REST + HMAC-SHA512 auth
    gemini.ts               — Gemini REST + HMAC-SHA384 auth
    onchain.ts              — ETH (Blockscout) + SOL (public RPC)
    index.ts                — CryptoSnapshot aggregator
tests/
  fixtures/                 — Scrubbed response fixtures (no real data)
  primitives.test.ts        — Unit tests (all offline, no API calls)
scripts/
  auth.sh                   — Auth helper script
  get_token.py              — Token retrieval utility
  get_refresh_token.py      — Token refresh utility
```

### Design Principles

- **Read-heavy, write-safe** — Write operations are dry-run by default and require `--confirm` to execute
- **Graceful degradation** — Each data source (Copilot, Kraken, Gemini, on-chain) fails independently; missing keys produce empty results, not crashes
- **Agent-native** — `--json` flag on every command for structured output; `snapshot` produces markdown context for LLM consumption
- **No secrets in code** — All credentials read from `~/.openclaw/secrets/` at runtime

## Testing

```bash
npm test
```

All tests run offline against fixture data — no API keys or network access required.

## License

Private. Not for redistribution.
