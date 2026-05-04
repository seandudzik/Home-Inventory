"use client";

import { useState, useTransition, useMemo } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Modal } from "@/components/ui/modal";
import { completeEvent, skipEvent, createSchedule } from "@/actions/maintenance";
import type { MaintenanceStatus, RecurrenceType, Item } from "@/types/database";

interface EventRow {
  id: string;
  scheduled_date: string;
  status: MaintenanceStatus;
  item_id: string;
  item_name: string;
  schedule_id: string;
  schedule_name: string;
  estimated_cost: number | null;
  estimated_duration_minutes: number | null;
}

interface MaintenanceClientProps {
  events: EventRow[];
  items: Pick<Item, "id" | "name">[];
}

// ── Calendar helpers ────────────────────────────────────────────────────────

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];

function calendarGrid(year: number, month: number) {
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells: (number | null)[] = Array(firstDay).fill(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

function toDateStr(year: number, month: number, day: number) {
  return `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function statusColor(status: MaintenanceStatus) {
  switch (status) {
    case "overdue": return "bg-red-500";
    case "pending": return "bg-blue-500";
    case "completed": return "bg-green-500";
    case "skipped": return "bg-zinc-400";
  }
}

function statusLabel(status: MaintenanceStatus) {
  return status.charAt(0).toUpperCase() + status.slice(1);
}

// ── Schedule form ───────────────────────────────────────────────────────────

const RECURRENCE_OPTIONS: { value: RecurrenceType; label: string }[] = [
  { value: "one_time", label: "One time" },
  { value: "daily", label: "Daily" },
  { value: "weekly", label: "Weekly" },
  { value: "monthly", label: "Monthly" },
  { value: "yearly", label: "Yearly" },
  { value: "custom", label: "Custom (every N days)" },
];

const INTERVAL_UNIT: Partial<Record<RecurrenceType, string>> = {
  daily: "days",
  weekly: "weeks",
  monthly: "months",
  yearly: "years",
  custom: "days",
};

interface ScheduleFormProps {
  items: Pick<Item, "id" | "name">[];
  onSuccess: () => void;
  onCancel: () => void;
}

function ScheduleForm({ items, onSuccess, onCancel }: ScheduleFormProps) {
  const [isPending, startTransition] = useTransition();
  const [recurrenceType, setRecurrenceType] = useState<RecurrenceType>("monthly");
  const [error, setError] = useState<string | null>(null);

  const showInterval = recurrenceType !== "one_time";
  const unit = INTERVAL_UNIT[recurrenceType];

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const fd = new FormData(e.currentTarget);
    const itemId = fd.get("item_id") as string;
    if (!itemId) { setError("Please select an item."); return; }

    startTransition(async () => {
      try {
        await createSchedule(itemId, fd);
        onSuccess();
      } catch (e) {
        setError((e as Error).message);
      }
    });
  }

  const inputCls = "mt-1.5 block w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 placeholder-zinc-400 focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-50";
  const labelCls = "block text-sm font-medium text-zinc-700 dark:text-zinc-300";

  return (
    <form onSubmit={handleSubmit} className="space-y-4 max-h-[70vh] overflow-y-auto pr-1">
      <div>
        <label className={labelCls}>Item <span className="text-red-500">*</span></label>
        <select name="item_id" required className={inputCls}>
          <option value="">Select an item…</option>
          {items.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
        </select>
      </div>

      <div>
        <label className={labelCls}>Schedule name <span className="text-red-500">*</span></label>
        <input name="name" required placeholder="e.g. Replace HVAC filter" className={inputCls} />
      </div>

      <div>
        <label className={labelCls}>Description</label>
        <textarea name="description" rows={2} className={inputCls} />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={labelCls}>Recurrence</label>
          <select
            name="recurrence_type"
            value={recurrenceType}
            onChange={(e) => setRecurrenceType(e.target.value as RecurrenceType)}
            className={inputCls}
          >
            {RECURRENCE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>
        {showInterval && (
          <div>
            <label className={labelCls}>Every {unit ? `(${unit})` : ""}</label>
            <input type="number" name="recurrence_interval" min="1" defaultValue="1" className={inputCls} />
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={labelCls}>Start date <span className="text-red-500">*</span></label>
          <input type="date" name="start_date" required defaultValue={new Date().toISOString().split("T")[0]} className={inputCls} />
        </div>
        <div>
          <label className={labelCls}>End date</label>
          <input type="date" name="end_date" className={inputCls} />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={labelCls}>Est. duration (min)</label>
          <input type="number" name="estimated_duration_minutes" min="1" className={inputCls} />
        </div>
        <div>
          <label className={labelCls}>Est. cost ($)</label>
          <input type="number" name="estimated_cost" min="0" step="0.01" className={inputCls} />
        </div>
      </div>

      {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}

      <div className="flex justify-end gap-2 pt-1">
        <button type="button" onClick={onCancel} className="rounded-lg border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800">Cancel</button>
        <button type="submit" disabled={isPending} className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 disabled:opacity-50 dark:bg-zinc-50 dark:text-zinc-900">
          {isPending ? "Saving..." : "Add schedule"}
        </button>
      </div>
    </form>
  );
}

// ── Complete event form ─────────────────────────────────────────────────────

interface CompleteFormProps {
  event: EventRow;
  onDone: () => void;
  onCancel: () => void;
}

function CompleteForm({ event, onDone, onCancel }: CompleteFormProps) {
  const [isPending, startTransition] = useTransition();

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    startTransition(async () => {
      await completeEvent(event.id, fd);
      onDone();
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <p className="text-sm text-zinc-600 dark:text-zinc-400">
        Mark <strong className="text-zinc-900 dark:text-zinc-50">{event.schedule_name}</strong> for{" "}
        <strong className="text-zinc-900 dark:text-zinc-50">{event.item_name}</strong> as complete?
      </p>
      <div>
        <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">Actual cost ($)</label>
        <input
          type="number"
          name="actual_cost"
          min="0"
          step="0.01"
          defaultValue={event.estimated_cost ?? ""}
          className="mt-1.5 block w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-50"
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">Notes</label>
        <textarea
          name="notes"
          rows={2}
          className="mt-1.5 block w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-50"
        />
      </div>
      <div className="flex justify-end gap-2">
        <button type="button" onClick={onCancel} className="rounded-lg border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800">Cancel</button>
        <button type="submit" disabled={isPending} className="rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-500 disabled:opacity-50">
          {isPending ? "Saving..." : "Mark complete"}
        </button>
      </div>
    </form>
  );
}

// ── Event card ──────────────────────────────────────────────────────────────

interface EventCardProps {
  event: EventRow;
  onComplete: (e: EventRow) => void;
  onSkip: (e: EventRow) => void;
  showDate?: boolean;
}

function EventCard({ event, onComplete, onSkip, showDate }: EventCardProps) {
  const [isPending, startTransition] = useTransition();
  const isActionable = event.status === "pending" || event.status === "overdue";

  return (
    <div className={`rounded-xl border bg-white p-4 dark:bg-zinc-900 ${event.status === "overdue" ? "border-red-200 dark:border-red-900" : "border-zinc-200 dark:border-zinc-800"}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className={`inline-block h-2 w-2 rounded-full shrink-0 ${statusColor(event.status)}`} />
            <p className="text-sm font-medium text-zinc-900 dark:text-zinc-50 truncate">{event.schedule_name}</p>
          </div>
          <Link href={`/items/${event.item_id}`} className="mt-0.5 block text-xs text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 truncate">
            {event.item_name}
          </Link>
          {showDate && (
            <p className="mt-0.5 text-xs text-zinc-400">
              {new Date(event.scheduled_date + "T00:00:00").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}
            </p>
          )}
          <div className="mt-1.5 flex flex-wrap gap-2 text-xs text-zinc-400">
            {event.estimated_duration_minutes && <span>⏱ {event.estimated_duration_minutes} min</span>}
            {event.estimated_cost && <span>💰 ${event.estimated_cost.toFixed(2)}</span>}
          </div>
        </div>
        <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${
          event.status === "overdue" ? "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-400" :
          event.status === "completed" ? "bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-400" :
          event.status === "skipped" ? "bg-zinc-100 text-zinc-500 dark:bg-zinc-800" :
          "bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-400"
        }`}>
          {statusLabel(event.status)}
        </span>
      </div>
      {isActionable && (
        <div className="mt-3 flex gap-2">
          <button
            onClick={() => onComplete(event)}
            className="flex-1 rounded-lg bg-green-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-green-500"
          >
            Complete
          </button>
          <button
            onClick={() => {
              startTransition(async () => { await skipEvent(event.id); });
            }}
            disabled={isPending}
            className="rounded-lg border border-zinc-300 px-3 py-1.5 text-xs font-medium text-zinc-600 hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-400"
          >
            Skip
          </button>
        </div>
      )}
    </div>
  );
}

// ── Main component ──────────────────────────────────────────────────────────

export function MaintenanceClient({ events, items }: MaintenanceClientProps) {
  const router = useRouter();
  const today = new Date();
  const todayStr = today.toISOString().split("T")[0];

  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth());
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [showAddSchedule, setShowAddSchedule] = useState(false);
  const [completing, setCompleting] = useState<EventRow | null>(null);

  const eventsByDate = useMemo(() => {
    const map = new Map<string, EventRow[]>();
    events.forEach((e) => {
      const list = map.get(e.scheduled_date) ?? [];
      list.push(e);
      map.set(e.scheduled_date, list);
    });
    return map;
  }, [events]);

  const overdueEvents = useMemo(() =>
    events.filter((e) => e.status === "overdue"), [events]);

  const upcomingEvents = useMemo(() =>
    events
      .filter((e) => e.status === "pending" && e.scheduled_date >= todayStr)
      .sort((a, b) => a.scheduled_date.localeCompare(b.scheduled_date))
      .slice(0, 20),
    [events, todayStr],
  );

  const selectedEvents = useMemo(() =>
    selectedDate ? (eventsByDate.get(selectedDate) ?? []) : [],
    [selectedDate, eventsByDate],
  );

  const cells = calendarGrid(year, month);

  function prevMonth() {
    if (month === 0) { setYear(y => y - 1); setMonth(11); }
    else setMonth(m => m - 1);
    setSelectedDate(null);
  }
  function nextMonth() {
    if (month === 11) { setYear(y => y + 1); setMonth(0); }
    else setMonth(m => m + 1);
    setSelectedDate(null);
  }

  function handleComplete(e: EventRow) { setCompleting(e); }
  function handleSkip() { router.refresh(); }

  const displayEvents = selectedDate ? selectedEvents : upcomingEvents;
  const displayTitle = selectedDate
    ? new Date(selectedDate + "T00:00:00").toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })
    : "Upcoming";

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-50">Maintenance</h1>
          {overdueEvents.length > 0 && (
            <p className="mt-0.5 text-sm text-red-600 dark:text-red-400">
              {overdueEvents.length} overdue task{overdueEvents.length !== 1 ? "s" : ""}
            </p>
          )}
        </div>
        <button
          onClick={() => setShowAddSchedule(true)}
          className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200"
        >
          Add schedule
        </button>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[320px_1fr]">
        {/* Calendar */}
        <div className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
          {/* Month nav */}
          <div className="flex items-center justify-between mb-3">
            <button onClick={prevMonth} className="rounded-md p-1.5 text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800">
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" /></svg>
            </button>
            <span className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">{MONTHS[month]} {year}</span>
            <button onClick={nextMonth} className="rounded-md p-1.5 text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800">
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" /></svg>
            </button>
          </div>

          {/* Day headers */}
          <div className="grid grid-cols-7 mb-1">
            {DAYS.map((d) => (
              <div key={d} className="text-center text-xs font-medium text-zinc-400 py-1">{d}</div>
            ))}
          </div>

          {/* Day cells */}
          <div className="grid grid-cols-7 gap-y-1">
            {cells.map((day, i) => {
              if (!day) return <div key={i} />;
              const dateStr = toDateStr(year, month, day);
              const dayEvents = eventsByDate.get(dateStr) ?? [];
              const isToday = dateStr === todayStr;
              const isSelected = dateStr === selectedDate;
              const hasOverdue = dayEvents.some((e) => e.status === "overdue");
              const hasPending = dayEvents.some((e) => e.status === "pending");

              return (
                <button
                  key={dateStr}
                  onClick={() => setSelectedDate(isSelected ? null : dateStr)}
                  className={`relative flex flex-col items-center rounded-lg py-1.5 text-sm transition-colors ${
                    isSelected ? "bg-zinc-900 text-white dark:bg-zinc-50 dark:text-zinc-900" :
                    isToday ? "bg-zinc-100 font-semibold text-zinc-900 dark:bg-zinc-800 dark:text-zinc-50" :
                    "text-zinc-700 hover:bg-zinc-50 dark:text-zinc-300 dark:hover:bg-zinc-800"
                  }`}
                >
                  {day}
                  {dayEvents.length > 0 && (
                    <div className="mt-0.5 flex gap-0.5">
                      {hasOverdue && <span className="h-1.5 w-1.5 rounded-full bg-red-500" />}
                      {hasPending && !hasOverdue && <span className="h-1.5 w-1.5 rounded-full bg-blue-500" />}
                      {!hasOverdue && !hasPending && <span className="h-1.5 w-1.5 rounded-full bg-green-500" />}
                    </div>
                  )}
                </button>
              );
            })}
          </div>

          {/* Legend */}
          <div className="mt-3 flex gap-3 border-t border-zinc-100 pt-3 dark:border-zinc-800">
            {[["bg-red-500", "Overdue"], ["bg-blue-500", "Pending"], ["bg-green-500", "Done"]].map(([color, label]) => (
              <div key={label} className="flex items-center gap-1.5 text-xs text-zinc-400">
                <span className={`h-1.5 w-1.5 rounded-full ${color}`} />
                {label}
              </div>
            ))}
          </div>
        </div>

        {/* Event list */}
        <div>
          {/* Overdue banner (always visible if any) */}
          {!selectedDate && overdueEvents.length > 0 && (
            <div className="mb-4">
              <h2 className="text-sm font-semibold text-red-600 dark:text-red-400 mb-2">Overdue</h2>
              <div className="space-y-2">
                {overdueEvents.map((e) => (
                  <EventCard key={e.id} event={e} onComplete={handleComplete} onSkip={handleSkip} showDate />
                ))}
              </div>
            </div>
          )}

          <h2 className="text-sm font-semibold text-zinc-700 dark:text-zinc-300 mb-2">{displayTitle}</h2>
          {displayEvents.length === 0 ? (
            <div className="rounded-xl border border-zinc-200 bg-white p-8 text-center text-sm text-zinc-400 dark:border-zinc-800 dark:bg-zinc-900">
              {selectedDate ? "No events on this day." : "No upcoming events."}
            </div>
          ) : (
            <div className="space-y-2">
              {displayEvents.map((e) => (
                <EventCard key={e.id} event={e} onComplete={handleComplete} onSkip={handleSkip} showDate={!selectedDate} />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Add schedule modal */}
      <Modal title="Add maintenance schedule" open={showAddSchedule} onClose={() => setShowAddSchedule(false)}>
        <ScheduleForm
          items={items}
          onSuccess={() => { setShowAddSchedule(false); router.refresh(); }}
          onCancel={() => setShowAddSchedule(false)}
        />
      </Modal>

      {/* Complete event modal */}
      <Modal title="Complete task" open={!!completing} onClose={() => setCompleting(null)}>
        {completing && (
          <CompleteForm
            event={completing}
            onDone={() => { setCompleting(null); router.refresh(); }}
            onCancel={() => setCompleting(null)}
          />
        )}
      </Modal>
    </div>
  );
}
