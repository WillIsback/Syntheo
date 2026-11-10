use std::sync::{
    Arc,
    atomic::{AtomicBool, Ordering},
};

/// Canaux coupés par l'utilisateur pendant l'écoute (issue 447) : le micro et le son système.
///
/// La session les tient (`SessionContext`) et les prête à chaque source : l'état survit à une
/// reconnexion du STT (la source ne change pas) comme à une relance de la capture (la nouvelle
/// source reçoit les mêmes drapeaux). Le flux de capture les lit à chaque trame, sans verrou.
#[derive(Clone, Debug, Default)]
pub struct ChannelMutes {
    mic: Arc<AtomicBool>,
    speaker: Arc<AtomicBool>,
}

impl ChannelMutes {
    pub fn mic(&self) -> bool {
        self.mic.load(Ordering::Relaxed)
    }

    pub fn speaker(&self) -> bool {
        self.speaker.load(Ordering::Relaxed)
    }

    /// Renvoie `true` si l'état a changé.
    pub fn set_mic(&self, muted: bool) -> bool {
        self.mic.swap(muted, Ordering::Relaxed) != muted
    }

    /// Renvoie `true` si l'état a changé.
    pub fn set_speaker(&self, muted: bool) -> bool {
        self.speaker.swap(muted, Ordering::Relaxed) != muted
    }
}

#[cfg(test)]
mod tests {
    use super::ChannelMutes;

    #[test]
    fn clones_share_each_channel_independently() {
        let session = ChannelMutes::default();
        let source = session.clone();

        assert!(source.set_mic(true));
        assert!(!source.set_mic(true), "same value is not a change");
        assert!(session.mic());
        assert!(!session.speaker());

        assert!(session.set_speaker(true));
        assert!(source.speaker());
        assert!(source.set_mic(false));
        assert!(!session.mic());
        assert!(session.speaker());
    }
}
