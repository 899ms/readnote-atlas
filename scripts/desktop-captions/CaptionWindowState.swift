// Desktop visibility is independent of playback and the bridge heartbeat timer.
// Pausing/temporary disconnection freezes an existing surface; it never opens one.
struct CaptionWindowState {
    private var visibleID: String?
    private var dismissedID: String?

    mutating func update(id: String?, sourceVisible: Bool = false, playing: Bool = false,
                         enabled: Bool = true, hasCaption: Bool = true) -> Bool {
        guard let id else { return visibleID != nil }
        if sourceVisible {
            visibleID = nil
            dismissedID = nil
            return false
        }
        if !enabled || dismissedID == id {
            visibleID = nil
            return false
        }
        if visibleID != id { visibleID = nil }
        if playing && hasCaption { visibleID = id }
        return visibleID == id
    }

    mutating func dismiss() {
        dismissedID = visibleID
        visibleID = nil
    }
}
