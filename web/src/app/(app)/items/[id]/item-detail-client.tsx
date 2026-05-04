"use client";

import { useState, useTransition, useRef } from "react";
import { useRouter } from "next/navigation";
import { Modal } from "@/components/ui/modal";
import { updateItem, deleteItem, recordAttachment, deleteAttachment, setPrimaryImage } from "@/actions/items";
import { upsertTag } from "@/actions/tags";
import { createSchedule, updateSchedule, deleteSchedule, toggleScheduleActive } from "@/actions/maintenance";
import { createClient } from "@/lib/supabase/client";
import type { Item, Room, Category, Tag, ItemAttachment, MaintenanceSchedule, RecurrenceType } from "@/types/database";

interface AttachmentWithUrl extends ItemAttachment {
  url: string;
}

interface ItemDetailProps {
  item: Item;
  rooms: Room[];
  categories: Category[];
  allTags: Tag[];
  itemTags: Tag[];
  attachments: AttachmentWithUrl[];
  householdId: string;
  schedules: MaintenanceSchedule[];
}

function formatDate(d: string | null) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}

function formatCurrency(n: number | null) {
  if (n === null) return "—";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n);
}

function WarrantyBadge({ date }: { date: string | null }) {
  if (!date) return null;
  const days = Math.ceil((new Date(date).getTime() - Date.now()) / 86400000);
  if (days < 0) return <span className="rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-medium text-red-700 dark:bg-red-950 dark:text-red-400">Expired {formatDate(date)}</span>;
  if (days <= 30) return <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-medium text-amber-700 dark:bg-amber-950 dark:text-amber-400">Expires {formatDate(date)}</span>;
  return <span className="rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-medium text-green-700 dark:bg-green-950 dark:text-green-400">Valid until {formatDate(date)}</span>;
}

interface EditFormProps {
  item: Item;
  rooms: Room[];
  categories: Category[];
  allTags: Tag[];
  itemTags: Tag[];
  onCancel: () => void;
  onSaved: () => void;
}

