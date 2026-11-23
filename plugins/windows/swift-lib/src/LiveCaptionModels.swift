import Cocoa

enum LiveCaptionPosition: String, Codable, CaseIterable {
  case topCenter
  case topLeft
  case topRight
  case bottomLeft
  case bottomRight
  case bottomCenter

  var title: String {
    switch self {
    case .topCenter:
      return "Top"
    case .topLeft:
      return "Top left"
    case .topRight:
      return "Top right"
    case .bottomLeft:
      return "Bottom left"
    case .bottomRight:
      return "Bottom right"
    case .bottomCenter:
      return "Bottom"
    }
  }
}

enum LiveCaptionLayout {
  static let minWidth: CGFloat = 260
  static let defaultWidth: CGFloat = 440
  static let maxWidth: CGFloat = 640
  static let minLineCount = 1
  static let defaultLineCount = 1
  static let maxLineCount = 4
  static let lineHeight: CGFloat = 22
  static let horizontalPadding: CGFloat = 16
  static let verticalPadding: CGFloat = 10
  static let footerHeight: CGFloat = 32
  static let footerSeparatorHeight: CGFloat = 1
  static let cornerRadius: CGFloat = 12
  static let screenMargin: CGFloat = 12
  static let topOffset: CGFloat = 18

  static func height(forLineCount lineCount: Int) -> CGFloat {
    let clampedLineCount = min(max(lineCount, minLineCount), maxLineCount)
    return verticalPadding * 2 + lineHeight * CGFloat(clampedLineCount) + footerSeparatorHeight
      + footerHeight
  }

  static func lineCount(forHeight height: CGFloat) -> Int {
    let textHeight = height - verticalPadding * 2 - footerSeparatorHeight - footerHeight
    let rawLineCount = (textHeight / lineHeight).rounded()
    return min(max(Int(rawLineCount), minLineCount), maxLineCount)
  }
}
