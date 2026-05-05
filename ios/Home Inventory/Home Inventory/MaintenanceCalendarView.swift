import SwiftUI
import Supabase

private let weekdays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]

struct MaintenanceCalendarView: View {
    @Environment(AppState.self) private var appState
    @State private var events: [MaintenanceEvent] = []
    @State private var isLoading = true
    @State private var displayMonth = Date()
    @State private var selectedDate: String? = nil
    @State private var showCompleteSheet: MaintenanceEvent? = nil

    var body: some View {
        NavigationStack {
            VStack(spacing: 0) {
                monthHeader
                weekdayRow
                calendarGrid
                Divider()
                eventList
            }
            .navigationTitle("Calendar")
            .task { await loadEvents() }
            .refreshable { await loadEvents() }
            .sheet(item: $showCompleteSheet) { event in
                CompleteEventSheet(event: event) { await loadEvents() }
            }
        }
    }

    // MARK: - Header

    private var monthHeader: some View {
        HStack {
            Button { changeMonth(-1) } label: {
                Image(systemName: "chevron.left").font(.title3)
            }
            Spacer()
            Text(monthTitle).font(.headline)
            Spacer()
            Button { changeMonth(1) } label: {
                Image(systemName: "chevron.right").font(.title3)
            }
        }
        .padding(.horizontal)
        .padding(.vertical, 8)
    }

    private var monthTitle: String {
        let f = DateFormatter()
        f.dateFormat = "MMMM yyyy"
        return f.string(from: displayMonth)
    }

    private func changeMonth(_ delta: Int) {
        displayMonth = Foundation.Calendar.current.date(byAdding: .month, value: delta, to: displayMonth) ?? displayMonth
        selectedDate = nil
    }

    // MARK: - Weekday row

    private var weekdayRow: some View {
        HStack(spacing: 0) {
            ForEach(weekdays, id: \.self) { day in
                Text(day).font(.caption2).foregroundStyle(.secondary)
                    .frame(maxWidth: .infinity)
            }
        }
        .padding(.horizontal, 4)
    }

    // MARK: - Calendar grid

    private var calendarGrid: some View {
        let cells = gridCells()
        return LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 0), count: 7), spacing: 4) {
            ForEach(Array(cells.enumerated()), id: \.offset) { _, dateStr in
                if let dateStr {
                    DayCell(
                        dateStr: dateStr,
                        isSelected: selectedDate == dateStr,
                        dots: dotColors(for: dateStr)
                    )
                    .onTapGesture { selectedDate = selectedDate == dateStr ? nil : dateStr }
                } else {
                    Color.clear.frame(height: 44)
                }
            }
        }
        .padding(.horizontal, 4)
        .padding(.bottom, 8)
    }

    private func gridCells() -> [String?] {
        let cal = Foundation.Calendar.current
        let comps = cal.dateComponents([.year, .month], from: displayMonth)
        guard let firstDay = cal.date(from: comps),
              let range = cal.range(of: .day, in: .month, for: firstDay) else { return [] }
        let startWeekday = cal.component(.weekday, from: firstDay) - 1
        var cells: [String?] = Array(repeating: nil, count: startWeekday)
        for day in range {
            if let date = cal.date(byAdding: .day, value: day - 1, to: firstDay) {
                cells.append(DateFormatter.iso8601Date.string(from: date))
            }
        }
        while cells.count % 7 != 0 { cells.append(nil) }
        return cells
    }

    private func dotColors(for dateStr: String) -> [Color] {
        let eventsOnDay = events.filter { $0.scheduledDate == dateStr }
        var colors: [Color] = []
        if eventsOnDay.contains(where: { $0.status == "overdue" }) { colors.append(.red) }
        if eventsOnDay.contains(where: { $0.status == "pending" }) { colors.append(.blue) }
        if eventsOnDay.contains(where: { $0.status == "completed" }) { colors.append(.green) }
        return colors
    }

    // MARK: - Event list

    private var eventList: some View {
        let listEvents: [MaintenanceEvent]
        if let selected = selectedDate {
            listEvents = events.filter { $0.scheduledDate == selected }
        } else {
            listEvents = events.filter { $0.status == "overdue" || $0.status == "pending" }
        }

        return Group {
            if isLoading {
                ProgressView().frame(maxWidth: .infinity).padding()
            } else if listEvents.isEmpty {
                Text(selectedDate != nil ? "No events on this day" : "No upcoming events")
                    .font(.subheadline).foregroundStyle(.secondary)
                    .frame(maxWidth: .infinity).padding()
            } else {
                List(listEvents) { event in
                    CalendarEventRow(event: event) { showCompleteSheet = event }
                }
                .listStyle(.plain)
            }
        }
    }

    // MARK: - Data

    private func loadEvents() async {
        guard let hid = appState.householdId else { return }
        isLoading = true

        let today = DateFormatter.iso8601Date.string(from: .now)
        let in90 = DateFormatter.iso8601Date.string(from: Foundation.Calendar.current.date(byAdding: .day, value: 90, to: .now)!)

        do {
            struct IdRow: Decodable { let id: UUID }
            let items: [IdRow] = try await supabase.from("items").select("id").eq("household_id", value: hid).execute().value
            let itemIds = items.map { $0.id.uuidString.lowercased() }
            guard !itemIds.isEmpty else { isLoading = false; return }

            try await supabase.from("maintenance_events")
                .update(["status": "overdue"])
                .eq("status", value: "pending")
                .lt("scheduled_date", value: today)
                .in("item_id", values: itemIds)
                .execute()

            let result: [MaintenanceEvent] = try await supabase
                .from("maintenance_events")
                .select("*, maintenance_schedules(name, estimated_cost, items(id, name))")
                .in("item_id", values: itemIds)
                .or("status.eq.overdue,and(status.eq.pending,scheduled_date.lte.\(in90))")
                .order("scheduled_date")
                .execute()
                .value
            events = result
        } catch { print("Calendar load error: \(error)") }
        isLoading = false
    }
}

