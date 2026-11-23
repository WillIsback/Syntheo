use swift_rs::{SRString, swift};

swift!(fn _capture_dictation_target() -> SRString);
swift!(fn _insert_dictation_text(target: &SRString, text: &SRString) -> SRString);

pub fn capture_target() -> Result<String, String> {
    let value = unsafe { _capture_dictation_target() }.to_string();
    value.strip_prefix("ok:").map(str::to_owned).ok_or(value)
}

pub fn insert_text(target: &str, text: &str) -> Result<(), String> {
    let value = unsafe { _insert_dictation_text(&SRString::from(target), &SRString::from(text)) }
        .to_string();
    if value.is_empty() { Ok(()) } else { Err(value) }
}
