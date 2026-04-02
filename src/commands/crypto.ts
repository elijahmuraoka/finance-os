/**
 * commands/crypto.ts — crypto, crypto kraken/gemini/wallet/summary
 */

import { getGeminiConfig, getKrakenConfig, getOnchainConfig } from "../crypto/config";
import { createGeminiClient } from "../crypto/gemini";
import { getCryptoSnapshot } from "../crypto/index";
import { createKrakenClient } from "../crypto/kraken";
import { getAllOnchainBalances } from "../crypto/onchain";
import { fatal, fmtAmount, fmtUsd, outputJson, outputText, parseArgs } from "../utils";

export async function cmdCrypto(
  positional: string[],
  flags: Record<string, string | boolean>,
): Promise<void> {
  const { flags: subFlags, positional: subPositional } = parseArgs(positional);
  const mergedFlags = { ...flags, ...subFlags };
  const sub = subPositional[0] ?? "";
  const json = !!mergedFlags.json;

  switch (sub) {
    case "kraken": {
      const cfg = getKrakenConfig();
      if (!cfg.configured) {
        if (json) outputJson({ error: "Kraken keys not configured", kraken: null });
        else
          outputText(
            "Kraken keys not configured. Set KRAKEN_API_KEY + KRAKEN_API_SECRET (env or FINANCE_OS_CRYPTO_KEYS file)",
          );
        return;
      }
      try {
        const client = createKrakenClient();
        if (!client) return;
        const balances = await client.getBalances();
        if (json) {
          outputJson(balances);
        } else {
          outputText("Kraken Balances:");
          for (const b of balances) {
            outputText(`  ${b.asset}: ${fmtAmount(b.balance)}`);
          }
        }
      } catch (err) {
        if (json) outputJson({ error: (err as Error).message, kraken: null });
        else fatal((err as Error).message);
      }
      break;
    }

    case "gemini": {
      const cfg = getGeminiConfig();
      if (!cfg.configured) {
        if (json) outputJson({ error: "Gemini keys not configured", gemini: null });
        else
          outputText(
            "Gemini keys not configured. Set GEMINI_API_KEY + GEMINI_API_SECRET (env or FINANCE_OS_CRYPTO_KEYS file)",
          );
        return;
      }
      try {
        const client = createGeminiClient();
        if (!client) return;
        const balances = await client.getBalances();
        if (json) {
          outputJson(balances);
        } else {
          outputText("Gemini Balances:");
          for (const b of balances) {
            outputText(`  ${b.currency}: ${fmtAmount(b.amount)}`);
          }
        }
      } catch (err) {
        if (json) outputJson({ error: (err as Error).message, gemini: null });
        else fatal((err as Error).message);
      }
      break;
    }

    case "wallet": {
      const cfg = getOnchainConfig();
      if (cfg.ethAddresses.length === 0 && !cfg.solAddress) {
        if (json) outputJson({ error: "No wallet addresses configured", onchain: null });
        else
          outputText(
            "No wallet addresses configured. Set RABBY_ETH_ADDRESS_MAIN and/or RABBY_SOL_ADDRESS (env or FINANCE_OS_CRYPTO_KEYS file)",
          );
        return;
      }
      try {
        const snapshot = await getAllOnchainBalances();
        if (json) {
          outputJson(snapshot);
        } else {
          for (const wallet of snapshot.ethereum) {
            outputText(`\nEthereum (${wallet.address.slice(0, 8)}...)`);
            outputText(`  ETH: ${fmtAmount(wallet.eth, 6)} (${fmtUsd(wallet.ethUsd)})`);
            for (const t of wallet.tokens) {
              outputText(
                `  ${t.symbol}: ${fmtAmount(t.balance)} (${t.usdValue !== null ? fmtUsd(t.usdValue) : "?"})`,
              );
            }
            for (const chain of wallet.extraChains ?? []) {
              outputText(`  [${chain.chainName}]`);
              if (chain.nativeBalance > 0.0001)
                outputText(
                  `    ${chain.nativeSymbol}: ${fmtAmount(chain.nativeBalance, 6)} (${fmtUsd(chain.nativeUsd)})`,
                );
              for (const t of chain.tokens) {
                outputText(
                  `    ${t.symbol}: ${fmtAmount(t.balance)} (${t.usdValue !== null ? fmtUsd(t.usdValue) : "?"})`,
                );
              }
              outputText(`    Total: ${fmtUsd(chain.totalUsd)}`);
            }
            outputText(`  Total: ${fmtUsd(wallet.totalUsd)}`);
          }
          if (snapshot.solana) {
            outputText(`\nSolana (${snapshot.solana.address.slice(0, 8)}...)`);
            outputText(
              `  SOL: ${fmtAmount(snapshot.solana.sol, 6)} (${fmtUsd(snapshot.solana.solUsd)})`,
            );
            for (const t of snapshot.solana.tokens) {
              outputText(
                `  ${t.symbol}: ${fmtAmount(t.balance)} (${t.usdValue !== null ? fmtUsd(t.usdValue) : "?"})`,
              );
            }
            outputText(`  Total: ${fmtUsd(snapshot.solana.totalUsd)}`);
          }
          if (snapshot.errors.length > 0) {
            outputText(`\nWarnings: ${snapshot.errors.join("; ")}`);
          }
          outputText(`\nTotal on-chain: ${fmtUsd(snapshot.totalUsd)}`);
        }
      } catch (err) {
        if (json) outputJson({ error: (err as Error).message, onchain: null });
        else fatal((err as Error).message);
      }
      break;
    }

    case "summary": {
      try {
        const snapshot = await getCryptoSnapshot();
        if (json) {
          outputJson(snapshot.summary);
        } else {
          outputText(`\nCrypto Summary — Total: ${fmtUsd(snapshot.summary.totalUsd)}`);
          outputText(
            `  Exchanges: ${fmtUsd(snapshot.summary.exchangeUsd)} | Wallet: ${fmtUsd(snapshot.summary.onchainUsd)}`,
          );
          outputText("\nTop Holdings:");
          for (const h of snapshot.summary.topHoldings) {
            const pct = h.pct.toFixed(1);
            outputText(`  ${h.symbol}: ${fmtUsd(h.usdValue)} (${pct}%) [${h.sources.join(", ")}]`);
          }
        }
      } catch (err) {
        if (json) outputJson({ error: (err as Error).message });
        else fatal((err as Error).message);
      }
      break;
    }
    default: {
      try {
        const snapshot = await getCryptoSnapshot();
        if (json) {
          outputJson(snapshot);
        } else {
          outputText(`\nCrypto Holdings — ${snapshot.fetchedAt}`);
          outputText(`Total: ${fmtUsd(snapshot.summary.totalUsd)}\n`);

          if (snapshot.exchanges.kraken) {
            outputText("Kraken:");
            for (const b of snapshot.exchanges.kraken) {
              outputText(
                `  ${b.asset}: ${fmtAmount(b.balance)}${b.usdValue !== null ? ` (${fmtUsd(b.usdValue)})` : ""}`,
              );
            }
          } else if (snapshot.exchanges.krakenError) {
            outputText(`Kraken: ${snapshot.exchanges.krakenError}`);
          }

          if (snapshot.exchanges.gemini) {
            outputText("\nGemini:");
            for (const b of snapshot.exchanges.gemini) {
              outputText(
                `  ${b.currency}: ${fmtAmount(b.amount)}${b.usdValue !== null ? ` (${fmtUsd(b.usdValue)})` : ""}`,
              );
            }
          } else if (snapshot.exchanges.geminiError) {
            outputText(`Gemini: ${snapshot.exchanges.geminiError}`);
          }

          if (snapshot.onchain?.ethereum && snapshot.onchain.ethereum.length > 0) {
            for (const wallet of snapshot.onchain.ethereum) {
              outputText(`\nWallet (ETH ${wallet.address.slice(0, 8)}...):`);
              outputText(`  ETH: ${fmtAmount(wallet.eth)} (${fmtUsd(wallet.ethUsd)})`);
              for (const t of wallet.tokens) {
                outputText(
                  `  ${t.symbol}: ${fmtAmount(t.balance)} (${t.usdValue !== null ? fmtUsd(t.usdValue) : "?"})`,
                );
              }
              for (const chain of wallet.extraChains ?? []) {
                outputText(
                  `  [${chain.chainName}] native: ${fmtAmount(chain.nativeBalance, 6)} ${chain.nativeSymbol} (${fmtUsd(chain.nativeUsd)})`,
                );
                for (const t of chain.tokens) {
                  outputText(
                    `    ${t.symbol}: ${fmtAmount(t.balance)} (${t.usdValue !== null ? fmtUsd(t.usdValue) : "?"})`,
                  );
                }
              }
            }
          }
          if (snapshot.onchain?.solana) {
            const sol = snapshot.onchain.solana;
            outputText(`\nWallet (SOL):`);
            outputText(`  SOL: ${fmtAmount(sol.sol)} (${fmtUsd(sol.solUsd)})`);
            for (const t of sol.tokens) {
              outputText(
                `  ${t.symbol}: ${fmtAmount(t.balance)} (${t.usdValue !== null ? fmtUsd(t.usdValue) : "?"})`,
              );
            }
          }
          if (snapshot.onchainError) {
            outputText(`Wallet: ${snapshot.onchainError}`);
          }
        }
      } catch (err) {
        if (json)
          outputJson({
            error: (err as Error).message,
            exchanges: { kraken: null, gemini: null },
            onchain: null,
          });
        else fatal((err as Error).message);
      }
    }
  }
}
