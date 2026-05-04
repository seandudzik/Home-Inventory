import SwiftUI

struct MainTabView: View {
    var body: some View {
        TabView {
            DashboardView()
                .tabItem { Label("Dashboard", systemImage: "house") }

            ItemsView()
                .tabItem { Label("Items", systemImage: "cube.box") }

            MaintenanceView()
                .tabItem { Label("Maintenance", systemImage: "wrench.and.screwdriver") }

            RoomsView()
                .tabItem { Label("Rooms", systemImage: "square.split.2x1") }

            ChatView()
                .tabItem { Label("Assistant", systemImage: "bubble.left.and.bubble.right") }
        }
    }
}
