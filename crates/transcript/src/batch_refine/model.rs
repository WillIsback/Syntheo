use std::{cmp::Ordering, collections::HashMap, hash::Hash};

use serde_json::{Number, Value};

use crate::ChannelProfile;

#[derive(Clone)]
pub(super) struct SpeakerKey {
    pub(super) channel: f64,
    pub(super) speaker_index: f64,
    pub(super) key: String,
}

#[derive(Clone)]
pub(super) struct SpeakerInterval {
    pub(super) speaker_key: String,
    pub(super) start_ms: f64,
    pub(super) end_ms: f64,
}

#[derive(Clone)]
pub(super) struct TargetWord {
    pub(super) speaker_key: String,
    pub(super) channel: f64,
    pub(super) start_ms: f64,
    pub(super) end_ms: f64,
}

#[derive(Clone)]
pub(super) struct RenderWord {
    pub(super) id: String,
    pub(super) text: String,
    pub(super) start_ms: f64,
    pub(super) end_ms: f64,
    pub(super) channel: f64,
    pub(super) speaker_index: Option<f64>,
}

#[derive(Clone)]
pub(super) enum AssignmentScope {
    Channel(ChannelProfile),
    ChannelSpeaker {
        channel: ChannelProfile,
        speaker_index: f64,
    },
    Words(Vec<String>),
}

#[derive(Clone)]
pub(super) struct IdentityAssignment {
    pub(super) human_id: String,
    pub(super) scope: AssignmentScope,
}

#[derive(serde::Serialize)]
pub(super) struct UserSegmentAssignmentValue<'a> {
    pub(super) human_id: &'a str,
    pub(super) scope: &'static str,
    pub(super) word_ids: &'a [String],
    pub(super) extend_to_adjacent: bool,
}

#[derive(Clone)]
pub(super) struct RenderTranscript {
    pub(super) words: Vec<RenderWord>,
    pub(super) assignments: Vec<IdentityAssignment>,
}

#[derive(Clone, Copy, PartialEq, Eq, Hash)]
pub(super) struct NumericKey(pub(super) u64);

impl NumericKey {
    pub(super) fn new(value: f64) -> Self {
        Self(if value == 0.0 { 0 } else { value.to_bits() })
    }
}

pub(super) struct OrderedMap<K, V> {
    pub(super) entries: Vec<(K, V)>,
    pub(super) indices: HashMap<K, usize>,
}

impl<K, V> Default for OrderedMap<K, V> {
    fn default() -> Self {
        Self {
            entries: Vec::new(),
            indices: HashMap::new(),
        }
    }
}

impl<K: Eq + Hash + Clone, V> OrderedMap<K, V> {
    pub(super) fn get(&self, key: &K) -> Option<&V> {
        self.indices.get(key).map(|index| &self.entries[*index].1)
    }

    pub(super) fn get_mut(&mut self, key: &K) -> Option<&mut V> {
        let index = *self.indices.get(key)?;
        Some(&mut self.entries[index].1)
    }

    pub(super) fn set(&mut self, key: K, value: V) {
        if let Some(index) = self.indices.get(&key).copied() {
            self.entries[index].1 = value;
        } else {
            self.indices.insert(key.clone(), self.entries.len());
            self.entries.push((key, value));
        }
    }

    pub(super) fn contains_key(&self, key: &K) -> bool {
        self.indices.contains_key(key)
    }

    pub(super) fn iter(&self) -> impl Iterator<Item = (&K, &V)> {
        self.entries.iter().map(|(key, value)| (key, value))
    }
}

pub(super) fn channel_profile(channel: f64) -> ChannelProfile {
    match channel {
        0.0 => ChannelProfile::DirectMic,
        1.0 => ChannelProfile::RemoteParty,
        _ => ChannelProfile::MixedCapture,
    }
}

pub(super) fn channel_profile_number(channel: ChannelProfile) -> u8 {
    match channel {
        ChannelProfile::DirectMic => 0,
        ChannelProfile::RemoteParty => 1,
        ChannelProfile::MixedCapture => 2,
    }
}

pub(super) fn has_timing(word: &RenderWord) -> bool {
    word.start_ms.is_finite() && word.end_ms.is_finite() && word.end_ms > word.start_ms
}

pub(super) fn parse_hint_value_for_render(value: &Value) -> Option<Value> {
    let parsed = match value {
        Value::String(value) => serde_json::from_str(value).ok()?,
        Value::Object(_) | Value::Array(_) => value.clone(),
        _ => return None,
    };
    matches!(&parsed, Value::Object(_) | Value::Array(_)).then_some(parsed)
}

pub(super) fn parse_string_hint_value(value: &Value) -> Option<Value> {
    let parsed = serde_json::from_str(value.as_str()?).ok()?;
    matches!(&parsed, Value::Object(_) | Value::Array(_)).then_some(parsed)
}

pub(super) fn integral_number(value: Option<&Value>) -> Option<f64> {
    let number = value?.as_f64()?;
    (number.is_finite() && number.fract() == 0.0).then_some(number)
}

pub(super) fn parse_speaker_key(key: &str) -> Option<SpeakerKey> {
    let (channel, speaker_index) = key.split_once(':')?;
    let channel = channel.parse::<f64>().ok()?;
    let speaker_index = speaker_index.parse::<f64>().ok()?;
    (channel.is_finite() && speaker_index.is_finite()).then(|| SpeakerKey {
        channel,
        speaker_index,
        key: key.to_string(),
    })
}

pub(super) fn javascript_number_string(number: f64) -> String {
    if number == 0.0 {
        return "0".to_string();
    }
    if number.fract() == 0.0 && number.abs() < 1.0e21 {
        return format!("{number:.0}");
    }
    let number = number.to_string();
    if let Some((mantissa, exponent)) = number.split_once('e') {
        let exponent = exponent.parse::<i32>().unwrap_or_default();
        return if exponent >= 0 {
            format!("{mantissa}e+{exponent}")
        } else {
            format!("{mantissa}e{exponent}")
        };
    }
    number
}

pub(crate) fn json_number(number: f64) -> Value {
    if number.fract() == 0.0 && number >= i64::MIN as f64 && number <= i64::MAX as f64 {
        return Value::Number(Number::from(number as i64));
    }
    Value::Number(Number::from_f64(number).expect("JSON number is finite"))
}

pub(super) fn compare_numbers(left: f64, right: f64) -> Ordering {
    left.partial_cmp(&right).unwrap_or(Ordering::Equal)
}

pub(super) fn insert_set_value<T: PartialEq>(values: &mut Vec<T>, value: T) {
    if !values.contains(&value) {
        values.push(value);
    }
}
