//! Empreinte d'un fichier du programme compagnon (issue 683), stable à la
//! signature Authenticode.
//!
//! Sous Windows, le job de signature signe `syntheo-speech.exe` après la
//! compilation de l'application, qui en a déjà épinglé l'empreinte : signer
//! complète le fichier par des zéros jusqu'à un multiple de 8, ajoute un bloc
//! de certificats en fin de fichier et modifie deux champs de l'en-tête
//! (somme de contrôle, entrée « table des certificats »). Comme Authenticode,
//! l'empreinte d'une image PE ignore ces deux champs et le bloc de
//! certificats. Le bloc n'est reconnu qu'après la fin réelle de l'image (fin
//! des en-têtes et des sections), aligné sur 8 : aucun octet de l'image ne
//! peut être exclu en déclarant une fausse table de certificats. Le contenu
//! haché est complété par au plus 7 zéros jusqu'à un multiple de 8, ce qui
//! absorbe l'alignement ajouté par la signature. Tout autre fichier : SHA-256
//! de son contenu.

use sha2::{Digest, Sha256};

fn u16_at(bytes: &[u8], at: usize) -> Option<u16> {
    Some(u16::from_le_bytes(bytes.get(at..at + 2)?.try_into().ok()?))
}

fn u32_at(bytes: &[u8], at: usize) -> Option<u32> {
    Some(u32::from_le_bytes(bytes.get(at..at + 4)?.try_into().ok()?))
}

/// Ce qu'il faut ignorer d'une image PE : somme de contrôle et entrée de la
/// table des certificats (plages), et la fin du contenu signé (début du bloc
/// de certificats, ou fin du fichier). `None` : pas une image PE lisible, ou
/// table des certificats incohérente (le fichier est alors haché en entier).
struct PeLayout {
    checksum: std::ops::Range<usize>,
    certificates: std::ops::Range<usize>,
    end: usize,
}

fn pe_layout(bytes: &[u8]) -> Option<PeLayout> {
    if bytes.get(0..2)? != b"MZ" {
        return None;
    }
    let pe = u32_at(bytes, 0x3c)? as usize;
    if bytes.get(pe..pe.checked_add(4)?)? != b"PE\0\0" {
        return None;
    }
    let sections = u16_at(bytes, pe + 6)? as usize;
    let optional_size = u16_at(bytes, pe + 20)? as usize;
    let optional = pe + 24;
    let (directories, rva_count) = match u16_at(bytes, optional)? {
        0x10b => (optional + 96, u32_at(bytes, optional + 92)?),
        0x20b => (optional + 112, u32_at(bytes, optional + 108)?),
        _ => return None,
    };
    let checksum = optional + 64;
    let certificates = directories + 4 * 8;
    // L'entrée « table des certificats » doit exister et tenir dans l'en-tête
    // optionnel déclaré.
    if rva_count <= 4 || certificates + 8 > optional + optional_size {
        return None;
    }
    // Fin réelle de l'image : en-têtes, puis données brutes des sections.
    let mut image_end = u32_at(bytes, optional + 60)? as u64;
    let table = optional + optional_size;
    for index in 0..sections {
        let section = table + index * 40;
        let raw_size = u32_at(bytes, section + 16)? as u64;
        let raw_pointer = u32_at(bytes, section + 20)? as u64;
        if raw_size > 0 {
            image_end = image_end.max(raw_pointer + raw_size);
        }
    }
    let offset = u32_at(bytes, certificates)? as u64;
    let size = u32_at(bytes, certificates + 4)? as u64;
    let len = bytes.len() as u64;
    let end = if size == 0 && offset == 0 {
        len
    } else if offset >= image_end
        && offset == image_end.next_multiple_of(8)
        && offset.checked_add(size)? == len
    {
        offset
    } else {
        return None;
    };
    // Le contenu haché doit couvrir les champs ignorés (image forgée dont le
    // bloc de certificats commencerait dans l'en-tête).
    if end < (certificates + 8) as u64 {
        return None;
    }
    Some(PeLayout {
        checksum: checksum..checksum + 4,
        certificates: certificates..certificates + 8,
        end: usize::try_from(end).ok()?,
    })
}

