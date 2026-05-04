import { createClient } from "@/lib/supabase/server";
import { getHouseholdId } from "@/lib/household";
import { notFound } from "next/navigation";
import { ItemDetailClient } from "./item-detail-client";
import type { Item, Room, Category, Tag, ItemAttachment, MaintenanceSchedule } from "@/types/database";

interface RawItem extends Item {
  item_tags: { tags: Tag }[];
  item_attachments: ItemAttachment[];
}

export default async function ItemDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const householdId = await getHouseholdId();
  if (!householdId) notFound();

  const [{ data: rawItem }, { data: rooms }, { data: categories }, { data: tags }, { data: schedules }] =
    await Promise.all([
      supabase
        .from("items")
        .select(`*, item_tags(tags(*)), item_attachments(*)`)
        .eq("id", id)
        .eq("household_id", householdId)
        .single(),
      supabase.from("rooms").select("*").eq("household_id", householdId).order("name"),
      supabase.from("categories").select("*").eq("household_id", householdId).order("name"),
      supabase.from("tags").select("*").eq("household_id", householdId).order("name"),
      supabase
        .from("maintenance_schedules")
        .select("*")
        .eq("item_id", id)
        .order("name"),
    ]);

  if (!rawItem) notFound();

  const item = rawItem as RawItem;
  const itemTags = item.item_tags.map((it) => it.tags).filter(Boolean) as Tag[];
  const rawAttachments = (item.item_attachments ?? []) as ItemAttachment[];

  const attachments = await Promise.all(
    rawAttachments.map(async (att) => {
      const bucket = att.mime_type.startsWith("image/") ? "item-images" : "item-documents";
      const { data } = await supabase.storage.from(bucket).createSignedUrl(att.storage_path, 3600);
      return { ...att, url: data?.signedUrl ?? "" };
    }),
  );

  attachments.sort((a, b) => {
    if (a.is_primary_image) return -1;
    if (b.is_primary_image) return 1;
    return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
  });

  return (
    <ItemDetailClient
      item={item}
      rooms={(rooms ?? []) as Room[]}
      categories={(categories ?? []) as Category[]}
      allTags={(tags ?? []) as Tag[]}
      itemTags={itemTags}
      attachments={attachments}
      householdId={householdId}
      schedules={(schedules ?? []) as MaintenanceSchedule[]}
    />
  );
}
