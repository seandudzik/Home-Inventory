import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getHouseholdId } from "@/lib/household";
import PieChart from "@/components/PieChart";

function StatCard({ label, value, href, accent }: { label: string; value: number; href?: string; accent?: "red" | "amber" }) {
  const valueClass =
    accent === "red"
      ? "text-red-600 dark:text-red-400"
      : accent === "amber"
      ? "text-amber-600 dark:text-amber-400"
      : "text-zinc-900 dark:text-zinc-50";

  const card = (
    <div className="rounded-xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
      <p className="text-sm text-zinc-500 dark:text-zinc-400">{label}</p>
      <p className={`mt-1 text-3xl font-semibold tabular-nums ${valueClass}`}>{value}</p>
    </div>
  );

  return href ? (
    <Link href={href} className="block transition-opacity hover:opacity-80">
      {card}
    </Link>
  ) : (
    card
  );
}

function SectionHeader({ title, href, linkLabel }: { title: string; href?: string; linkLabel?: string }) {
  return (
    <div className="flex items-center justify-between">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">{title}</h2>
      {href && linkLabel && (
        <Link href={href} className="text-xs text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200">
          {linkLabel} →
        </Link>
      )}
    </div>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <p className="py-4 text-center text-sm text-zinc-400">{message}</p>
  );
}

