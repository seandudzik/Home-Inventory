import { createClient } from "@/lib/supabase/server";
import { getHouseholdId } from "@/lib/household";
import { CategoriesClient } from "./categories-client";
import type { Category } from "@/types/database";

export default async function CategoriesPage() {
  const supabase = await createClient();
  const householdId = await getHouseholdId();

  if (!householdId) {
    return (
      <div className="mt-12 text-center text-sm text-zinc-400">
        You are not part of a household yet. Ask your administrator to add you.
      </div>
    );
  }

  const { data: categories } = await supabase
    .from("categories")
    .select("*")
    .eq("household_id", householdId)
    .order("name");

  const { data: itemCounts } = await supabase
    .from("items")
    .select("category_id")
    .eq("household_id", householdId)
    .not("category_id", "is", null);

  const countMap = ((itemCounts ?? []) as { category_id: string }[]).reduce<Record<string, number>>(
    (acc, { category_id }) => {
      acc[category_id] = (acc[category_id] ?? 0) + 1;
      return acc;
    },
    {},
  );

  const categoriesWithCount = ((categories ?? []) as Category[]).map((cat) => ({
    ...cat,
    item_count: countMap[cat.id] ?? 0,
  }));

  return <CategoriesClient categories={categoriesWithCount} />;
}
