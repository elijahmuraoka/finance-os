/**
 * logger.ts — Structured logging with quiet mode support
 *
 * All console.warn calls should route through this module.
 * Quiet mode suppresses warnings (not errors).
 *
 * Enable quiet mode:
 *   - Set FINANCE_OS_QUIET=1 in environment
 *   - Pass --quiet flag on CLI
 */

const isQuiet = process.env.FINANCE_OS_QUIET === "1" || process.argv.includes("--quiet");

export function warn(module: string, message: string): void {
  if (!isQuiet) {
    process.stderr.write(`[${module}] Warning: ${message}\n`);
  }
}

export function error(module: string, message: string): void {
  process.stderr.write(`[${module}] Error: ${message}\n`);
}
