"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Modal } from "@/components/ui/modal";
import { createCategory, updateCategory, deleteCategory } from "@/actions/categories";
import type { Category } from "@/types/database";

interface CategoryWithCount extends Category {
  item_count: number;
}

// Tree node: category + its resolved children
interface CategoryNode extends CategoryWithCount {
  children: CategoryNode[];
}

function buildTree(categories: CategoryWithCount[]): CategoryNode[] {
  const map = new Map<string, CategoryNode>();
  categories.forEach((c) => map.set(c.id, { ...c, children: [] }));

  const roots: CategoryNode[] = [];
  map.forEach((node) => {
    if (node.parent_category_id && map.has(node.parent_category_id)) {
      map.get(node.parent_category_id)!.children.push(node);
    } else {
      roots.push(node);
    }
  });

  const sortNodes = (nodes: CategoryNode[]) => {
    nodes.sort((a, b) => a.name.localeCompare(b.name));
    nodes.forEach((n) => sortNodes(n.children));
  };
  sortNodes(roots);
  return roots;
}

// Flatten tree for the parent selector, with indentation labels
function flattenForSelect(
  nodes: CategoryNode[],
  depth = 0,
  excludeId?: string,
): { id: string; label: string }[] {
  return nodes.flatMap((node) => {
    if (node.id === excludeId) return [];
    const prefix = depth > 0 ? "  ".repeat(depth) + "↳ " : "";
    return [
      { id: node.id, label: prefix + node.name },
      ...flattenForSelect(node.children, depth + 1, excludeId),
    ];
  });
}

const PRESET_COLORS = [
  "#ef4444", "#f97316", "#eab308", "#22c55e",
  "#06b6d4", "#3b82f6", "#8b5cf6", "#ec4899",
];

interface CategoryFormProps {
  initial?: CategoryWithCount;
  allCategories: CategoryNode[];
  onSubmit: (formData: FormData) => Promise<void>;
  onCancel: () => void;
  pending: boolean;
}

function CategoryForm({ initial, allCategories, onSubmit, onCancel, pending }: CategoryFormProps) {
  const [color, setColor] = useState(initial?.color ?? "");
  const parentOptions = flattenForSelect(allCategories, 0, initial?.id);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    fd.set("color", color);
    await onSubmit(fd);
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">
          Name <span className="text-red-500">*</span>
        </label>
        <input
          name="name"
          required
          defaultValue={initial?.name}
          placeholder="e.g. Appliances"
          className="mt-1.5 block w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 placeholder-zinc-400 focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-50"
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">
            Parent category
          </label>
          <select
            name="parent_category_id"
            defaultValue={initial?.parent_category_id ?? ""}
            className="mt-1.5 block w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-50"
          >
            <option value="">None (top-level)</option>
            {parentOptions.map((opt) => (
              <option key={opt.id} value={opt.id}>{opt.label}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">
            Icon (emoji)
          </label>
          <input
            name="icon"
            defaultValue={initial?.icon ?? ""}
            placeholder="e.g. 📦"
            className="mt-1.5 block w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 placeholder-zinc-400 focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-50"
          />
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">Color</label>
        <div className="mt-1.5 flex items-center gap-2">
          <div className="flex gap-1.5">
            {PRESET_COLORS.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setColor(c)}
                style={{ backgroundColor: c }}
                className={`h-5 w-5 rounded-full transition-transform ${color === c ? "scale-125 ring-2 ring-offset-1 ring-zinc-400" : ""}`}
              />
            ))}
          </div>
          {color && (
            <button
              type="button"
              onClick={() => setColor("")}
              className="text-xs text-zinc-400 hover:text-zinc-600"
            >
              Clear
            </button>
          )}
        </div>
      </div>

      <div className="flex justify-end gap-2 pt-2">
        <button
          type="button"
          onClick={onCancel}
          className="rounded-lg border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 disabled:opacity-50 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200"
        >
          {pending ? "Saving..." : initial ? "Save changes" : "Add category"}
        </button>
      </div>
    </form>
  );
}

interface CategoryRowProps {
  node: CategoryNode;
  depth: number;
  onEdit: (c: CategoryWithCount) => void;
  onDelete: (c: CategoryWithCount) => void;
}

