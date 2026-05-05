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

            MaintenanceCalendarView()
                .tabItem { Label("Calendar", systemImage: "calendar") }

            RoomsView()
                .tabItem { Label("Rooms", systemImage: "square.split.2x1") }

            CategoriesView()
                .tabItem { Label("Categories", systemImage: "tag") }

            ChatView()
                .tabItem { Label("Assistant", systemImage: "bubble.left.and.bubble.right") }
        }
    }
}
