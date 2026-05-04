"use server";

import { createClient } from "@/lib/supabase/server";
import { getHouseholdId } from "@/lib/household";
import { revalidatePath } from "next/cache";

export async function createRoom(formData: FormData) {
  const supabase = await createClient();
  const householdId = await getHouseholdId();
  if (!householdId) throw new Error("No household found");

  const { error } = await supabase.from("rooms").insert({
    household_id: householdId,
    name: formData.get("name") as string,
    floor: formData.get("floor") ? Number(formData.get("floor")) : null,
    icon: (formData.get("icon") as string) || null,
  } as never);

  if (error) throw new Error(error.message);
  revalidatePath("/rooms");
}

export async function updateRoom(id: string, formData: FormData) {
  const supabase = await createClient();
  const householdId = await getHouseholdId();
  if (!householdId) throw new Error("No household found");

  const { error } = await supabase
    .from("rooms")
    .update({
      name: formData.get("name") as string,
      floor: formData.get("floor") ? Number(formData.get("floor")) : null,
      icon: (formData.get("icon") as string) || null,
    } as never)
    .eq("id", id)
    .eq("household_id", householdId);

  if (error) throw new Error(error.message);
  revalidatePath("/rooms");
}

export async function deleteRoom(id: string) {
  const supabase = await createClient();
  const householdId = await getHouseholdId();
  if (!householdId) throw new Error("No household found");

  const { error } = await supabase
    .from("rooms")
    .delete()
    .eq("id", id)
    .eq("household_id", householdId);

  if (error) throw new Error(error.message);
  revalidatePath("/rooms");
}
