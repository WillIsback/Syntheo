import Combine
import Foundation

struct FloatingOverlaySettingsChangePayload: Codable {
  var liveCaptionMinimized: Bool?
}

enum FloatingOverlayOpacity {
  static let minFloatingBar = 0.35
  static let minLiveCaption = 0.05
  static let maxFloatingBar = 0.95
  static let maxLiveCaption = 1.0
}

final class FloatingOverlaySettingsModel: ObservableObject {
  static let shared = FloatingOverlaySettingsModel()

  @Published var floatingBarOpacity: Double = 0.78
  @Published var liveCaptionOpacity: Double = 0.30
  @Published var liveCaptionWidth: Double = Double(LiveCaptionLayout.defaultWidth)
  @Published var liveCaptionLineCount: Int = LiveCaptionLayout.defaultLineCount
  @Published var liveCaptionPosition: LiveCaptionPosition = .topCenter
  @Published var liveCaptionMinimized: Bool = true

  private var pendingLiveCaptionMinimized: Bool?

  private init() {}

  func apply(floatingBarState state: FloatingBarStatePayload) {
    applyFloatingBarOpacity(state.opacity)
    applyLiveCaptionOpacity(state.liveCaptionOpacity)
    applyLiveCaptionWidth(state.liveCaptionWidth)
    applyLiveCaptionLineCount(state.liveCaptionLineCount)
    _ = applyLiveCaptionPosition(state.liveCaptionPosition)
    if state.dictation == nil {
      _ = applyLiveCaptionMinimized(state.liveCaptionMinimized)
    }
  }

  func setLiveCaptionMinimized(_ value: Bool) {
    guard liveCaptionMinimized != value else { return }
    liveCaptionMinimized = value
    pendingLiveCaptionMinimized = value
    RustBridge.floatingBarSettingsChanged(
      FloatingOverlaySettingsChangePayload(liveCaptionMinimized: value))
  }

  private func applyFloatingBarOpacity(_ value: Double) {
    let nextValue = clampedFloatingBarOpacity(value)
    guard !opacitiesMatch(floatingBarOpacity, nextValue) else { return }
    floatingBarOpacity = nextValue
  }

  private func applyLiveCaptionOpacity(_ value: Double) {
    let nextValue = clampedLiveCaptionOpacity(value)
    guard !opacitiesMatch(liveCaptionOpacity, nextValue) else { return }
    liveCaptionOpacity = nextValue
  }

  private func applyLiveCaptionWidth(_ value: Double) {
    let nextValue = clampedLiveCaptionWidth(value)
    guard !numbersMatch(liveCaptionWidth, nextValue) else { return }
    liveCaptionWidth = nextValue
  }

  private func applyLiveCaptionLineCount(_ value: Int) {
    let nextValue = clampedLiveCaptionLineCount(value)
    guard liveCaptionLineCount != nextValue else { return }
    liveCaptionLineCount = nextValue
  }

  private func applyLiveCaptionPosition(_ value: LiveCaptionPosition) -> Bool {
    guard liveCaptionPosition != value else { return false }
    liveCaptionPosition = value
    return true
  }

  private func applyLiveCaptionMinimized(_ value: Bool) -> Bool {
    if let pendingLiveCaptionMinimized {
      guard pendingLiveCaptionMinimized == value else { return false }
      self.pendingLiveCaptionMinimized = nil
    }

    guard liveCaptionMinimized != value else { return false }
    liveCaptionMinimized = value
    return true
  }

  private func clampedFloatingBarOpacity(_ value: Double) -> Double {
    min(max(value, FloatingOverlayOpacity.minFloatingBar), FloatingOverlayOpacity.maxFloatingBar)
  }

  private func clampedLiveCaptionOpacity(_ value: Double) -> Double {
    min(max(value, FloatingOverlayOpacity.minLiveCaption), FloatingOverlayOpacity.maxLiveCaption)
  }

  private func clampedLiveCaptionWidth(_ value: Double) -> Double {
    min(max(value, Double(LiveCaptionLayout.minWidth)), Double(LiveCaptionLayout.maxWidth))
  }

  private func clampedLiveCaptionLineCount(_ value: Int) -> Int {
    min(max(value, LiveCaptionLayout.minLineCount), LiveCaptionLayout.maxLineCount)
  }

  private func opacitiesMatch(_ left: Double, _ right: Double) -> Bool {
    numbersMatch(left, right)
  }

  private func numbersMatch(_ left: Double, _ right: Double) -> Bool {
    abs(left - right) < 0.0001
  }
}
