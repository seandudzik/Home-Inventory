import { createClient } from "@/lib/supabase/server";
import { getHouseholdId } from "@/lib/household";
import { MaintenanceClient } from "./maintenance-client";
import type { Item, MaintenanceEvent, MaintenanceSchedule } from "@/types/database";

interface RawEvent extends MaintenanceEvent {
  maintenance_schedules: Pick<MaintenanceSchedule, "name" | "estimated_cost" | "estimated_duration_minutes"> & {
    items: Pick<Item, "id" | "name">;
  };
}

export default async function MaintenancePage() {
  const supabase = await createClient();
  const householdId = await getHouseholdId();

  if (!householdId) {
    return (
      <div className="mt-12 text-center text-sm text-zinc-400">
        You are not part of a household yet. Ask your administrator to add you.
      </div>
    );
  }

  // Fetch household item IDs first so we can scope event queries
  const { data: householdItems } = await supabase
    .from("items")
    .select("id, name")
    .eq("household_id", householdId)
    .order("name");

  const itemIds = ((householdItems ?? []) as Pick<Item, "id" | "name">[]).map((i) => i.id);

  if (itemIds.length === 0) {
    return (
      <MaintenanceClient events={[]} items={[]} />
    );
  }

  // Mark any pending past events as overdue before rendering
  const today = new Date().toISOString().split("T")[0];
  await supabase
    .from("maintenance_events")
    .update({ status: "overdue" } as never)
    .eq("status", "pending")
    .lt("scheduled_date", today)
    .in("item_id", itemIds);

  const ninetyDaysOut = new Date();
  ninetyDaysOut.setDate(ninetyDaysOut.getDate() + 90);

  const { data: rawEvents } = await supabase
    .from("maintenance_events")
    .select(`
      *,
      maintenance_schedules(
        name,
        estimated_cost,
        estimated_duration_minutes,
        items(id, name)
      )
    `)
    .in("item_id", itemIds)
    .or(`status.eq.overdue,and(status.eq.pending,scheduled_date.lte.${ninetyDaysOut.toISOString().split("T")[0]})`)
    .order("scheduled_date");

  const events = ((rawEvents ?? []) as RawEvent[]).map((e) => ({
    id: e.id,
    scheduled_date: e.scheduled_date,
    status: e.status,
    item_id: e.maintenance_schedules?.items?.id ?? "",
    item_name: e.maintenance_schedules?.items?.name ?? "Unknown item",
    schedule_id: e.schedule_id,
    schedule_name: e.maintenance_schedules?.name ?? "Unknown schedule",
    estimated_cost: e.maintenance_schedules?.estimated_cost ?? null,
    estimated_duration_minutes: e.maintenance_schedules?.estimated_duration_minutes ?? null,
  }));

  return (
    <MaintenanceClient
      events={events}
      items={(householdItems ?? []) as Pick<Item, "id" | "name">[]}
    />
  );
}