function EditForm({ item, rooms, categories, allTags: initialAllTags, itemTags, onCancel, onSaved }: EditFormProps) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>(itemTags.map((t) => t.id));
  const [newTagName, setNewTagName] = useState("");
  const [localTags, setLocalTags] = useState(initialAllTags);

  function toggleTag(id: string) {
    setSelectedTagIds((prev) => prev.includes(id) ? prev.filter((t) => t !== id) : [...prev, id]);
  }

  async function handleAddTag() {
    if (!newTagName.trim()) return;
    startTransition(async () => {
      try {
        const tag = await upsertTag(newTagName.trim());
        setLocalTags((prev) => (prev.find((t) => t.id === tag.id) ? prev : [...prev, tag]));
        setSelectedTagIds((prev) => (prev.includes(tag.id) ? prev : [...prev, tag.id]));
        setNewTagName("");
      } catch (e) { setError((e as Error).message); }
    });
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const fd = new FormData(e.currentTarget);
    selectedTagIds.forEach((id) => fd.append("tag_ids", id));
    startTransition(async () => {
      try {
        await updateItem(item.id, fd);
        onSaved();
      } catch (e) { setError((e as Error).message); }
    });
  }

  const inputCls = "mt-1.5 block w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 placeholder-zinc-400 focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-50";
  const selectCls = "mt-1.5 block w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-50";
  const labelCls = "block text-sm font-medium text-zinc-700 dark:text-zinc-300";

  return (
    <form onSubmit={handleSubmit} className="space-y-5 max-h-[70vh] overflow-y-auto pr-1">
      <fieldset className="space-y-3">
        <legend className="text-xs font-semibold uppercase tracking-wider text-zinc-400">Basic info</legend>
        <div>
          <label className={labelCls}>Name <span className="text-red-500">*</span></label>
          <input name="name" required defaultValue={item.name} className={inputCls} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div><label className={labelCls}>Brand</label><input name="brand" defaultValue={item.brand ?? ""} className={inputCls} /></div>
          <div><label className={labelCls}>Model</label><input name="model" defaultValue={item.model ?? ""} className={inputCls} /></div>
        </div>
        <div><label className={labelCls}>Serial number</label><input name="serial_number" defaultValue={item.serial_number ?? ""} className={inputCls} /></div>
        <div><label className={labelCls}>Description</label><textarea name="description" rows={2} defaultValue={item.description ?? ""} className={inputCls} /></div>
      </fieldset>

      <fieldset className="space-y-3">
        <legend className="text-xs font-semibold uppercase tracking-wider text-zinc-400">Location</legend>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelCls}>Room</label>
            <select name="room_id" defaultValue={item.room_id ?? ""} className={selectCls}>
              <option value="">None</option>
              {rooms.map((r) => <option key={r.id} value={r.id}>{r.icon ? `${r.icon} ` : ""}{r.name}</option>)}
            </select>
          </div>
          <div>
            <label className={labelCls}>Category</label>
            <select name="category_id" defaultValue={item.category_id ?? ""} className={selectCls}>
              <option value="">None</option>
              {categories.map((c) => <option key={c.id} value={c.id}>{c.icon ? `${c.icon} ` : ""}{c.name}</option>)}
            </select>
          </div>
        </div>
      </fieldset>

      <fieldset className="space-y-3">
        <legend className="text-xs font-semibold uppercase tracking-wider text-zinc-400">Purchase</legend>
        <div className="grid grid-cols-3 gap-3">
          <div><label className={labelCls}>Date</label><input type="date" name="purchase_date" defaultValue={item.purchase_date ?? ""} className={inputCls} /></div>
          <div><label className={labelCls}>Price ($)</label><input type="number" name="purchase_price" min="0" step="0.01" defaultValue={item.purchase_price ?? ""} className={inputCls} /></div>
          <div><label className={labelCls}>Warranty ends</label><input type="date" name="warranty_expires_at" defaultValue={item.warranty_expires_at ?? ""} className={inputCls} /></div>
        </div>
      </fieldset>

      <fieldset className="space-y-3">
        <legend className="text-xs font-semibold uppercase tracking-wider text-zinc-400">Tags</legend>
        {localTags.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {localTags.map((tag) => (
              <button key={tag.id} type="button" onClick={() => toggleTag(tag.id)}
                className={`rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors ${selectedTagIds.includes(tag.id) ? "border-transparent text-white" : "border-zinc-200 bg-zinc-50 text-zinc-600 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-400"}`}
                style={selectedTagIds.includes(tag.id) ? { backgroundColor: tag.color ?? "#3f3f46" } : {}}
              >
                {tag.name}
              </button>
            ))}
          </div>
        )}
        <div className="flex gap-2">
          <input value={newTagName} onChange={(e) => setNewTagName(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); handleAddTag(); } }}
            placeholder="New tag name"
            className="block flex-1 rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-sm text-zinc-900 placeholder-zinc-400 focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-50"
          />
          <button type="button" onClick={handleAddTag} disabled={!newTagName.trim() || isPending}
            className="rounded-lg border border-zinc-300 px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-40 dark:border-zinc-700 dark:text-zinc-300">Add</button>
        </div>
      </fieldset>

      <fieldset>
        <legend className="text-xs font-semibold uppercase tracking-wider text-zinc-400">Notes</legend>
        <textarea name="notes" rows={3} defaultValue={item.notes ?? ""} className={`mt-2 ${inputCls}`} />
      </fieldset>

      {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}

      <div className="flex justify-end gap-2 pt-2 sticky bottom-0 bg-white dark:bg-zinc-900 pb-1">
        <button type="button" onClick={onCancel} className="rounded-lg border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800">Cancel</button>
        <button type="submit" disabled={isPending} className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 disabled:opacity-50 dark:bg-zinc-50 dark:text-zinc-900">
          {isPending ? "Saving..." : "Save changes"}
        </button>
      </div>
    </form>
  );
}

const RECURRENCE_LABELS: Record<RecurrenceType, string> = {
  one_time: "One time",
  daily: "Daily",
  weekly: "Weekly",
  monthly: "Monthly",
  yearly: "Yearly",
  custom: "Custom",
};

const RECURRENCE_OPTIONS: { value: RecurrenceType; label: string }[] = [
  { value: "one_time", label: "One time" },
  { value: "daily", label: "Daily" },
  { value: "weekly", label: "Weekly" },
  { value: "monthly", label: "Monthly" },
  { value: "yearly", label: "Yearly" },
  { value: "custom", label: "Custom (every N days)" },
];

interface ScheduleFormProps {
  initial?: MaintenanceSchedule;
  itemId: string;
  onSuccess: () => void;
  onCancel: () => void;
}

