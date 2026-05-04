"use client";

import { useState, useTransition, useMemo } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Modal } from "@/components/ui/modal";
import { createItem } from "@/actions/items";
import { upsertTag } from "@/actions/tags";
import type { Room, Category, Tag, Item } from "@/types/database";

interface ItemSummary extends Item {
  room_name: string | null;
  category_name: string | null;
  category_color: string | null;
  tags: { id: string; name: string; color: string | null }[];
  primary_image_path: string | null;
  primary_image_url: string | null;
}

interface ItemsClientProps {
  items: ItemSummary[];
  rooms: Room[];
  categories: Category[];
  tags: Tag[];
}

function warrantyStatus(date: string | null): "expired" | "soon" | "ok" | null {
  if (!date) return null;
  const days = Math.ceil((new Date(date).getTime() - Date.now()) / 86400000);
  if (days < 0) return "expired";
  if (days <= 30) return "soon";
  return "ok";
}

interface ItemFormProps {
  rooms: Room[];
  categories: Category[];
  tags: Tag[];
  onSuccess: (id: string) => void;
  onCancel: () => void;
}

function ItemForm({ rooms, categories, tags: initialTags, onSuccess, onCancel }: ItemFormProps) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>([]);
  const [newTagName, setNewTagName] = useState("");
  const [localTags, setLocalTags] = useState(initialTags);

  function toggleTag(id: string) {
    setSelectedTagIds((prev) =>
      prev.includes(id) ? prev.filter((t) => t !== id) : [...prev, id],
    );
  }

  async function handleAddTag() {
    if (!newTagName.trim()) return;
    startTransition(async () => {
      try {
        const tag = await upsertTag(newTagName.trim());
        setLocalTags((prev) => (prev.find((t) => t.id === tag.id) ? prev : [...prev, tag]));
        setSelectedTagIds((prev) => (prev.includes(tag.id) ? prev : [...prev, tag.id]));
        setNewTagName("");
      } catch (e) {
        setError((e as Error).message);
      }
    });
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const fd = new FormData(e.currentTarget);
    selectedTagIds.forEach((id) => fd.append("tag_ids", id));

    startTransition(async () => {
      try {
        const id = await createItem(fd);
        onSuccess(id);
      } catch (e) {
        setError((e as Error).message);
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5 max-h-[70vh] overflow-y-auto pr-1">
      {/* Basic info */}
      <fieldset className="space-y-3">
        <legend className="text-xs font-semibold uppercase tracking-wider text-zinc-400">Basic info</legend>
        <div>
          <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">
            Name <span className="text-red-500">*</span>
          </label>
          <input
            name="name"
            required
            placeholder="e.g. LG Dishwasher"
            className="mt-1.5 block w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 placeholder-zinc-400 focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-50"
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">Brand</label>
            <input
              name="brand"
              placeholder="e.g. LG"
              className="mt-1.5 block w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 placeholder-zinc-400 focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-50"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">Model</label>
            <input
              name="model"
              placeholder="e.g. LDFN4542D"
              className="mt-1.5 block w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 placeholder-zinc-400 focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-50"
            />
          </div>
        </div>
        <div>
          <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">Serial number</label>
          <input
            name="serial_number"
            className="mt-1.5 block w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 placeholder-zinc-400 focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-50"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">Description</label>
          <textarea
            name="description"
            rows={2}
            className="mt-1.5 block w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 placeholder-zinc-400 focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-50"
          />
        </div>
      </fieldset>

      {/* Location */}
      <fieldset className="space-y-3">
        <legend className="text-xs font-semibold uppercase tracking-wider text-zinc-400">Location</legend>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">Room</label>
            <select
              name="room_id"
              className="mt-1.5 block w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-50"
            >
              <option value="">None</option>
              {rooms.map((r) => <option key={r.id} value={r.id}>{r.icon ? `${r.icon} ` : ""}{r.name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">Category</label>
            <select
              name="category_id"
              className="mt-1.5 block w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-50"
            >
              <option value="">None</option>
              {categories.map((c) => <option key={c.id} value={c.id}>{c.icon ? `${c.icon} ` : ""}{c.name}</option>)}
            </select>
          </div>
        </div>
      </fieldset>

      {/* Purchase */}
      <fieldset className="space-y-3">
        <legend className="text-xs font-semibold uppercase tracking-wider text-zinc-400">Purchase</legend>
        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">Date</label>
            <input
              type="date"
              name="purchase_date"
              className="mt-1.5 block w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-50"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">Price ($)</label>
            <input
              type="number"
              name="purchase_price"
              min="0"
              step="0.01"
              className="mt-1.5 block w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-50"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">Warranty ends</label>
            <input
              type="date"
              name="warranty_expires_at"
              className="mt-1.5 block w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-50"
            />
          </div>
        </div>
      </fieldset>

      {/* Tags */}
      <fieldset className="space-y-3">
        <legend className="text-xs font-semibold uppercase tracking-wider text-zinc-400">Tags</legend>
        {localTags.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {localTags.map((tag) => (
              <button
                key={tag.id}
                type="button"
                onClick={() => toggleTag(tag.id)}
                className={`rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors ${
                  selectedTagIds.includes(tag.id)
                    ? "border-transparent text-white"
                    : "border-zinc-200 bg-zinc-50 text-zinc-600 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-400"
                }`}
                style={selectedTagIds.includes(tag.id) ? { backgroundColor: tag.color ?? "#3f3f46" } : {}}
              >
                {tag.name}
              </button>
            ))}
          </div>
        )}
        <div className="flex gap-2">
          <input
            value={newTagName}
            onChange={(e) => setNewTagName(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); handleAddTag(); } }}
            placeholder="New tag name"
            className="block flex-1 rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-sm text-zinc-900 placeholder-zinc-400 focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-50"
          />
          <button
            type="button"
            onClick={handleAddTag}
            disabled={!newTagName.trim() || isPending}
            className="rounded-lg border border-zinc-300 px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-40 dark:border-zinc-700 dark:text-zinc-300"
          >
            Add
          </button>
        </div>
      </fieldset>

      {/* Notes */}
      <fieldset>
        <legend className="text-xs font-semibold uppercase tracking-wider text-zinc-400">Notes</legend>
        <textarea
          name="notes"
          rows={3}
          className="mt-2 block w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 placeholder-zinc-400 focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-50"
        />
      </fieldset>

      {error && (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600 dark:bg-red-950 dark:text-red-400">{error}</p>
      )}

      <div className="flex justify-end gap-2 pt-2 sticky bottom-0 bg-white dark:bg-zinc-900 pb-1">
        <button
          type="button"
          onClick={onCancel}
          className="rounded-lg border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={isPending}
          className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 disabled:opacity-50 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200"
        >
          {isPending ? "Adding..." : "Add item"}
        </button>
      </div>
    </form>
  );
}

export function ItemsClient({ items, rooms, categories, tags }: ItemsClientProps) {
  const router = useRouter();
  const [showAdd, setShowAdd] = useState(false);
  const [search, setSearch] = useState("");
  const [roomFilter, setRoomFilter] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return items.filter((item) => {
      if (roomFilter && item.room_id !== roomFilter) return false;
      if (categoryFilter && item.category_id !== categoryFilter) return false;
      if (q && !item.name.toLowerCase().includes(q) && !item.brand?.toLowerCase().includes(q) && !item.model?.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [items, search, roomFilter, categoryFilter]);

  function handleCreated(id: string) {
    setShowAdd(false);
    router.push(`/items/${id}`);
  }

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-50">Items</h1>
          <p className="mt-0.5 text-sm text-zinc-500">{items.length} item{items.length !== 1 ? "s" : ""}</p>
        </div>
        <button
          onClick={() => setShowAdd(true)}
          className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200"
        >
          Add item
        </button>
      </div>

      {/* Filters */}
      <div className="mt-4 flex flex-wrap gap-2">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search items..."
          className="w-48 rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-sm text-zinc-900 placeholder-zinc-400 focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-50"
        />
        <select
          value={roomFilter}
          onChange={(e) => setRoomFilter(e.target.value)}
          className="rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-sm text-zinc-900 focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-50"
        >
          <option value="">All rooms</option>
          {rooms.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
        </select>
        <select
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value)}
          className="rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-sm text-zinc-900 focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-50"
        >
          <option value="">All categories</option>
          {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        {(search || roomFilter || categoryFilter) && (
          <button
            onClick={() => { setSearch(""); setRoomFilter(""); setCategoryFilter(""); }}
            className="rounded-lg border border-zinc-300 px-3 py-1.5 text-sm text-zinc-500 hover:bg-zinc-50 dark:border-zinc-700 dark:hover:bg-zinc-800"
          >
            Clear
          </button>
        )}
      </div>

      {/* Grid */}
      {filtered.length === 0 ? (
        <div className="mt-12 text-center text-sm text-zinc-400">
          {items.length === 0 ? "No items yet — add your first item to get started." : "No items match your filters."}
        </div>
      ) : (
        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {filtered.map((item) => {
            const ws = warrantyStatus(item.warranty_expires_at);
            return (
              <Link
                key={item.id}
                href={`/items/${item.id}`}
                className="group flex flex-col rounded-xl border border-zinc-200 bg-white overflow-hidden hover:border-zinc-300 hover:shadow-sm transition-all dark:border-zinc-800 dark:bg-zinc-900"
              >
                {/* Image */}
                <div className="aspect-video bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center overflow-hidden">
                  {item.primary_image_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={item.primary_image_url}
                      alt={item.name}
                      className="h-full w-full object-cover group-hover:scale-105 transition-transform duration-200"
                    />
                  ) : (
                    <span className="text-3xl">{item.category_color ? "📦" : "📦"}</span>
                  )}
                </div>

                {/* Content */}
                <div className="flex flex-col flex-1 p-3">
                  <p className="text-sm font-medium text-zinc-900 dark:text-zinc-50 line-clamp-1">{item.name}</p>
                  {(item.brand || item.model) && (
                    <p className="mt-0.5 text-xs text-zinc-400 line-clamp-1">
                      {[item.brand, item.model].filter(Boolean).join(" · ")}
                    </p>
                  )}

                  <div className="mt-2 flex flex-wrap gap-1">
                    {item.room_name && (
                      <span className="rounded-md bg-zinc-100 px-1.5 py-0.5 text-xs text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400">
                        {item.room_name}
                      </span>
                    )}
                    {item.category_name && (
                      <span
                        className="rounded-md px-1.5 py-0.5 text-xs text-white"
                        style={{ backgroundColor: item.category_color ?? "#71717a" }}
                      >
                        {item.category_name}
                      </span>
                    )}
                    {ws === "expired" && (
                      <span className="rounded-md bg-red-100 px-1.5 py-0.5 text-xs text-red-600 dark:bg-red-950 dark:text-red-400">
                        Warranty expired
                      </span>
                    )}
                    {ws === "soon" && (
                      <span className="rounded-md bg-amber-100 px-1.5 py-0.5 text-xs text-amber-700 dark:bg-amber-950 dark:text-amber-400">
                        Warranty ending
                      </span>
                    )}
                  </div>

                  {item.tags.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1">
                      {item.tags.map((tag) => (
                        <span
                          key={tag.id}
                          className="rounded-full px-2 py-0.5 text-xs text-white"
                          style={{ backgroundColor: tag.color ?? "#3f3f46" }}
                        >
                          {tag.name}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </Link>
            );
          })}
        </div>
      )}

      <Modal title="Add item" open={showAdd} onClose={() => setShowAdd(false)}>
        <ItemForm
          rooms={rooms}
          categories={categories}
          tags={tags}
          onSuccess={handleCreated}
          onCancel={() => setShowAdd(false)}
        />
      </Modal>
    </div>
  );
}
