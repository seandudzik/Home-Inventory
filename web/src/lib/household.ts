import { createClient } from "@/lib/supabase/server";

export async function getHouseholdId(): Promise<string | null> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data } = await supabase
    .from("household_members")
    .select("household_id")
    .eq("user_id", user.id)
    .limit(1)
    .single();

  return (data as { household_id: string } | null)?.household_id ?? null;
}
