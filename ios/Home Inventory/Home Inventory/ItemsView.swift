import SwiftUI
import Supabase

struct ItemsView: View {
    @Environment(AppState.self) private var appState
    @State private var items: [Item] = []
    @State private var isLoading = true
    @State private var searchText = ""
    @State private var selectedRoomFilter: String? = nil
    @State private var rooms: [String] = []
    @State private var showAdd = false

    var filtered: [Item] {
        items.filter {
            (searchText.isEmpty || $0.name.localizedCaseInsensitiveContains(searchText) || ($0.brand ?? "").localizedCaseInsensitiveContains(searchText)) &&
            (selectedRoomFilter == nil || $0.room?.name == selectedRoomFilter)
        }
    }

    var body: some View {
        NavigationStack {
            Group {
                if isLoading {
                    ProgressView()
                } else if items.isEmpty {
                    ContentUnavailableView("No Items", systemImage: "cube.box", description: Text("Tap + to add your first item."))
                } else {
                    List(filtered) { item in
                        NavigationLink(destination: ItemDetailView(item: item)) {
                            ItemRow(item: item)
                        }
                        .swipeActions(edge: .trailing, allowsFullSwipe: false) {
                            Button(role: .destructive) { Task { await deleteItem(item) } } label: {
                                Label("Delete", systemImage: "trash")
                            }
                        }
                    }
                    .searchable(text: $searchText, prompt: "Search items…")
                }
            }
            .navigationTitle("Items")
            .toolbar {
                if !rooms.isEmpty {
                    ToolbarItem(placement: .topBarLeading) {
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
                ToolbarItem(placement: .topBarTrailing) {
                    Button { showAdd = true } label: {
                        Image(systemName: "plus")
                    }
                }
            }
            .task { await loadItems() }
            .refreshable { await loadItems() }
            .sheet(isPresented: $showAdd) {
                AddItemView()
                    .onDisappear { Task { await loadItems() } }
            }
        }
    }

    private func loadItems() async {
        guard let hid = appState.householdId else { return }
        isLoading = true
        do {
            let result: [Item] = try await supabase
                .from("items")
                .select("*, rooms(name), categories(name, color, icon)")
                .eq("household_id", value: hid)
                .order("name")
                .execute()
                .value
            items = result
            rooms = Array(Set(result.compactMap { $0.room?.name })).sorted()
        } catch { print("Error loading items: \(error)") }
        isLoading = false
    }

    private func deleteItem(_ item: Item) async {
        guard let hid = appState.householdId else { return }
        do {
            // Delete storage objects first
            let attachments: [ItemAttachment] = (try? await supabase
                .from("item_attachments").select("*")
                .eq("item_id", value: item.id.uuidString.lowercased())
                .execute().value) ?? []
            let imagePaths = attachments.filter { $0.isImage }.map { $0.storagePath }
            let docPaths = attachments.filter { !$0.isImage }.map { $0.storagePath }
            if !imagePaths.isEmpty { try await supabase.storage.from("item-images").remove(paths: imagePaths) }
            if !docPaths.isEmpty { try await supabase.storage.from("item-documents").remove(paths: docPaths) }
            try await supabase.from("items").delete().eq("id", value: item.id.uuidString.lowercased()).execute()
            items.removeAll { $0.id == item.id }
            _ = hid
        } catch { print("Delete error: \(error)") }
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

private struct ItemRow: View {
    let item: Item

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(item.name).font(.headline)
            HStack(spacing: 8) {
                if let room = item.room {
                    Label(room.name, systemImage: "mappin").font(.caption).foregroundStyle(.secondary)
                }
                if let cat = item.category {
                    Text(cat.name).font(.caption)
                        .padding(.horizontal, 6).padding(.vertical, 2)
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
            Label("Warranty expired", systemImage: "exclamationmark.triangle").font(.caption2).foregroundStyle(.red)
        case .expiringSoon(let days):
            Label("Warranty expires in \(days)d", systemImage: "clock").font(.caption2).foregroundStyle(.orange)
        default:
            EmptyView()
        }
    }
}
