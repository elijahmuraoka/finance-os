/**
 * tags.ts — Tag read/write primitives
 *
 * Write operations are dry-run by default.
 * Pass confirm=true to execute the GraphQL mutation.
 */
import { CopilotError, getClient } from "../client";
import { warn } from "../logger";
import {
  CREATE_TAG_MUTATION,
  DELETE_TAG_MUTATION,
  EDIT_TAG_MUTATION,
  TAGS_QUERY,
} from "../queries";

function dryRun(message: string): void {
  process.stdout.write(`[dry-run] ${message}\n`);
  process.stdout.write("  (Pass --confirm to execute this mutation)\n");
}

export interface Tag {
  id: string;
  name: string;
  colorName: string | null;
}

export interface CreateTagOpts {
  colorName?: string;
}

export interface EditTagOpts {
  name?: string;
  colorName?: string;
}

interface TagsData {
  tags: Array<{
    id: string;
    name: string;
    colorName: string | null;
  }>;
}

interface CreateTagData {
  createTag: {
    id: string;
    name: string;
    colorName: string | null;
  };
}

interface EditTagData {
  editTag: {
    id: string;
    name: string;
    colorName: string | null;
  };
}

interface DeleteTagData {
  deleteTag: boolean | null;
}

export async function getTags(): Promise<Tag[]> {
  try {
    const data = await getClient().graphql<TagsData>("Tags", TAGS_QUERY, {});

    return (data?.tags ?? []).map((t) => ({
      id: t.id ?? "",
      name: t.name ?? "",
      colorName: t.colorName ?? null,
    }));
  } catch (err) {
    warn("tags", (err as Error).message);
    return [];
  }
}

export async function createTag(
  name: string,
  opts: CreateTagOpts = {},
  confirm = false,
): Promise<Tag | null> {
  if (!confirm) {
    const extras = opts.colorName ? ` (color=${opts.colorName})` : "";
    dryRun(`Would create tag "${name}"${extras}`);
    return null;
  }

  try {
    const input: Record<string, unknown> = { name };
    if (opts.colorName) input.colorName = opts.colorName;

    const data = await getClient().graphql<CreateTagData>("CreateTag", CREATE_TAG_MUTATION, {
      input,
    });

    const created = data?.createTag;
    if (!created) {
      throw new CopilotError("CreateTag returned no data");
    }

    process.stdout.write(`✓ Created tag "${created.name}" (${created.id})\n`);
    return {
      id: created.id,
      name: created.name,
      colorName: created.colorName ?? null,
    };
  } catch (err) {
    throw new CopilotError(`Failed to create tag: ${(err as Error).message}`);
  }
}

export async function editTag(
  id: string,
  opts: EditTagOpts = {},
  confirm = false,
): Promise<Tag | null> {
  if (!confirm) {
    const changes = [
      opts.name ? `name="${opts.name}"` : null,
      opts.colorName ? `color=${opts.colorName}` : null,
    ]
      .filter(Boolean)
      .join(", ");
    dryRun(`Would edit tag ${id}: ${changes || "no changes"}`);
    return null;
  }

  try {
    const input: Record<string, unknown> = {};
    if (opts.name) input.name = opts.name;
    if (opts.colorName) input.colorName = opts.colorName;

    const data = await getClient().graphql<EditTagData>("EditTag", EDIT_TAG_MUTATION, {
      id,
      input,
    });

    const updated = data?.editTag;
    if (!updated) {
      throw new CopilotError("EditTag returned no data");
    }

    process.stdout.write(`✓ Updated tag "${updated.name}" (${updated.id})\n`);
    return {
      id: updated.id,
      name: updated.name,
      colorName: updated.colorName ?? null,
    };
  } catch (err) {
    throw new CopilotError(`Failed to edit tag: ${(err as Error).message}`);
  }
}

export async function deleteTag(id: string, confirm = false): Promise<void> {
  if (!confirm) {
    dryRun(`Would delete tag ${id}`);
    return;
  }

  try {
    await getClient().graphql<DeleteTagData>("DeleteTag", DELETE_TAG_MUTATION, { id });

    process.stdout.write(`✓ Deleted tag ${id}\n`);
  } catch (err) {
    throw new CopilotError(`Failed to delete tag: ${(err as Error).message}`);
  }
}

export function formatTagsTable(tags: Tag[]): string {
  if (tags.length === 0) return "No tags found.";

  const lines: string[] = [`Tags (${tags.length}):`, ""];
  for (const t of tags) {
    const color = t.colorName ? ` [${t.colorName}]` : "";
    lines.push(`  ${t.name}${color} (${t.id})`);
  }
  return lines.join("\n");
}
