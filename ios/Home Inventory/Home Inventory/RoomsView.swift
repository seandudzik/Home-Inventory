import SwiftUI
import Supabase

struct RoomsView: View {
    @Environment(AppState.self) private var appState
    @State private var rooms: [Room] = []
    @State private var itemCounts: [String: Int] = [:]
    @State private var isLoading = true

    var body: some View {
        NavigationStack {
            Group {
                if isLoading {
                    ProgressView()
                } else if rooms.isEmpty {
                    ContentUnavailableView("No Rooms", systemImage: "square.split.2x1", description: Text("Add rooms via the web app."))
                } else {
                    List(rooms) { room in
                        HStack {
                            VStack(alignment: .leading, spacing: 2) {
                                Text(room.name).font(.headline)
                                if let floor = room.floor {
                                    Text("Floor \(floor)")
                                        .font(.caption)
                                        .foregroundStyle(.secondary)
                                }
                            }
                            Spacer()
                            let count = itemCounts[room.id.uuidString.lowercased()] ?? 0
                            Text("\(count) item\(count == 1 ? "" : "s")")
                                .font(.subheadline)
                                .foregroundStyle(.secondary)
                        }
                        .padding(.vertical, 2)
                    }
                }
            }
            .navigationTitle("Rooms")
            .task { await loadRooms() }
            .refreshable { await loadRooms() }
        }
    }

    private func loadRooms() async {
        guard let householdId = appState.householdId else { return }
        isLoading = true
        do {
            let result: [Room] = try await supabase
                .from("rooms")
                .select("*")
                .eq("household_id", value: householdId)
                .order("name")
                .execute()
                .value
            rooms = result

            struct ItemRoomRow: Decodable {
                let roomId: String?
                enum CodingKeys: String, CodingKey { case roomId = "room_id" }
            }
            let allItems: [ItemRoomRow] = try await supabase
                .from("items")
                .select("room_id")
                .eq("household_id", value: householdId)
                .execute()
                .value

            var counts: [String: Int] = [:]
            for item in allItems {
                if let rid = item.roomId { counts[rid.lowercased(), default: 0] += 1 }
            }
            itemCounts = counts
        } catch {
            print("Error loading rooms: \(error)")
        }
        isLoading = false
    }
}
