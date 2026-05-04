import { createClient } from "@/lib/supabase/server";
import { getHouseholdId } from "@/lib/household";
import { ItemsClient } from "./items-client";
import type { Item, Room, Category, Tag } from "@/types/database";

interface RawItem extends Item {
  rooms: { name: string } | null;
  categories: { name: string; color: string | null; icon: string | null } | null;
  item_tags: { tags: { id: string; name: string; color: string | null } }[];
  item_attachments: { id: string; storage_path: string; is_primary_image: boolean; mime_type: string }[];
}

export default async function ItemsPage() {
  const supabase = await createClient();
  const householdId = await getHouseholdId();

  if (!householdId) {
    return (
      <div className="mt-12 text-center text-sm text-zinc-400">
        You are not part of a household yet. Ask your administrator to add you.
      </div>
    );
  }

  const [{ data: rawItems }, { data: rooms }, { data: categories }, { data: tags }] = await Promise.all([
    supabase
      .from("items")
      .select(`
        *,
        rooms(name),
        categories(name, color, icon),
        item_tags(tags(id, name, color)),
        item_attachments(id, storage_path, is_primary_image, mime_type)
      `)
      .eq("household_id", householdId)
      .order("name"),
    supabase.from("rooms").select("*").eq("household_id", householdId).order("name"),
    supabase.from("categories").select("*").eq("household_id", householdId).order("name"),
    supabase.from("tags").select("*").eq("household_id", householdId).order("name"),
  ]);

  // Generate signed URLs for primary images
  const items = await Promise.all(
    ((rawItems ?? []) as RawItem[]).map(async (item) => {
      const primary = item.item_attachments?.find((a) => a.is_primary_image);
      let primaryImageUrl: string | null = null;

      if (primary) {
        const { data } = await supabase.storage
          .from("item-images")
          .createSignedUrl(primary.storage_path, 3600);
        primaryImageUrl = data?.signedUrl ?? null;
      }

      return {
        ...item,
        room_name: item.rooms?.name ?? null,
        category_name: item.categories?.name ?? null,
        category_color: item.categories?.color ?? null,
        tags: item.item_tags?.map((it) => it.tags).filter(Boolean) ?? [],
        primary_image_path: primary?.storage_path ?? null,
        primary_image_url: primaryImageUrl,
      };
    }),
  );

  return (
    <ItemsClient
      items={items}
      rooms={(rooms ?? []) as Room[]}
      categories={(categories ?? []) as Category[]}
      tags={(tags ?? []) as Tag[]}
    />
  );
}
