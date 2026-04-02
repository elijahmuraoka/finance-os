/**
 * utils.ts — Shared CLI helpers
 *
 * Argument parsing, output formatting, and common utilities
 * used across all command modules.
 */

export function parseArgs(argv: string[]): {
  flags: Record<string, string | boolean>;
  positional: string[];
} {
  const flags: Record<string, string | boolean> = {};
  const positional: string[] = [];
  let i = 0;
  while (i < argv.length) {
    const arg = argv[i];
    if (arg.startsWith("--")) {
      const key = arg.slice(2);
      const next = argv[i + 1];
      if (next !== undefined && !next.startsWith("--")) {
        flags[key] = next;
        i += 2;
      } else {
        flags[key] = true;
        i++;
      }
    } else {
      positional.push(arg);
      i++;
    }
  }
  return { flags, positional };
}

export function outputJson(data: unknown): void {
  process.stdout.write(`${JSON.stringify(data, null, 2)}\n`);
}

export function outputText(text: string): void {
  process.stdout.write(`${text}\n`);
}

export function fatal(message: string): never {
  process.stderr.write(`Error: ${message}\n`);
  process.exit(1);
}

export function getCurrentMonth(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  return `${year}-${month}`;
}

export function fmtUsd(n: number): string {
  return `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function fmtAmount(n: number, decimals = 6): string {
  return n.toLocaleString("en-US", { maximumFractionDigits: decimals });
}

export function parseTimeFrame(flag: string | boolean | undefined): string | undefined {
  if (!flag || flag === true) return undefined;
  const map: Record<string, string> = {
    "1M": "ONE_MONTH",
    "3M": "THREE_MONTHS",
    "6M": "SIX_MONTHS",
    "1Y": "ONE_YEAR",
    ALL: "ALL",
  };
  const upper = (flag as string).toUpperCase();
  if (!map[upper]) {
    fatal(`Invalid timeframe: ${flag}. Valid values: 1M, 3M, 6M, 1Y, ALL`);
  }
  return map[upper];
}
