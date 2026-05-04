// Supabase Edge Function — invoked on a daily cron schedule.
// Generates maintenance_events for the next 365 days for all active schedules
// that don't yet have events generated that far out.

import { createClient } from "jsr:@supabase/supabase-js@2";

const LOOKAHEAD_DAYS = 365;

Deno.serve(async () => {
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const today = new Date();
  const horizon = new Date(today);
  horizon.setDate(horizon.getDate() + LOOKAHEAD_DAYS);

  const { data: schedules, error } = await supabase
    .from("maintenance_schedules")
    .select("id, item_id, recurrence_type, recurrence_interval, start_date, end_date")
    .eq("is_active", true);

  if (error) {
    console.error("Failed to fetch schedules", error);
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }

  const eventsToInsert: Array<{
    schedule_id: string;
    item_id: string;
    scheduled_date: string;
    status: string;
  }> = [];

  for (const schedule of schedules ?? []) {
    const dates = generateDates(schedule, today, horizon);

    for (const date of dates) {
      const dateStr = date.toISOString().split("T")[0];

      // Check if event already exists for this schedule + date
      const { count } = await supabase
        .from("maintenance_events")
        .select("id", { count: "exact", head: true })
        .eq("schedule_id", schedule.id)
        .eq("scheduled_date", dateStr);

      if (count === 0) {
        eventsToInsert.push({
          schedule_id: schedule.id,
          item_id: schedule.item_id,
          scheduled_date: dateStr,
          status: "pending",
        });
      }
    }
  }

  if (eventsToInsert.length > 0) {
    const { error: insertError } = await supabase
      .from("maintenance_events")
      .insert(eventsToInsert);

    if (insertError) {
      console.error("Failed to insert events", insertError);
      return new Response(JSON.stringify({ error: insertError.message }), { status: 500 });
    }
  }

  return new Response(
    JSON.stringify({ generated: eventsToInsert.length }),
    { headers: { "Content-Type": "application/json" } },
  );
});

function generateDates(
  schedule: {
    recurrence_type: string;
    recurrence_interval: number | null;
    start_date: string;
    end_date: string | null;
  },
  from: Date,
  to: Date,
): Date[] {
  const interval = schedule.recurrence_interval ?? 1;
  const scheduleEnd = schedule.end_date ? new Date(schedule.end_date) : to;
  const ceiling = scheduleEnd < to ? scheduleEnd : to;

  const dates: Date[] = [];
  let cursor = new Date(schedule.start_date);

  if (schedule.recurrence_type === "one_time") {
    if (cursor >= from && cursor <= ceiling) dates.push(new Date(cursor));
    return dates;
  }

  while (cursor <= ceiling) {
    if (cursor >= from) dates.push(new Date(cursor));

    switch (schedule.recurrence_type) {
      case "daily":
        cursor.setDate(cursor.getDate() + interval);
        break;
      case "weekly":
        cursor.setDate(cursor.getDate() + 7 * interval);
        break;
      case "monthly":
        cursor.setMonth(cursor.getMonth() + interval);
        break;
      case "yearly":
        cursor.setFullYear(cursor.getFullYear() + interval);
        break;
      case "custom":
        // custom treats interval as days
        cursor.setDate(cursor.getDate() + interval);
        break;
      default:
        return dates;
    }
  }

  return dates;
}
