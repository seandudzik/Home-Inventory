import SwiftUI
import Supabase

struct MaintenanceView: View {
    @Environment(AppState.self) private var appState
    @State private var events: [MaintenanceEvent] = []
    @State private var isLoading = true
    @State private var completingId: UUID? = nil
    @State private var showCompleteSheet: MaintenanceEvent? = nil

    var overdueEvents: [MaintenanceEvent] { events.filter { $0.isOverdue } }
    var upcomingEvents: [MaintenanceEvent] { events.filter { !$0.isOverdue } }

    var body: some View {
        NavigationStack {
            Group {
                if isLoading {
                    ProgressView()
                } else if events.isEmpty {
                    ContentUnavailableView(
                        "All Clear",
                        systemImage: "checkmark.seal",
                        description: Text("No overdue or upcoming maintenance.")
                    )
                } else {
                    List {
                        if !overdueEvents.isEmpty {
                            Section {
                                ForEach(overdueEvents) { event in
                                    MaintenanceEventRow(event: event) {
                                        showCompleteSheet = event
                                    }
                                }
                            } header: {
                                Label("Overdue", systemImage: "exclamationmark.triangle.fill")
                                    .foregroundStyle(.red)
                            }
                        }
                        if !upcomingEvents.isEmpty {
                            Section("Upcoming") {
                                ForEach(upcomingEvents) { event in
                                    MaintenanceEventRow(event: event) {
                                        showCompleteSheet = event
                                    }
                                }
                            }
                        }
                    }
                }
            }
            .navigationTitle("Maintenance")
            .task { await loadEvents() }
            .refreshable { await loadEvents() }
            .sheet(item: $showCompleteSheet) { event in
                CompleteEventSheet(event: event) {
                    await loadEvents()
                }
            }
        }
    }

    private func loadEvents() async {
        guard let householdId = appState.householdId else { return }
        isLoading = true

        let today = DateFormatter.iso8601Date.string(from: .now)
        let in90 = DateFormatter.iso8601Date.string(from: Calendar.current.date(byAdding: .day, value: 90, to: .now)!)

        do {
            struct ItemIdRow: Decodable { let id: UUID }
            let items: [ItemIdRow] = try await supabase
                .from("items")
                .select("id")
                .eq("household_id", value: householdId)
                .execute()
                .value

            let itemIds = items.map { $0.id.uuidString.lowercased() }
            guard !itemIds.isEmpty else { isLoading = false; return }

            // Mark stale as overdue
            try await supabase
                .from("maintenance_events")
                .update(["status": "overdue"])
                .eq("status", value: "pending")
                .lt("scheduled_date", value: today)
                .in("item_id", values: itemIds)
                .execute()

            let result: [MaintenanceEvent] = try await supabase
                .from("maintenance_events")
                .select("*, maintenance_schedules(name, estimated_cost, items(id, name))")
                .in("item_id", values: itemIds)
                .or("status.eq.overdue,and(status.eq.pending,scheduled_date.lte.\(in90))")
                .order("scheduled_date")
                .execute()
                .value
            events = result
        } catch {
            print("Error loading maintenance: \(error)")
        }
        isLoading = false
    }
}

private struct MaintenanceEventRow: View {
    let event: MaintenanceEvent
    let onComplete: () -> Void

    var body: some View {
        HStack(alignment: .center, spacing: 12) {
            VStack(alignment: .leading, spacing: 2) {
                Text(event.schedule?.name ?? "—").font(.subheadline.weight(.medium))
                Text(event.schedule?.item?.name ?? "Unknown item")
                    .font(.caption)
                    .foregroundStyle(.secondary)
                Text(event.scheduledDateFormatted)
                    .font(.caption2)
                    .foregroundStyle(event.isOverdue ? .red : .secondary)
            }
            Spacer()
            Button {
                onComplete()
            } label: {
                Image(systemName: "checkmark.circle")
                    .font(.title2)
                    .foregroundStyle(.green)
            }
            .buttonStyle(.borderless)
        }
        .padding(.vertical, 2)
    }
}

private struct CompleteEventSheet: View {
    let event: MaintenanceEvent
    let onDone: () async -> Void
    @Environment(\.dismiss) private var dismiss
    @State private var actualCost = ""
    @State private var notes = ""
    @State private var isSaving = false

    var body: some View {
        NavigationStack {
            Form {
                Section("Completing") {
                    HStack {
                        Text(event.schedule?.name ?? "—").font(.headline)
                        Spacer()
                    }
                    Text(event.schedule?.item?.name ?? "")
                        .foregroundStyle(.secondary)
                }
                Section("Optional Details") {
                    HStack {
                        Text("$")
                        TextField("Actual cost", text: $actualCost)
                            .keyboardType(.decimalPad)
                    }
                    TextField("Notes", text: $notes, axis: .vertical)
                        .lineLimit(3...)
                }
            }
            .navigationTitle("Mark Complete")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Done") {
                        Task { await complete() }
                    }
                    .disabled(isSaving)
                }
            }
        }
    }

    private func complete() async {
        isSaving = true
        var update: [String: AnyEncodable] = [
            "status": AnyEncodable("completed"),
            "completed_at": AnyEncodable(ISO8601DateFormatter().string(from: .now)),
        ]
        if let cost = Double(actualCost) {
            update["actual_cost"] = AnyEncodable(cost)
        }
        if !notes.isEmpty {
            update["notes"] = AnyEncodable(notes)
        }
        do {
            try await supabase
                .from("maintenance_events")
                .update(update)
                .eq("id", value: event.id.uuidString.lowercased())
                .execute()
        } catch {
            print("Error completing event: \(error)")
        }
        await onDone()
        isSaving = false
        dismiss()
    }
}

// Lightweight type-erased Encodable wrapper for heterogeneous dictionaries
struct AnyEncodable: Encodable {
    private let _encode: (Encoder) throws -> Void
    init<T: Encodable>(_ value: T) { _encode = { try value.encode(to: $0) } }
    func encode(to encoder: Encoder) throws { try _encode(encoder) }
}
