import SwiftUI

struct ContentView: View {
    @Environment(AppState.self) private var appState

    var body: some View {
        Group {
            if appState.isLoading {
                ProgressView()
                    .task { await appState.initialize() }
            } else if appState.isAuthenticated {
                MainTabView()
            } else {
                AuthView()
            }
        }
    }
}
