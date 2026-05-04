import SwiftUI
import Supabase

private let systemInstruction = """
You are a friendly and knowledgeable home assistant AI for a household. You have been given a live snapshot of the household's home inventory, room layout, and maintenance schedule.

Your capabilities:
- Help locate items ("Where is the...?")
- Answer questions about specific items (brand, model, warranty status, notes)
- Summarize what's in a room or category
- Remind about upcoming or overdue maintenance
- Suggest maintenance best practices
- Help think through home organization and purchasing decisions

Guidelines:
- Be concise and conversational
- When referencing items, include the room they're stored in when relevant
- If asked about something not in the inventory, say so clearly
- Use the household data below as your primary source of truth
"""

private let suggestions = [
    "What's coming up for maintenance?",
    "Do I have anything with an expiring warranty?",
    "What items are overdue for service?",
    "Summarize my home inventory",
]

struct ChatView: View {
    @Environment(AppState.self) private var appState
    @State private var messages: [ChatMessage] = []
    @State private var input = ""
    @State private var isStreaming = false
    @State private var householdContext: String? = nil
    @FocusState private var inputFocused: Bool

    var body: some View {
        NavigationStack {
            VStack(spacing: 0) {
                if messages.isEmpty {
                    emptyState
                } else {
                    messageList
                }
                inputBar
            }
            .navigationTitle("Assistant")
            .task { await buildContext() }
        }
    }

    // MARK: - Empty state

