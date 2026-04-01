/**
 * CopilotClient — authenticated GraphQL client for Copilot Money API.
 * Token priority: process.env.COPILOT_TOKEN > ~/.openclaw/secrets/copilot-token
 * Auto-refreshes via Firebase refresh token on 401 — no manual intervention needed.
 */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { execSync } from 'child_process';

const AUTH_SCRIPT = path.join(os.homedir(), '.openclaw', 'skills', 'finance', 'scripts', 'auth.sh');

const GRAPHQL_ENDPOINT = 'https://app.copilot.money/api/graphql';
const TOKEN_FILE = path.join(os.homedir(), '.openclaw', 'secrets', 'copilot-token');

export class CopilotError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CopilotError';
  }
}

function loadToken(): string {
  // Priority 1: environment variable
  if (process.env.COPILOT_TOKEN) {
    return process.env.COPILOT_TOKEN.trim();
  }

  // Priority 2: token file
  try {
    const token = fs.readFileSync(TOKEN_FILE, 'utf-8').trim();
    if (!token) throw new CopilotError('Token file exists but is empty');
    return token;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      throw new CopilotError(
        `Copilot token not found. Set COPILOT_TOKEN env var or write token to ${TOKEN_FILE}`
      );
    }
    throw err;
  }
}

function refreshToken(): void {
  if (!fs.existsSync(AUTH_SCRIPT)) {
    throw new CopilotError(
      `Auth script not found at ${AUTH_SCRIPT}. Cannot auto-refresh token.`
    );
  }
  try {
    execSync(`bash "${AUTH_SCRIPT}" --mode refresh`, { stdio: 'pipe' });
  } catch (err) {
    throw new CopilotError(
      `Token refresh failed: ${(err as Error).message}. Run auth.sh --mode refresh manually or re-authenticate with auth.sh (no flags).`
    );
  }
}

export class CopilotClient {
  private token: string;

  constructor() {
    this.token = loadToken();
  }

  private async doRequest(body: string): Promise<Response> {
    return fetch(GRAPHQL_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.token}`,
        'User-Agent': 'finance-os/0.1.0',
      },
      body,
    });
  }

  async graphql<T = unknown>(
    operationName: string,
    query: string,
    variables?: Record<string, unknown>
  ): Promise<T> {
    const body = JSON.stringify({
      operationName,
      query,
      variables: variables ?? {},
    });

    let response: Response;
    try {
      response = await this.doRequest(body);
    } catch (err) {
      throw new CopilotError(`Network error: ${(err as Error).message}`);
    }

    // Auto-refresh on 401 — try once, then retry
    if (response.status === 401) {
      try {
        refreshToken();
        this.token = loadToken(); // reload from disk
        _client = null; // reset singleton so next call gets fresh token
      } catch (err) {
        throw new CopilotError(
          `401 from Copilot API and auto-refresh failed: ${(err as Error).message}`
        );
      }
      try {
        response = await this.doRequest(body);
      } catch (err) {
        throw new CopilotError(`Network error after token refresh: ${(err as Error).message}`);
      }
    }

    if (!response.ok) {
      throw new CopilotError(
        `HTTP ${response.status} ${response.statusText} from Copilot API`
      );
    }

    let json: { data?: T; errors?: Array<{ message: string }> };
    try {
      json = (await response.json()) as typeof json;
    } catch {
      throw new CopilotError('Failed to parse JSON response from Copilot API');
    }

    if (json.errors && json.errors.length > 0) {
      const messages = json.errors.map((e) => e.message).join('; ');
      throw new CopilotError(`GraphQL errors: ${messages}`);
    }

    if (json.data === undefined) {
      throw new CopilotError('No data field in GraphQL response');
    }

    return json.data;
  }
}

// Singleton instance
let _client: CopilotClient | null = null;

export function getClient(): CopilotClient {
  if (!_client) {
    _client = new CopilotClient();
  }
  return _client;
}
