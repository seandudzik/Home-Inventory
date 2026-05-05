import SwiftUI
import Supabase

struct RoomsView: View {
    @Environment(AppState.self) private var appState
    @State private var rooms: [Room] = []
    @State private var itemCounts: [String: Int] = [:]
    @State private var isLoading = true
    @State private var showAdd = false
    @State private var editRoom: Room? = nil

    var body: some View {
        NavigationStack {
            Group {
                if isLoading {
                    ProgressView()
                } else if rooms.isEmpty {
                    ContentUnavailableView("No Rooms", systemImage: "square.split.2x1", description: Text("Tap + to add a room."))
                } else {
                    List {
                        ForEach(rooms) { room in
                            HStack {
                                VStack(alignment: .leading, spacing: 2) {
                                    Text(room.name).font(.headline)
                                    if let floor = room.floor {
                                        Text("Floor \(floor)").font(.caption).foregroundStyle(.secondary)
                                    }
                                }
                                Spacer()
                                let count = itemCounts[room.id.uuidString.lowercased()] ?? 0
                                Text("\(count) item\(count == 1 ? "" : "s")").font(.subheadline).foregroundStyle(.secondary)
                            }
                            .padding(.vertical, 2)
                            .contentShape(Rectangle())
                            .onTapGesture { editRoom = room }
                            .swipeActions(edge: .trailing) {
                                Button(role: .destructive) { Task { await deleteRoom(room) } } label: {
                                    Label("Delete", systemImage: "trash")
                                }
                                Button { editRoom = room } label: {
                                    Label("Edit", systemImage: "pencil")
                                }
                                .tint(.blue)
                            }
                        }
                    }
                }
            }
            .navigationTitle("Rooms")
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button { showAdd = true } label: { Image(systemName: "plus") }
                }
            }
            .task { await loadRooms() }
            .refreshable { await loadRooms() }
            .sheet(isPresented: $showAdd) {
                RoomFormSheet(room: nil) { await loadRooms() }
            }
            .sheet(item: $editRoom) { room in
                RoomFormSheet(room: room) { await loadRooms() }
            }
        }
    }

    private func loadRooms() async {
        guard let hid = appState.householdId else { return }
        isLoading = true
        do {
            let result: [Room] = try await supabase.from("rooms").select("*").eq("household_id", value: hid).order("name").execute().value
            rooms = result

            struct ItemRoomRow: Decodable {
                let roomId: String?
                enum CodingKeys: String, CodingKey { case roomId = "room_id" }
            }
            let allItems: [ItemRoomRow] = (try? await supabase.from("items").select("room_id").eq("household_id", value: hid).execute().value) ?? []
            var counts: [String: Int] = [:]
            for item in allItems { if let rid = item.roomId { counts[rid.lowercased(), default: 0] += 1 } }
            itemCounts = counts
        } catch { print("Rooms error: \(error)") }
        isLoading = false
    }

    private func deleteRoom(_ room: Room) async {
        do {
            try await supabase.from("rooms").delete().eq("id", value: room.id.uuidString.lowercased()).execute()
            rooms.removeAll { $0.id == room.id }
        } catch { print("Delete room error: \(error)") }
    }
}

struct RoomFormSheet: View {
    let room: Room?
    let onSave: () async -> Void
    @Environment(AppState.self) private var appState
    @Environment(\.dismiss) private var dismiss

    @State private var name = ""
    @State private var floorText = ""
    @State private var isSaving = false
    @State private var errorMessage: String?

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    TextField("Room name *", text: $name)
                    TextField("Floor number (optional)", text: $floorText)
                        .keyboardType(.numberPad)
                }
                if let error = errorMessage {
                    Section { Text(error).foregroundStyle(.red).font(.caption) }
                }
            }
            .navigationTitle(room == nil ? "New Room" : "Edit Room")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button(isSaving ? "Saving…" : "Save") { Task { await save() } }
                        .disabled(name.trimmingCharacters(in: .whitespaces).isEmpty || isSaving)
                }
            }
            .onAppear {
                name = room?.name ?? ""
                floorText = room?.floor.map { String($0) } ?? ""
            }
        }
    }

    private func save() async {
        guard let hid = appState.householdId else { return }
        isSaving = true; errorMessage = nil

        struct RoomPayload: Encodable {
            let householdId, name: String
            let floor: Int?
            enum CodingKeys: String, CodingKey { case householdId = "household_id", name, floor }
        }
        struct UpdatePayload: Encodable {
            let name: String; let floor: Int?
        }

        let floor = Int(floorText)
        do {
            if let existing = room {
                try await supabase.from("rooms").update(UpdatePayload(name: name.trimmingCharacters(in: .whitespaces), floor: floor))
                    .eq("id", value: existing.id.uuidString.lowercased()).execute()
            } else {
                try await supabase.from("rooms").insert(RoomPayload(householdId: hid, name: name.trimmingCharacters(in: .whitespaces), floor: floor)).execute()
            }
            await onSave()
            dismiss()
        } catch { errorMessage = error.localizedDescription }
        isSaving = false
    }
}