    private var emptyState: some View {
        VStack(spacing: 20) {
            Spacer()
            Image(systemName: "bubble.left.and.bubble.right.fill")
                .font(.system(size: 48))
                .foregroundStyle(.secondary)
            Text("Ask me anything about your home")
                .font(.headline)
            Text("I have live access to your inventory and maintenance schedule.")
                .font(.subheadline)
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)
                .padding(.horizontal, 32)
            VStack(spacing: 10) {
                ForEach(suggestions, id: \.self) { s in
                    Button(s) { send(s) }
                        .buttonStyle(.bordered)
                        .tint(.primary)
                }
            }
            Spacer()
        }
    }

    // MARK: - Message list

    private var messageList: some View {
        ScrollViewReader { proxy in
            ScrollView {
                LazyVStack(alignment: .leading, spacing: 12) {
                    ForEach(messages) { msg in
                        MessageBubble(message: msg)
                            .id(msg.id)
                    }
                }
                .padding()
            }
            .onChange(of: messages.last?.content) {
                if let last = messages.last {
                    withAnimation { proxy.scrollTo(last.id, anchor: .bottom) }
                }
            }
        }
    }

    // MARK: - Input bar

    private var inputBar: some View {
        VStack(spacing: 0) {
            Divider()
            HStack(alignment: .bottom, spacing: 8) {
                TextField("Ask about your home…", text: $input, axis: .vertical)
                    .lineLimit(1...5)
                    .focused($inputFocused)
                    .padding(.horizontal, 12)
                    .padding(.vertical, 8)
                    .background(Color(.secondarySystemBackground))
                    .clipShape(RoundedRectangle(cornerRadius: 20))
                    .onSubmit { if !isStreaming { send(input) } }

                Button {
                    send(input)
                } label: {
                    Image(systemName: "arrow.up.circle.fill")
                        .font(.system(size: 32))
                        .foregroundStyle(input.trimmingCharacters(in: .whitespaces).isEmpty || isStreaming ? Color.secondary : Color.primary)
                }
                .disabled(input.trimmingCharacters(in: .whitespaces).isEmpty || isStreaming)
            }
            .padding(.horizontal, 12)
            .padding(.vertical, 8)
        }
    }

    // MARK: - Send

    private func send(_ text: String) {
        let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty, !isStreaming else { return }
        input = ""

        messages.append(ChatMessage(role: "user", content: trimmed))
        messages.append(ChatMessage(role: "model", content: ""))
        isStreaming = true

        Task { await stream(userText: trimmed) }
    }

    // MARK: - Gemini streaming

    private func stream(userText: String) async {
        guard !geminiAPIKey.isEmpty else {
            updateLastMessage("Gemini API key not configured. Add it to SupabaseClient.swift.")
            isStreaming = false
            return
        }

        let context = householdContext ?? "No household data available."
        let fullSystem = systemInstruction + "\n\n--- HOUSEHOLD DATA ---\n" + context + "\n--- END HOUSEHOLD DATA ---"

        // Build contents array from message history
        let historyMessages = messages.dropLast() // exclude the empty placeholder
        let contents: [[String: Any]] = historyMessages.map { msg in
            ["role": msg.role, "parts": [["text": msg.content]]]
        }

        let body: [String: Any] = [
            "system_instruction": ["parts": [["text": fullSystem]]],
            "contents": contents,
        ]

        guard let bodyData = try? JSONSerialization.data(withJSONObject: body),
              let url = URL(string: "https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:streamGenerateContent?alt=sse&key=\(geminiAPIKey)") else {
            updateLastMessage("Failed to build request.")
            isStreaming = false
            return
        }

        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = bodyData

        do {
            let (bytes, _) = try await URLSession.shared.bytes(for: request)
            for try await line in bytes.lines {
                guard line.hasPrefix("data: ") else { continue }
                let json = String(line.dropFirst(6))
                if json == "[DONE]" { break }
                if let data = json.data(using: .utf8),
                   let chunk = try? JSONDecoder().decode(GeminiChunk.self, from: data),
                   let text = chunk.candidates?.first?.content?.parts?.first?.text {
                    appendToLastMessage(text)
                }
            }
        } catch {
            appendToLastMessage("\n\n[Error: \(error.localizedDescription)]")
        }
        isStreaming = false
    }

    private func appendToLastMessage(_ text: String) {
        guard !messages.isEmpty else { return }
        messages[messages.count - 1].content += text
    }

    private func updateLastMessage(_ text: String) {
        guard !messages.isEmpty else { return }
        messages[messages.count - 1].content = text
    }

    // MARK: - Context builder

    private func buildContext() async {
        guard let householdId = appState.householdId else { return }
        let hid = householdId
        let today = DateFormatter.iso8601Date.string(from: .now)
        let in30 = DateFormatter.iso8601Date.string(from: Calendar.current.date(byAdding: .day, value: 30, to: .now)!)

        do {
            let items: [Item] = try await supabase
                .from("items")
                .select("*, rooms(name), categories(name)")
                .eq("household_id", value: hid)
                .execute()
                .value

            struct RoomRow: Decodable { let name: String; let floor: Int? }
            let rooms: [RoomRow] = try await supabase
                .from("rooms").select("name, floor").eq("household_id", value: hid).execute().value

            let itemIds = items.map { $0.id.uuidString.lowercased() }
            var overdueEvents: [MaintenanceEvent] = []
            var upcomingEvents: [MaintenanceEvent] = []

            if !itemIds.isEmpty {
                overdueEvents = (try? await supabase
                    .from("maintenance_events")
                    .select("*, maintenance_schedules(name, items(name))")
                    .eq("status", value: "overdue")
                    .in("item_id", values: itemIds)
                    .limit(20)
                    .execute()
                    .value) ?? []

                upcomingEvents = (try? await supabase
                    .from("maintenance_events")
                    .select("*, maintenance_schedules(name, items(name))")
                    .eq("status", value: "pending")
                    .gte("scheduled_date", value: today)
                    .lte("scheduled_date", value: in30)
                    .in("item_id", values: itemIds)
                    .order("scheduled_date")
                    .limit(20)
                    .execute()
                    .value) ?? []
            }

            var lines: [String] = []
            lines.append("TODAY: \(DateFormatter.display.string(from: .now))")
            lines.append("")

            if !rooms.isEmpty {
                lines.append("ROOMS IN THE HOME:")
                rooms.forEach { r in
                    lines.append("  - \(r.name)\(r.floor.map { " (floor \($0))" } ?? "")")
                }
                lines.append("")
            }

            if !items.isEmpty {
                lines.append("INVENTORY (\(items.count) items):")
                items.forEach { item in
                    var parts = ["  - \(item.name)"]
                    if let b = item.brand, let m = item.model { parts.append("(\(b) \(m))") }
                    else if let b = item.brand { parts.append("(\(b))") }
                    if let r = item.room { parts.append("in \(r.name)") }
                    if let c = item.category { parts.append("[\(c.name)]") }
                    if let w = item.warrantyExpiresAt {
                        let expired = w < today
                        parts.append("warranty \(expired ? "expired" : "until") \(w)")
                    }
                    lines.append(parts.joined(separator: " "))
                }
                lines.append("")
            }

            if !overdueEvents.isEmpty {
                lines.append("OVERDUE MAINTENANCE:")
                overdueEvents.forEach { e in
                    if let s = e.schedule {
                        lines.append("  - \(s.name) for \(s.item?.name ?? "?") (was due \(e.scheduledDate))")
                    }
                }
                lines.append("")
            }

            if !upcomingEvents.isEmpty {
                lines.append("UPCOMING MAINTENANCE (next 30 days):")
                upcomingEvents.forEach { e in
                    if let s = e.schedule {
                        lines.append("  - \(e.scheduledDate): \(s.name) for \(s.item?.name ?? "?")")
                    }
                }
            }

            householdContext = lines.joined(separator: "\n")
        } catch {
            householdContext = "Could not load household data."
        }
    }
}

// MARK: - Message bubble

private struct MessageBubble: View {
    let message: ChatMessage

    var isUser: Bool { message.role == "user" }

    var body: some View {
        HStack {
            if isUser { Spacer(minLength: 60) }
            Text(message.content.isEmpty ? " " : message.content)
                .padding(.horizontal, 14)
                .padding(.vertical, 10)
                .background(isUser ? Color.primary : Color(.secondarySystemBackground))
                .foregroundStyle(isUser ? Color(UIColor.systemBackground) : .primary)
                .clipShape(RoundedRectangle(cornerRadius: 18))
            if !isUser { Spacer(minLength: 60) }
        }
        .frame(maxWidth: .infinity, alignment: isUser ? .trailing : .leading)
    }
}

// MARK: - Gemini response types

private struct GeminiChunk: Decodable {
    let candidates: [Candidate]?
    struct Candidate: Decodable {
        let content: Content?
        struct Content: Decodable {
            let parts: [Part]?
            struct Part: Decodable { let text: String? }
        }
    }
}
