import SwiftUI
import Supabase

struct DashboardView: View {
    @Environment(AppState.self) private var appState
    @State private var itemCount = 0
    @State private var roomCount = 0
    @State private var overdueEvents: [MaintenanceEvent] = []
    @State private var upcomingEvents: [MaintenanceEvent] = []
    @State private var warrantiesExpiring: [Item] = []
    @State private var isLoading = true
    @State private var errorMessage: String?

    var body: some View {
        NavigationStack {
            Group {
                if isLoading {
                    ProgressView()
                } else {
                    List {
                        // Stats
                        Section {
                            LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())], spacing: 12) {
                                StatCard(label: "Items", value: itemCount, color: .primary)
                                StatCard(label: "Rooms", value: roomCount, color: .primary)
                                StatCard(label: "Overdue", value: overdueEvents.count, color: overdueEvents.isEmpty ? .primary : .red)
                                StatCard(label: "Due (14d)", value: upcomingEvents.count, color: upcomingEvents.isEmpty ? .primary : .orange)
                            }
                            .listRowInsets(EdgeInsets())
                            .listRowBackground(Color.clear)
                        }

                        // Overdue
                        if !overdueEvents.isEmpty {
                            Section("Overdue Maintenance") {
                                ForEach(overdueEvents) { event in
                                    EventRow(event: event)
                                }
                            }
                        }

                        // Upcoming
                        if !upcomingEvents.isEmpty {
                            Section("Due in 14 Days") {
                                ForEach(upcomingEvents) { event in
                                    EventRow(event: event)
                                }
                            }
                        }

                        // Warranties
                        if !warrantiesExpiring.isEmpty {
                            Section("Warranties Expiring (90 days)") {
                                ForEach(warrantiesExpiring) { item in
                                    HStack {
                                        VStack(alignment: .leading, spacing: 2) {
                                            Text(item.name).font(.subheadline)
                                            if let room = item.room {
                                                Text(room.name).font(.caption).foregroundStyle(.secondary)
                                            }
                                        }
                                        Spacer()
                                        if let expiry = item.warrantyExpiresAt {
                                            Text(expiry).font(.caption).foregroundStyle(.orange)
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
            .navigationTitle("Dashboard")
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button("Sign Out") { Task { await appState.signOut() } }
                        .font(.subheadline)
                }
            }
            .task { await loadData() }
            .refreshable { await loadData() }
        }
    }

    private func loadData() async {
        guard let householdId = appState.householdId else { return }
        isLoading = true

        let today = DateFormatter.iso8601Date.string(from: .now)
        let in14 = DateFormatter.iso8601Date.string(from: Calendar.current.date(byAdding: .day, value: 14, to: .now)!)
        let in90 = DateFormatter.iso8601Date.string(from: Calendar.current.date(byAdding: .day, value: 90, to: .now)!)

        do {
            // Fetch items
            let items: [Item] = try await supabase
                .from("items")
                .select("*, rooms(name), categories(name, color, icon)")
                .eq("household_id", value: householdId)
                .execute()
                .value

            itemCount = items.count

            warrantiesExpiring = items.filter {
                guard let w = $0.warrantyExpiresAt else { return false }
                return w >= today && w <= in90
            }.sorted { ($0.warrantyExpiresAt ?? "") < ($1.warrantyExpiresAt ?? "") }

            // Fetch rooms count
            struct RoomCount: Decodable { let id: UUID }
            let rooms: [RoomCount] = try await supabase
                .from("rooms")
                .select("id")
                .eq("household_id", value: householdId)
                .execute()
                .value
            roomCount = rooms.count

            let itemIds = items.map { $0.id.uuidString.lowercased() }
            guard !itemIds.isEmpty else {
                isLoading = false
                return
            }

            // Mark stale pending events overdue
            try await supabase
                .from("maintenance_events")
                .update(["status": "overdue"])
                .eq("status", value: "pending")
                .lt("scheduled_date", value: today)
                .in("item_id", values: itemIds)
                .execute()

            // Overdue
            let overdue: [MaintenanceEvent] = try await supabase
                .from("maintenance_events")
                .select("*, maintenance_schedules(name, estimated_cost, items(id, name))")
                .eq("status", value: "overdue")
                .in("item_id", values: itemIds)
                .order("scheduled_date")
                .limit(8)
                .execute()
                .value
            overdueEvents = overdue

            // Upcoming 14 days
            let upcoming: [MaintenanceEvent] = try await supabase
                .from("maintenance_events")
                .select("*, maintenance_schedules(name, estimated_cost, items(id, name))")
                .eq("status", value: "pending")
                .gte("scheduled_date", value: today)
                .lte("scheduled_date", value: in14)
                .in("item_id", values: itemIds)
                .order("scheduled_date")
                .limit(8)
                .execute()
                .value
            upcomingEvents = upcoming

        } catch {
            errorMessage = error.localizedDescription
        }

        isLoading = false
    }
}

private struct StatCard: View {
    let label: String
    let value: Int
    let color: Color

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(label)
                .font(.caption)
                .foregroundStyle(.secondary)
            Text("\(value)")
                .font(.system(size: 32, weight: .semibold, design: .rounded))
                .foregroundStyle(color)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(16)
        .background(Color(.secondarySystemGroupedBackground))
        .clipShape(RoundedRectangle(cornerRadius: 12))
    }
}

private struct EventRow: View {
    let event: MaintenanceEvent

    var body: some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(event.schedule?.name ?? "—")
                .font(.subheadline)
            Text(event.schedule?.item?.name ?? "Unknown item")
                .font(.caption)
                .foregroundStyle(.secondary)
        }
        .overlay(alignment: .trailing) {
            Text(event.scheduledDateFormatted)
                .font(.caption)
                .foregroundStyle(event.isOverdue ? .red : .secondary)
        }
    }
}
