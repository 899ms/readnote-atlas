import AppKit

// One independent desktop surface for Readnote Atlas, not a PiP child of Chrome.
// No browser automation / accessibility permission / screenshot capture.
final class CaptionPanel: NSPanel {
    override var canBecomeKey: Bool { false }
    override var canBecomeMain: Bool { false }
}

final class CaptionView: NSView {
    override var isFlipped: Bool { true }
    let english = NSTextField(wrappingLabelWithString: "")
    let chinese = NSTextField(wrappingLabelWithString: "")
    let rewind = NSButton()
    let pause = NSButton()
    let forward = NSButton()
    let save = NSButton()
    let close = NSButton()
    let glass = NSVisualEffectView()
    var onAction: ((String) -> Void)?
    var resizeStart: (point: NSPoint, frame: NSRect)?
    var tracking: NSTrackingArea?
    var fittedSize: CGFloat = 18
    var controlsVisible = false

    override init(frame: NSRect) {
        super.init(frame: frame)
        wantsLayer = true
        layer?.cornerRadius = 12
        layer?.masksToBounds = true
        layer?.backgroundColor = NSColor(calibratedRed: 0.06, green: 0.07, blue: 0.09, alpha: 0.84).cgColor
        layer?.borderColor = NSColor.white.withAlphaComponent(0.25).cgColor
        layer?.borderWidth = 0.7
        // Neutral smoke tint keeps the surface legible on light wallpapers
        // without turning it into an opaque black slab.
        glass.material = .underWindowBackground
        glass.blendingMode = .behindWindow
        glass.state = .active
        glass.alphaValue = 0.28
        glass.wantsLayer = true
        glass.layer?.backgroundColor = NSColor(calibratedRed: 0.12, green: 0.14, blue: 0.17, alpha: 0.42).cgColor
        addSubview(glass)
        for label in [english, chinese] {
            label.isSelectable = false
            label.maximumNumberOfLines = 0
            label.lineBreakMode = .byWordWrapping
            label.cell?.truncatesLastVisibleLine = false
            label.alignment = .left
            label.setContentCompressionResistancePriority(.defaultLow, for: .horizontal)
            let shadow = NSShadow()
            shadow.shadowBlurRadius = 3
            shadow.shadowOffset = NSSize(width: 0, height: -1)
            shadow.shadowColor = NSColor.black.withAlphaComponent(0.85)
            label.shadow = shadow
            addSubview(label)
        }
        english.textColor = .white
        chinese.textColor = NSColor(calibratedRed: 1, green: 0.96, blue: 0.8, alpha: 1)
        for (button, symbol, label) in [(rewind, "gobackward.15", "Rewind 15 seconds"), (pause, "pause.fill", "Pause video"), (forward, "goforward.15", "Forward 15 seconds"), (save, "bookmark", "Save bookmark"), (close, "xmark", "Hide captions until returning to YouTube")] {
            button.isBordered = false
            button.image = NSImage(systemSymbolName: symbol, accessibilityDescription: label)
            button.contentTintColor = .white
            button.toolTip = label
            button.target = self
            button.action = #selector(buttonPressed(_:))
            button.imageScaling = .scaleProportionallyDown
            button.wantsLayer = true
            button.layer?.backgroundColor = NSColor(calibratedWhite: 0.12, alpha: 0.94).cgColor
            button.layer?.borderColor = NSColor.white.withAlphaComponent(0.2).cgColor
            button.layer?.borderWidth = 0.5
            addSubview(button)
        }
        // Keep the surface quiet until the pointer is over it. Controls are
        // discoverable on hover, while the caption itself remains unobstructed.
        setControlsVisible(false)
        setAccessibilityLabel("Atlas desktop captions")
    }
    required init?(coder: NSCoder) { fatalError("not used") }
    @objc func buttonPressed(_ sender: NSButton) {
        onAction?(sender === rewind ? "rewind" : sender === pause ? "playback" : sender === forward ? "forward" : sender === save ? "bookmark" : "close")
    }
    func height(_ text: String, size: CGFloat, width: CGFloat) -> CGFloat {
        if text.isEmpty { return 0 }
        let style = NSMutableParagraphStyle()
        style.lineBreakMode = .byWordWrapping
        style.alignment = .left
        return ceil((text as NSString).boundingRect(with: NSSize(width: max(1, width - 6), height: 100_000),
            options: [.usesLineFragmentOrigin, .usesFontLeading],
            attributes: [.font: NSFont.systemFont(ofSize: size, weight: .medium), .paragraphStyle: style]).height) + 3
    }
    func setCaption(en: String, zh: String, playing: Bool, live: Bool) {
        english.stringValue = en
        chinese.stringValue = zh
        pause.image = NSImage(systemSymbolName: playing ? "pause.fill" : "play.fill", accessibilityDescription: playing ? "Pause video" : "Play video")
        pause.toolTip = playing ? "Pause video" : "Play video"
        save.isEnabled = live
        for button in [rewind, pause, forward] { button.isEnabled = live }
        save.toolTip = live ? "Save bookmark in Atlas" : "Preview only — connect YouTube to save"
        needsLayout = true
    }
    override func layout() {
        super.layout()
        glass.frame = bounds
        let width = max(1, bounds.width - 32)
        let available = max(1, bounds.height - 24)
        var low: CGFloat = 1
        var high: CGFloat = min(34, bounds.width / 17)
        for _ in 0..<14 {
            let size = (low + high) / 2
            let gap = english.stringValue.isEmpty || chinese.stringValue.isEmpty ? 0 : size * 0.5
            let needed = height(english.stringValue, size: size, width: width) + height(chinese.stringValue, size: size * 0.95, width: width) + gap
            if needed <= available { low = size } else { high = size }
        }
        fittedSize = low
        english.font = .systemFont(ofSize: low, weight: .medium)
        chinese.font = .systemFont(ofSize: low * 0.95, weight: .medium)
        let enHeight = height(english.stringValue, size: low, width: width)
        let zhHeight = height(chinese.stringValue, size: low * 0.95, width: width)
        let gap = english.stringValue.isEmpty || chinese.stringValue.isEmpty ? 0 : low * 0.5
        let top = 12 + max(0, (available - enHeight - zhHeight - gap) / 2)
        english.frame = NSRect(x: 16, y: top, width: width, height: enHeight)
        chinese.frame = NSRect(x: 16, y: top + enHeight + gap, width: width, height: zhHeight)
        let side = max(36, min(80, min(bounds.width * 0.12, bounds.height * 0.36)))
        let center = side * 1.2
        let distance = (side + center) / 2 + max(12, side * 0.3)
        rewind.frame = NSRect(x: bounds.midX - distance - side / 2, y: bounds.midY - side / 2, width: side, height: side)
        pause.frame = NSRect(x: bounds.midX - center / 2, y: bounds.midY - center / 2, width: center, height: center)
        forward.frame = NSRect(x: bounds.midX + distance - side / 2, y: bounds.midY - side / 2, width: side, height: side)
        for button in [rewind, pause, forward] {
            button.image = button.image?.withSymbolConfiguration(NSImage.SymbolConfiguration(pointSize: button.bounds.width * 0.5, weight: .medium))
        }
        save.frame = NSRect(x: 10, y: bounds.height - 34, width: 26, height: 26)
        close.frame = NSRect(x: bounds.width - 32, y: 8, width: 24, height: 24)
        for button in [rewind, pause, forward, save, close] { button.layer?.cornerRadius = button.bounds.width / 2 }
        needsDisplay = true
    }
    override func draw(_ dirtyRect: NSRect) {
        super.draw(dirtyRect)
        NSColor.white.withAlphaComponent(0.45).setStroke()
        let path = NSBezierPath()
        path.lineWidth = 1.2
        for offset: CGFloat in [0, 4] {
            path.move(to: NSPoint(x: bounds.width - 6 - offset, y: bounds.height - 5))
            path.line(to: NSPoint(x: bounds.width - 5, y: bounds.height - 6 - offset))
        }
        path.stroke()
    }
    override func updateTrackingAreas() {
        super.updateTrackingAreas()
        if let area = tracking { removeTrackingArea(area) }
        let area = NSTrackingArea(rect: bounds, options: [.mouseEnteredAndExited, .activeAlways, .inVisibleRect], owner: self)
        tracking = area; addTrackingArea(area)
    }
    func setControlsVisible(_ visible: Bool) {
        controlsVisible = visible
        for button in [rewind, pause, forward, save, close] { button.isHidden = !visible }
        for label in [english, chinese] { label.alphaValue = visible ? 0.9 : 1 }
    }
    override func mouseEntered(with event: NSEvent) { setControlsVisible(true) }
    override func mouseExited(with event: NSEvent) { setControlsVisible(false) }
    override func mouseDown(with event: NSEvent) {
        guard let window else { return }
        let local = convert(event.locationInWindow, from: nil)
        if local.x > bounds.width - 23 && local.y > bounds.height - 26 {
            resizeStart = (NSEvent.mouseLocation, window.frame)
        } else { window.performDrag(with: event) }
    }
    override func mouseDragged(with event: NSEvent) {
        guard let start = resizeStart, let window else { return }
        let position = NSEvent.mouseLocation
        let screen = window.screen?.visibleFrame ?? NSRect(x: 0, y: 0, width: 1400, height: 900)
        let width = min(screen.width, max(260, start.frame.width + position.x - start.point.x))
        let height = min(screen.height, max(96, start.frame.height - position.y + start.point.y))
        window.setFrame(NSRect(x: start.frame.minX, y: start.frame.maxY - height, width: width, height: height), display: true)
    }
    override func mouseUp(with event: NSEvent) { resizeStart = nil }
}

