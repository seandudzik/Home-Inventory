"use server";

import { createClient } from "@/lib/supabase/server";
import { getHouseholdId } from "@/lib/household";
import type { Tag } from "@/types/database";

export async function upsertTag(name: string, color?: string): Promise<Tag> {
  const supabase = await createClient();
  const householdId = await getHouseholdId();
  if (!householdId) throw new Error("No household found");

  const { data, error } = await supabase
    .from("tags")
    .upsert(
      { household_id: householdId, name: name.trim(), color: color ?? null } as never,
      { onConflict: "household_id,name" },
    )
    .select()
    .single();

  if (error) throw new Error(error.message);
  return data as Tag;
}
