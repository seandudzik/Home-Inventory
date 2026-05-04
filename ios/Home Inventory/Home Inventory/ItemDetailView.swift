import SwiftUI

struct ItemDetailView: View {
    let item: Item

    var body: some View {
        List {
            // Identity
            Section("Details") {
                if let brand = item.brand {
                    row(label: "Brand", value: brand)
                }
                if let model = item.model {
                    row(label: "Model", value: model)
                }
                if let serial = item.serialNumber {
                    row(label: "Serial", value: serial)
                }
                if let room = item.room {
                    row(label: "Room", value: room.name)
                }
                if let cat = item.category {
                    row(label: "Category", value: cat.name)
                }
            }

            // Purchase
            if item.purchaseDate != nil || item.purchasePrice != nil {
                Section("Purchase") {
                    if let date = item.purchaseDate {
                        row(label: "Date", value: date)
                    }
                    if let price = item.purchasePrice {
                        row(label: "Price", value: String(format: "$%.2f", price))
                    }
                }
            }

            // Warranty
            if let warranty = item.warrantyExpiresAt {
                Section("Warranty") {
                    HStack {
                        Text("Expires")
                        Spacer()
                        Text(warranty)
                            .foregroundStyle(warrantyColor)
                    }
                    if case .expired = item.warrantyStatus {
                        Label("Warranty has expired", systemImage: "exclamationmark.triangle.fill")
                            .foregroundStyle(.red)
                            .font(.caption)
                    } else if case .expiringSoon(let days) = item.warrantyStatus {
                        Label("Expires in \(days) days", systemImage: "clock.fill")
                            .foregroundStyle(.orange)
                            .font(.caption)
                    }
                }
            }

            // Notes
            if let notes = item.notes, !notes.isEmpty {
                Section("Notes") {
                    Text(notes)
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                }
            }
        }
        .navigationTitle(item.name)
        .navigationBarTitleDisplayMode(.large)
    }

    private var warrantyColor: Color {
        switch item.warrantyStatus {
        case .expired: return .red
        case .expiringSoon: return .orange
        default: return .primary
        }
    }

    private func row(label: String, value: String) -> some View {
        HStack {
            Text(label).foregroundStyle(.secondary)
            Spacer()
            Text(value)
        }
    }
}
