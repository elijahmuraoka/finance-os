/**
 * gemini.ts — Gemini exchange client
 *
 * Auth: Base64-encoded JSON payload + HMAC-SHA384 signature.
 * Signing algorithm:
 *   payload = base64( JSON.stringify({ request, nonce, ...params }) )
 *   signature = hex( HMAC-SHA384(payload, secret) )
 *   Headers: X-GEMINI-APIKEY, X-GEMINI-PAYLOAD, X-GEMINI-SIGNATURE
 *
 * Endpoints:
 *   POST https://api.gemini.com/v1/balances
 *   POST https://api.gemini.com/v1/notionalbalances/usd
 */

import * as crypto from "node:crypto";
import { getGeminiConfig } from "./config";

const BASE_URL = "https://api.gemini.com";

export interface GeminiBalance {
  currency: string; // e.g. "BTC", "ETH", "USD"
  amount: number; // total balance
  available: number; // available for trading
  availableForWithdrawal: number;
  usdValue: number | null; // enriched by aggregator or from notional endpoint
}

export class GeminiError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GeminiError";
  }
}

function sign(payload: string, secret: string): string {
  return crypto.createHmac("sha384", secret).update(payload).digest("hex");
}

export class GeminiClient {
  private apiKey: string;
  private apiSecret: string;
  private nonce: number;

  constructor(apiKey: string, apiSecret: string) {
    this.apiKey = apiKey;
    this.apiSecret = apiSecret;
    this.nonce = Date.now() * 1000;
  }

  private nextNonce(): number {
    // Ensure monotonically increasing nonce
    this.nonce = Math.max(Date.now() * 1000, this.nonce + 1);
    return this.nonce;
  }

  private async post<T = unknown>(
    requestPath: string,
    params: Record<string, unknown> = {},
  ): Promise<T> {
    const nonce = this.nextNonce();
    const payloadObj = {
      request: requestPath,
      nonce,
      ...params,
    };

    const payloadJson = JSON.stringify(payloadObj);
    const payloadB64 = Buffer.from(payloadJson).toString("base64");
    const signature = sign(payloadB64, this.apiSecret);

    let response: Response;
    try {
      response = await fetch(`${BASE_URL}${requestPath}`, {
        method: "POST",
        headers: {
          "Content-Type": "text/plain",
          "X-GEMINI-APIKEY": this.apiKey,
          "X-GEMINI-PAYLOAD": payloadB64,
          "X-GEMINI-SIGNATURE": signature,
          "User-Agent": "finance-skill/0.1.0",
          "Cache-Control": "no-cache",
        },
      });
    } catch (err) {
      throw new GeminiError(`Network error: ${(err as Error).message}`);
    }

    if (!response.ok) {
      let body = "";
      try {
        body = await response.text();
      } catch {
        /* ignore */
      }
      throw new GeminiError(
        `HTTP ${response.status} ${response.statusText}${body ? `: ${body.slice(0, 200)}` : ""}`,
      );
    }

    let json: T;
    try {
      json = (await response.json()) as T;
    } catch {
      throw new GeminiError("Failed to parse JSON response");
    }

    // Gemini returns error objects: { result: "error", reason: "...", message: "..." }
    const maybeErr = json as { result?: string; reason?: string; message?: string };
    if (maybeErr.result === "error") {
      throw new GeminiError(
        `Gemini API error: ${maybeErr.reason ?? maybeErr.message ?? "unknown"}`,
      );
    }

    return json;
  }

  /**
   * Get all available balances.
   * Returns non-zero balances only.
   */
  async getBalances(): Promise<GeminiBalance[]> {
    // Response: array of { currency, amount, available, availableForWithdrawal, type }
    type RawBalance = {
      currency: string;
      amount: string;
      available: string;
      availableForWithdrawal: string;
      type: string;
    };

    // Master API keys require account=primary; regular keys ignore this param
    const result = await this.post<RawBalance[]>("/v1/balances", { account: "primary" });

    return (Array.isArray(result) ? result : [])
      .map((b) => ({
        currency: b.currency,
        amount: parseFloat(b.amount) || 0,
        available: parseFloat(b.available) || 0,
        availableForWithdrawal: parseFloat(b.availableForWithdrawal) || 0,
        usdValue: null,
      }))
      .filter((b) => b.amount > 0);
  }

  /**
   * Get notional (USD) balances — Gemini's own USD conversion.
   * Useful as a cross-check or fallback for USD values.
   */
  async getNotionalBalances(): Promise<
    Array<{
      currency: string;
      amount: number;
      amountNotional: number;
      available: number;
      availableNotional: number;
    }>
  > {
    type RawNotional = {
      currency: string;
      amount: string;
      amountNotional: string;
      available: string;
      availableNotional: string;
    };

    const result = await this.post<RawNotional[]>("/v1/notionalbalances/usd", {
      account: "primary",
    });

    return (Array.isArray(result) ? result : [])
      .map((b) => ({
        currency: b.currency,
        amount: parseFloat(b.amount) || 0,
        amountNotional: parseFloat(b.amountNotional) || 0,
        available: parseFloat(b.available) || 0,
        availableNotional: parseFloat(b.availableNotional) || 0,
      }))
      .filter((b) => b.amount > 0);
  }
}

/** Create a GeminiClient from config/env. Returns null if keys not configured. */
export function createGeminiClient(): GeminiClient | null {
  const { apiKey, apiSecret, configured } = getGeminiConfig();
  if (!configured) return null;
  return new GeminiClient(apiKey, apiSecret);
}