function ScheduleForm({ initial, itemId, onSuccess, onCancel }: ScheduleFormProps) {
  const [isPending, startTransition] = useTransition();
  const [recurrenceType, setRecurrenceType] = useState<RecurrenceType>(initial?.recurrence_type ?? "monthly");
  const [error, setError] = useState<string | null>(null);
  const showInterval = recurrenceType !== "one_time";

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const fd = new FormData(e.currentTarget);
    startTransition(async () => {
      try {
        if (initial) {
          await updateSchedule(initial.id, itemId, fd);
        } else {
          await createSchedule(itemId, fd);
        }
        onSuccess();
      } catch (e) {
        setError((e as Error).message);
      }
    });
  }

  const inputCls = "mt-1.5 block w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 placeholder-zinc-400 focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-50";
  const labelCls = "block text-sm font-medium text-zinc-700 dark:text-zinc-300";

  return (
    <form onSubmit={handleSubmit} className="space-y-4 max-h-[65vh] overflow-y-auto pr-1">
      <div>
        <label className={labelCls}>Name <span className="text-red-500">*</span></label>
        <input name="name" required defaultValue={initial?.name} placeholder="e.g. Replace filter" className={inputCls} />
      </div>
      <div>
        <label className={labelCls}>Description</label>
        <textarea name="description" rows={2} defaultValue={initial?.description ?? ""} className={inputCls} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={labelCls}>Recurrence</label>
          <select name="recurrence_type" value={recurrenceType} onChange={(e) => setRecurrenceType(e.target.value as RecurrenceType)} className={inputCls}>
            {RECURRENCE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>
        {showInterval && (
          <div>
            <label className={labelCls}>Interval</label>
            <input type="number" name="recurrence_interval" min="1" defaultValue={initial?.recurrence_interval ?? 1} className={inputCls} />
          </div>
        )}
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={labelCls}>Start date <span className="text-red-500">*</span></label>
          <input type="date" name="start_date" required defaultValue={initial?.start_date ?? new Date().toISOString().split("T")[0]} className={inputCls} />
        </div>
        <div>
          <label className={labelCls}>End date</label>
          <input type="date" name="end_date" defaultValue={initial?.end_date ?? ""} className={inputCls} />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={labelCls}>Est. duration (min)</label>
          <input type="number" name="estimated_duration_minutes" min="1" defaultValue={initial?.estimated_duration_minutes ?? ""} className={inputCls} />
        </div>
        <div>
          <label className={labelCls}>Est. cost ($)</label>
          <input type="number" name="estimated_cost" min="0" step="0.01" defaultValue={initial?.estimated_cost ?? ""} className={inputCls} />
        </div>
      </div>
      {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}
      <div className="flex justify-end gap-2 pt-1">
        <button type="button" onClick={onCancel} className="rounded-lg border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800">Cancel</button>
        <button type="submit" disabled={isPending} className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 disabled:opacity-50 dark:bg-zinc-50 dark:text-zinc-900">
          {isPending ? "Saving..." : initial ? "Save changes" : "Add schedule"}
        </button>
      </div>
    </form>
  );
}

