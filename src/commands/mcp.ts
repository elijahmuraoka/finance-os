import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListResourcesRequestSchema,
  ListToolsRequestSchema,
  ReadResourceRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

import { getAccounts } from "../primitives/accounts";
import { getBudgetStatus } from "../primitives/budgets";
import { getHoldings } from "../primitives/holdings";
import { getCurrentNetworth, getNetworthHistory } from "../primitives/networth";
import { getTransactions, getUnreviewed } from "../primitives/transactions";
import { markReviewed, setCategory } from "../primitives/write";

export async function cmdMcp(): Promise<void> {
  const server = new Server(
    {
      name: "finance-os",
      version: "0.1.0",
    },
    {
      capabilities: {
        resources: {},
        tools: {},
      },
    },
  );

  server.setRequestHandler(ListResourcesRequestSchema, async () => {
    return {
      resources: [
        {
          uri: "finance://networth/current",
          name: "Current Networth",
          description: "Current networth and liquid assets",
          mimeType: "application/json",
        },
        {
          uri: "finance://networth/history",
          name: "Networth History",
          description: "Historical networth data",
          mimeType: "application/json",
        },
        {
          uri: "finance://budgets/current",
          name: "Current Budgets",
          description: "Current month budget vs actual spending",
          mimeType: "application/json",
        },
        {
          uri: "finance://accounts",
          name: "Accounts",
          description: "List of all financial accounts",
          mimeType: "application/json",
        },
        {
          uri: "finance://holdings",
          name: "Investment Holdings",
          description: "Current investment holdings",
          mimeType: "application/json",
        },
        {
          uri: "finance://transactions/unreviewed",
          name: "Unreviewed Transactions",
          description: "List of unreviewed transactions",
          mimeType: "application/json",
        },
      ],
    };
  });

  server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
    const uri = request.params.uri;
    let data: unknown;

    try {
      switch (uri) {
        case "finance://networth/current":
          data = await getCurrentNetworth();
          break;
        case "finance://networth/history":
          data = await getNetworthHistory();
          break;
        case "finance://budgets/current":
          data = await getBudgetStatus();
          break;
        case "finance://accounts":
          data = await getAccounts();
          break;
        case "finance://holdings":
          data = await getHoldings();
          break;
        case "finance://transactions/unreviewed":
          data = await getUnreviewed();
          break;
        default:
          throw new Error(`Resource not found: ${uri}`);
      }

      return {
        contents: [
          {
            uri,
            mimeType: "application/json",
            text: JSON.stringify(data, null, 2),
          },
        ],
      };
    } catch (err: unknown) {
      throw new Error(`Failed to read resource ${uri}: ${err.message}`);
    }
  });

  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return {
      tools: [
        {
          name: "mark_transaction_reviewed",
          description: "Mark a specific transaction as reviewed",
          inputSchema: {
            type: "object",
            properties: {
              txId: { type: "string", description: "Transaction ID" },
            },
            required: ["txId"],
          },
        },
        {
          name: "set_transaction_category",
          description: "Change the category of a transaction",
          inputSchema: {
            type: "object",
            properties: {
              txId: { type: "string", description: "Transaction ID" },
              categoryId: { type: "string", description: "Category ID" },
            },
            required: ["txId", "categoryId"],
          },
        },
        {
          name: "get_recent_transactions",
          description: "Fetch recent transactions with optional limits",
          inputSchema: {
            type: "object",
            properties: {
              limit: { type: "number", description: "Number of transactions to fetch" },
              search: { type: "string", description: "Search query string" },
            },
          },
        },
      ],
    };
  });

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const name = request.params.name;
    const args = request.params.arguments || {};

    try {
      if (name === "mark_transaction_reviewed") {
        const { txId } = args as { txId: string };
        if (!txId) throw new Error("txId is required");
        await markReviewed(txId, true);
        return {
          content: [{ type: "text", text: `Transaction ${txId} marked as reviewed.` }],
        };
      }

      if (name === "set_transaction_category") {
        const { txId, categoryId } = args as { txId: string; categoryId: string };
        if (!txId || !categoryId) throw new Error("txId and categoryId are required");
        await setCategory(txId, categoryId, true);
        return {
          content: [{ type: "text", text: `Transaction ${txId} category set to ${categoryId}.` }],
        };
      }

      if (name === "get_recent_transactions") {
        const { limit = 20, search } = args as { limit?: number; search?: string };
        const result = await getTransactions({ limit, search });
        return {
          content: [{ type: "text", text: JSON.stringify(result.transactions, null, 2) }],
        };
      }

      throw new Error(`Tool not found: ${name}`);
    } catch (err: unknown) {
      return {
        content: [{ type: "text", text: `Error calling tool ${name}: ${err.message}` }],
        isError: true,
      };
    }
  });

  const transport = new StdioServerTransport();
  await server.connect(transport);
}