// MARK: - Day cell

private struct DayCell: View {
    let dateStr: String
    let isSelected: Bool
    let dots: [Color]

    private var dayNumber: String {
        String(dateStr.suffix(2)).trimmingCharacters(in: CharacterSet(charactersIn: "0")).isEmpty ? "0" :
        String(Int(dateStr.suffix(2)) ?? 0)
    }

    private var isToday: Bool { dateStr == DateFormatter.iso8601Date.string(from: .now) }

    var body: some View {
        VStack(spacing: 2) {
            Text(dayNumber)
                .font(.system(size: 15, weight: isToday ? .bold : .regular))
                .frame(width: 32, height: 32)
                .background(isSelected ? Color.primary : isToday ? Color.primary.opacity(0.15) : Color.clear, in: Circle())
                .foregroundStyle(isSelected ? Color(UIColor.systemBackground) : .primary)
            HStack(spacing: 2) {
                ForEach(Array(dots.prefix(3).enumerated()), id: \.offset) { _, color in
                    Circle().fill(color).frame(width: 5, height: 5)
                }
            }
            .frame(height: 6)
        }
        .frame(height: 44)
    }
}

// MARK: - Calendar event row

private struct CalendarEventRow: View {
    let event: MaintenanceEvent
    let onComplete: () -> Void

    var statusColor: Color { event.isOverdue ? .red : .blue }

    var body: some View {
        HStack {
            Rectangle().fill(statusColor).frame(width: 3).clipShape(Capsule())
            VStack(alignment: .leading, spacing: 2) {
                Text(event.schedule?.name ?? "—").font(.subheadline.weight(.medium))
                Text(event.schedule?.item?.name ?? "").font(.caption).foregroundStyle(.secondary)
                Text(event.scheduledDateFormatted).font(.caption2).foregroundStyle(statusColor)
            }
            Spacer()
            if event.status != "completed" {
                Button { onComplete() } label: {
                    Image(systemName: "checkmark.circle").font(.title2).foregroundStyle(.green)
                }
                .buttonStyle(.borderless)
            }
        }
        .padding(.vertical, 2)
    }
}
