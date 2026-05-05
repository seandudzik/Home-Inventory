import SwiftUI
import VisionKit

struct BarcodeScannerView: UIViewControllerRepresentable {
    let onScan: (String) -> Void
    @Environment(\.dismiss) private var dismiss

    func makeUIViewController(context: Context) -> DataScannerViewController {
        let vc = DataScannerViewController(
            recognizedDataTypes: [.barcode()],
            isHighlightingEnabled: true
        )
        vc.delegate = context.coordinator
        try? vc.startScanning()
        return vc
    }

    func updateUIViewController(_ uiViewController: DataScannerViewController, context: Context) {}

    func makeCoordinator() -> Coordinator { Coordinator(onScan: onScan, dismiss: dismiss) }

    class Coordinator: NSObject, DataScannerViewControllerDelegate {
        let onScan: (String) -> Void
        let dismiss: DismissAction
        private var scanned = false

        init(onScan: @escaping (String) -> Void, dismiss: DismissAction) {
            self.onScan = onScan
            self.dismiss = dismiss
        }

        func dataScanner(_ dataScanner: DataScannerViewController, didAdd addedItems: [RecognizedItem], allItems: [RecognizedItem]) {
            guard !scanned else { return }
            for item in addedItems {
                if case .barcode(let code) = item, let value = code.payloadStringValue, !value.isEmpty {
                    scanned = true
                    dataScanner.stopScanning()
                    onScan(value)
                    dismiss()
                    return
                }
            }
        }
    }
}

// Wrapper view with a cancel button overlay
struct BarcodeScannerSheet: View {
    let onScan: (String) -> Void
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        if DataScannerViewController.isSupported && DataScannerViewController.isAvailable {
            ZStack(alignment: .topTrailing) {
                BarcodeScannerView(onScan: onScan)
                    .ignoresSafeArea()
                Button("Cancel") { dismiss() }
                    .padding()
                    .background(.ultraThinMaterial, in: Capsule())
                    .padding()
            }
        } else {
            VStack(spacing: 16) {
                Image(systemName: "barcode.viewfinder")
                    .font(.system(size: 48))
                    .foregroundStyle(.secondary)
                Text("Barcode scanning not available")
                    .font(.headline)
                Text("Use a physical device to scan barcodes.")
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
                Button("Dismiss") { dismiss() }
                    .buttonStyle(.bordered)
            }
            .padding()
        }
    }
}
