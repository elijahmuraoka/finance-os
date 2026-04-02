# finance-os

A comprehensive CLI for personal finance management. Connects to Copilot Money, crypto exchanges (Kraken, Gemini), and on-chain wallets (ETH, SOL, multi-chain EVM).

## Features

- **39 CLI commands** across accounts, transactions, budgets, investments, crypto, and more
- **Auto-refresh authentication** — Firebase token refresh on 401, zero manual intervention
- **Investment holdings** — see all positions with cost basis and returns
- **Crypto portfolio** — Kraken, Gemini, and on-chain wallets (ETH + SOL + all EVM chains)
- **Budget tracking** — spending vs budget per category
- **Transaction management** — categorize, review, tag, create, delete
- **Recurring detection** — track subscriptions and recurring expenses
- **Export** — CSV download of all transactions
- **99 tests** — full fixture-based test suite

## Prerequisites

- [Bun](https://bun.sh) runtime
- [Copilot Money](https://copilot.money) account
- Python 3 + Playwright (for initial auth only)

## Setup

### 1. Clone and install

```bash
git clone https://github.com/elijahmuraoka/finance-os.git
cd finance-os
bun install
bun run build
```

### 2. Authenticate with Copilot Money

```bash
# First time — opens browser, you log in, tokens saved automatically
./scripts/auth.sh

# Subsequent — auto-refreshes silently (used by the CLI on 401)
./scripts/auth.sh --mode refresh

# Verify
./scripts/auth.sh --mode verify
```

### 3. (Optional) Configure crypto

Create `~/.finance-os/crypto-keys.env` (or set `FINANCE_OS_CRYPTO_KEYS` env var):

```env
KRAKEN_API_KEY=your_key
KRAKEN_API_SECRET=your_secret
GEMINI_API_KEY=your_key
GEMINI_API_SECRET=your_secret
RABBY_ETH_ADDRESS_MAIN=0x...
RABBY_SOL_ADDRESS=...
```

### 4. Run

```bash
# Quick start
bun run dist/cli.js accounts
bun run dist/cli.js snapshot --print
bun run dist/cli.js doctor
```

## CLI Reference

### Read Commands
| Command | Description |
|---|---|
| `accounts` | List all connected accounts with balances |
| `balances` | Simplified balance summary sorted by type |
| `transactions [--limit N] [--unreviewed] [--search TEXT]` | Transaction list with filters |
| `categories` | All spending categories |
| `spending [--month YYYY-MM]` | Spending by category |
| `budget [--month YYYY-MM]` | Budget status per category |
| `networth [--history]` | Net worth (current or trend) |
| `holdings [--aggregated] [--timeframe]` | Investment positions |
| `performance [--timeframe]` | Portfolio returns |
| `allocation` | Investment allocation breakdown |
| `tags` | Custom transaction tags |
| `recurring` | Tracked subscriptions |
| `summary [--month YYYY-MM]` | Transaction totals |
| `snapshot [--print]` | Full financial context snapshot |
| `doctor` | Health check all connections |
| `export [--month YYYY-MM]` | CSV export URL |

### Crypto Commands
| Command | Description |
|---|---|
| `crypto` | Full crypto snapshot |
| `crypto kraken` | Kraken balances |
| `crypto gemini` | Gemini balances |
| `crypto wallet` | On-chain ETH + SOL |
| `crypto summary` | Aggregated holdings |

### Write Commands (dry-run by default)
| Command | Description |
|---|---|
| `set-category <tx-id> <cat-id> [--confirm]` | Categorize transaction |
| `mark-reviewed <tx-id> [--confirm]` | Mark reviewed |
| `mark-all-reviewed [--confirm]` | Bulk review |
| `set-notes <tx-id> <notes> [--confirm]` | Add notes |
| `budget set <cat-id> <amount> [--confirm]` | Set budget |
| `category create <name> [--confirm]` | Create category |
| `category edit <id> [--confirm]` | Edit category |
| `category delete <id> [--confirm]` | Delete category |
| `tag create <name> [--confirm]` | Create tag |
| `tag edit <id> [--confirm]` | Edit tag |
| `tag delete <id> [--confirm]` | Delete tag |
| `transaction create [--confirm]` | Create transaction |
| `transaction delete <id> [--confirm]` | Delete transaction |

### Infrastructure
| Command | Description |
|---|---|
| `refresh` | Force-sync bank connections |
| `account-history <id> [--timeframe]` | Balance history per account |

## Architecture

```
src/
  cli.ts              ← CLI router (39 commands)
  client.ts           ← GraphQL client (auto-refresh on 401)
  queries.ts          ← All GraphQL queries + mutations
  context-loader.ts   ← Builds markdown snapshot
  primitives/         ← One file per domain
    accounts.ts, transactions.ts, categories.ts,
    budgets.ts, networth.ts, write.ts, holdings.ts,
    investments.ts, tags.ts, recurring.ts, ...
  crypto/
    kraken.ts         ← HMAC-SHA512 auth
    gemini.ts         ← HMAC-SHA384 auth
    onchain.ts        ← DeBank (EVM) + Solana RPC
    config.ts, index.ts
scripts/
  auth.sh             ← Copilot auth (Playwright + Firebase refresh)
  get_token.py        ← Bearer token capture
  get_refresh_token.py ← Firebase refresh token extraction
tests/                ← 99 unit tests (fixture-based, offline)
docs/spec.md          ← Full behavioral specification
```

## Auth Model

Uses Copilot Money's internal GraphQL API (same as their web app). Authentication:

1. **Initial setup:** Playwright opens Copilot in a browser, you log in, tokens captured
2. **Ongoing:** Firebase refresh tokens exchanged via REST (~200ms, no browser)
3. **Auto-refresh:** On 401, the client automatically refreshes and retries

Firebase refresh tokens don't expire unless you explicitly sign out of Copilot everywhere.

## Environment Variables

| Variable | Default | Description |
|---|---|---|
| `FINANCE_OS_TOKEN_PATH` | `~/.openclaw/secrets/copilot-token` | Copilot bearer token |
| `FINANCE_OS_CRYPTO_KEYS` | `~/.openclaw/secrets/crypto-keys.env` | Crypto API keys |
| `FINANCE_OS_SNAPSHOT_PATH` | `~/.openclaw/workspace/memory/finance-snapshot.md` | Snapshot output |
| `FINANCE_OS_AUTH_SCRIPT` | `~/.openclaw/skills/finance/scripts/auth.sh` | Auth script path |
| `COPILOT_TOKEN` | — | Override token directly |

## License

MIT
