import SwiftUI
import Supabase

private let presetColors = ["#ef4444","#f97316","#eab308","#22c55e","#3b82f6","#8b5cf6","#ec4899","#6b7280"]

struct CategoriesView: View {
    @Environment(AppState.self) private var appState
    @State private var categories: [Category] = []
    @State private var isLoading = true
    @State private var showAdd = false
    @State private var editCategory: Category? = nil

    var body: some View {
        NavigationStack {
            Group {
                if isLoading {
                    ProgressView()
                } else if categories.isEmpty {
                    ContentUnavailableView("No Categories", systemImage: "tag", description: Text("Tap + to add a category."))
                } else {
                    List {
                        ForEach(flatCategories, id: \.0.id) { cat, depth in
                            HStack(spacing: 12) {
                                if depth > 0 {
                                    Rectangle().fill(Color.clear).frame(width: CGFloat(depth) * 16)
                                }
                                if let icon = cat.icon, !icon.isEmpty {
                                    Text(icon).font(.title3)
                                }
                                Circle()
                                    .fill(colorFromHex(cat.color ?? "")?.opacity(1) ?? Color.gray.opacity(0.4))
                                    .frame(width: 10, height: 10)
                                Text(cat.name).font(depth == 0 ? .headline : .subheadline)
                                Spacer()
                            }
                            .swipeActions(edge: .trailing) {
                                Button(role: .destructive) { Task { await deleteCategory(cat) } } label: {
                                    Label("Delete", systemImage: "trash")
                                }
                                Button { editCategory = cat } label: {
                                    Label("Edit", systemImage: "pencil")
                                }
                                .tint(.blue)
                            }
                        }
                    }
                }
            }
            .navigationTitle("Categories")
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button { showAdd = true } label: { Image(systemName: "plus") }
                }
            }
            .task { await load() }
            .refreshable { await load() }
            .sheet(isPresented: $showAdd) {
                CategoryFormSheet(category: nil, allCategories: categories) { await load() }
            }
            .sheet(item: $editCategory) { cat in
                CategoryFormSheet(category: cat, allCategories: categories) { await load() }
            }
        }
    }

    private var flatCategories: [(Category, Int)] {
        func flatten(_ parentId: UUID? = nil, depth: Int = 0) -> [(Category, Int)] {
            categories.filter { $0.parentCategoryId == parentId }
                .flatMap { [($0, depth)] + flatten($0.id, depth: depth + 1) }
        }
        return flatten()
    }

    private func load() async {
        guard let hid = appState.householdId else { return }
        isLoading = true
        categories = (try? await supabase.from("categories").select("*").eq("household_id", value: hid).order("name").execute().value) ?? []
        isLoading = false
    }

    private func deleteCategory(_ cat: Category) async {
        do {
            try await supabase.from("categories").delete().eq("id", value: cat.id.uuidString.lowercased()).execute()
            categories.removeAll { $0.id == cat.id }
        } catch { print("Delete category error: \(error)") }
    }
}

struct CategoryFormSheet: View {
    let category: Category?
    let allCategories: [Category]
    let onSave: () async -> Void
    @Environment(AppState.self) private var appState
    @Environment(\.dismiss) private var dismiss

    @State private var name = ""
    @State private var icon = ""
    @State private var selectedColor = presetColors[4]
    @State private var selectedParentId: String? = nil
    @State private var isSaving = false
    @State private var errorMessage: String?

    var eligibleParents: [Category] {
        allCategories.filter { $0.id != category?.id && $0.parentCategoryId == nil }
    }

    var body: some View {
        NavigationStack {
            Form {
                Section("Details") {
                    TextField("Name *", text: $name)
                    TextField("Icon (emoji)", text: $icon)
                }

                Section("Color") {
                    LazyVGrid(columns: Array(repeating: GridItem(.flexible()), count: 8), spacing: 8) {
                        ForEach(presetColors, id: \.self) { hex in
                            Circle()
                                .fill(colorFromHex(hex)?.opacity(1) ?? Color.gray)
                                .frame(width: 28, height: 28)
                                .overlay(Circle().stroke(Color.primary, lineWidth: selectedColor == hex ? 2 : 0).padding(2))
                                .onTapGesture { selectedColor = hex }
                        }
                    }
                    .padding(.vertical, 4)
                }

                Section("Parent Category") {
                    Picker("Parent", selection: $selectedParentId) {
                        Text("None (top level)").tag(String?.none)
                        ForEach(eligibleParents) { cat in
                            Text(cat.name).tag(String?.some(cat.id.uuidString.lowercased()))
                        }
                    }
                }

                if let error = errorMessage {
                    Section { Text(error).foregroundStyle(.red).font(.caption) }
                }
            }
            .navigationTitle(category == nil ? "New Category" : "Edit Category")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button(isSaving ? "Saving…" : "Save") { Task { await save() } }
                        .disabled(name.trimmingCharacters(in: .whitespaces).isEmpty || isSaving)
                }
            }
            .onAppear {
                name = category?.name ?? ""
                icon = category?.icon ?? ""
                selectedColor = category?.color ?? presetColors[4]
                selectedParentId = category?.parentCategoryId?.uuidString.lowercased()
            }
        }
    }

    private func save() async {
        guard let hid = appState.householdId else { return }
        isSaving = true; errorMessage = nil

        struct Payload: Encodable {
            let householdId, name: String
            let color, icon, parentCategoryId: String?
            enum CodingKeys: String, CodingKey {
                case householdId = "household_id", name, color, icon
                case parentCategoryId = "parent_category_id"
            }
        }
        struct UpdatePayload: Encodable {
            let name, color: String
            let icon: String?
            let parentCategoryId: String?
            enum CodingKeys: String, CodingKey {
                case name, color, icon, parentCategoryId = "parent_category_id"
            }
        }

        do {
            if let existing = category {
                try await supabase.from("categories")
                    .update(UpdatePayload(name: name.trimmingCharacters(in: .whitespaces),
                                         color: selectedColor,
                                         icon: icon.isEmpty ? nil : icon,
                                         parentCategoryId: selectedParentId))
                    .eq("id", value: existing.id.uuidString.lowercased()).execute()
            } else {
                try await supabase.from("categories")
                    .insert(Payload(householdId: hid,
                                    name: name.trimmingCharacters(in: .whitespaces),
                                    color: selectedColor,
                                    icon: icon.isEmpty ? nil : icon,
                                    parentCategoryId: selectedParentId)).execute()
            }
            await onSave()
            dismiss()
        } catch { errorMessage = error.localizedDescription }
        isSaving = false
    }
}
