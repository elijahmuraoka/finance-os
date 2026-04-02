# Changelog

All notable changes to this project will be documented in this file.

## [0.1.0] - 2026-04-02

### Added
- Initial open source release
- 39 CLI commands across accounts, transactions, budgets, investments, crypto, and infrastructure
- Copilot Money GraphQL integration with auto-refresh authentication
- Kraken and Gemini exchange integrations (HMAC-signed)
- On-chain wallet tracking via DeBank (multi-chain EVM) + Solana RPC
- Investment holdings with cost basis and returns
- Budget tracking with per-category status
- Recurring expense detection
- Transaction categorization, tagging, and review
- CSV export
- Health check (`finance doctor`)
- Full behavioral specification (`docs/spec.md`)
- 107 fixture-based tests
- Biome linting with zero warnings
- Apache 2.0 license

### Changed
- Refactored CLI into 11 command modules under `src/commands/`
- Replaced `console.warn` with structured logger
- Parameterized all filesystem paths via environment variables
- Excluded Copilot crypto exchange accounts from net worth calculations to prevent double-counting
- Increased DeBank cache TTL to 24 hours

### Fixed
- Transaction search now works via client-side filtering (Copilot API has no server-side search field)
- Transaction write primitives now resolve `itemId` correctly
