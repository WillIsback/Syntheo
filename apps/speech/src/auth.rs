//! Jeton par lancement et authentification dans les deux sens, sans que le
//! jeton circule jamais.
//!
//! - L'application tire un jeton aléatoire d'au moins 128 bits à chaque
//!   lancement et l'écrit sur l'entrée standard du module, jamais sur la ligne
//!   de commande (visible des autres processus) ni dans un journal.
//! - Le client envoie un nonce `Nc` (`x-syntheo-speech-nonce`) et une preuve
//!   (`x-syntheo-speech-client-proof`) : HMAC-SHA-256 du jeton sur
//!   `syntheo-speech/1 client|Nc|port source|port serveur`.
//! - Le module la vérifie en temps constant avec le port source vu sur la
//!   connexion et son propre port, ce qui lie la preuve à cette connexion TCP
//!   (un relais ne peut pas la réutiliser), et refuse tout `Nc` déjà vu pendant
//!   le lancement (rejeu).
//! - Il répond dans `x-syntheo-speech-proof` par le HMAC du jeton sur
//!   `syntheo-speech/1 server|Nc|port source|port serveur` : l'étiquette de
//!   sens empêche de renvoyer au client sa propre preuve (réflexion).
//! - Le client n'envoie rien d'autre avant d'avoir vérifié cette preuve. Un
//!   processus qui aurait pris le port ne reçoit que le nonce et une preuve
//!   liée à des ports : il ne peut ni répondre, ni rejouer ailleurs.

use std::collections::HashSet;
use std::sync::Mutex;

use hmac::{Hmac, KeyInit, Mac};
use sha2::Sha256;

pub const NONCE_HEADER: &str = "x-syntheo-speech-nonce";
pub const CLIENT_PROOF_HEADER: &str = "x-syntheo-speech-client-proof";
pub const PROOF_HEADER: &str = "x-syntheo-speech-proof";
const PROTOCOL: &str = "syntheo-speech/1";

/// Jeton du lancement. Son `Debug` ne l'affiche jamais.
#[derive(Clone)]
pub struct Token(Vec<u8>);

impl std::fmt::Debug for Token {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str("Token(<masqué>)")
    }
}

#[derive(Debug, PartialEq, Eq)]
pub enum TokenError {
    /// Moins de 128 bits, ou pas de l'hexadécimal.
    Invalid,
}

/// Sens d'une preuve : l'étiquette diffère, contre la réflexion.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Direction {
    Client,
    Server,
}

impl Direction {
    fn label(self) -> &'static str {
        match self {
            Direction::Client => "client",
            Direction::Server => "server",
        }
    }
}

/// Ports de la connexion TCP : source (client) et serveur (module).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Ports {
    pub client: u16,
    pub server: u16,
}

impl Token {
    /// Jeton lu sur l'entrée standard : au moins 32 chiffres hexadécimaux
    /// (128 bits), au plus 128.
    pub fn from_hex(line: &str) -> Result<Self, TokenError> {
        let hex = line.trim();
        if !(32..=128).contains(&hex.len()) || !hex.len().is_multiple_of(2) {
            return Err(TokenError::Invalid);
        }
        decode_hex(hex).map(Self).ok_or(TokenError::Invalid)
    }

    /// Preuve d'un sens pour un nonce et une connexion.
    pub fn proof(&self, direction: Direction, nonce: &str, ports: Ports) -> String {
        let mut mac = <Hmac<Sha256> as KeyInit>::new_from_slice(&self.0)
            .expect("hmac accepts keys of any length");
        mac.update(
            format!(
                "{PROTOCOL} {}|{nonce}|{}|{}",
                direction.label(),
                ports.client,
                ports.server
            )
            .as_bytes(),
        );
        encode_hex(&mac.finalize().into_bytes())
    }

    /// Vérifie une preuve en temps constant.
    pub fn verify(&self, direction: Direction, nonce: &str, ports: Ports, proof: &str) -> bool {
        constant_time_eq(
            self.proof(direction, nonce, ports).as_bytes(),
            proof.trim().as_bytes(),
        )
    }
}

/// Nonces déjà acceptés pendant le lancement : un rejeu est refusé. Seules
/// des preuves valides y entrent, donc seulement des connexions légitimes.
#[derive(Default)]
pub struct SeenNonces(Mutex<HashSet<String>>);

