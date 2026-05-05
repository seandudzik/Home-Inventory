import Foundation

struct ProductInfo {
    let title: String
    let brand: String?
    let description: String?
    let imageURL: String?
}

enum ProductLookupService {
    static func lookup(barcode: String) async -> ProductInfo? {
        if let result = await openFoodFacts(barcode) { return result }
        return await upcItemDB(barcode)
    }

    private static func openFoodFacts(_ barcode: String) async -> ProductInfo? {
        guard let url = URL(string: "https://world.openfoodfacts.org/api/v0/product/\(barcode).json") else { return nil }
        guard let (data, _) = try? await URLSession.shared.data(from: url) else { return nil }

        struct Response: Decodable {
            let status: Int
            let product: Product?
            struct Product: Decodable {
                let productName: String?
                let brands: String?
                let genericName: String?
                let imageURL: String?
                enum CodingKeys: String, CodingKey {
                    case productName = "product_name"
                    case brands
                    case genericName = "generic_name"
                    case imageURL = "image_url"
                }
            }
        }
        guard let r = try? JSONDecoder().decode(Response.self, from: data),
              r.status == 1,
              let name = r.product?.productName, !name.isEmpty else { return nil }
        return ProductInfo(title: name, brand: r.product?.brands, description: r.product?.genericName, imageURL: r.product?.imageURL)
    }

    private static func upcItemDB(_ barcode: String) async -> ProductInfo? {
        guard let url = URL(string: "https://api.upcitemdb.com/prod/trial/lookup?upc=\(barcode)") else { return nil }
        guard let (data, _) = try? await URLSession.shared.data(from: url) else { return nil }

        struct Response: Decodable {
            let items: [Item]?
            struct Item: Decodable {
                let title: String?
                let brand: String?
                let description: String?
                let images: [String]?
            }
        }
        guard let r = try? JSONDecoder().decode(Response.self, from: data),
              let item = r.items?.first,
              let title = item.title, !title.isEmpty else { return nil }
        return ProductInfo(title: title, brand: item.brand, description: item.description, imageURL: item.images?.first)
    }
}