export function ItemDetailClient({ item, rooms, categories, allTags, itemTags, attachments, householdId, schedules: initialSchedules }: ItemDetailProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [showEdit, setShowEdit] = useState(false);
  const [showDelete, setShowDelete] = useState(false);
  const [showAddSchedule, setShowAddSchedule] = useState(false);
  const [editingSchedule, setEditingSchedule] = useState<MaintenanceSchedule | null>(null);
  const [confirmDeleteSchedule, setConfirmDeleteSchedule] = useState<MaintenanceSchedule | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const docInputRef = useRef<HTMLInputElement>(null);

  const supabase = createClient();

  async function handleUpload(file: File, isImage: boolean) {
    setUploadError(null);
    setUploading(true);
    try {
      const ext = file.name.split(".").pop();
      const path = `${householdId}/${item.id}/${crypto.randomUUID()}.${ext}`;
      const bucket = isImage ? "item-images" : "item-documents";
      const { error: storageError } = await supabase.storage.from(bucket).upload(path, file);
      if (storageError) throw new Error(storageError.message);

      const isFirstImage = isImage && attachments.filter((a) => a.mime_type.startsWith("image/")).length === 0;
      await recordAttachment(item.id, path, file.name, file.type, file.size, isFirstImage);
      router.refresh();
    } catch (e) {
      setUploadError((e as Error).message);
    } finally {
      setUploading(false);
    }
  }

  async function handleDeleteAttachment(att: AttachmentWithUrl) {
    startTransition(async () => {
      try {
        await deleteAttachment(att.id, att.storage_path, att.mime_type, item.id);
        router.refresh();
      } catch (e) {
        setUploadError((e as Error).message);
      }
    });
  }

  async function handleSetPrimary(attachmentId: string) {
    startTransition(async () => {
      await setPrimaryImage(item.id, attachmentId);
      router.refresh();
    });
  }

  async function handleDelete() {
    startTransition(async () => {
      await deleteItem(item.id, householdId);
      router.push("/items");
    });
  }

  const room = rooms.find((r) => r.id === item.room_id);
  const category = categories.find((c) => c.id === item.category_id);
  const images = attachments.filter((a) => a.mime_type.startsWith("image/"));
  const docs = attachments.filter((a) => !a.mime_type.startsWith("image/"));
  const primaryImage = attachments.find((a) => a.is_primary_image);

  return (
    <div>
      {/* Back + actions */}
      <div className="flex items-center justify-between">
        <button onClick={() => router.back()} className="flex items-center gap-1.5 text-sm text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-200">
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" /></svg>
          Items
        </button>
        <div className="flex gap-2">
          <button onClick={() => setShowEdit(true)} className="rounded-lg border border-zinc-300 px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800">Edit</button>
          <button onClick={() => setShowDelete(true)} className="rounded-lg border border-red-200 px-3 py-1.5 text-sm font-medium text-red-600 hover:bg-red-50 dark:border-red-900 dark:text-red-400 dark:hover:bg-red-950">Delete</button>
        </div>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        {/* Left: metadata */}
        <div className="lg:col-span-2 space-y-6">
          <div>
            <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">{item.name}</h1>
            {(item.brand || item.model) && (
              <p className="mt-1 text-sm text-zinc-500">{[item.brand, item.model].filter(Boolean).join(" · ")}</p>
            )}
            <div className="mt-2 flex flex-wrap items-center gap-2">
              {room && (
                <span className="rounded-md bg-zinc-100 px-2 py-0.5 text-xs text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400">
                  {room.icon ?? ""} {room.name}
                </span>
              )}
              {category && (
                <span className="rounded-md px-2 py-0.5 text-xs text-white" style={{ backgroundColor: category.color ?? "#71717a" }}>
                  {category.icon ?? ""} {category.name}
                </span>
              )}
              {itemTags.map((tag) => (
                <span key={tag.id} className="rounded-full px-2.5 py-0.5 text-xs text-white" style={{ backgroundColor: tag.color ?? "#3f3f46" }}>
                  {tag.name}
                </span>
              ))}
            </div>
          </div>

          {item.description && (
            <p className="text-sm text-zinc-600 dark:text-zinc-400">{item.description}</p>
          )}

          {/* Details grid */}
          <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 overflow-hidden">
            {[
              ["Serial number", item.serial_number],
              ["Purchase date", formatDate(item.purchase_date)],
              ["Purchase price", formatCurrency(item.purchase_price)],
              ["Warranty", item.warranty_expires_at ? null : "—"],
            ].filter(([, v]) => v !== null).map(([label, value]) => (
              <div key={label as string} className="flex border-b border-zinc-100 last:border-0 dark:border-zinc-800">
                <dt className="w-36 shrink-0 bg-zinc-50 px-4 py-2.5 text-xs font-medium text-zinc-500 dark:bg-zinc-900/50">{label}</dt>
                <dd className="px-4 py-2.5 text-sm text-zinc-900 dark:text-zinc-50">{value as string}</dd>
              </div>
            ))}
            {item.warranty_expires_at && (
              <div className="flex border-b border-zinc-100 last:border-0 dark:border-zinc-800">
                <dt className="w-36 shrink-0 bg-zinc-50 px-4 py-2.5 text-xs font-medium text-zinc-500 dark:bg-zinc-900/50">Warranty</dt>
                <dd className="flex items-center px-4 py-2.5"><WarrantyBadge date={item.warranty_expires_at} /></dd>
              </div>
            )}
          </div>

          {item.notes && (
            <div>
              <h2 className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">Notes</h2>
              <p className="mt-1.5 whitespace-pre-wrap text-sm text-zinc-600 dark:text-zinc-400">{item.notes}</p>
            </div>
          )}
        </div>

        {/* Right: attachments */}
        <div className="space-y-5">
          {/* Primary image hero */}
          <div className="overflow-hidden rounded-xl border border-zinc-200 bg-zinc-100 aspect-video flex items-center justify-center dark:border-zinc-800 dark:bg-zinc-800">
            {primaryImage ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={primaryImage.url} alt={item.name} className="h-full w-full object-cover" />
            ) : (
              <span className="text-5xl">📦</span>
            )}
          </div>

          {/* Upload buttons */}
          <div className="flex gap-2">
            <input ref={imageInputRef} type="file" accept="image/*" className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) handleUpload(f, true); e.target.value = ""; }}
            />
            <input ref={docInputRef} type="file" accept=".pdf,.doc,.docx" className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) handleUpload(f, false); e.target.value = ""; }}
            />
            <button onClick={() => imageInputRef.current?.click()} disabled={uploading}
              className="flex-1 rounded-lg border border-zinc-300 px-3 py-2 text-xs font-medium text-zinc-600 hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-800">
              {uploading ? "Uploading..." : "📷 Add photo"}
            </button>
            <button onClick={() => docInputRef.current?.click()} disabled={uploading}
              className="flex-1 rounded-lg border border-zinc-300 px-3 py-2 text-xs font-medium text-zinc-600 hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-800">
              📄 Add document
            </button>
          </div>

          {uploadError && <p className="text-xs text-red-600">{uploadError}</p>}

          {/* Image thumbnails */}
          {images.length > 0 && (
            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-400">Photos</h3>
              <div className="mt-2 grid grid-cols-3 gap-1.5">
                {images.map((att) => (
                  <div key={att.id} className="group relative aspect-square overflow-hidden rounded-lg bg-zinc-100 dark:bg-zinc-800">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={att.url} alt={att.file_name} className="h-full w-full object-cover" />
                    <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity">
                      {!att.is_primary_image && (
                        <button onClick={() => handleSetPrimary(att.id)} className="rounded bg-white/90 px-1.5 py-0.5 text-xs font-medium text-zinc-800">Set primary</button>
                      )}
                      <button onClick={() => handleDeleteAttachment(att)} disabled={isPending} className="rounded bg-red-600/90 px-1.5 py-0.5 text-xs font-medium text-white">Remove</button>
                    </div>
                    {att.is_primary_image && (
                      <div className="absolute top-1 left-1 rounded bg-zinc-900/70 px-1 py-0.5 text-xs text-white">Primary</div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Document list */}
          {docs.length > 0 && (
            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-400">Documents</h3>
              <ul className="mt-2 space-y-1.5">
                {docs.map((att) => (
                  <li key={att.id} className="flex items-center justify-between rounded-lg border border-zinc-200 px-3 py-2 dark:border-zinc-800">
                    <a href={att.url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-xs text-zinc-700 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-200 truncate">
                      <span>📄</span>
                      <span className="truncate">{att.file_name}</span>
                    </a>
                    <button onClick={() => handleDeleteAttachment(att)} disabled={isPending} className="ml-2 shrink-0 text-zinc-400 hover:text-red-500">
                      <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>

      {/* Maintenance schedules */}
      <div className="mt-8">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-50">Maintenance schedules</h2>
          <button
            onClick={() => setShowAddSchedule(true)}
            className="rounded-lg border border-zinc-300 px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
          >
            Add schedule
          </button>
        </div>
        {initialSchedules.length === 0 ? (
          <p className="text-sm text-zinc-400">No maintenance schedules yet.</p>
        ) : (
          <div className="space-y-2">
            {initialSchedules.map((sched) => (
              <div
                key={sched.id}
                className="flex items-center justify-between rounded-xl border border-zinc-200 bg-white px-4 py-3 dark:border-zinc-800 dark:bg-zinc-900"
              >
                <div>
                  <div className="flex items-center gap-2">
                    <span className={`h-2 w-2 rounded-full ${sched.is_active ? "bg-green-500" : "bg-zinc-300"}`} />
                    <p className="text-sm font-medium text-zinc-900 dark:text-zinc-50">{sched.name}</p>
                  </div>
                  <p className="mt-0.5 text-xs text-zinc-400">
                    {RECURRENCE_LABELS[sched.recurrence_type]}
                    {sched.recurrence_interval && sched.recurrence_type !== "one_time"
                      ? ` · every ${sched.recurrence_interval}`
                      : ""}
                    {sched.estimated_cost ? ` · $${sched.estimated_cost}` : ""}
                    {sched.estimated_duration_minutes ? ` · ${sched.estimated_duration_minutes} min` : ""}
                  </p>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => {
                      startTransition(async () => {
                        await toggleScheduleActive(sched.id, !sched.is_active, item.id);
                        router.refresh();
                      });
                    }}
                    className="rounded p-1.5 text-xs text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600 dark:hover:bg-zinc-800"
                    title={sched.is_active ? "Pause" : "Resume"}
                  >
                    {sched.is_active ? "⏸" : "▶"}
                  </button>
                  <button onClick={() => setEditingSchedule(sched)} className="rounded p-1.5 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600 dark:hover:bg-zinc-800">
                    <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536M9 13l6.586-6.586a2 2 0 112.828 2.828L11.828 15.828a2 2 0 01-1.414.586H9v-2a2 2 0 01.586-1.414z" /></svg>
                  </button>
                  <button onClick={() => setConfirmDeleteSchedule(sched)} className="rounded p-1.5 text-zinc-400 hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-950">
                    <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6M9 7h6m2 0a1 1 0 00-1-1h-4a1 1 0 00-1 1m-4 0h10" /></svg>
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Edit modal */}
      <Modal title="Edit item" open={showEdit} onClose={() => setShowEdit(false)}>
        <EditForm
          item={item}
          rooms={rooms}
          categories={categories}
          allTags={allTags}
          itemTags={itemTags}
          onCancel={() => setShowEdit(false)}
          onSaved={() => { setShowEdit(false); router.refresh(); }}
        />
      </Modal>

      {/* Add schedule modal */}
      <Modal title="Add maintenance schedule" open={showAddSchedule} onClose={() => setShowAddSchedule(false)}>
        <ScheduleForm
          itemId={item.id}
          onSuccess={() => { setShowAddSchedule(false); router.refresh(); }}
          onCancel={() => setShowAddSchedule(false)}
        />
      </Modal>

      {/* Edit schedule modal */}
      <Modal title="Edit schedule" open={!!editingSchedule} onClose={() => setEditingSchedule(null)}>
        {editingSchedule && (
          <ScheduleForm
            initial={editingSchedule}
            itemId={item.id}
            onSuccess={() => { setEditingSchedule(null); router.refresh(); }}
            onCancel={() => setEditingSchedule(null)}
          />
        )}
      </Modal>

      {/* Delete schedule confirmation */}
      <Modal title="Delete schedule" open={!!confirmDeleteSchedule} onClose={() => setConfirmDeleteSchedule(null)}>
        {confirmDeleteSchedule && (
          <div className="space-y-4">
            <p className="text-sm text-zinc-600 dark:text-zinc-400">
              Delete <strong className="text-zinc-900 dark:text-zinc-50">{confirmDeleteSchedule.name}</strong>? All future pending events will also be removed.
            </p>
            <div className="flex justify-end gap-2">
              <button onClick={() => setConfirmDeleteSchedule(null)} className="rounded-lg border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800">Cancel</button>
              <button
                onClick={() => {
                  startTransition(async () => {
                    await deleteSchedule(confirmDeleteSchedule.id, item.id);
                    setConfirmDeleteSchedule(null);
                    router.refresh();
                  });
                }}
                disabled={isPending}
                className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-500 disabled:opacity-50"
              >
                {isPending ? "Deleting..." : "Delete"}
              </button>
            </div>
          </div>
        )}
      </Modal>

      {/* Delete confirmation */}
      <Modal title="Delete item" open={showDelete} onClose={() => setShowDelete(false)}>
        <div className="space-y-4">
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            Permanently delete <strong className="text-zinc-900 dark:text-zinc-50">{item.name}</strong>? This will also remove all attached photos and documents.
          </p>
          <div className="flex justify-end gap-2">
            <button onClick={() => setShowDelete(false)} className="rounded-lg border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800">Cancel</button>
            <button onClick={handleDelete} disabled={isPending} className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-500 disabled:opacity-50">
              {isPending ? "Deleting..." : "Delete"}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
