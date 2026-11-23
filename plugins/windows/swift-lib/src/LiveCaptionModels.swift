import Cocoa

enum LiveCaptionPosition: String, Codable {
  case topCenter
  case topLeft
  case topRight
  case bottomLeft
  case bottomRight
  case bottomCenter
}

enum LiveCaptionLayout {
  static let minWidth: CGFloat = 260
  static let defaultWidth: CGFloat = 440
  static let maxWidth: CGFloat = 640
  static let minLineCount = 1
  static let defaultLineCount = 1
  static let maxLineCount = 4
}