final class AppDelegate: NSObject, NSApplicationDelegate {
    var panel: CaptionPanel!
    var captions: CaptionView!
    var item: NSStatusItem!
    var status: NSMenuItem!
    var previewItem: NSMenuItem!
    var source: [String: Any]?
    var connectedOnce = false
    var preview = CommandLine.arguments.contains("--preview")
    var previewPaused = false
    var requestRunning = false
    var visibility = CaptionWindowState()
    var lastResultId = ""
    var previewIndex = 0
    var lastTransition = ""
    var savedUntil = Date.distantPast
    let token = ProcessInfo.processInfo.environment["READNOTE_DESKTOP_SESSION"] ?? ""
    let examples = [
        ("This desktop preview stays above other apps, even when Chrome is minimized.", "这是桌面预览：即使 Chrome 最小化，字幕窗也能留在其他应用上方。"),
        ("Make the box smaller. The text wraps and scales with it.", "缩小窗口，文字会自动换行，并随窗口一起调整大小。"),
        ("The best ideas often arrive while you are doing something else. Keep listening, and save the moment when something clicks.", "好想法常常在你做其他事情时出现。继续听，在有所领悟的那一刻，留下书签。")
    ]
    func applicationDidFinishLaunching(_ notification: Notification) {
        let frame = NSRect(x: 0, y: 0, width: 440, height: 146)
        panel = CaptionPanel(contentRect: frame, styleMask: [.borderless, .nonactivatingPanel, .resizable], backing: .buffered, defer: false)
        panel.title = "Readnote Atlas Captions"
        panel.isOpaque = false
        panel.backgroundColor = .clear
        panel.hasShadow = true
        panel.level = .floating
        panel.hidesOnDeactivate = false
        panel.collectionBehavior = [.canJoinAllSpaces, .fullScreenAuxiliary, .ignoresCycle]
        panel.minSize = NSSize(width: 260, height: 96)
        captions = CaptionView(frame: frame)
        captions.onAction = { [weak self] action in self?.action(action) }
        panel.contentView = captions
        if let screen = NSScreen.main?.visibleFrame {
            panel.setFrameOrigin(NSPoint(x: screen.maxX - 464, y: screen.minY + 32))
        }
        item = NSStatusBar.system.statusItem(withLength: NSStatusItem.squareLength)
        item.button?.image = NSImage(systemSymbolName: "captions.bubble", accessibilityDescription: "Readnote Atlas captions")
        let menu = NSMenu()
        status = NSMenuItem(title: "Preview — YouTube bridge not connected", action: nil, keyEquivalent: "")
        menu.addItem(status)
        menu.addItem(.separator())
        previewItem = NSMenuItem(title: "Show / hide preview", action: #selector(togglePreview), keyEquivalent: "")
        previewItem.target = self; menu.addItem(previewItem)
        let quit = NSMenuItem(title: "Quit desktop captions", action: #selector(quitPrototype), keyEquivalent: "q")
        quit.target = self; menu.addItem(quit)
        item.menu = menu
        if preview { showPreview() }
        Timer.scheduledTimer(withTimeInterval: 5, repeats: true) { [weak self] _ in
            guard let self, self.preview && !self.previewPaused else { return }
            self.previewIndex += 1; self.showPreview()
        }
        Timer.scheduledTimer(withTimeInterval: 0.2, repeats: true) { [weak self] _ in self?.poll() }
        poll()
    }
    func showPreview() {
        let example = examples[previewIndex % examples.count]
        captions.setCaption(en: example.0, zh: example.1, playing: !previewPaused, live: false)
        panel.orderFrontRegardless()
    }
    @objc func togglePreview() {
        preview.toggle()
        if preview { showPreview() } else { panel.orderOut(nil) }
    }
    @objc func quitPrototype() { NSApp.terminate(nil) }
    func request(_ path: String, body: [String: Any]? = nil, completion: @escaping ([String: Any]?) -> Void) {
        var request = URLRequest(url: URL(string: "http://127.0.0.1:8792\(path)")!)
        request.timeoutInterval = 2
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        if let body {
            request.httpMethod = "POST"
            request.httpBody = try? JSONSerialization.data(withJSONObject: body)
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        }
        URLSession.shared.dataTask(with: request) { data, response, _ in
            let valid = (response as? HTTPURLResponse)?.statusCode == 200
            let json = valid ? data.flatMap { try? JSONSerialization.jsonObject(with: $0) as? [String: Any] } : nil
            DispatchQueue.main.async { completion(json) }
        }.resume()
    }
    func poll() {
        if requestRunning { return }
        requestRunning = true
        request("/state") { [weak self] response in
            guard let self else { return }
            self.requestRunning = false
            if let result = response?["result"] as? [String: Any], let id = result["id"] as? String, id != self.lastResultId {
                self.lastResultId = id
                if result["ok"] as? Bool == true {
                    self.status.title = "Action completed in YouTube"
                } else { self.status.title = "Action unavailable — check YouTube" }
            }
            guard let state = response?["state"] as? [String: Any] else {
                if !self.preview {
                    // Keep the last cue through timer throttling while paused.
                    // The extension wakes the paused source independently;
                    // keep the controls ready during a transient heartbeat gap.
                    if !self.visibility.update(id: nil) { self.panel.orderOut(nil) }
                }
                self.status.title = self.connectedOnce ? "Waiting for playing YouTube video" : "Preview — YouTube bridge not connected"
                return
            }
            if !self.connectedOnce { self.preview = false; self.connectedOnce = true }
            self.source = state
            if self.preview { return }
            let id = "\(state["tabId"] ?? ""):\(state["videoId"] ?? "")"
            // The extension owns authoritative tab/window state. The panel may
            // be frontmost itself, so NSWorkspace is not a reliable signal.
            let sourceVisible = state["sourceVisible"] as? Bool == true
            let playing = state["playing"] as? Bool == true
            let en = state["en"] as? String ?? ""
            let zh = state["zh"] as? String ?? ""
            let show = self.visibility.update(id: id, sourceVisible: sourceVisible, playing: playing,
                enabled: state["enabled"] as? Bool != false, hasCaption: !en.isEmpty || !zh.isEmpty)
            self.status.title = sourceVisible ? "Live — YouTube in foreground" : "Live — desktop captions"
            let transition = "desktop visible=\(show) sourceVisible=\(sourceVisible) playing=\(playing) window=\(state["windowState"] ?? "unknown")"
            if transition != self.lastTransition { print(transition); fflush(stdout); self.lastTransition = transition }
            // YouTube may clear its cue after pausing. Retain the frozen words.
            if playing || !en.isEmpty || !zh.isEmpty || !show {
                self.captions.setCaption(en: en, zh: zh, playing: playing, live: true)
            } else {
                self.captions.setCaption(en: self.captions.english.stringValue, zh: self.captions.chinese.stringValue, playing: false, live: true)
            }
            if show {
                if !self.panel.isVisible { self.panel.orderFrontRegardless() }
            } else { self.panel.orderOut(nil) }
        }
    }
    func action(_ action: String) {
        if action == "close" {
            visibility.dismiss()
            preview = false; panel.orderOut(nil); return
        }
        if preview {
            if action == "playback" { previewPaused.toggle(); showPreview() }
            return
        }
        guard let source else { return }
        request("/command", body: ["action": action, "tabId": source["tabId"] ?? 0, "videoId": source["videoId"] ?? "", "time": source["time"] ?? 0]) { [weak self] result in
            if result == nil { self?.status.title = "Action failed — source disconnected" }
        }
    }
}

@main
struct AtlasCaptionsApp {
    static func main() {
        let app = NSApplication.shared
        let delegate = AppDelegate()
        app.delegate = delegate
        app.setActivationPolicy(.accessory)
        withExtendedLifetime(delegate) { app.run() }
    }
}
