import SwiftUI
import WebKit

@main struct StageSetHostApp: App {
    var body: some Scene { WindowGroup { HostView() } }
}

struct SharedPDF: Identifiable { let id = UUID(); let url: URL }
struct HostView: View {
    @AppStorage("serverAddress") private var address = ""
    @State private var server: URL?
    @State private var error = ""
    @State private var pdf: SharedPDF?
    var body: some View {
        ZStack(alignment: .bottomTrailing) {
            Color(red: 16/255, green: 20/255, blue: 27/255).ignoresSafeArea()
            if let server {
                Receiver(url: server, onFailure: { message in self.server = nil; error = message }, onPDF: { pdf = SharedPDF(url: $0) })
                Button { self.server = nil } label: { Image(systemName: "house.fill").padding(14).background(.black.opacity(0.55)).clipShape(Circle()) }
                    .accessibilityLabel("Mudar de servidor").padding(16)
            } else {
                ScrollView {
                    VStack(alignment: .leading, spacing: 18) {
                        Text("StageSet Host").font(.largeTitle.bold()).foregroundStyle(.mint)
                        Text("Recetor de letras · iPhone e iPad")
                        Text("Endereço mostrado no StageSet")
                        TextField("http://192.168.1.20:4180", text: $address).textFieldStyle(.roundedBorder).keyboardType(.URL).textInputAutocapitalization(.never).autocorrectionDisabled().accessibilityIdentifier("server-address")
                        Button("Ligar ao StageSet", action: connect).buttonStyle(.borderedProminent).tint(.mint)
                        Text(error).foregroundStyle(.orange).accessibilityLabel(error)
                        Text("Usa a mesma rede do computador principal e permite o acesso à rede local. Depois de ligar, indica o nome deste dispositivo e o código da sessão. No StageSet principal, atribui a saída de letras.")
                    }.padding(28).frame(maxWidth: 600)
                }.frame(maxWidth: .infinity)
            }
        }
        .preferredColorScheme(.dark)
        .statusBarHidden(server != nil)
        .onChange(of: server) { value in UIApplication.shared.isIdleTimerDisabled = value != nil }
        .sheet(item: $pdf) { item in SharePDF(url: item.url) }
    }
    private func connect() {
        guard var components = URLComponents(string: address.trimmingCharacters(in: .whitespacesAndNewlines)),
              ["http", "https"].contains(components.scheme ?? ""), components.host?.isEmpty == false,
              components.user == nil, components.password == nil else { error = "Indica um endereço HTTP ou HTTPS válido."; return }
        components.path = "/host.html"; components.query = nil; components.fragment = nil
        server = components.url; error = ""
    }
}

struct SharePDF: UIViewControllerRepresentable {
    let url: URL
    func makeUIViewController(context: Context) -> UIActivityViewController { UIActivityViewController(activityItems: [url], applicationActivities: nil) }
    func updateUIViewController(_ controller: UIActivityViewController, context: Context) {}
}

struct Receiver: UIViewRepresentable {
    let url: URL
    let onFailure: (String) -> Void
    let onPDF: (URL) -> Void
    func makeCoordinator() -> Coordinator { Coordinator(parent: self) }
    func makeUIView(context: Context) -> WKWebView {
        let config = WKWebViewConfiguration(); config.allowsInlineMediaPlayback = true
        config.applicationNameForUserAgent = "StageSetHost/iOS"
        let view = WKWebView(frame: .zero, configuration: config)
        view.navigationDelegate = context.coordinator
        view.isOpaque = false; view.backgroundColor = .black
        view.scrollView.contentInsetAdjustmentBehavior = .never
        view.load(URLRequest(url: url)); return view
    }
    func updateUIView(_ view: WKWebView, context: Context) {}
    static func dismantleUIView(_ view: WKWebView, coordinator: Coordinator) { view.stopLoading(); view.navigationDelegate = nil }
    class Coordinator: NSObject, WKNavigationDelegate, WKDownloadDelegate {
        let parent: Receiver
        var downloaded: URL?
        init(parent: Receiver) { self.parent = parent }
        func allowed(_ url: URL) -> Bool { url.scheme == parent.url.scheme && url.host == parent.url.host && url.port == parent.url.port }
        func webView(_ view: WKWebView, decidePolicyFor action: WKNavigationAction, decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
            guard let url = action.request.url else { decisionHandler(.cancel); return }
            let blob = url.scheme == "blob" && URL(string: String(url.absoluteString.dropFirst(5))).map(allowed) == true
            guard allowed(url) || blob else { decisionHandler(.cancel); return }
            decisionHandler(action.shouldPerformDownload ? .download : .allow)
        }
        func webView(_ view: WKWebView, navigationAction: WKNavigationAction, didBecome download: WKDownload) { download.delegate = self }
        func webView(_ view: WKWebView, decidePolicyFor response: WKNavigationResponse, decisionHandler: @escaping (WKNavigationResponsePolicy) -> Void) { decisionHandler(response.canShowMIMEType ? .allow : .download) }
        func webView(_ view: WKWebView, navigationResponse: WKNavigationResponse, didBecome download: WKDownload) { download.delegate = self }
        func download(_ download: WKDownload, decideDestinationUsing response: URLResponse, suggestedFilename: String, completionHandler: @escaping (URL?) -> Void) {
            guard response.mimeType == "application/pdf", response.expectedContentLength <= 30000000 else { completionHandler(nil); return }
            let target = FileManager.default.temporaryDirectory.appendingPathComponent("StageSet-\(UUID().uuidString).pdf")
            downloaded = target; completionHandler(target)
        }
        func downloadDidFinish(_ download: WKDownload) { if let downloaded { parent.onPDF(downloaded) } }
        func download(_ download: WKDownload, didFailWithError error: Error, resumeData: Data?) { parent.onFailure("Não foi possível guardar o PDF: \(error.localizedDescription)") }
        func webView(_ view: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
            if (error as NSError).code != NSURLErrorCancelled { parent.onFailure("Não foi possível ligar. Confirma o endereço, a autorização de rede local e o certificado HTTPS.\n\(error.localizedDescription)") }
        }
        // Default TLS validation: never accept an untrusted server certificate automatically.
    }
}
