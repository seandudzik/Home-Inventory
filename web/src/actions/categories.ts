"use server";

import { createClient } from "@/lib/supabase/server";
import { getHouseholdId } from "@/lib/household";
import { revalidatePath } from "next/cache";

export async function createCategory(formData: FormData) {
  const supabase = await createClient();
  const householdId = await getHouseholdId();
  if (!householdId) throw new Error("No household found");

  const { error } = await supabase.from("categories").insert({
    household_id: householdId,
    name: formData.get("name") as string,
    parent_category_id: (formData.get("parent_category_id") as string) || null,
    icon: (formData.get("icon") as string) || null,
    color: (formData.get("color") as string) || null,
  } as never);

  if (error) throw new Error(error.message);
  revalidatePath("/categories");
}

export async function updateCategory(id: string, formData: FormData) {
  const supabase = await createClient();
  const householdId = await getHouseholdId();
  if (!householdId) throw new Error("No household found");

  const { error } = await supabase
    .from("categories")
    .update({
      name: formData.get("name") as string,
      parent_category_id: (formData.get("parent_category_id") as string) || null,
      icon: (formData.get("icon") as string) || null,
      color: (formData.get("color") as string) || null,
    } as never)
    .eq("id", id)
    .eq("household_id", householdId);

  if (error) throw new Error(error.message);
  revalidatePath("/categories");
}

export async function deleteCategory(id: string) {
  const supabase = await createClient();
  const householdId = await getHouseholdId();
  if (!householdId) throw new Error("No household found");

  const { error } = await supabase
    .from("categories")
    .delete()
    .eq("id", id)
    .eq("household_id", householdId);

  if (error) throw new Error(error.message);
  revalidatePath("/categories");
}
