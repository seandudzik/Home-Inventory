"use server";

import { createClient } from "@/lib/supabase/server";
import { getHouseholdId } from "@/lib/household";
import { revalidatePath } from "next/cache";
import type { ItemAttachment } from "@/types/database";

export async function createItem(formData: FormData): Promise<string> {
  const supabase = await createClient();
  const householdId = await getHouseholdId();
  if (!householdId) throw new Error("No household found");

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const { data, error } = await supabase
    .from("items")
    .insert({
      household_id: householdId,
      created_by: user.id,
      name: formData.get("name") as string,
      description: (formData.get("description") as string) || null,
      brand: (formData.get("brand") as string) || null,
      model: (formData.get("model") as string) || null,
      serial_number: (formData.get("serial_number") as string) || null,
      room_id: (formData.get("room_id") as string) || null,
      category_id: (formData.get("category_id") as string) || null,
      purchase_date: (formData.get("purchase_date") as string) || null,
      purchase_price: formData.get("purchase_price") ? Number(formData.get("purchase_price")) : null,
      warranty_expires_at: (formData.get("warranty_expires_at") as string) || null,
      notes: (formData.get("notes") as string) || null,
    } as never)
    .select("id")
    .single();

  if (error) throw new Error(error.message);
  const item = data as { id: string };

  // Sync tags
  const tagIds = (formData.getAll("tag_ids") as string[]).filter(Boolean);
  if (tagIds.length > 0) {
    await supabase.from("item_tags").insert(
      tagIds.map((tag_id) => ({ item_id: item.id, tag_id } as never)),
    );
  }

  revalidatePath("/items");
  return item.id;
}

export async function updateItem(id: string, formData: FormData) {
  const supabase = await createClient();
  const householdId = await getHouseholdId();
  if (!householdId) throw new Error("No household found");

  const { error } = await supabase
    .from("items")
    .update({
      name: formData.get("name") as string,
      description: (formData.get("description") as string) || null,
      brand: (formData.get("brand") as string) || null,
      model: (formData.get("model") as string) || null,
      serial_number: (formData.get("serial_number") as string) || null,
      room_id: (formData.get("room_id") as string) || null,
      category_id: (formData.get("category_id") as string) || null,
      purchase_date: (formData.get("purchase_date") as string) || null,
      purchase_price: formData.get("purchase_price") ? Number(formData.get("purchase_price")) : null,
      warranty_expires_at: (formData.get("warranty_expires_at") as string) || null,
      notes: (formData.get("notes") as string) || null,
    } as never)
    .eq("id", id)
    .eq("household_id", householdId);

  if (error) throw new Error(error.message);

  // Replace tags
  const tagIds = (formData.getAll("tag_ids") as string[]).filter(Boolean);
  await supabase.from("item_tags").delete().eq("item_id", id);
  if (tagIds.length > 0) {
    await supabase.from("item_tags").insert(
      tagIds.map((tag_id) => ({ item_id: id, tag_id } as never)),
    );
  }

  revalidatePath(`/items/${id}`);
  revalidatePath("/items");
}

export async function deleteItem(id: string, householdId: string) {
  const supabase = await createClient();

  // Delete all storage objects for this item
  const { data: attachments } = await supabase
    .from("item_attachments")
    .select("storage_path, mime_type")
    .eq("item_id", id);

  for (const att of (attachments ?? []) as Pick<ItemAttachment, "storage_path" | "mime_type">[]) {
    const bucket = att.mime_type.startsWith("image/") ? "item-images" : "item-documents";
    await supabase.storage.from(bucket).remove([att.storage_path]);
  }

  const { error } = await supabase
    .from("items")
    .delete()
    .eq("id", id)
    .eq("household_id", householdId);

  if (error) throw new Error(error.message);
  revalidatePath("/items");
}

export async function recordAttachment(
  itemId: string,
  storagePath: string,
  fileName: string,
  mimeType: string,
  sizeBytes: number,
  makePrimary: boolean,
) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  // Clear existing primary if needed
  if (makePrimary) {
    await supabase
      .from("item_attachments")
      .update({ is_primary_image: false } as never)
      .eq("item_id", itemId)
      .eq("is_primary_image", true);
  }

  const { error } = await supabase.from("item_attachments").insert({
    item_id: itemId,
    storage_path: storagePath,
    file_name: fileName,
    mime_type: mimeType,
    size_bytes: sizeBytes,
    is_primary_image: makePrimary,
    uploaded_by: user.id,
  } as never);

  if (error) throw new Error(error.message);
  revalidatePath(`/items/${itemId}`);
}

export async function deleteAttachment(attachmentId: string, storagePath: string, mimeType: string, itemId: string) {
  const supabase = await createClient();

  const bucket = mimeType.startsWith("image/") ? "item-images" : "item-documents";
  await supabase.storage.from(bucket).remove([storagePath]);

  const { error } = await supabase
    .from("item_attachments")
    .delete()
    .eq("id", attachmentId);

  if (error) throw new Error(error.message);
  revalidatePath(`/items/${itemId}`);
}

export async function setPrimaryImage(itemId: string, attachmentId: string) {
  const supabase = await createClient();

  await supabase
    .from("item_attachments")
    .update({ is_primary_image: false } as never)
    .eq("item_id", itemId);

  const { error } = await supabase
    .from("item_attachments")
    .update({ is_primary_image: true } as never)
    .eq("id", attachmentId);

  if (error) throw new Error(error.message);
  revalidatePath(`/items/${itemId}`);
  revalidatePath("/items");
}
