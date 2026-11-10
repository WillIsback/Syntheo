import Cocoa

extension NotificationManager {
  func createExpandedNotificationView(notification: NotificationInstance) -> NSView {
    let container = NSStackView()
    container.orientation = .vertical
    container.alignment = .leading
    container.distribution = .fill
    container.spacing = 12

    let headerStack = NSStackView()
    headerStack.orientation = .horizontal
    headerStack.alignment = .centerY
    headerStack.distribution = .fill
    headerStack.spacing = 8

    let title = notification.payload.title
    let titleLabel = NSTextField(labelWithString: title)
    titleLabel.font = NSFont.systemFont(ofSize: Fonts.expandedTitleSize, weight: Fonts.titleWeight)
    titleLabel.textColor = NSColor.labelColor
    titleLabel.lineBreakMode = .byTruncatingTail
    titleLabel.maximumNumberOfLines = 1
    titleLabel.setContentHuggingPriority(.defaultLow, for: .horizontal)
    titleLabel.setContentCompressionResistancePriority(.defaultLow, for: .horizontal)

    let collapseButton = CollapseButton()
    collapseButton.notification = notification
    collapseButton.title = notification.payload.resolvedLabels.showLess
    collapseButton.setContentHuggingPriority(.required, for: .horizontal)

    headerStack.addArrangedSubview(titleLabel)
    headerStack.addArrangedSubview(collapseButton)
    container.addArrangedSubview(headerStack)
    headerStack.widthAnchor.constraint(equalTo: container.widthAnchor).isActive = true

    let separator = NSBox()
    separator.boxType = .separator
    separator.translatesAutoresizingMaskIntoConstraints = false
    container.addArrangedSubview(separator)
    separator.widthAnchor.constraint(equalTo: container.widthAnchor).isActive = true

    let (actionStack, timerLabel) = createActionSection(notification: notification)
    container.addArrangedSubview(actionStack)
    actionStack.widthAnchor.constraint(equalTo: container.widthAnchor).isActive = true

    notification.bindExpandedTimerLabel(timerLabel)

    return container
  }

  func createActionSection(notification: NotificationInstance) -> (
    NSStackView, NSTextField
  ) {
    let stack = NSStackView()
    stack.orientation = .vertical
    stack.alignment = .centerX
    stack.spacing = 8

    let actionButton = ActionButton()
    let actionLabel = notification.payload.actionLabel ?? notification.payload.resolvedLabels.accept
    if notification.payload.isDestructiveAction {
      actionButton.configureDestructiveAction(label: actionLabel)
    } else {
      actionButton.title = "  \(actionLabel)"
      actionButton.setBackgroundColors(
        normal: Colors.actionButtonBg,
        pressed: Colors.actionButtonPressedBg
      )
      actionButton.contentTintColor = NSColor.white
    }
    actionButton.notification = notification
    actionButton.font = NSFont.systemFont(
      ofSize: Fonts.actionButtonSize, weight: Fonts.buttonWeight)
    actionButton.layer?.cornerRadius = 10
    actionButton.translatesAutoresizingMaskIntoConstraints = false
    actionButton.heightAnchor.constraint(equalToConstant: 36).isActive = true

    let timerLabel = NSTextField(labelWithString: "")
    timerLabel.font = NSFont.systemFont(ofSize: Fonts.bodySize, weight: Fonts.bodyWeight)
    timerLabel.textColor = NSColor.secondaryLabelColor
    timerLabel.alignment = .center

    stack.addArrangedSubview(actionButton)
    stack.addArrangedSubview(timerLabel)

    actionButton.widthAnchor.constraint(equalTo: stack.widthAnchor, constant: -24).isActive = true

    return (stack, timerLabel)
  }
}
