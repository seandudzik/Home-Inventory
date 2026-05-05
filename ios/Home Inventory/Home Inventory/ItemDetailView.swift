import SwiftUI
import Supabase
import PhotosUI

struct ItemDetailView: View {
    let item: Item
    @Environment(AppState.self) private var appState
    @State private var attachments: [ItemAttachment] = []
    @State private var signedURLs: [UUID: URL] = [:]
    @State private var isLoadingAttachments = false
    @State private var selectedPhotos: [PhotosPickerItem] = []
    @State private var showCamera = false
    @State private var showEdit = false
    @State private var confirmDeleteAttachment: ItemAttachment? = nil

    var body: some View {
        List {
            Section("Details") {
                if let brand = item.brand { row("Brand", brand) }
                if let model = item.model { row("Model", model) }
                if let serial = item.serialNumber { row("Serial", serial) }
                if let room = item.room { row("Room", room.name) }
                if let cat = item.category { row("Category", cat.name) }
            }

            if item.purchaseDate != nil || item.purchasePrice != nil {
                Section("Purchase") {
                    if let d = item.purchaseDate { row("Date", d) }
                    if let p = item.purchasePrice { row("Price", String(format: "$%.2f", p)) }
                }
            }

            if let warranty = item.warrantyExpiresAt {
                Section("Warranty") {
                    HStack {
                        Text("Expires").foregroundStyle(.secondary)
                        Spacer()
                        Text(warranty).foregroundStyle(warrantyColor)
                    }
                }
            }

            if let notes = item.notes, !notes.isEmpty {
                Section("Notes") {
                    Text(notes).foregroundStyle(.secondary)
                }
            }

            // Photos
            Section("Photos") {
                let images = attachments.filter { $0.isImage }
                if images.isEmpty && !isLoadingAttachments {
                    Text("No photos yet").foregroundStyle(.secondary).font(.subheadline)
                } else {
                    LazyVGrid(columns: [GridItem(.adaptive(minimum: 100))], spacing: 8) {
                        ForEach(images) { attachment in
                            ZStack(alignment: .topTrailing) {
                                if let url = signedURLs[attachment.id] {
                                    AsyncImage(url: url) { image in
                                        image.resizable().scaledToFill()
                                    } placeholder: {
                                        Rectangle().fill(Color(.systemGray5))
                                    }
                                    .frame(width: 100, height: 100)
                                    .clipShape(RoundedRectangle(cornerRadius: 8))
                                }
                                Button {
                                    confirmDeleteAttachment = attachment
                                } label: {
                                    Image(systemName: "xmark.circle.fill")
                                        .foregroundStyle(.white)
                                        .background(Color.black.opacity(0.5), in: Circle())
                                }
                                .offset(x: 4, y: -4)
                            }
                        }
                    }
                    .padding(.vertical, 4)
                }

                HStack(spacing: 20) {
                    PhotosPicker(selection: $selectedPhotos, maxSelectionCount: 10, matching: .images) {
                        Label("Add from Library", systemImage: "photo")
                    }
                    Button { showCamera = true } label: {
                        Label("Take Photo", systemImage: "camera")
                    }
                }
            }
        }
        .navigationTitle(item.name)
        .navigationBarTitleDisplayMode(.large)
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Button("Edit") { showEdit = true }
            }
        }
        .task { await loadAttachments() }
        .onChange(of: selectedPhotos) { _, items in Task { await uploadFromPicker(items) } }
        .fullScreenCover(isPresented: $showCamera) {
            CameraView { img in Task { await uploadImage(img) } }
        }
        .navigationDestination(isPresented: $showEdit) {
            EditItemView(item: item)
        }
        .confirmationDialog("Delete this photo?", isPresented: .constant(confirmDeleteAttachment != nil), titleVisibility: .visible) {
            Button("Delete", role: .destructive) {
                if let a = confirmDeleteAttachment { Task { await deleteAttachment(a) } }
            }
            Button("Cancel", role: .cancel) { confirmDeleteAttachment = nil }
        }
    }

    private var warrantyColor: Color {
        switch item.warrantyStatus {
        case .expired: return .red
        case .expiringSoon: return .orange
        default: return .primary
        }
    }

    private func row(_ label: String, _ value: String) -> some View {
        HStack {
            Text(label).foregroundStyle(.secondary)
            Spacer()
            Text(value)
        }
    }

    private func loadAttachments() async {
        isLoadingAttachments = true
        do {
            let result: [ItemAttachment] = try await supabase
                .from("item_attachments")
                .select("*")
                .eq("item_id", value: item.id.uuidString.lowercased())
                .order("created_at")
                .execute()
                .value
            attachments = result
            await generateSignedURLs(for: result)
        } catch { print("Attachments error: \(error)") }
        isLoadingAttachments = false
    }

    private func generateSignedURLs(for items: [ItemAttachment]) async {
        for attachment in items where attachment.isImage {
            if let url = try? await supabase.storage
                .from("item-images")
                .createSignedURL(path: attachment.storagePath, expiresIn: 3600) {
                signedURLs[attachment.id] = url
            }
        }
    }

    private func uploadFromPicker(_ items: [PhotosPickerItem]) async {
        for item in items {
            if let data = try? await item.loadTransferable(type: Data.self),
               let img = UIImage(data: data) {
                await uploadImage(img)
            }
        }
        selectedPhotos = []
    }

    private func uploadImage(_ image: UIImage) async {
        guard let hid = appState.householdId,
              let data = image.jpegData(compressionQuality: 0.8) else { return }
        let fileName = "\(UUID().uuidString).jpg"
        let path = "\(hid)/\(item.id.uuidString.lowercased())/\(fileName)"

        struct NewAttachment: Encodable {
            let itemId, storagePath, fileName, mimeType: String
            let sizeBytes: Int; let isPrimaryImage: Bool
            enum CodingKeys: String, CodingKey {
                case itemId = "item_id", storagePath = "storage_path", fileName = "file_name"
                case mimeType = "mime_type", sizeBytes = "size_bytes", isPrimaryImage = "is_primary_image"
            }
        }
        do {
            try await supabase.storage.from("item-images").upload(path, data: data, options: FileOptions(contentType: "image/jpeg"))
            try await supabase.from("item_attachments").insert(
                NewAttachment(itemId: item.id.uuidString.lowercased(), storagePath: path,
                              fileName: fileName, mimeType: "image/jpeg", sizeBytes: data.count,
                              isPrimaryImage: attachments.isEmpty)
            ).execute()
            await loadAttachments()
        } catch { print("Upload error: \(error)") }
    }

    private func deleteAttachment(_ attachment: ItemAttachment) async {
        do {
            try await supabase.storage.from("item-images").remove(paths: [attachment.storagePath])
            try await supabase.from("item_attachments").delete().eq("id", value: attachment.id.uuidString.lowercased()).execute()
            attachments.removeAll { $0.id == attachment.id }
            signedURLs.removeValue(forKey: attachment.id)
        } catch { print("Delete error: \(error)") }
        confirmDeleteAttachment = nil
    }
}