impl SeenNonces {
    /// `true` si le nonce est nouveau (et le retient).
    pub fn first_use(&self, nonce: &str) -> bool {
        self.0
            .lock()
            .unwrap_or_else(|e| e.into_inner())
            .insert(nonce.to_owned())
    }
}

/// Nonce du client : 32 à 128 chiffres hexadécimaux.
pub fn valid_nonce(nonce: &str) -> bool {
    (32..=128).contains(&nonce.len()) && nonce.bytes().all(|b| b.is_ascii_hexdigit())
}

fn constant_time_eq(a: &[u8], b: &[u8]) -> bool {
    if a.len() != b.len() {
        return false;
    }
    a.iter().zip(b).fold(0u8, |acc, (x, y)| acc | (x ^ y)) == 0
}

fn decode_hex(hex: &str) -> Option<Vec<u8>> {
    if !hex.len().is_multiple_of(2) || !hex.bytes().all(|b| b.is_ascii_hexdigit()) {
        return None;
    }
    (0..hex.len())
        .step_by(2)
        .map(|i| u8::from_str_radix(&hex[i..i + 2], 16).ok())
        .collect()
}

pub fn encode_hex(bytes: &[u8]) -> String {
    bytes.iter().map(|b| format!("{b:02x}")).collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Valeur hexadécimale de 128 bits dérivée d'un compteur (splitmix64) :
    /// jetons et nonces des essais, sans valeur littérale.
    fn test_hex(n: u64) -> String {
        let mut state = n.wrapping_mul(0x9e37_79b9_7f4a_7c15);
        let mut next = || {
            state = state.wrapping_add(0x9e37_79b9_7f4a_7c15);
            let mut z = state;
            z = (z ^ (z >> 30)).wrapping_mul(0xbf58_476d_1ce4_e5b9);
            z = (z ^ (z >> 27)).wrapping_mul(0x94d0_49bb_1331_11eb);
            z ^ (z >> 31)
        };
        format!("{:016x}{:016x}", next(), next())
    }
    const PORTS: Ports = Ports {
        client: 50000,
        server: 40000,
    };

    #[test]
    fn tokens_need_128_bits_of_hex() {
        assert!(Token::from_hex(&test_hex(1)).is_ok());
        assert!(Token::from_hex(&format!("{}\n", test_hex(1))).is_ok());
        assert_eq!(
            Token::from_hex(&test_hex(1)[..30]).err(),
            Some(TokenError::Invalid)
        );
        assert_eq!(
            Token::from_hex(&test_hex(6).replace(|c: char| c.is_ascii_hexdigit(), "z")).err(),
            Some(TokenError::Invalid)
        );
        assert_eq!(
            format!("{:?}", Token::from_hex(&test_hex(1)).unwrap()),
            "Token(<masqué>)"
        );
    }

    #[test]
    fn proofs_are_bound_to_token_nonce_ports_and_direction() {
        let token = Token::from_hex(&test_hex(1)).unwrap();
        let other = Token::from_hex(&test_hex(2)).unwrap();
        let nonce = test_hex(3);
        let client = token.proof(Direction::Client, &nonce, PORTS);
        assert!(token.verify(Direction::Client, &nonce, PORTS, &client));
        // Autre jeton, autre nonce, autre connexion : refusée.
        assert!(!other.verify(Direction::Client, &nonce, PORTS, &client));
        assert!(!token.verify(Direction::Client, &test_hex(4), PORTS, &client));
        let relayed = Ports {
            client: 50001,
            ..PORTS
        };
        assert!(!token.verify(Direction::Client, &nonce, relayed, &client));
        // Réflexion : la preuve du client n'est pas celle du serveur.
        assert!(!token.verify(Direction::Server, &nonce, PORTS, &client));
    }

    #[test]
    fn a_nonce_is_accepted_once() {
        let seen = SeenNonces::default();
        let nonce = test_hex(5);
        assert!(seen.first_use(&nonce));
        assert!(!seen.first_use(&nonce));
        assert!(valid_nonce(&test_hex(3)) && !valid_nonce("court"));
        assert!(!valid_nonce(
            &test_hex(6).replace(|c: char| c.is_ascii_hexdigit(), "z")
        ));
    }
}
