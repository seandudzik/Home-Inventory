"use server";

import { createClient } from "@/lib/supabase/server";
import { getHouseholdId } from "@/lib/household";
import { revalidatePath } from "next/cache";
import type { RecurrenceType } from "@/types/database";

// ── Event generation (mirrors the Edge Function logic) ─────────────────────

function generateDates(
  recurrenceType: RecurrenceType,
  interval: number,
  startDate: Date,
  from: Date,
  to: Date,
  endDate: Date | null,
): Date[] {
  const ceiling = endDate && endDate < to ? endDate : to;
  const dates: Date[] = [];
  const cursor = new Date(startDate);

  if (recurrenceType === "one_time") {
    if (cursor >= from && cursor <= ceiling) dates.push(new Date(cursor));
    return dates;
  }

  while (cursor <= ceiling) {
    if (cursor >= from) dates.push(new Date(cursor));
    switch (recurrenceType) {
      case "daily":    cursor.setDate(cursor.getDate() + interval); break;
      case "weekly":   cursor.setDate(cursor.getDate() + 7 * interval); break;
      case "monthly":  cursor.setMonth(cursor.getMonth() + interval); break;
      case "yearly":   cursor.setFullYear(cursor.getFullYear() + interval); break;
      case "custom":   cursor.setDate(cursor.getDate() + interval); break;
      default: return dates;
    }
  }
  return dates;
}

async function generateEventsForSchedule(
  supabase: Awaited<ReturnType<typeof import("@/lib/supabase/server").createClient>>,
  scheduleId: string,
  itemId: string,
  recurrenceType: RecurrenceType,
  interval: number,
  startDate: string,
  endDate: string | null,
) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const horizon = new Date(today);
  horizon.setDate(horizon.getDate() + 365);

  const dates = generateDates(
    recurrenceType,
    interval,
    new Date(startDate),
    today,
    horizon,
    endDate ? new Date(endDate) : null,
  );

  if (dates.length === 0) return;

  const events = dates.map((d) => ({
    schedule_id: scheduleId,
    item_id: itemId,
    scheduled_date: d.toISOString().split("T")[0],
    status: "pending",
  }));

  await supabase.from("maintenance_events").insert(events as never);
}

// ── Schedule CRUD ──────────────────────────────────────────────────────────

export async function createSchedule(itemId: string, formData: FormData): Promise<string> {
  const supabase = await createClient();
  const householdId = await getHouseholdId();
  if (!householdId) throw new Error("No household found");

  const recurrenceType = formData.get("recurrence_type") as RecurrenceType;
  const startDate = formData.get("start_date") as string;
  const endDate = (formData.get("end_date") as string) || null;
  const interval = Number(formData.get("recurrence_interval") || 1);

  const { data, error } = await supabase
    .from("maintenance_schedules")
    .insert({
      item_id: itemId,
      name: formData.get("name") as string,
      description: (formData.get("description") as string) || null,
      recurrence_type: recurrenceType,
      recurrence_interval: interval,
      start_date: startDate,
      end_date: endDate,
      estimated_duration_minutes: formData.get("estimated_duration_minutes")
        ? Number(formData.get("estimated_duration_minutes"))
        : null,
      estimated_cost: formData.get("estimated_cost")
        ? Number(formData.get("estimated_cost"))
        : null,
      assigned_to: (formData.get("assigned_to") as string) || null,
      is_active: true,
    } as never)
    .select("id")
    .single();

  if (error) throw new Error(error.message);
  const { id } = data as { id: string };

  await generateEventsForSchedule(supabase, id, itemId, recurrenceType, interval, startDate, endDate);

  revalidatePath("/maintenance");
  revalidatePath(`/items/${itemId}`);
  return id;
}

export async function updateSchedule(scheduleId: string, itemId: string, formData: FormData) {
  const supabase = await createClient();

  const recurrenceType = formData.get("recurrence_type") as RecurrenceType;
  const startDate = formData.get("start_date") as string;
  const endDate = (formData.get("end_date") as string) || null;
  const interval = Number(formData.get("recurrence_interval") || 1);

  const { error } = await supabase
    .from("maintenance_schedules")
    .update({
      name: formData.get("name") as string,
      description: (formData.get("description") as string) || null,
      recurrence_type: recurrenceType,
      recurrence_interval: interval,
      start_date: startDate,
      end_date: endDate,
      estimated_duration_minutes: formData.get("estimated_duration_minutes")
        ? Number(formData.get("estimated_duration_minutes"))
        : null,
      estimated_cost: formData.get("estimated_cost")
        ? Number(formData.get("estimated_cost"))
        : null,
      assigned_to: (formData.get("assigned_to") as string) || null,
    } as never)
    .eq("id", scheduleId);

  if (error) throw new Error(error.message);

  // Drop all pending future events and regenerate
  const today = new Date().toISOString().split("T")[0];
  await supabase
    .from("maintenance_events")
    .delete()
    .eq("schedule_id", scheduleId)
    .eq("status", "pending")
    .gte("scheduled_date", today);

  await generateEventsForSchedule(supabase, scheduleId, itemId, recurrenceType, interval, startDate, endDate);

  revalidatePath("/maintenance");
  revalidatePath(`/items/${itemId}`);
}

export async function deleteSchedule(scheduleId: string, itemId: string) {
  const supabase = await createClient();

  const { error } = await supabase
    .from("maintenance_schedules")
    .delete()
    .eq("id", scheduleId);

  if (error) throw new Error(error.message);
  revalidatePath("/maintenance");
  revalidatePath(`/items/${itemId}`);
}

export async function toggleScheduleActive(scheduleId: string, isActive: boolean, itemId: string) {
  const supabase = await createClient();

  const { error } = await supabase
    .from("maintenance_schedules")
    .update({ is_active: isActive } as never)
    .eq("id", scheduleId);

  if (error) throw new Error(error.message);
  revalidatePath("/maintenance");
  revalidatePath(`/items/${itemId}`);
}

// ── Event actions ──────────────────────────────────────────────────────────

export async function completeEvent(eventId: string, formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const { error } = await supabase
    .from("maintenance_events")
    .update({
      status: "completed",
      completed_at: new Date().toISOString(),
      completed_by: user.id,
      actual_cost: formData.get("actual_cost") ? Number(formData.get("actual_cost")) : null,
      notes: (formData.get("notes") as string) || null,
    } as never)
    .eq("id", eventId);

  if (error) throw new Error(error.message);
  revalidatePath("/maintenance");
}

export async function skipEvent(eventId: string) {
  const supabase = await createClient();

  const { error } = await supabase
    .from("maintenance_events")
    .update({ status: "skipped" } as never)
    .eq("id", eventId);

  if (error) throw new Error(error.message);
  revalidatePath("/maintenance");
}

export async function markOverdueEvents() {
  const supabase = await createClient();
  const today = new Date().toISOString().split("T")[0];

  await supabase
    .from("maintenance_events")
    .update({ status: "overdue" } as never)
    .eq("status", "pending")
    .lt("scheduled_date", today);

  revalidatePath("/maintenance");
}