function CategoryRow({ node, depth, onEdit, onDelete }: CategoryRowProps) {
  return (
    <>
      <div
        className="flex items-center justify-between rounded-lg border border-zinc-200 bg-white px-4 py-3 dark:border-zinc-800 dark:bg-zinc-900"
        style={{ marginLeft: depth * 24 }}
      >
        <div className="flex items-center gap-3">
          {node.color && (
            <span
              className="h-2.5 w-2.5 shrink-0 rounded-full"
              style={{ backgroundColor: node.color }}
            />
          )}
          <span className="text-base leading-none">{node.icon || "📁"}</span>
          <div>
            <p className="text-sm font-medium text-zinc-900 dark:text-zinc-50">{node.name}</p>
            <p className="text-xs text-zinc-400">
              {[
                node.children.length > 0 && `${node.children.length} sub-categor${node.children.length !== 1 ? "ies" : "y"}`,
                `${node.item_count} item${node.item_count !== 1 ? "s" : ""}`,
              ]
                .filter(Boolean)
                .join(" · ")}
            </p>
          </div>
        </div>
        <div className="flex gap-1">
          <button
            onClick={() => onEdit(node)}
            className="rounded p-1.5 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600 dark:hover:bg-zinc-800 dark:hover:text-zinc-300"
            title="Edit"
          >
            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536M9 13l6.586-6.586a2 2 0 112.828 2.828L11.828 15.828a2 2 0 01-1.414.586H9v-2a2 2 0 01.586-1.414z" />
            </svg>
          </button>
          <button
            onClick={() => onDelete(node)}
            className="rounded p-1.5 text-zinc-400 hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-950"
            title="Delete"
          >
            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6M9 7h6m2 0a1 1 0 00-1-1h-4a1 1 0 00-1 1m-4 0h10" />
            </svg>
          </button>
        </div>
      </div>
      {node.children.map((child) => (
        <CategoryRow key={child.id} node={child} depth={depth + 1} onEdit={onEdit} onDelete={onDelete} />
      ))}
    </>
  );
}

interface CategoriesClientProps {
  categories: CategoryWithCount[];
}

export function CategoriesClient({ categories }: CategoriesClientProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [showAdd, setShowAdd] = useState(false);
  const [editing, setEditing] = useState<CategoryWithCount | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<CategoryWithCount | null>(null);
  const [error, setError] = useState<string | null>(null);

  const tree = buildTree(categories);

  function refresh() { router.refresh(); }

  async function handleCreate(formData: FormData) {
    setError(null);
    startTransition(async () => {
      try {
        await createCategory(formData);
        setShowAdd(false);
        refresh();
      } catch (e) {
        setError((e as Error).message);
      }
    });
  }

  async function handleUpdate(formData: FormData) {
    if (!editing) return;
    setError(null);
    startTransition(async () => {
      try {
        await updateCategory(editing.id, formData);
        setEditing(null);
        refresh();
      } catch (e) {
        setError((e as Error).message);
      }
    });
  }

  async function handleDelete(category: CategoryWithCount) {
    setError(null);
    startTransition(async () => {
      try {
        await deleteCategory(category.id);
        setConfirmDelete(null);
        refresh();
      } catch (e) {
        setError((e as Error).message);
      }
    });
  }

  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-50">Categories</h1>
          <p className="mt-0.5 text-sm text-zinc-500">{categories.length} categor{categories.length !== 1 ? "ies" : "y"}</p>
        </div>
        <button
          onClick={() => setShowAdd(true)}
          className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200"
        >
          Add category
        </button>
      </div>

      {error && (
        <div className="mt-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-600 dark:bg-red-950 dark:text-red-400">
          {error}
        </div>
      )}

      {tree.length === 0 ? (
        <div className="mt-12 text-center text-sm text-zinc-400">
          No categories yet — add your first category to get started.
        </div>
      ) : (
        <div className="mt-6 space-y-2">
          {tree.map((node) => (
            <CategoryRow
              key={node.id}
              node={node}
              depth={0}
              onEdit={setEditing}
              onDelete={setConfirmDelete}
            />
          ))}
        </div>
      )}

      {/* Add modal */}
      <Modal title="Add category" open={showAdd} onClose={() => setShowAdd(false)}>
        <CategoryForm
          allCategories={tree}
          onSubmit={handleCreate}
          onCancel={() => setShowAdd(false)}
          pending={isPending}
        />
      </Modal>

      {/* Edit modal */}
      <Modal title="Edit category" open={!!editing} onClose={() => setEditing(null)}>
        {editing && (
          <CategoryForm
            initial={editing}
            allCategories={tree}
            onSubmit={handleUpdate}
            onCancel={() => setEditing(null)}
            pending={isPending}
          />
        )}
      </Modal>

      {/* Delete confirmation */}
      <Modal title="Delete category" open={!!confirmDelete} onClose={() => setConfirmDelete(null)}>
        {confirmDelete && (
          <div className="space-y-4">
            <p className="text-sm text-zinc-600 dark:text-zinc-400">
              Delete <strong className="text-zinc-900 dark:text-zinc-50">{confirmDelete.name}</strong>?
            </p>
            {confirmDelete.item_count > 0 && (
              <p className="text-sm text-amber-600 dark:text-amber-400">
                {confirmDelete.item_count} item{confirmDelete.item_count !== 1 ? "s" : ""} will have their category cleared.
              </p>
            )}
            {categories.some((c) => c.parent_category_id === confirmDelete.id) && (
              <p className="text-sm text-amber-600 dark:text-amber-400">
                Sub-categories will become top-level categories.
              </p>
            )}
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setConfirmDelete(null)}
                className="rounded-lg border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
              >
                Cancel
              </button>
              <button
                onClick={() => handleDelete(confirmDelete)}
                disabled={isPending}
                className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-500 disabled:opacity-50"
              >
                {isPending ? "Deleting..." : "Delete"}
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
