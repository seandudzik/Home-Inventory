"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Modal } from "@/components/ui/modal";
import { createRoom, updateRoom, deleteRoom } from "@/actions/rooms";
import type { Room } from "@/types/database";

interface RoomWithCount extends Room {
  item_count: number;
}

interface RoomsClientProps {
  rooms: RoomWithCount[];
}

const FLOOR_LABELS: Record<number, string> = {
  0: "Basement",
  1: "Ground floor",
  2: "2nd floor",
  3: "3rd floor",
};

function floorLabel(floor: number | null) {
  if (floor === null) return null;
  return FLOOR_LABELS[floor] ?? `Floor ${floor}`;
}

interface RoomFormProps {
  initial?: Room;
  onSubmit: (formData: FormData) => Promise<void>;
  onCancel: () => void;
  pending: boolean;
}

function RoomForm({ initial, onSubmit, onCancel, pending }: RoomFormProps) {
  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    await onSubmit(new FormData(e.currentTarget));
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
          placeholder="e.g. Living Room"
          className="mt-1.5 block w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 placeholder-zinc-400 focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-50"
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">
            Floor
          </label>
          <select
            name="floor"
            defaultValue={initial?.floor ?? ""}
            className="mt-1.5 block w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-50"
          >
            <option value="">—</option>
            <option value="0">Basement</option>
            <option value="1">Ground floor</option>
            <option value="2">2nd floor</option>
            <option value="3">3rd floor</option>
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">
            Icon (emoji)
          </label>
          <input
            name="icon"
            defaultValue={initial?.icon ?? ""}
            placeholder="e.g. 🛋️"
            className="mt-1.5 block w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 placeholder-zinc-400 focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-50"
          />
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
          {pending ? "Saving..." : initial ? "Save changes" : "Add room"}
        </button>
      </div>
    </form>
  );
}

export function RoomsClient({ rooms }: RoomsClientProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [showAdd, setShowAdd] = useState(false);
  const [editing, setEditing] = useState<Room | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<RoomWithCount | null>(null);
  const [error, setError] = useState<string | null>(null);

  function refresh() {
    router.refresh();
  }

  async function handleCreate(formData: FormData) {
    setError(null);
    startTransition(async () => {
      try {
        await createRoom(formData);
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
        await updateRoom(editing.id, formData);
        setEditing(null);
        refresh();
      } catch (e) {
        setError((e as Error).message);
      }
    });
  }

  async function handleDelete(room: RoomWithCount) {
    setError(null);
    startTransition(async () => {
      try {
        await deleteRoom(room.id);
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
          <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-50">Rooms</h1>
          <p className="mt-0.5 text-sm text-zinc-500">{rooms.length} room{rooms.length !== 1 ? "s" : ""}</p>
        </div>
        <button
          onClick={() => setShowAdd(true)}
          className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200"
        >
          Add room
        </button>
      </div>

      {error && (
        <div className="mt-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-600 dark:bg-red-950 dark:text-red-400">
          {error}
        </div>
      )}

      {rooms.length === 0 ? (
        <div className="mt-12 text-center text-sm text-zinc-400">
          No rooms yet — add your first room to get started.
        </div>
      ) : (
        <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {rooms.map((room) => (
            <div
              key={room.id}
              className="flex items-start justify-between rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900"
            >
              <div className="flex items-start gap-3">
                <span className="text-2xl leading-none">{room.icon || "🏠"}</span>
                <div>
                  <p className="text-sm font-medium text-zinc-900 dark:text-zinc-50">{room.name}</p>
                  <p className="mt-0.5 text-xs text-zinc-400">
                    {[floorLabel(room.floor), `${room.item_count} item${room.item_count !== 1 ? "s" : ""}`]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                </div>
              </div>
              <div className="flex shrink-0 gap-1">
                <button
                  onClick={() => setEditing(room)}
                  className="rounded p-1.5 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600 dark:hover:bg-zinc-800 dark:hover:text-zinc-300"
                  title="Edit"
                >
                  <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536M9 13l6.586-6.586a2 2 0 112.828 2.828L11.828 15.828a2 2 0 01-1.414.586H9v-2a2 2 0 01.586-1.414z" />
                  </svg>
                </button>
                <button
                  onClick={() => setConfirmDelete(room)}
                  className="rounded p-1.5 text-zinc-400 hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-950"
                  title="Delete"
                >
                  <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6M9 7h6m2 0a1 1 0 00-1-1h-4a1 1 0 00-1 1m-4 0h10" />
                  </svg>
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add modal */}
      <Modal title="Add room" open={showAdd} onClose={() => setShowAdd(false)}>
        <RoomForm onSubmit={handleCreate} onCancel={() => setShowAdd(false)} pending={isPending} />
      </Modal>

      {/* Edit modal */}
      <Modal title="Edit room" open={!!editing} onClose={() => setEditing(null)}>
        {editing && (
          <RoomForm
            initial={editing}
            onSubmit={handleUpdate}
            onCancel={() => setEditing(null)}
            pending={isPending}
          />
        )}
      </Modal>

      {/* Delete confirmation */}
      <Modal title="Delete room" open={!!confirmDelete} onClose={() => setConfirmDelete(null)}>
        {confirmDelete && (
          <div className="space-y-4">
            <p className="text-sm text-zinc-600 dark:text-zinc-400">
              Delete <strong className="text-zinc-900 dark:text-zinc-50">{confirmDelete.name}</strong>?
              {confirmDelete.item_count > 0 && (
                <span className="block mt-1 text-amber-600 dark:text-amber-400">
                  {confirmDelete.item_count} item{confirmDelete.item_count !== 1 ? "s" : ""} will have their room cleared.
                </span>
              )}
            </p>
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
