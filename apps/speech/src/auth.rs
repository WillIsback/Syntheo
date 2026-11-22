//! Jeton par lancement et authentification dans les deux sens.
//!
//! - L'application tire un jeton aléatoire d'au moins 128 bits à chaque
//!   lancement et l'écrit sur l'entrée standard du module, jamais sur la ligne
//!   de commande (visible des autres processus) ni dans un journal.
//! - Le client prouve qu'il connaît le jeton : `Authorization: Bearer <jeton>`,
//!   comparé en temps constant.
//! - Le module prouve qu'il le connaît aussi : le client envoie un nonce
//!   (`x-syntheo-speech-nonce`), le module répond dans l'en-tête
//!   `x-syntheo-speech-proof` par HMAC-SHA-256(jeton, `syntheo-speech/1 ` +
//!   nonce). Le client vérifie cette preuve avant d'envoyer l'audio : un autre
//!   processus qui aurait pris le port ne la produit pas.

use hmac::{Hmac, KeyInit, Mac};
use sha2::Sha256;

pub const NONCE_HEADER: &str = "x-syntheo-speech-nonce";
pub const PROOF_HEADER: &str = "x-syntheo-speech-proof";
const PROOF_CONTEXT: &str = "syntheo-speech/1 ";

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

    /// Vérifie `Authorization: Bearer <jeton>` en temps constant.
    pub fn accepts_bearer(&self, header: Option<&str>) -> bool {
        let Some(given) = header.and_then(|h| h.strip_prefix("Bearer ")) else {
            return false;
        };
        let Some(given) = decode_hex(given.trim()) else {
            return false;
        };
        constant_time_eq(&given, &self.0)
    }

    /// Preuve du module pour un nonce du client.
    pub fn proof(&self, nonce: &str) -> String {
        let mut mac = <Hmac<Sha256> as KeyInit>::new_from_slice(&self.0)
            .expect("hmac accepts keys of any length");
        mac.update(PROOF_CONTEXT.as_bytes());
        mac.update(nonce.as_bytes());
        encode_hex(&mac.finalize().into_bytes())
    }

    /// Vérification côté client (utilisée par les tests et par l'application).
    pub fn verify_proof(&self, nonce: &str, proof: &str) -> bool {
        constant_time_eq(self.proof(nonce).as_bytes(), proof.trim().as_bytes())
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

    const HEX: &str = "00112233445566778899aabbccddeeff";

    #[test]
    fn tokens_need_128_bits_of_hex() {
        assert!(Token::from_hex(HEX).is_ok());
        assert!(Token::from_hex(&format!("{HEX}\n")).is_ok());
        assert_eq!(Token::from_hex(&HEX[..30]).err(), Some(TokenError::Invalid));
        assert_eq!(
            Token::from_hex(&"zz".repeat(16)).err(),
            Some(TokenError::Invalid)
        );
        assert_eq!(
            format!("{:?}", Token::from_hex(HEX).unwrap()),
            "Token(<masqué>)"
        );
    }

    #[test]
    fn bearer_is_checked() {
        let token = Token::from_hex(HEX).unwrap();
        assert!(token.accepts_bearer(Some(&format!("Bearer {HEX}"))));
        assert!(!token.accepts_bearer(Some(&format!("Bearer {}", "11".repeat(16)))));
        assert!(!token.accepts_bearer(Some(HEX)));
        assert!(!token.accepts_bearer(None));
    }

    #[test]
    fn the_proof_needs_the_token() {
        let token = Token::from_hex(HEX).unwrap();
        let other = Token::from_hex(&"ab".repeat(16)).unwrap();
        let nonce = "cd".repeat(16);
        assert!(token.verify_proof(&nonce, &token.proof(&nonce)));
        assert!(!token.verify_proof(&nonce, &other.proof(&nonce)));
        assert!(!token.verify_proof(&"ef".repeat(16), &token.proof(&nonce)));
        assert!(valid_nonce(&nonce) && !valid_nonce("court") && !valid_nonce(&"zz".repeat(16)));
    }
}