/// Empreinte hexadécimale (minuscules) du contenu, stable à la signature
/// Authenticode pour une image PE.
pub fn image_hash(bytes: &[u8]) -> String {
    let mut hasher = Sha256::new();
    match pe_layout(bytes) {
        Some(PeLayout {
            checksum,
            certificates,
            end,
        }) => {
            let content = &bytes[..end];
            hasher.update(&content[..checksum.start]);
            hasher.update(&content[checksum.end..certificates.start]);
            hasher.update(&content[certificates.end..]);
            // Alignement sur 8 qu'ajoute la signature : au plus 7 zéros.
            let padding = end.next_multiple_of(8) - end;
            hasher.update(&[0u8; 7][..padding]);
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

    const OPTIONAL: usize = 0x80 + 24;
    const OPTIONAL_SIZE: usize = 112 + 16 * 8;
    const SECTIONS: usize = OPTIONAL + OPTIONAL_SIZE;
    const CERTS: usize = OPTIONAL + 112 + 4 * 8;

    /// Image PE32+ minimale, non signée : en-tête DOS, signature PE, en-tête
    /// COFF (1 section), en-tête optionnel avec 16 répertoires, table des
    /// sections, puis la section, qui finit par des zéros de bourrage.
    fn pe() -> Vec<u8> {
        let mut bytes = vec![0u8; 0x80];
        bytes[0..2].copy_from_slice(b"MZ");
        bytes[0x3c..0x40].copy_from_slice(&0x80u32.to_le_bytes());
        bytes.extend(b"PE\0\0");
        let mut coff = [0u8; 20];
        coff[2..4].copy_from_slice(&1u16.to_le_bytes());
        coff[16..18].copy_from_slice(&(OPTIONAL_SIZE as u16).to_le_bytes());
        bytes.extend(coff);
        bytes.extend(vec![0u8; OPTIONAL_SIZE]);
        bytes[OPTIONAL..OPTIONAL + 2].copy_from_slice(&0x20bu16.to_le_bytes());
        bytes[OPTIONAL + 108..OPTIONAL + 112].copy_from_slice(&16u32.to_le_bytes());
        let headers = (SECTIONS + 40).next_multiple_of(0x200);
        bytes[OPTIONAL + 60..OPTIONAL + 64].copy_from_slice(&(headers as u32).to_le_bytes());
        let mut section = [0u8; 40];
        section[0..5].copy_from_slice(b".text");
        section[16..20].copy_from_slice(&1001u32.to_le_bytes());
        section[20..24].copy_from_slice(&(headers as u32).to_le_bytes());
        bytes.extend(section);
        bytes.resize(headers, 0);
        bytes.extend((0..990u32).map(|i| (i % 251) as u8 + 1));
        bytes.extend([0u8; 11]);
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
        bytes[OPTIONAL + 64..OPTIONAL + 68].copy_from_slice(&0xdead_beefu32.to_le_bytes());
        bytes[CERTS..CERTS + 4].copy_from_slice(&offset.to_le_bytes());
        bytes[CERTS + 4..CERTS + 8].copy_from_slice(&(certificate.len() as u32).to_le_bytes());
        bytes
    }

    #[test]
    fn signing_does_not_change_the_image_hash() {
        let unsigned = pe();
        assert!(!unsigned.len().is_multiple_of(8), "alignement à ajouter");
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
        let last = altered.len() - 20;
        altered[last] ^= 0xff;
        assert_ne!(image_hash(&unsigned), image_hash(&altered));
        let signed_altered = sign(&altered, b"certificat");
        assert_ne!(image_hash(&unsigned), image_hash(&signed_altered));
    }

    // Revue de 7d72caf6, constat 6 : remplacer les zéros de fin de l'image
    // par d'autres octets en déclarant une fausse table de certificats ne
    // doit pas garder l'empreinte.
    #[test]
    fn trailing_zeros_cannot_be_replaced_behind_a_fake_certificate_table() {
        let unsigned = pe();
        let trimmed = unsigned.len() - 11;
        let mut forged = unsigned[..trimmed].to_vec();
        let offset = forged.len() as u32;
        forged.extend(b"code arbitraire");
        forged[CERTS..CERTS + 4].copy_from_slice(&offset.to_le_bytes());
        forged[CERTS + 4..CERTS + 8].copy_from_slice(&15u32.to_le_bytes());
        assert_ne!(image_hash(&unsigned), image_hash(&forged));
        // Même chose avec le bloc placé à la fin de l'image, mais non aligné.
        let mut forged = unsigned.clone();
        let offset = forged.len() as u32;
        forged.extend(b"x");
        forged[CERTS..CERTS + 4].copy_from_slice(&offset.to_le_bytes());
        forged[CERTS + 4..CERTS + 8].copy_from_slice(&1u32.to_le_bytes());
        assert_ne!(image_hash(&unsigned), image_hash(&forged));
    }

    // Revue, R1 : bloc de certificats déclaré dans l'en-tête d'une image
    // courte (fin des en-têtes et des sections avant l'entrée de la table) :
    // pas de panic, fichier haché en entier.
    /// Image forgée : en-têtes et section déclarés minuscules (fin réelle à
    /// 8), bloc de certificats déclaré dans l'en-tête jusqu'à la fin.
    fn certificates_in_headers() -> Vec<u8> {
        let mut forged = pe();
        forged[OPTIONAL + 60..OPTIONAL + 64].copy_from_slice(&8u32.to_le_bytes());
        forged[SECTIONS + 16..SECTIONS + 20].copy_from_slice(&0u32.to_le_bytes());
        let size = forged.len() as u32 - 8;
        forged[CERTS..CERTS + 4].copy_from_slice(&8u32.to_le_bytes());
        forged[CERTS + 4..CERTS + 8].copy_from_slice(&size.to_le_bytes());
        forged
    }

    #[test]
    fn a_certificate_block_inside_the_headers_does_not_panic() {
        let forged = certificates_in_headers();
        assert_eq!(
            image_hash(&forged),
            Sha256::digest(&forged)
                .iter()
                .map(|b| format!("{b:02x}"))
                .collect::<String>()
        );
    }

    // Octets ajoutés après l'image, sans table de certificats : hachés.
    #[test]
    fn bytes_appended_after_the_image_change_the_hash() {
        let unsigned = pe();
        let mut appended = unsigned.clone();
        appended.extend(b"octets ajoutes");
        assert_ne!(image_hash(&unsigned), image_hash(&appended));
        let mut zeros = unsigned.clone();
        zeros.extend([0u8; 16]);
        assert_ne!(image_hash(&unsigned), image_hash(&zeros));
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
        let plain = |data: &[u8]| -> String {
            Sha256::digest(data)
                .iter()
                .map(|b| format!("{b:02x}"))
                .collect()
        };
        let text = b"ELF ou autre contenu";
        assert_eq!(image_hash(text), plain(text));
        // Un en-tête PE tronqué n'est pas une image : SHA-256 simple.
        assert_eq!(image_hash(b"MZ"), plain(b"MZ"));
    }

    /// Images de référence partagées avec `scripts/check-companion-pins.ps1`
    /// (job Windows de ci-code-quality) : `tests/fixtures/expected.txt`
    /// donne l'empreinte attendue de chaque fichier. Régénérer avec
    /// `SYNTHEO_WRITE_IMAGE_HASH_FIXTURES=1 cargo test -p image-hash fixtures`.
    #[test]
    fn fixtures_match_their_expected_hash() {
        let dir = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("tests/fixtures");
        if std::env::var_os("SYNTHEO_WRITE_IMAGE_HASH_FIXTURES").is_some() {
            std::fs::create_dir_all(&dir).unwrap();
            let unsigned = pe();
            let mut appended = unsigned.clone();
            appended.extend(b"octets ajoutes");
            let files = [
                ("unsigned.bin", unsigned.clone()),
                (
                    "signed.bin",
                    sign(&unsigned, b"certificat Authenticode factice"),
                ),
                ("appended.bin", appended),
                ("plain.bin", b"pas une image PE".to_vec()),
                ("certificates-in-headers.bin", certificates_in_headers()),
            ];
            let mut expected = String::new();
            for (name, bytes) in files {
                std::fs::write(dir.join(name), &bytes).unwrap();
                expected.push_str(&format!("{} {name}\n", image_hash(&bytes)));
            }
            std::fs::write(dir.join("expected.txt"), expected).unwrap();
        }
        let expected = std::fs::read_to_string(dir.join("expected.txt")).unwrap();
        let mut lines = 0;
        for line in expected.lines() {
            let (hash, name) = line.split_once(' ').unwrap();
            assert_eq!(
                image_hash(&std::fs::read(dir.join(name)).unwrap()),
                hash,
                "{name}"
            );
            lines += 1;
        }
        assert_eq!(lines, 5);
        // Signée ou non, même empreinte ; octets ajoutés, empreinte différente.
        let hash_of = |name: &str| {
            expected
                .lines()
                .find(|l| l.ends_with(&format!(" {name}")))
                .unwrap()
                .split_once(' ')
                .unwrap()
                .0
                .to_owned()
        };
        assert_eq!(hash_of("unsigned.bin"), hash_of("signed.bin"));
        assert_ne!(hash_of("unsigned.bin"), hash_of("appended.bin"));
    }
}