export default async function DashboardPage() {
  const supabase = await createClient();
  const householdId = await getHouseholdId();

  if (!householdId) {
    return (
      <div className="mt-12 text-center text-sm text-zinc-400">
        You are not part of a household yet. Ask your administrator to add you.
      </div>
    );
  }

  const today = new Date().toISOString().split("T")[0];
  const in14Days = new Date();
  in14Days.setDate(in14Days.getDate() + 14);
  const in14DaysStr = in14Days.toISOString().split("T")[0];
  const in90Days = new Date();
  in90Days.setDate(in90Days.getDate() + 90);
  const in90DaysStr = in90Days.toISOString().split("T")[0];

  // Fetch household item IDs for scoping event queries
  const { data: householdItems } = await supabase
    .from("items")
    .select("id, name, warranty_expires_at, category_id, room_id, rooms(name), categories(name, color)")
    .eq("household_id", householdId)
    .order("name") as {
      data: {
        id: string;
        name: string;
        warranty_expires_at: string | null;
        category_id: string | null;
        room_id: string | null;
        rooms: { name: string } | null;
        categories: { name: string; color: string | null } | null;
      }[] | null
    };

  const items = householdItems ?? [];
  const itemIds = items.map((i) => i.id);

  // Mark stale pending events overdue (same as maintenance page)
  if (itemIds.length > 0) {
    await supabase
      .from("maintenance_events")
      .update({ status: "overdue" } as never)
      .eq("status", "pending")
      .lt("scheduled_date", today)
      .in("item_id", itemIds);
  }

  type EventRow = { id: string; scheduled_date: string; item_id: string; maintenance_schedules: { name: string; items: { name: string } } | null };
  type RoomRow = { id: string; name: string; floor: number | null };

  const { data: rawRooms } = await supabase
    .from("rooms")
    .select("id, name, floor")
    .eq("household_id", householdId)
    .order("name");

  const rooms = (rawRooms ?? []) as RoomRow[];

  let overdueList: EventRow[] = [];
  let upcomingList: EventRow[] = [];

  if (itemIds.length > 0) {
    const [{ data: rawOverdue }, { data: rawUpcoming }] = await Promise.all([
      supabase
        .from("maintenance_events")
        .select("id, scheduled_date, item_id, maintenance_schedules(name, items(name))")
        .eq("status", "overdue")
        .in("item_id", itemIds)
        .order("scheduled_date")
        .limit(8),
      supabase
        .from("maintenance_events")
        .select("id, scheduled_date, item_id, maintenance_schedules(name, items(name))")
        .eq("status", "pending")
        .gte("scheduled_date", today)
        .lte("scheduled_date", in14DaysStr)
        .in("item_id", itemIds)
        .order("scheduled_date")
        .limit(8),
    ]);
    overdueList = (rawOverdue ?? []) as unknown as EventRow[];
    upcomingList = (rawUpcoming ?? []) as unknown as EventRow[];
  }

  // Items with warranties expiring in the next 90 days (not yet expired)
  const warrantiesExpiringSoon = items
    .filter((i) => {
      if (!i.warranty_expires_at) return false;
      return i.warranty_expires_at >= today && i.warranty_expires_at <= in90DaysStr;
    })
    .sort((a, b) => a.warranty_expires_at!.localeCompare(b.warranty_expires_at!));

  // Items per room
  const itemsByRoom = (rooms ?? []).map((room) => ({
    ...room,
    count: items.filter((i) => (i.rooms as unknown as { name: string } | null)?.name === room.name).length,
  })).filter((r) => r.count > 0).sort((a, b) => b.count - a.count);

  const maxRoomCount = itemsByRoom[0]?.count ?? 1;

  // Items by category for pie chart
  const categoryMap = new Map<string, { name: string; color: string | null; count: number; id: string | null }>();
  for (const item of items) {
    const cat = item.categories as unknown as { name: string; color: string | null } | null;
    const key = item.category_id ?? "__none__";
    const existing = categoryMap.get(key);
    if (existing) {
      existing.count++;
    } else {
      categoryMap.set(key, { name: cat?.name ?? "Uncategorized", color: cat?.color ?? null, count: 1, id: item.category_id ?? null });
    }
  }
  const categorySlices = Array.from(categoryMap.values())
    .sort((a, b) => b.count - a.count)
    .map((s) => ({ ...s, href: s.id ? `/items?category=${s.id}` : `/items` }));

  // Items by room for pie chart
  const roomMap = new Map<string, { name: string; count: number; id: string | null }>();
  for (const item of items) {
    const key = item.room_id ?? "__none__";
    const existing = roomMap.get(key);
    if (existing) {
      existing.count++;
    } else {
      const roomName = (item.rooms as unknown as { name: string } | null)?.name ?? "No Room";
      roomMap.set(key, { name: roomName, count: 1, id: item.room_id ?? null });
    }
  }
  const roomSlices = Array.from(roomMap.values())
    .sort((a, b) => b.count - a.count)
    .map((s) => ({ ...s, color: null, href: s.id ? `/items?room=${s.id}` : `/items` }));

  function formatDate(dateStr: string) {
    return new Date(dateStr + "T00:00:00").toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
    });
  }

  function daysUntil(dateStr: string) {
    const diff = Math.ceil((new Date(dateStr + "T00:00:00").getTime() - new Date().setHours(0, 0, 0, 0)) / 86400000);
    if (diff === 0) return "Today";
    if (diff === 1) return "Tomorrow";
    if (diff < 0) return `${Math.abs(diff)}d ago`;
    return `in ${diff}d`;
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-50">Dashboard</h1>
        <p className="mt-1 text-sm text-zinc-500">
          {new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" })}
        </p>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatCard label="Total Items" value={items.length} href="/items" />
        <StatCard label="Rooms" value={(rooms ?? []).length} href="/rooms" />
        <StatCard
          label="Overdue"
          value={overdueList.length}
          href="/maintenance"
          accent={overdueList.length > 0 ? "red" : undefined}
        />
        <StatCard
          label="Due in 14 days"
          value={upcomingList.length}
          href="/maintenance"
          accent={upcomingList.length > 0 ? "amber" : undefined}
        />
      </div>

      {/* Pie charts */}
      <div className="grid gap-4 sm:grid-cols-2">
        <PieChart title="Items by Category" slices={categorySlices} />
        <PieChart title="Items by Room" slices={roomSlices} />
      </div>

      {/* Maintenance columns */}
      <div className="grid gap-6 sm:grid-cols-2">
        {/* Overdue */}
        <div className="rounded-xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
          <SectionHeader title="Overdue Maintenance" href="/maintenance" linkLabel="View all" />
          <div className="mt-3 space-y-2">
            {overdueList.length === 0 ? (
              <EmptyState message="No overdue tasks" />
            ) : (
              overdueList.map((e) => (
                <div key={e.id} className="flex items-start justify-between gap-2 rounded-lg px-2 py-1.5 hover:bg-zinc-50 dark:hover:bg-zinc-800">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-zinc-900 dark:text-zinc-100">
                      {e.maintenance_schedules?.name ?? "—"}
                    </p>
                    <p className="truncate text-xs text-zinc-500">
                      {e.maintenance_schedules?.items?.name ?? "Unknown item"}
                    </p>
                  </div>
                  <span className="shrink-0 rounded-full bg-red-50 px-2 py-0.5 text-xs font-medium text-red-600 dark:bg-red-950 dark:text-red-400">
                    {daysUntil(e.scheduled_date)}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Upcoming */}
        <div className="rounded-xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
          <SectionHeader title="Upcoming (14 days)" href="/maintenance" linkLabel="View all" />
          <div className="mt-3 space-y-2">
            {upcomingList.length === 0 ? (
              <EmptyState message="Nothing due in the next 14 days" />
            ) : (
              upcomingList.map((e) => (
                <div key={e.id} className="flex items-start justify-between gap-2 rounded-lg px-2 py-1.5 hover:bg-zinc-50 dark:hover:bg-zinc-800">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-zinc-900 dark:text-zinc-100">
                      {e.maintenance_schedules?.name ?? "—"}
                    </p>
                    <p className="truncate text-xs text-zinc-500">
                      {e.maintenance_schedules?.items?.name ?? "Unknown item"}
                    </p>
                  </div>
                  <span className="shrink-0 rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-medium text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400">
                    {formatDate(e.scheduled_date)}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Warranty expirations + Items by room */}
      <div className="grid gap-6 sm:grid-cols-2">
        {/* Warranties */}
        <div className="rounded-xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
          <SectionHeader title="Warranties Expiring (90 days)" href="/items" linkLabel="View items" />
          <div className="mt-3 space-y-2">
            {warrantiesExpiringSoon.length === 0 ? (
              <EmptyState message="No warranties expiring soon" />
            ) : (
              warrantiesExpiringSoon.map((item) => (
                <div key={item.id} className="flex items-start justify-between gap-2 rounded-lg px-2 py-1.5 hover:bg-zinc-50 dark:hover:bg-zinc-800">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-zinc-900 dark:text-zinc-100">{item.name}</p>
                    {item.rooms && (
                      <p className="truncate text-xs text-zinc-500">{(item.rooms as unknown as { name: string }).name}</p>
                    )}
                  </div>
                  <span className="shrink-0 rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700 dark:bg-amber-950 dark:text-amber-400">
                    {formatDate(item.warranty_expires_at!)}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Items by room */}
        <div className="rounded-xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
          <SectionHeader title="Items by Room" href="/rooms" linkLabel="View rooms" />
          <div className="mt-3 space-y-3">
            {itemsByRoom.length === 0 ? (
              <EmptyState message="No items assigned to rooms yet" />
            ) : (
              itemsByRoom.map((room) => (
                <div key={room.id}>
                  <div className="mb-1 flex items-center justify-between text-xs">
                    <span className="font-medium text-zinc-700 dark:text-zinc-300">
                      {room.name}
                      {room.floor !== null && (
                        <span className="ml-1 text-zinc-400">· floor {room.floor}</span>
                      )}
                    </span>
                    <span className="tabular-nums text-zinc-500">{room.count}</span>
                  </div>
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800">
                    <div
                      className="h-full rounded-full bg-zinc-400 dark:bg-zinc-500"
                      style={{ width: `${Math.round((room.count / maxRoomCount) * 100)}%` }}
                    />
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
