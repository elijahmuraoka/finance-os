/**
 * commands/categories.ts — categories, spending, category create/edit/delete
 */
import {
  formatCategoriesTable,
  formatSpendingTable,
  getCategories,
  getSpendingByCategory,
} from "../primitives/categories";
import { createCategory, deleteCategory, editCategory } from "../primitives/categories-write";
import { fatal, outputJson, outputText, parseArgs } from "../utils";

export async function cmdCategories(
  _positional: string[],
  flags: Record<string, string | boolean>,
): Promise<void> {
  const categories = await getCategories();
  if (flags.json) {
    outputJson(categories);
  } else {
    outputText(formatCategoriesTable(categories));
  }
}

export async function cmdSpending(
  _positional: string[],
  flags: Record<string, string | boolean>,
): Promise<void> {
  const month = flags.month as string | undefined;
  const spending = await getSpendingByCategory(month);
  if (flags.json) {
    outputJson(spending);
  } else {
    outputText(formatSpendingTable(spending));
  }
}

export async function cmdCategoryWrite(
  positional: string[],
  flags: Record<string, string | boolean>,
): Promise<void> {
  const { flags: parsedFlags, positional: parsedPositional } = parseArgs(positional);
  const mergedFlags = { ...flags, ...parsedFlags };
  const subcommand = parsedPositional[0];

  if (subcommand === "create") {
    const name = parsedPositional[1];
    if (!name) {
      fatal("Usage: finance category create <name> [--color <colorName>] [--excluded] [--confirm]");
    }
    const opts: Record<string, unknown> = {};
    if (mergedFlags.color) opts.colorName = mergedFlags.color as string;
    if (mergedFlags.excluded) opts.isExcluded = true;
    await createCategory(name, opts, !!mergedFlags.confirm);
  } else if (subcommand === "edit") {
    const id = parsedPositional[1];
    if (!id) {
      fatal(
        "Usage: finance category edit <id> --name <new-name> [--color <colorName>] [--excluded] [--confirm]",
      );
    }
    const opts: Record<string, unknown> = {};
    if (mergedFlags.name) opts.name = mergedFlags.name as string;
    if (mergedFlags.color) opts.colorName = mergedFlags.color as string;
    if (mergedFlags.excluded !== undefined) opts.isExcluded = !!mergedFlags.excluded;
    await editCategory(id, opts, !!mergedFlags.confirm);
  } else if (subcommand === "delete") {
    const id = parsedPositional[1];
    if (!id) fatal("Usage: finance category delete <id> [--confirm]");
    await deleteCategory(id, !!mergedFlags.confirm);
  } else {
    fatal(`Unknown category subcommand: ${subcommand}. Use: create, edit, delete`);
  }
}
