/**
 * commands/tags.ts — tags, tag create/edit/delete
 */
import { createTag, deleteTag, editTag, formatTagsTable, getTags } from "../primitives/tags";
import { fatal, outputJson, outputText, parseArgs } from "../utils";

export async function cmdTags(
  _positional: string[],
  flags: Record<string, string | boolean>,
): Promise<void> {
  const tags = await getTags();
  if (flags.json) {
    outputJson(tags);
  } else {
    outputText(formatTagsTable(tags));
  }
}

export async function cmdTagWrite(
  positional: string[],
  flags: Record<string, string | boolean>,
): Promise<void> {
  const { flags: parsedFlags, positional: parsedPositional } = parseArgs(positional);
  const mergedFlags = { ...flags, ...parsedFlags };
  const subcommand = parsedPositional[0];

  if (subcommand === "create") {
    const name = parsedPositional[1];
    if (!name) fatal("Usage: finance tag create <name> [--color <colorName>] [--confirm]");
    const opts: Record<string, unknown> = {};
    if (mergedFlags.color) opts.colorName = mergedFlags.color as string;
    await createTag(name, opts, !!mergedFlags.confirm);
  } else if (subcommand === "edit") {
    const id = parsedPositional[1];
    if (!id) fatal("Usage: finance tag edit <id> --name <new-name> [--confirm]");
    const opts: Record<string, unknown> = {};
    if (mergedFlags.name) opts.name = mergedFlags.name as string;
    await editTag(id, opts, !!mergedFlags.confirm);
  } else if (subcommand === "delete") {
    const id = parsedPositional[1];
    if (!id) fatal("Usage: finance tag delete <id> [--confirm]");
    await deleteTag(id, !!mergedFlags.confirm);
  } else {
    fatal(`Unknown tag subcommand: ${subcommand}. Use: create, edit, delete`);
  }
}
