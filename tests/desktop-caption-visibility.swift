@main
struct VisibilityTests {
    static func main() {
        var state = CaptionWindowState()
        precondition(!state.update(id: "a", playing: false), "paused video must not open a new surface")
        precondition(!state.update(id: "a", sourceVisible: true, playing: true))
        precondition(state.update(id: "a", playing: true), "leaving YouTube opens captions")
        for _ in 0..<100 {
            precondition(state.update(id: "a", playing: false), "pause must not close captions")
            precondition(state.update(id: nil), "heartbeat gap must not close captions")
        }
        state.dismiss()
        precondition(!state.update(id: nil))
        precondition(!state.update(id: "a", playing: true), "X must prevent immediate reopening")
        precondition(!state.update(id: "a", sourceVisible: true, playing: false))
        precondition(!state.update(id: "a", playing: false))
        precondition(state.update(id: "a", playing: true))
        precondition(!state.update(id: "b", playing: false), "do not carry a caption into a new video")
        precondition(state.update(id: "b", playing: true))
        precondition(!state.update(id: "b", playing: true, enabled: false))
        precondition(!state.update(id: "c", playing: true, hasCaption: false))
        print("Desktop visibility: pause, disconnect, close, return, new source, captions Off — passed")
    }
}
