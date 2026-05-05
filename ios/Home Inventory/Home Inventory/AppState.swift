import Foundation
import Supabase
import Observation

@Observable
final class AppState {
    var isAuthenticated = false
    var householdId: String? = nil
    var userId: String? = nil
    var isLoading = true

    func initialize() async {
        do {
            let session = try await supabase.auth.session
            isAuthenticated = true
            let uid = session.user.id.uuidString.lowercased()
            userId = uid
            await fetchHouseholdId(userId: uid)
        } catch {
            isAuthenticated = false
        }
        isLoading = false

        Task {
            for await (event, session) in supabase.auth.authStateChanges {
                switch event {
                case .signedIn:
                    isAuthenticated = true
                    if let uid = session?.user.id.uuidString.lowercased() {
                        userId = uid
                        await fetchHouseholdId(userId: uid)
                    }
                case .signedOut:
                    isAuthenticated = false
                    householdId = nil
                    userId = nil
                default:
                    break
                }
            }
        }
    }

    func signIn(email: String, password: String) async throws {
        let session = try await supabase.auth.signIn(email: email, password: password)
        isAuthenticated = true
        let uid = session.user.id.uuidString.lowercased()
        userId = uid
        await fetchHouseholdId(userId: uid)
    }

    func signOut() async {
        try? await supabase.auth.signOut()
        isAuthenticated = false
        householdId = nil
        userId = nil
    }

    private func fetchHouseholdId(userId: String) async {
        struct MemberRow: Decodable {
            let householdId: String
            enum CodingKeys: String, CodingKey { case householdId = "household_id" }
        }
        do {
            let row: MemberRow = try await supabase
                .from("household_members")
                .select("household_id")
                .eq("user_id", value: userId)
                .limit(1)
                .single()
                .execute()
                .value
            householdId = row.householdId.lowercased()
        } catch {
            householdId = nil
        }
    }
}
