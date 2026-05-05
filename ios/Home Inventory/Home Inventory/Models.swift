import Foundation

// MARK: - Item

struct Item: Codable, Identifiable {
    let id: UUID
    let householdId: UUID
    let name: String
    let brand: String?
    let model: String?
    let serialNumber: String?
    let roomId: UUID?
    let categoryId: UUID?
    let purchaseDate: String?
    let purchasePrice: Double?
    let warrantyExpiresAt: String?
    let notes: String?
    let createdAt: String
    var room: RoomRef?
    var category: CategoryRef?

    enum CodingKeys: String, CodingKey {
        case id, name, brand, model, notes
        case householdId = "household_id"
        case serialNumber = "serial_number"
        case roomId = "room_id"
        case categoryId = "category_id"
        case purchaseDate = "purchase_date"
        case purchasePrice = "purchase_price"
        case warrantyExpiresAt = "warranty_expires_at"
        case createdAt = "created_at"
        case room = "rooms"
        case category = "categories"
    }

    var warrantyStatus: WarrantyStatus {
        guard let expiryStr = warrantyExpiresAt,
              let expiry = DateFormatter.iso8601Date.date(from: expiryStr) else {
            return .none
        }
        let days = Calendar.current.dateComponents([.day], from: .now, to: expiry).day ?? 0
        if days < 0 { return .expired }
        if days <= 90 { return .expiringSoon(days: days) }
        return .valid
    }
}

enum WarrantyStatus {
    case none, expired, expiringSoon(days: Int), valid
}

struct RoomRef: Codable {
    let name: String
}

struct CategoryRef: Codable {
    let name: String
    let color: String?
    let icon: String?
}

// MARK: - Room

struct Room: Codable, Identifiable {
    let id: UUID
    let householdId: UUID
    let name: String
    let floor: Int?

    enum CodingKeys: String, CodingKey {
        case id, name, floor
        case householdId = "household_id"
    }
}

// MARK: - Category

struct Category: Codable, Identifiable {
    let id: UUID
    let householdId: UUID
    let name: String
    let color: String?
    let icon: String?
    let parentCategoryId: UUID?

    enum CodingKeys: String, CodingKey {
        case id, name, color, icon
        case householdId = "household_id"
        case parentCategoryId = "parent_category_id"
    }
}

// MARK: - Maintenance

struct MaintenanceEvent: Codable, Identifiable {
    let id: UUID
    let scheduleId: UUID
    let itemId: UUID
    let scheduledDate: String
    var status: String
    let completedAt: String?
    let actualCost: Double?
    var schedule: MaintenanceScheduleRef?

    enum CodingKeys: String, CodingKey {
        case id, status
        case scheduleId = "schedule_id"
        case itemId = "item_id"
        case scheduledDate = "scheduled_date"
        case completedAt = "completed_at"
        case actualCost = "actual_cost"
        case schedule = "maintenance_schedules"
    }

    var isOverdue: Bool { status == "overdue" }

    var scheduledDateFormatted: String {
        DateFormatter.iso8601Date.date(from: scheduledDate)
            .map { DateFormatter.display.string(from: $0) } ?? scheduledDate
    }
}

struct MaintenanceScheduleRef: Codable {
    let name: String
    let estimatedCost: Double?
    let item: ItemRef?

    enum CodingKeys: String, CodingKey {
        case name
        case estimatedCost = "estimated_cost"
        case item = "items"
    }
}

struct ItemRef: Codable {
    let id: UUID
    let name: String
}

// MARK: - Attachment

struct ItemAttachment: Codable, Identifiable {
    let id: UUID
    let itemId: UUID
    let storagePath: String
    let fileName: String
    let mimeType: String
    let sizeBytes: Int
    let isPrimaryImage: Bool
    let createdAt: String

    enum CodingKeys: String, CodingKey {
        case id
        case itemId = "item_id"
        case storagePath = "storage_path"
        case fileName = "file_name"
        case mimeType = "mime_type"
        case sizeBytes = "size_bytes"
        case isPrimaryImage = "is_primary_image"
        case createdAt = "created_at"
    }

    var isImage: Bool { mimeType.hasPrefix("image/") }
}

// MARK: - Chat

struct ChatMessage: Identifiable {
    let id = UUID()
    let role: String  // "user" or "model"
    var content: String
}

// MARK: - Date Formatters

extension DateFormatter {
    static let iso8601Date: DateFormatter = {
        let f = DateFormatter()
        f.dateFormat = "yyyy-MM-dd"
        return f
    }()

    static let display: DateFormatter = {
        let f = DateFormatter()
        f.dateStyle = .medium
        f.timeStyle = .none
        return f
    }()
}
