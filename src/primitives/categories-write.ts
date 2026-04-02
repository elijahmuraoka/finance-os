/**
 * categories-write.ts — Category CRUD write primitives
 *
 * All write operations are dry-run by default.
 * Pass confirm=true to execute the GraphQL mutation.
 */
import { getClient, CopilotError } from '../client';
import {
  CREATE_CATEGORY_MUTATION,
  EDIT_CATEGORY_MUTATION,
  DELETE_CATEGORY_MUTATION,
} from '../queries';

function dryRun(message: string): void {
  process.stdout.write(`[dry-run] ${message}\n`);
  process.stdout.write('  (Pass --confirm to execute this mutation)\n');
}

export interface CreateCategoryOpts {
  colorName?: string;
  isExcluded?: boolean;
}

export interface EditCategoryOpts {
  name?: string;
  colorName?: string;
  isExcluded?: boolean;
}

interface CategoryResult {
  id: string;
  name: string;
  colorName: string | null;
  isExcluded: boolean;
}

interface CreateCategoryData {
  createCategory: CategoryResult;
}

interface EditCategoryData {
  editCategory: {
    category: CategoryResult;
  };
}

interface DeleteCategoryData {
  deleteCategory: boolean | null;
}

export async function createCategory(
  name: string,
  opts: CreateCategoryOpts = {},
  confirm = false
): Promise<CategoryResult | null> {
  if (!confirm) {
    const extras = [
      opts.colorName ? `color=${opts.colorName}` : null,
      opts.isExcluded ? 'excluded=true' : null,
    ].filter(Boolean).join(', ');
    dryRun(`Would create category "${name}"${extras ? ` (${extras})` : ''}`);
    return null;
  }

  try {
    const input: Record<string, unknown> = { name };
    if (opts.colorName) input['colorName'] = opts.colorName;
    if (opts.isExcluded !== undefined) input['isExcluded'] = opts.isExcluded;

    const data = await getClient().graphql<CreateCategoryData>(
      'CreateCategory',
      CREATE_CATEGORY_MUTATION,
      { input }
    );

    const created = data?.createCategory;
    if (!created) {
      throw new CopilotError('CreateCategory returned no data');
    }

    process.stdout.write(`✓ Created category "${created.name}" (${created.id})\n`);
    return created;
  } catch (err) {
    throw new CopilotError(`Failed to create category: ${(err as Error).message}`);
  }
}

export async function editCategory(
  id: string,
  opts: EditCategoryOpts = {},
  confirm = false
): Promise<CategoryResult | null> {
  if (!confirm) {
    const changes = [
      opts.name ? `name="${opts.name}"` : null,
      opts.colorName ? `color=${opts.colorName}` : null,
      opts.isExcluded !== undefined ? `excluded=${opts.isExcluded}` : null,
    ].filter(Boolean).join(', ');
    dryRun(`Would edit category ${id}: ${changes || 'no changes'}`);
    return null;
  }

  try {
    const input: Record<string, unknown> = {};
    if (opts.name) input['name'] = opts.name;
    if (opts.colorName) input['colorName'] = opts.colorName;
    if (opts.isExcluded !== undefined) input['isExcluded'] = opts.isExcluded;

    const data = await getClient().graphql<EditCategoryData>(
      'EditCategory',
      EDIT_CATEGORY_MUTATION,
      { id, input }
    );

    const updated = data?.editCategory?.category;
    if (!updated) {
      throw new CopilotError('EditCategory returned no data');
    }

    process.stdout.write(`✓ Updated category "${updated.name}" (${updated.id})\n`);
    return updated;
  } catch (err) {
    throw new CopilotError(`Failed to edit category: ${(err as Error).message}`);
  }
}

export async function deleteCategory(
  id: string,
  confirm = false
): Promise<void> {
  if (!confirm) {
    dryRun(`Would delete category ${id}`);
    return;
  }

  try {
    await getClient().graphql<DeleteCategoryData>(
      'DeleteCategory',
      DELETE_CATEGORY_MUTATION,
      { id }
    );

    process.stdout.write(`✓ Deleted category ${id}\n`);
  } catch (err) {
    throw new CopilotError(`Failed to delete category: ${(err as Error).message}`);
  }
}
