// https://github.com/insidegui/AudioCap/blob/93881a4/AudioCap/ProcessTap/AudioRecordingPermission.swift

import CoreGraphics
import Foundation

private let TCC_PATH = "/System/Library/PrivateFrameworks/TCC.framework/Versions/A/TCC"

private let apiHandle: UnsafeMutableRawPointer? = {
  dlopen(TCC_PATH, RTLD_NOW)
}()

private typealias PreflightFuncType = @convention(c) (CFString, CFDictionary?) -> Int

@_cdecl("_audio_capture_permission_status")
public func _audio_capture_permission_status() -> Int {
  guard let apiHandle,
    let funcSym = dlsym(apiHandle, "TCCAccessPreflight"),
    let preflight = unsafeBitCast(funcSym, to: PreflightFuncType.self) as PreflightFuncType?
  else {
    return -1
  }

  let result = preflight("kTCCServiceAudioCapture" as CFString, nil)
  return result
}

@_cdecl("_screen_capture_permission_status")
public func _screen_capture_permission_status() -> Int {
  guard let apiHandle,
    let funcSym = dlsym(apiHandle, "TCCAccessPreflight"),
    let preflight = unsafeBitCast(funcSym, to: PreflightFuncType.self) as PreflightFuncType?
  else {
    return -1
  }

  let result = preflight("kTCCServiceScreenCapture" as CFString, nil)
  return result
}

@_cdecl("_request_screen_capture_permission")
public func _request_screen_capture_permission() -> Bool {
  CGRequestScreenCaptureAccess()
}
