import SwiftUI
import Supabase

struct ItemsView: View {
    @Environment(AppState.self) private var appState
    @State private var items: [Item] = []
    @State private var isLoading = true
    @State private var searchText = ""
    @State private var selectedRoomFilter: String? = nil
    @State private var rooms: [String] = []

    var filtered: [Item] {
        items.filter { item in
            let matchesSearch = searchText.isEmpty ||
                item.name.localizedCaseInsensitiveContains(searchText) ||
                (item.brand ?? "").localizedCaseInsensitiveContains(searchText)
            let matchesRoom = selectedRoomFilter == nil ||
                item.room?.name == selectedRoomFilter
            return matchesSearch && matchesRoom
        }
    }

    var body: some View {
        NavigationStack {
            Group {
                if isLoading {
                    ProgressView()
                } else if items.isEmpty {
                    ContentUnavailableView("No Items", systemImage: "cube.box", description: Text("Add items via the web app."))
                } else {
                    List(filtered) { item in
                        NavigationLink(destination: ItemDetailView(item: item)) {
                            ItemRow(item: item)
                        }
                    }
                    .searchable(text: $searchText, prompt: "Search items…")
                }
            }
            .navigationTitle("Items")
            .toolbar {
                if !rooms.isEmpty {
                    ToolbarItem(placement: .topBarTrailing) {
                        Menu {
                            Button("All Rooms") { selectedRoomFilter = nil }
                            Divider()
                            ForEach(rooms, id: \.self) { room in
                                Button(room) { selectedRoomFilter = room }
                            }
                        } label: {
                            Label(selectedRoomFilter ?? "Filter", systemImage: "line.3.horizontal.decrease.circle")
                                .symbolVariant(selectedRoomFilter != nil ? .fill : .none)
                        }
                    }
                }
            }
            .task { await loadItems() }
            .refreshable { await loadItems() }
        }
    }

    private func loadItems() async {
        guard let householdId = appState.householdId else { return }
        isLoading = true
        do {
            let result: [Item] = try await supabase
                .from("items")
                .select("*, rooms(name), categories(name, color, icon)")
                .eq("household_id", value: householdId)
                .order("name")
                .execute()
                .value
            items = result
            rooms = Array(Set(result.compactMap { $0.room?.name })).sorted()
        } catch {
            print("Error loading items: \(error)")
        }
        isLoading = false
    }
}

private struct ItemRow: View {
    let item: Item

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(item.name).font(.headline)
            HStack(spacing: 8) {
                if let room = item.room {
                    Label(room.name, systemImage: "mappin")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
                if let cat = item.category {
                    Text(cat.name)
                        .font(.caption)
                        .padding(.horizontal, 6)
                        .padding(.vertical, 2)
                        .background(colorFromHex(cat.color ?? "") ?? Color.gray.opacity(0.2))
                        .clipShape(Capsule())
                }
            }
            warrantyBadge
        }
        .padding(.vertical, 2)
    }

    @ViewBuilder
    private var warrantyBadge: some View {
        switch item.warrantyStatus {
        case .expired:
            Label("Warranty expired", systemImage: "exclamationmark.triangle")
                .font(.caption2)
                .foregroundStyle(.red)
        case .expiringSoon(let days):
            Label("Warranty expires in \(days)d", systemImage: "clock")
                .font(.caption2)
                .foregroundStyle(.orange)
        default:
            EmptyView()
        }
    }
}

func colorFromHex(_ hex: String) -> Color? {
    let h = hex.trimmingCharacters(in: CharacterSet(charactersIn: "#"))
    guard h.count == 6, let rgb = UInt64(h, radix: 16) else { return nil }
    return Color(
        red: Double((rgb >> 16) & 0xFF) / 255,
        green: Double((rgb >> 8) & 0xFF) / 255,
        blue: Double(rgb & 0xFF) / 255
    ).opacity(0.25)
}
