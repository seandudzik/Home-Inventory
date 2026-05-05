import Foundation
import Supabase

let supabase = SupabaseClient(
    supabaseURL: URL(string: "https://azqscjzcoyfacdfudufp.supabase.co")!,
    supabaseKey: "sb_publishable_d2Xa7MZhuHGfZyiF-RAHug_ZY0WmrTr",
    options: SupabaseClientOptions(
        auth: SupabaseClientOptions.AuthOptions(
            emitLocalSessionAsInitialSession: true
        )
    )
)

// Paste your Gemini API key from https://aistudio.google.com/app/apikey
let geminiAPIKey = "AIzaSyAoV4cXqHburzgH6XFFxZsrLBSCogc66a4"
