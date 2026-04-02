# Contributing to finance-os

Thanks for your interest in contributing! This guide will help you get started.

## Development Setup

### Prerequisites
- [Bun](https://bun.sh) v1.0+
- Python 3.10+ with Playwright (for auth scripts only)
- A [Copilot Money](https://copilot.money) account

### Getting Started
```bash
git clone https://github.com/elijahmuraoka/finance-os.git
cd finance-os
bun install
bun run build
bun test
```

### Project Structure
```text
src/
  cli.ts              ← Thin command router
  commands/           ← One file per command group (11 modules)
  primitives/         ← Data access layer (one file per domain)
  crypto/             ← Exchange + on-chain integrations
  client.ts           ← GraphQL client with auto-refresh
  queries.ts          ← All GraphQL query/mutation strings
  context-loader.ts   ← Snapshot builder
  utils.ts            ← Shared helpers
  logger.ts           ← Structured logging
tests/                ← Fixture-based unit tests
docs/spec.md          ← Behavioral specification
```

## Making Changes

### Before You Start
1. Check existing issues and PRs to avoid duplicate work
2. For large changes, open an issue first to discuss the approach
3. Read `docs/spec.md` for behavioral contracts

### Development Workflow
1. Create a feature branch: `git checkout -b feat/my-feature`
2. Make your changes
3. Run tests: `bun test`
4. Run linter: `bun run lint`
5. Format code: `bun run format`
6. Commit with a descriptive message following conventional commits:
   - `feat:` for new features
   - `fix:` for bug fixes
   - `refactor:` for code restructuring
   - `docs:` for documentation
   - `test:` for test additions

### Code Standards
- **TypeScript strict mode** — no `any` types, proper null handling
- **Biome linting** — zero warnings required (`bun run lint`)
- **Test everything** — new primitives need fixture-based tests
- **Dry-run by default** — all write operations must require `--confirm`
- **Graceful degradation** — primitives return empty/null on failure, never crash
- **Structured logging** — use `warn()` from `src/logger.ts`, not `console.log`

### Adding a New Primitive
1. Create `src/primitives/my-feature.ts`
2. Add GraphQL query/mutation to `src/queries.ts`
3. Create `src/commands/my-feature.ts` (or add to existing command module)
4. Register in `src/cli.ts` COMMAND_MAP
5. Add fixture to `tests/fixtures/`
6. Write tests
7. Update `docs/spec.md` with the new primitive's contract
8. Update README.md CLI reference

### Adding a New Data Source
finance-os is designed to be extensible. To add a new exchange or data source:
1. Create `src/crypto/my-exchange.ts` following the Kraken/Gemini pattern
2. Add config to `src/crypto/config.ts`
3. Integrate into `src/crypto/index.ts`
4. Add tests with fixture data

## Testing
- All tests are fixture-based (no live API calls)
- Fixtures live in `tests/fixtures/`
- Mock the GraphQL client, not the HTTP layer

```bash
bun test                    # Run all tests
bun test --watch            # Watch mode
bun run lint                # Check linting
bun run format              # Auto-format
```

## Reporting Issues
- Use GitHub Issues
- Include: what you expected, what happened, steps to reproduce
- For auth issues: include the error message (never share tokens)

## Code of Conduct
Be respectful. We follow the [Contributor Covenant](https://www.contributor-covenant.org/).
