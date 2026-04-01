/**
 * CopilotClient — authenticated GraphQL client for Copilot Money API.
 * Token priority: process.env.COPILOT_TOKEN > ~/.openclaw/secrets/copilot-token
 */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

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

export class CopilotClient {
  private token: string;

  constructor() {
    this.token = loadToken();
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
      response = await fetch(GRAPHQL_ENDPOINT, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.token}`,
          'User-Agent': 'finance-skill/0.1.0',
        },
        body,
      });
    } catch (err) {
      throw new CopilotError(`Network error: ${(err as Error).message}`);
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
