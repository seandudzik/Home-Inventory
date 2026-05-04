import { NextRequest } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

interface ChatMessage {
  role: "user" | "model";
  content: string;
}

// Build a rich context string from the household's live data
async function buildHouseholdContext(supabase: ReturnType<typeof createServerClient>) {
  const today = new Date().toISOString().split("T")[0];
  const in30Days = new Date();
  in30Days.setDate(in30Days.getDate() + 30);
  const in30DaysStr = in30Days.toISOString().split("T")[0];

  const [
    { data: items },
    { data: rooms },
    { data: categories },
    { data: tags },
    { data: overdueEvents },
    { data: upcomingEvents },
  ] = await Promise.all([
    supabase.from("items").select("name, brand, model, room_id, category_id, purchase_date, warranty_expires_at, notes, rooms(name), categories(name)"),
    supabase.from("rooms").select("name, floor"),
    supabase.from("categories").select("name, parent_category_id"),
    supabase.from("tags").select("name"),
    supabase.from("maintenance_events").select("scheduled_date, maintenance_schedules(name, items(name))").eq("status", "overdue").limit(20),
    supabase.from("maintenance_events").select("scheduled_date, maintenance_schedules(name, items(name))").eq("status", "pending").gte("scheduled_date", today).lte("scheduled_date", in30DaysStr).order("scheduled_date").limit(20),
  ]);

  const lines: string[] = [];

  lines.push(`TODAY: ${new Date().toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}`);
  lines.push("");

  // Rooms
  if (rooms && rooms.length > 0) {
    lines.push("ROOMS IN THE HOME:");
    (rooms as { name: string; floor: number | null }[]).forEach((r) => {
      lines.push(`  - ${r.name}${r.floor !== null ? ` (floor ${r.floor})` : ""}`);
    });
    lines.push("");
  }

  // Categories
  if (categories && categories.length > 0) {
    lines.push(`ITEM CATEGORIES: ${(categories as { name: string }[]).map((c) => c.name).join(", ")}`);
    lines.push("");
  }

  // Items
  if (items && items.length > 0) {
    lines.push(`INVENTORY (${items.length} items):`);
    (items as { name: string; brand: string | null; model: string | null; warranty_expires_at: string | null; notes: string | null; rooms: { name: string } | null; categories: { name: string } | null }[]).forEach((item) => {
      const parts: string[] = [`  - ${item.name}`];
      if (item.brand || item.model) parts.push(`(${[item.brand, item.model].filter(Boolean).join(" ")})`);
      if (item.rooms) parts.push(`in ${item.rooms.name}`);
      if (item.categories) parts.push(`[${item.categories.name}]`);
      if (item.warranty_expires_at) {
        const expired = new Date(item.warranty_expires_at) < new Date();
        parts.push(`warranty ${expired ? "expired" : "until"} ${item.warranty_expires_at}`);
      }
      lines.push(parts.join(" "));
      if (item.notes) lines.push(`    Notes: ${item.notes}`);
    });
    lines.push("");
  }

  // Overdue maintenance
  if (overdueEvents && overdueEvents.length > 0) {
    lines.push("⚠️  OVERDUE MAINTENANCE:");
    (overdueEvents as { scheduled_date: string; maintenance_schedules: { name: string; items: { name: string } } | null }[]).forEach((e) => {
      if (e.maintenance_schedules) {
        lines.push(`  - ${e.maintenance_schedules.name} for ${e.maintenance_schedules.items?.name} (was due ${e.scheduled_date})`);
      }
    });
    lines.push("");
  }

  // Upcoming maintenance
  if (upcomingEvents && upcomingEvents.length > 0) {
    lines.push("📅 UPCOMING MAINTENANCE (next 30 days):");
    (upcomingEvents as { scheduled_date: string; maintenance_schedules: { name: string; items: { name: string } } | null }[]).forEach((e) => {
      if (e.maintenance_schedules) {
        lines.push(`  - ${e.scheduled_date}: ${e.maintenance_schedules.name} for ${e.maintenance_schedules.items?.name}`);
      }
    });
    lines.push("");
  }

  if (tags && tags.length > 0) {
    lines.push(`TAGS IN USE: ${(tags as { name: string }[]).map((t) => t.name).join(", ")}`);
  }

  return lines.join("\n");
}

const SYSTEM_INSTRUCTION = `You are a friendly and knowledgeable home assistant AI for a household. You have been given a live snapshot of the household's home inventory, room layout, and maintenance schedule.

Your capabilities:
- Help locate items ("Where is the...?")
- Answer questions about specific items (brand, model, warranty status, notes)
- Summarize what's in a room or category
- Remind about upcoming or overdue maintenance
- Suggest maintenance best practices
- Help think through home organization and purchasing decisions
- Answer general home improvement and maintenance questions

Guidelines:
- Be concise and conversational — this is a chat interface, not a report
- When referencing items, include the room they're stored in when relevant
- If asked about something not in the inventory, say so clearly and offer to help add it
- Format lists with line breaks for readability
- Use the household data below as your primary source of truth`;

export async function POST(request: NextRequest) {
  const cookieStore = await cookies();

  // Auth check via Supabase
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: () => {},
      },
    },
  );

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return new Response("Unauthorized", { status: 401 });
  }

  const { messages }: { messages: ChatMessage[] } = await request.json();
  if (!messages?.length) {
    return new Response("No messages", { status: 400 });
  }

  const householdContext = await buildHouseholdContext(supabase);
  const systemWithContext = `${SYSTEM_INSTRUCTION}\n\n--- HOUSEHOLD DATA ---\n${householdContext}\n--- END HOUSEHOLD DATA ---`;

  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);
  const model = genAI.getGenerativeModel({
    model: "gemini-1.5-flash",
    systemInstruction: systemWithContext,
  });

  // Convert our message format to Gemini's history format
  // The last message is the new user turn; history is everything before it
  const history = messages.slice(0, -1).map((m) => ({
    role: m.role,
    parts: [{ text: m.content }],
  }));
  const lastMessage = messages[messages.length - 1].content;

  const chat = model.startChat({ history });
  const result = await chat.sendMessageStream(lastMessage);

  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();
      try {
        for await (const chunk of result.stream) {
          const text = chunk.text();
          if (text) controller.enqueue(encoder.encode(text));
        }
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-cache",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
