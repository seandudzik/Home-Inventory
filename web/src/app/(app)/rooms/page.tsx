import { createClient } from "@/lib/supabase/server";
import { getHouseholdId } from "@/lib/household";
import { RoomsClient } from "./rooms-client";
import type { Room } from "@/types/database";

export default async function RoomsPage() {
  const supabase = await createClient();
  const householdId = await getHouseholdId();

  if (!householdId) {
    return (
      <div className="mt-12 text-center text-sm text-zinc-400">
        You are not part of a household yet. Ask your administrator to add you.
      </div>
    );
  }

  const { data: rooms } = await supabase
    .from("rooms")
    .select("*")
    .eq("household_id", householdId)
    .order("floor", { ascending: true, nullsFirst: false })
    .order("name");

  const { data: itemCounts } = await supabase
    .from("items")
    .select("room_id")
    .eq("household_id", householdId)
    .not("room_id", "is", null);

  const countMap = ((itemCounts ?? []) as { room_id: string }[]).reduce<Record<string, number>>(
    (acc, { room_id }) => {
      acc[room_id] = (acc[room_id] ?? 0) + 1;
      return acc;
    },
    {},
  );

  const roomsWithCount = ((rooms ?? []) as Room[]).map((room) => ({
    ...room,
    item_count: countMap[room.id] ?? 0,
  }));

  return <RoomsClient rooms={roomsWithCount} />;
}
