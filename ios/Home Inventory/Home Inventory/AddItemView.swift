import SwiftUI
import Supabase
import PhotosUI

struct AddItemView: View {
    @Environment(AppState.self) private var appState
    @Environment(\.dismiss) private var dismiss

    var prefill: ProductInfo? = nil

    @State private var name = ""
    @State private var brand = ""
    @State private var model = ""
    @State private var serialNumber = ""
    @State private var selectedRoomId: String? = nil
    @State private var selectedCategoryId: String? = nil
    @State private var hasPurchaseDate = false
    @State private var purchaseDate = Date()
    @State private var purchasePrice = ""
    @State private var hasWarranty = false
    @State private var warrantyDate = Date()
    @State private var notes = ""
    @State private var rooms: [Room] = []
    @State private var categories: [Category] = []
    @State private var pendingImages: [UIImage] = []
    @State private var selectedPhotos: [PhotosPickerItem] = []
    @State private var showCamera = false
    @State private var showScanner = false
    @State private var isLookingUp = false
    @State private var isSaving = false
    @State private var errorMessage: String?

    var body: some View {
        NavigationStack {
            Form {
                Section("Item Details") {
                    TextField("Name *", text: $name)
                    TextField("Brand", text: $brand)
                    TextField("Model", text: $model)
                    TextField("Serial Number", text: $serialNumber)
                    Button {
                        showScanner = true
                    } label: {
                        Label(isLookingUp ? "Looking up…" : "Scan Barcode", systemImage: "barcode.viewfinder")
                    }
                    .disabled(isLookingUp)
                }

                Section("Location") {
                    Picker("Room", selection: $selectedRoomId) {
                        Text("None").tag(String?.none)
                        ForEach(rooms) { room in
                            Text(room.name).tag(String?.some(room.id.uuidString.lowercased()))
                        }
                    }
                    Picker("Category", selection: $selectedCategoryId) {
                        Text("None").tag(String?.none)
                        ForEach(flatCategories, id: \.0.id) { cat, depth in
                            Text(String(repeating: "  ", count: depth) + cat.name)
                                .tag(String?.some(cat.id.uuidString.lowercased()))
                        }
                    }
                }

                Section("Purchase") {
                    Toggle("Has Purchase Date", isOn: $hasPurchaseDate)
                    if hasPurchaseDate {
                        DatePicker("Date", selection: $purchaseDate, displayedComponents: .date)
                    }
                    HStack {
                        Text("$")
                        TextField("Price", text: $purchasePrice).keyboardType(.decimalPad)
                    }
                }

                Section("Warranty") {
                    Toggle("Has Warranty", isOn: $hasWarranty)
                    if hasWarranty {
                        DatePicker("Expires", selection: $warrantyDate, displayedComponents: .date)
                    }
                }

                Section("Notes") {
                    TextField("Notes", text: $notes, axis: .vertical).lineLimit(3...)
                }

                Section("Photos") {
                    if !pendingImages.isEmpty {
                        ScrollView(.horizontal, showsIndicators: false) {
                            HStack(spacing: 8) {
                                ForEach(Array(pendingImages.enumerated()), id: \.offset) { idx, img in
                                    ZStack(alignment: .topTrailing) {
                                        Image(uiImage: img)
                                            .resizable().scaledToFill()
                                            .frame(width: 80, height: 80)
                                            .clipShape(RoundedRectangle(cornerRadius: 8))
                                        Button { pendingImages.remove(at: idx) } label: {
                                            Image(systemName: "xmark.circle.fill")
                                                .foregroundStyle(.white)
                                                .background(Color.black.opacity(0.5), in: Circle())
                                        }
                                        .offset(x: 4, y: -4)
                                    }
                                }
                            }
                        }
                    }
                    HStack(spacing: 20) {
                        PhotosPicker(selection: $selectedPhotos, maxSelectionCount: 10, matching: .images) {
                            Label("Library", systemImage: "photo")
                        }
                        Button { showCamera = true } label: {
                            Label("Camera", systemImage: "camera")
                        }
                    }
                }

                if let error = errorMessage {
                    Section { Text(error).foregroundStyle(.red).font(.caption) }
                }
            }
            .navigationTitle("New Item")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button(isSaving ? "Saving…" : "Save") { Task { await save() } }
                        .disabled(name.trimmingCharacters(in: .whitespaces).isEmpty || isSaving)
                }
            }
            .task { await loadFormData() }
            .onChange(of: selectedPhotos) { _, items in Task { await loadPhotos(from: items) } }
            .fullScreenCover(isPresented: $showCamera) {
                CameraView { img in pendingImages.append(img) }
            }
            .sheet(isPresented: $showScanner) {
                BarcodeScannerSheet { barcode in
                    Task { await handleBarcode(barcode) }
                }
            }
            .onAppear { applyPrefill() }
        }
    }

    private var flatCategories: [(Category, Int)] {
        func flatten(_ parentId: UUID? = nil, depth: Int = 0) -> [(Category, Int)] {
            categories.filter { $0.parentCategoryId == parentId }
                .flatMap { [($0, depth)] + flatten($0.id, depth: depth + 1) }
        }
        return flatten()
    }

    private func handleBarcode(_ barcode: String) async {
        isLookingUp = true
        if let info = await ProductLookupService.lookup(barcode: barcode) {
            name = info.title
            brand = info.brand ?? brand
        }
        isLookingUp = false
    }

    private func applyPrefill() {
        guard let p = prefill else { return }
        name = p.title
        brand = p.brand ?? ""
    }

    private func loadFormData() async {
        guard let hid = appState.householdId else { return }
        async let r: [Room] = (try? await supabase.from("rooms").select("*").eq("household_id", value: hid).order("name").execute().value) ?? []
        async let c: [Category] = (try? await supabase.from("categories").select("*").eq("household_id", value: hid).order("name").execute().value) ?? []
        rooms = await r
        categories = await c
    }

    private func loadPhotos(from items: [PhotosPickerItem]) async {
        for item in items {
            if let data = try? await item.loadTransferable(type: Data.self), let img = UIImage(data: data) {
                pendingImages.append(img)
            }
        }
        selectedPhotos = []
    }

    private func save() async {
        guard let hid = appState.householdId else { return }
        isSaving = true; errorMessage = nil

        guard let uid = appState.userId else { errorMessage = "Not signed in."; isSaving = false; return }

        struct NewItem: Encodable {
            let householdId, name, createdBy: String
            let brand, model, serialNumber, roomId, categoryId, purchaseDate, warrantyExpiresAt, notes: String?
            let purchasePrice: Double?
            enum CodingKeys: String, CodingKey {
                case householdId = "household_id", name, brand, model, notes
                case createdBy = "created_by"
                case serialNumber = "serial_number", roomId = "room_id", categoryId = "category_id"
                case purchaseDate = "purchase_date", purchasePrice = "purchase_price"
                case warrantyExpiresAt = "warranty_expires_at"
            }
        }
        let payload = NewItem(
            householdId: hid, name: name.trimmingCharacters(in: .whitespaces), createdBy: uid,
            brand: brand.isEmpty ? nil : brand, model: model.isEmpty ? nil : model,
            serialNumber: serialNumber.isEmpty ? nil : serialNumber,
            roomId: selectedRoomId, categoryId: selectedCategoryId,
            purchaseDate: hasPurchaseDate ? DateFormatter.iso8601Date.string(from: purchaseDate) : nil,
            warrantyExpiresAt: hasWarranty ? DateFormatter.iso8601Date.string(from: warrantyDate) : nil,
            notes: notes.isEmpty ? nil : notes, purchasePrice: Double(purchasePrice)
        )
        do {
            struct Created: Decodable { let id: String }
            let created: Created = try await supabase.from("items").insert(payload).select("id").single().execute().value
            await uploadImages(itemId: created.id, householdId: hid)
            dismiss()
        } catch { errorMessage = error.localizedDescription }
        isSaving = false
    }

    private func uploadImages(itemId: String, householdId: String) async {
        struct NewAttachment: Encodable {
            let itemId, storagePath, fileName, mimeType: String
            let sizeBytes: Int; let isPrimaryImage: Bool
            enum CodingKeys: String, CodingKey {
                case itemId = "item_id", storagePath = "storage_path", fileName = "file_name"
                case mimeType = "mime_type", sizeBytes = "size_bytes", isPrimaryImage = "is_primary_image"
            }
        }
        for (idx, image) in pendingImages.enumerated() {
            guard let data = image.jpegData(compressionQuality: 0.8) else { continue }
            let fileName = "\(UUID().uuidString).jpg"
            let path = "\(householdId)/\(itemId)/\(fileName)"
            do {
                try await supabase.storage.from("item-images").upload(path, data: data, options: FileOptions(contentType: "image/jpeg"))
                try await supabase.from("item_attachments").insert(
                    NewAttachment(itemId: itemId, storagePath: path, fileName: fileName,
                                  mimeType: "image/jpeg", sizeBytes: data.count, isPrimaryImage: idx == 0)
                ).execute()
            } catch { print("Upload failed: \(error)") }
        }
    }
}
