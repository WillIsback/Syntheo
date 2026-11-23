import Cocoa

@_silgen_name("rust_set_force_quit")
func rustSetForceQuit()

@_cdecl("_setup_force_quit_handler")
public func _setupForceQuitHandler() {
  QuitInterceptor.shared.setup()
}
