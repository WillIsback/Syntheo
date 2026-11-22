//! Empreinte d'un fichier du programme compagnon (issue 683), stable à la
//! signature Authenticode.
//!
//! Sous Windows, le job de signature signe `syntheo-speech.exe` après la
//! compilation de l'application, qui en a déjà épinglé l'empreinte : signer
//! ajoute un bloc de certificats en fin de fichier et modifie deux champs de
//! l'en-tête (somme de contrôle, entrée « table des certificats »). Comme
//! Authenticode, l'empreinte d'une image PE ignore ces deux champs et le bloc
//! de certificats ; les zéros de fin (alignement ajouté avant le bloc) sont
//! ignorés aussi. Tout autre fichier : SHA-256 de son contenu.

use sha2::{Digest, Sha256};

fn u16_at(bytes: &[u8], at: usize) -> Option<u16> {
    Some(u16::from_le_bytes(bytes.get(at..at + 2)?.try_into().ok()?))
}

fn u32_at(bytes: &[u8], at: usize) -> Option<u32> {
    Some(u32::from_le_bytes(bytes.get(at..at + 4)?.try_into().ok()?))
}

/// Plages à ignorer d'une image PE : somme de contrôle, entrée de la table
/// des certificats, et le bloc de certificats lui-même. `None` : pas une
/// image PE lisible.
fn pe_skips(bytes: &[u8]) -> Option<([std::ops::Range<usize>; 2], usize)> {
    if bytes.get(0..2)? != b"MZ" {
        return None;
    }
    let pe = u32_at(bytes, 0x3c)? as usize;
    if bytes.get(pe..pe + 4)? != b"PE\0\0" {
        return None;
    }
    let optional = pe + 24;
    let directories = match u16_at(bytes, optional)? {
        0x10b => optional + 96,
        0x20b => optional + 112,
        _ => return None,
    };
    let checksum = optional + 64;
    let certificates = directories + 4 * 8;
    let offset = u32_at(bytes, certificates)? as usize;
    let size = u32_at(bytes, certificates + 4)? as usize;
    // Fin du contenu signé : le bloc de certificats est en fin de fichier.
    let end = if size > 0 && offset.checked_add(size)? == bytes.len() && offset >= certificates + 8
    {
        offset
    } else {
        bytes.len()
    };
    Some((
        [checksum..checksum + 4, certificates..certificates + 8],
        end,
    ))
}

/// Empreinte hexadécimale (minuscules) du contenu, stable à la signature
/// Authenticode pour une image PE.
pub fn image_hash(bytes: &[u8]) -> String {
    let mut hasher = Sha256::new();
    match pe_skips(bytes) {
        Some(([checksum, certificates], end)) => {
            let mut content = &bytes[..end];
            while let [rest @ .., 0] = content {
                content = rest;
            }
            let len = content.len();
            let clip = |r: std::ops::Range<usize>| r.start.min(len)..r.end.min(len);
            let (checksum, certificates) = (clip(checksum), clip(certificates));
            hasher.update(&content[..checksum.start]);
            hasher.update(&content[checksum.end..certificates.start]);
            hasher.update(&content[certificates.end..]);
        }
        None => hasher.update(bytes),
    }
    hasher
        .finalize()
        .iter()
        .map(|b| format!("{b:02x}"))
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Image PE32+ minimale, non signée : en-tête DOS, signature PE, en-tête
    /// COFF, en-tête optionnel avec 16 répertoires, puis du code.
    fn pe() -> Vec<u8> {
        let mut bytes = vec![0u8; 0x80];
        bytes[0..2].copy_from_slice(b"MZ");
        bytes[0x3c..0x40].copy_from_slice(&0x80u32.to_le_bytes());
        bytes.extend(b"PE\0\0");
        bytes.extend([0u8; 20]);
        let optional = bytes.len();
        bytes.extend(vec![0u8; 112 + 16 * 8]);
        bytes[optional..optional + 2].copy_from_slice(&0x20bu16.to_le_bytes());
        bytes.extend((0..1000u32).map(|i| (i % 251) as u8 + 1));
        bytes
    }

    /// Ce que fait la signature : alignement sur 8, bloc de certificats en
    /// fin, somme de contrôle et entrée de la table mises à jour.
    fn sign(unsigned: &[u8], certificate: &[u8]) -> Vec<u8> {
        let mut bytes = unsigned.to_vec();
        while !bytes.len().is_multiple_of(8) {
            bytes.push(0);
        }
        let offset = bytes.len() as u32;
        bytes.extend(certificate);
        let optional = 0x80 + 24;
        bytes[optional + 64..optional + 68].copy_from_slice(&0xdead_beefu32.to_le_bytes());
        let entry = optional + 112 + 4 * 8;
        bytes[entry..entry + 4].copy_from_slice(&offset.to_le_bytes());
        bytes[entry + 4..entry + 8].copy_from_slice(&(certificate.len() as u32).to_le_bytes());
        bytes
    }

    #[test]
    fn signing_does_not_change_the_image_hash() {
        let unsigned = pe();
        let signed = sign(&unsigned, b"certificat Authenticode factice");
        assert_ne!(Sha256::digest(&unsigned), Sha256::digest(&signed));
        assert_eq!(image_hash(&unsigned), image_hash(&signed));
        // Resigner (autre certificat) ne change rien non plus.
        let resigned = sign(&unsigned, b"autre certificat, plus long que le premier");
        assert_eq!(image_hash(&unsigned), image_hash(&resigned));
    }

    #[test]
    fn any_change_to_the_code_changes_the_hash() {
        let unsigned = pe();
        let mut altered = unsigned.clone();
        let last = altered.len() - 10;
        altered[last] ^= 0xff;
        assert_ne!(image_hash(&unsigned), image_hash(&altered));
        let signed_altered = sign(&altered, b"certificat");
        assert_ne!(image_hash(&unsigned), image_hash(&signed_altered));
    }

    /// Vraie signature Authenticode : paires « signé, désigné » (par exemple
    /// une DLL de Microsoft et sa copie passée à `signtool remove /s`) dans
    /// `SYNTHEO_IMAGE_HASH_PAIRS` (`a,b;c,d`).
    #[test]
    #[ignore = "fichiers signés fournis par l'essai"]
    fn real_authenticode_pairs_share_their_image_hash() {
        let Ok(pairs) = std::env::var("SYNTHEO_IMAGE_HASH_PAIRS") else {
            return;
        };
        for pair in pairs.split(';') {
            let (signed, stripped) = pair.split_once(',').unwrap();
            let (signed, stripped) = (
                std::fs::read(signed).unwrap(),
                std::fs::read(stripped).unwrap(),
            );
            assert_ne!(signed.len(), stripped.len());
            assert_eq!(image_hash(&signed), image_hash(&stripped), "{pair}");
        }
    }

    #[test]
    fn other_files_use_a_plain_sha256() {
        let text = b"ELF ou autre contenu";
        let plain: String = Sha256::digest(text)
            .iter()
            .map(|b| format!("{b:02x}"))
            .collect();
        assert_eq!(image_hash(text), plain);
        // Un en-tête PE tronqué n'est pas une image : SHA-256 simple.
        assert_eq!(image_hash(b"MZ"), {
            let d: String = Sha256::digest(b"MZ")
                .iter()
                .map(|b| format!("{b:02x}"))
                .collect();
            d
        });
    }
}
