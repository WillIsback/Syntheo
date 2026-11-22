//! Source « Sur ce poste » (issue 684) : le module `syntheo-speech` lancé par
//! l'application. Le jeton du lancement ne circule jamais ; le client prouve
//! qu'il le connaît, et exige la preuve du module avant tout envoi (voir
//! `apps/speech/src/auth.rs`, même schéma, et `PeerProof` de `ws-client`).

use std::sync::Arc;

use hmac::{Hmac, KeyInit, Mac};
use sha2::Sha256;
use syntheo_ws_client::client::PeerProof;

/// Adresse interne réservée de la source « Sur ce poste » : jamais une
/// adresse réelle ni modifiable. Le port et le jeton du lancement en cours sont
/// résolus à chaque connexion (`OnDeviceTarget`) ; un module relancé a un
/// nouveau port et un nouveau jeton, l'ancien port n'est jamais réutilisé.
pub const ON_DEVICE_BASE_URL: &str = "syntheo-speech://local";

/// Cible résolue d'un lancement en cours du module.
#[derive(Debug, Clone)]
pub struct OnDeviceTarget {
    /// `http://127.0.0.1:<port annoncé>`.
    pub base_url: String,
    pub token: OnDeviceToken,
}

/// Pourquoi la source « Sur ce poste » n'est pas disponible.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum OnDeviceErrorKind {
    /// Pas de module dans cette application.
    Unavailable,
    /// Interdit par un réglage géré.
    Disabled,
    /// Module absent, altéré, non signé ou incompatible.
    Invalid,
    /// Le module plante en boucle : lancements suspendus.
    Crashing,
    /// Le lancement a échoué ; une nouvelle tentative peut réussir.
    FailedToStart,
}

impl OnDeviceErrorKind {
    /// Code stable, transmis à l'interface.
    pub fn code(self) -> &'static str {
        match self {
            Self::Unavailable => "unavailable",
            Self::Disabled => "disabled",
            Self::Invalid => "invalid",
            Self::Crashing => "crashing",
            Self::FailedToStart => "failed_to_start",
        }
    }

    /// Refus définitif pour la durée de l'écoute : ne pas réessayer.
    pub fn is_permanent(self) -> bool {
        !matches!(self, Self::FailedToStart)
    }
}

/// Erreur de résolution de la source « Sur ce poste ».
#[derive(Debug, Clone)]
pub struct OnDeviceError {
    pub kind: OnDeviceErrorKind,
    /// Détail pour le journal (jamais le jeton).
    pub message: String,
}

/// `true` pour l'adresse réservée de la source « Sur ce poste ».
pub fn is_on_device(base_url: &str) -> bool {
    base_url == ON_DEVICE_BASE_URL
}

pub const NONCE_HEADER: &str = "x-syntheo-speech-nonce";
pub const CLIENT_PROOF_HEADER: &str = "x-syntheo-speech-client-proof";
pub const PROOF_HEADER: &str = "x-syntheo-speech-proof";
const PROTOCOL: &str = "syntheo-speech/1";

/// Jeton d'un lancement du module, gardé en mémoire seulement. Son `Debug`
/// ne l'affiche jamais.
#[derive(Clone)]
pub struct OnDeviceToken(Arc<Vec<u8>>);

impl std::fmt::Debug for OnDeviceToken {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str("OnDeviceToken(<masqué>)")
    }
}

impl OnDeviceToken {
    /// Au moins 16 octets (128 bits).
    pub fn new(bytes: Vec<u8>) -> Option<Self> {
        (bytes.len() >= 16).then(|| Self(Arc::new(bytes)))
    }

    fn proof(&self, direction: &str, nonce: &str, client: u16, server: u16) -> String {
        let mut mac = <Hmac<Sha256> as KeyInit>::new_from_slice(&self.0)
            .expect("hmac accepts keys of any length");
        mac.update(format!("{PROTOCOL} {direction}|{nonce}|{client}|{server}").as_bytes());
        mac.finalize()
            .into_bytes()
            .iter()
            .map(|b| format!("{b:02x}"))
            .collect()
    }

    /// Preuves du handshake, pour `ws-client`.
    pub fn peer_proof(&self) -> PeerProof {
        let (client, server) = (self.clone(), self.clone());
        PeerProof {
            nonce_header: NONCE_HEADER,
            client_proof_header: CLIENT_PROOF_HEADER,
            proof_header: PROOF_HEADER,
            client_proof: Arc::new(move |nonce, c, s| client.proof("client", nonce, c, s)),
            verify_server: Arc::new(move |nonce, c, s, answer| {
                let expected = server.proof("server", nonce, c, s);
                expected.len() == answer.len()
                    && expected
                        .bytes()
                        .zip(answer.bytes())
                        .fold(0u8, |acc, (x, y)| acc | (x ^ y))
                        == 0
            }),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn proofs_follow_the_module_scheme() {
        let token = OnDeviceToken::new(vec![7; 16]).unwrap();
        let proof = token.peer_proof();
        let client = (proof.client_proof)("aa", 50000, 40000);
        assert_eq!(client, token.proof("client", "aa", 50000, 40000));
        let server = token.proof("server", "aa", 50000, 40000);
        assert!((proof.verify_server)("aa", 50000, 40000, &server));
        // Réflexion, autre port, autre jeton : refusés.
        assert!(!(proof.verify_server)("aa", 50000, 40000, &client));
        assert!(!(proof.verify_server)("aa", 50001, 40000, &server));
        let other = OnDeviceToken::new(vec![8; 16])
            .unwrap()
            .proof("server", "aa", 50000, 40000);
        assert!(!(proof.verify_server)("aa", 50000, 40000, &other));
        assert!(OnDeviceToken::new(vec![1; 15]).is_none());
        assert_eq!(format!("{token:?}"), "OnDeviceToken(<masqué>)");
    }
}
