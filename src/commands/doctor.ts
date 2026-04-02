/**
 * commands/doctor.ts — doctor
 */
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { getGeminiConfig, getKrakenConfig, getOnchainConfig } from "../crypto/config";
import { createGeminiClient } from "../crypto/gemini";
import { createKrakenClient } from "../crypto/kraken";
import { getSolBalance } from "../crypto/onchain";
import { getAccounts } from "../primitives/accounts";
import { outputJson, outputText } from "../utils";

type DoctorCheck = {
  key: string;
  label: string;
  ok: boolean;
  message: string;
  meta?: Record<string, unknown>;
};

function formatDoctorLine(check: DoctorCheck): string {
  const symbol = check.ok ? "✓" : "✗";
  return `${symbol} ${check.label.padEnd(16)} ${check.message}`;
}

const REFRESH_TOKEN_PATH =
  process.env.FINANCE_OS_REFRESH_TOKEN_PATH ||
  path.join(os.homedir(), ".openclaw", "secrets", "copilot-refresh-token");

const DEBANK_CACHE_BASE =
  process.env.FINANCE_OS_CACHE_DIR || path.join(os.homedir(), ".openclaw", "cache", "finance");

async function runDoctor(): Promise<DoctorCheck[]> {
  const checks: DoctorCheck[] = [];

  try {
    const accounts = await getAccounts();
    checks.push({
      key: "copilot",
      label: "Copilot Money",
      ok: true,
      message: `authenticated (${accounts.length} accounts)`,
      meta: { accounts: accounts.length },
    });
  } catch (err) {
    checks.push({
      key: "copilot",
      label: "Copilot Money",
      ok: false,
      message: `${(err as Error).message}`,
    });
  }

  try {
    const refreshToken = fs.readFileSync(REFRESH_TOKEN_PATH, "utf8").trim();
    checks.push({
      key: "firebase-refresh",
      label: "Firebase token",
      ok: Boolean(refreshToken),
      message: refreshToken ? "refresh token present" : "refresh token file is empty",
      meta: { path: REFRESH_TOKEN_PATH },
    });
  } catch (err) {
    checks.push({
      key: "firebase-refresh",
      label: "Firebase token",
      ok: false,
      message: `missing refresh token (set FINANCE_OS_REFRESH_TOKEN_PATH or place at default path)`,
      meta: { error: (err as Error).message },
    });
  }

  const krakenCfg = getKrakenConfig();
  if (!krakenCfg.configured) {
    checks.push({
      key: "kraken",
      label: "Kraken",
      ok: false,
      message: "keys not configured",
    });
  } else {
    try {
      const balances = await createKrakenClient()?.getBalances();
      checks.push({
        key: "kraken",
        label: "Kraken",
        ok: true,
        message: `${balances.length} assets`,
        meta: { count: balances.length },
      });
    } catch (err) {
      checks.push({
        key: "kraken",
        label: "Kraken",
        ok: false,
        message: (err as Error).message,
      });
    }
  }

  const geminiCfg = getGeminiConfig();
  if (!geminiCfg.configured) {
    checks.push({
      key: "gemini",
      label: "Gemini",
      ok: false,
      message: "keys not configured",
    });
  } else {
    try {
      const balances = await createGeminiClient()?.getBalances();
      checks.push({
        key: "gemini",
        label: "Gemini",
        ok: true,
        message: `${balances.length} assets`,
        meta: { count: balances.length },
      });
    } catch (err) {
      checks.push({
        key: "gemini",
        label: "Gemini",
        ok: false,
        message: (err as Error).message,
      });
    }
  }

  const onchainCfg = getOnchainConfig();
  if (onchainCfg.ethAddresses.length === 0) {
    checks.push({
      key: "debank",
      label: "DeBank (EVM)",
      ok: false,
      message: "no ETH address configured",
    });
  } else {
    const address = onchainCfg.ethAddresses[0];
    const cachePath = path.join(DEBANK_CACHE_BASE, `debank-${address.toLowerCase()}.json`);
    const cacheExists = fs.existsSync(cachePath);
    let cacheAgeMinutes: number | null = null;
    if (cacheExists) {
      try {
        const parsed = JSON.parse(fs.readFileSync(cachePath, "utf8")) as {
          fetchedAt?: number;
          tokens?: unknown[];
        };
        if (typeof parsed.fetchedAt === "number") {
          cacheAgeMinutes = Math.floor((Date.now() - parsed.fetchedAt) / 60000);
        }
      } catch {
        cacheAgeMinutes = null;
      }
    }

    if (cacheExists && cacheAgeMinutes !== null && cacheAgeMinutes <= 30) {
      checks.push({
        key: "debank",
        label: "DeBank (EVM)",
        ok: true,
        message: `cached (${cacheAgeMinutes} min old) — ${onchainCfg.ethAddresses.length} address${onchainCfg.ethAddresses.length === 1 ? "" : "es"}`,
        meta: { address, cacheAgeMinutes, addresses: onchainCfg.ethAddresses.length },
      });
    } else {
      try {
        const pingUrl = `https://api.rabby.io/v1/user/token_list?id=${address}&is_all=false&has_balance=true`;
        const res = await fetch(pingUrl, {
          headers: {
            "User-Agent": "Mozilla/5.0",
            Origin: "https://rabby.io",
            Referer: "https://rabby.io/",
          },
          signal: AbortSignal.timeout(8000),
        });
        checks.push({
          key: "debank",
          label: "DeBank (EVM)",
          ok: res.ok,
          message: res.ok
            ? `reachable — ${onchainCfg.ethAddresses.length} address${onchainCfg.ethAddresses.length === 1 ? "" : "es"}`
            : `HTTP ${res.status}`,
          meta: { address, status: res.status },
        });
      } catch (err) {
        checks.push({
          key: "debank",
          label: "DeBank (EVM)",
          ok: false,
          message: (err as Error).message,
        });
      }
    }
  }

  if (!onchainCfg.solAddress) {
    checks.push({
      key: "solana",
      label: "Solana RPC",
      ok: false,
      message: "no SOL address configured",
    });
  } else {
    try {
      await Promise.race([
        getSolBalance(onchainCfg.solAddress),
        new Promise((_, reject) => setTimeout(() => reject(new Error("timeout after 8s")), 8000)),
      ]);
      checks.push({
        key: "solana",
        label: "Solana RPC",
        ok: true,
        message: "reachable",
        meta: { address: onchainCfg.solAddress },
      });
    } catch (err) {
      checks.push({
        key: "solana",
        label: "Solana RPC",
        ok: false,
        message: (err as Error).message,
      });
    }
  }

  return checks;
}

export async function cmdDoctor(
  _positional: string[],
  flags: Record<string, string | boolean>,
): Promise<void> {
  const checks = await runDoctor();
  const passed = checks.every((check) => check.ok);

  if (flags.json) {
    outputJson({
      ok: passed,
      checks,
    });
    return;
  }

  outputText("finance-os doctor");
  outputText("─────────────────────────────────");
  for (const check of checks) {
    outputText(formatDoctorLine(check));
  }
  outputText("─────────────────────────────────");
  outputText(passed ? "All checks passed" : "Some checks failed");
}
