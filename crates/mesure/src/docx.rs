// Lecture bornée d'un document Word (`.docx`) : seule la partie
// `word/document.xml` est lue, dans l'archive ZIP, puis convertie en HTML
// simple (titres et paragraphes) pour la normalisation commune.
//
// Contre-visite de sécurité, exigences de la bêta : parseur borné, sans
// réseau ni entité externe. Le lecteur ZIP ne suit que le répertoire central,
// refuse le chiffrement et ZIP64, et arrête la décompression au plafond. Le
// lecteur XML est un simple balayage linéaire : il refuse toute déclaration
// `<!DOCTYPE` (donc toute entité, interne ou externe) et ne connaît que les
// cinq entités prédéfinies et les références numériques.

use std::io::Read;

use crate::MeasureError;

/// Taille maximale de l'archive `.docx` lue.
pub const MAX_DOCX_BYTES: usize = 16 * 1024 * 1024;
/// Taille maximale de `word/document.xml` une fois décompressé.
const MAX_XML_BYTES: u64 = 32 * 1024 * 1024;
/// Nombre maximal d'entrées du répertoire central parcourues.
const MAX_ENTRIES: usize = 10_000;

const DOCUMENT: &str = "word/document.xml";

/// Texte d'un `.docx`, en HTML simple : `<h1>` pour un paragraphe de style
/// titre (Heading, Titre, Title), `<p>` sinon ; texte échappé.
pub fn docx_to_html(bytes: &[u8]) -> Result<String, MeasureError> {
    if bytes.len() > MAX_DOCX_BYTES {
        return Err(MeasureError::TooLarge);
    }
    let xml = read_entry(bytes, DOCUMENT)?;
    let xml = String::from_utf8(xml).map_err(|_| MeasureError::InvalidDocument)?;
    xml_to_html(&xml)
}

fn u16_at(b: &[u8], at: usize) -> Option<u16> {
    Some(u16::from_le_bytes(b.get(at..at + 2)?.try_into().ok()?))
}

fn u32_at(b: &[u8], at: usize) -> Option<u32> {
    Some(u32::from_le_bytes(b.get(at..at + 4)?.try_into().ok()?))
}

fn read_entry(zip: &[u8], wanted: &str) -> Result<Vec<u8>, MeasureError> {
    let bad = || MeasureError::InvalidDocument;
    // Fin du répertoire central : signature dans les 64 Kio + 22 derniers
    // octets (commentaire d'archive au plus 65 535 octets).
    let from = zip.len().saturating_sub(65_535 + 22);
    let eocd = (from..zip.len().saturating_sub(21))
        .rev()
        .find(|&i| zip[i..].starts_with(&[0x50, 0x4b, 0x05, 0x06]))
        .ok_or_else(bad)?;
    let entries = u16_at(zip, eocd + 10).ok_or_else(bad)? as usize;
    let mut at = u32_at(zip, eocd + 16).ok_or_else(bad)? as usize;
    if entries == 0xffff || at == 0xffff_ffff_usize {
        return Err(bad()); // ZIP64 : non pris en charge.
    }
    for _ in 0..entries.min(MAX_ENTRIES) {
        if u32_at(zip, at) != Some(0x0201_4b50) {
            return Err(bad());
        }
        let flags = u16_at(zip, at + 8).ok_or_else(bad)?;
        let method = u16_at(zip, at + 10).ok_or_else(bad)?;
        let compressed = u32_at(zip, at + 20).ok_or_else(bad)? as usize;
        let size = u32_at(zip, at + 24).ok_or_else(bad)? as u64;
        let name_len = u16_at(zip, at + 28).ok_or_else(bad)? as usize;
        let extra_len = u16_at(zip, at + 30).ok_or_else(bad)? as usize;
        let comment_len = u16_at(zip, at + 32).ok_or_else(bad)? as usize;
        let local = u32_at(zip, at + 42).ok_or_else(bad)? as usize;
        let name = zip.get(at + 46..at + 46 + name_len).ok_or_else(bad)?;
        at += 46 + name_len + extra_len + comment_len;
        if name != wanted.as_bytes() {
            continue;
        }
        if flags & 0x1 != 0 || size > MAX_XML_BYTES {
            return Err(bad()); // Chiffré, ou annoncé trop grand.
        }
        if u32_at(zip, local) != Some(0x0403_4b50) {
            return Err(bad());
        }
        let local_name = u16_at(zip, local + 26).ok_or_else(bad)? as usize;
        let local_extra = u16_at(zip, local + 28).ok_or_else(bad)? as usize;
        let start = local + 30 + local_name + local_extra;
        let data = zip.get(start..start + compressed).ok_or_else(bad)?;
        let mut out = Vec::new();
        match method {
            0 => out.extend_from_slice(data),
            8 => {
                // Décompression arrêtée au plafond, quelle que soit la taille
                // annoncée.
                flate2::read::DeflateDecoder::new(data)
                    .take(MAX_XML_BYTES + 1)
                    .read_to_end(&mut out)
                    .map_err(|_| bad())?;
            }
            _ => return Err(bad()),
        }
        if out.len() as u64 > MAX_XML_BYTES {
            return Err(MeasureError::TooLarge);
        }
        return Ok(out);
    }
    Err(bad())
}

/// Balayage linéaire du XML de WordprocessingML.
fn xml_to_html(xml: &str) -> Result<String, MeasureError> {
    if xml.contains("<!DOCTYPE") || xml.contains("<!ENTITY") {
        return Err(MeasureError::InvalidDocument);
    }
    let mut html = String::with_capacity(xml.len() / 4);
    let mut paragraph = String::new();
    let mut heading = false;
    let mut in_text = false;
    let mut rest = xml;
    while let Some(lt) = rest.find('<') {
        if in_text {
            paragraph.push_str(&decode(&rest[..lt])?);
        }
        let gt = rest[lt..].find('>').ok_or(MeasureError::InvalidDocument)? + lt;
        let tag = &rest[lt + 1..gt];
        rest = &rest[gt + 1..];
        let closing = tag.starts_with('/');
        let self_closing = tag.ends_with('/');
        let name = tag
            .trim_start_matches('/')
            .split(|c: char| c.is_whitespace() || c == '/')
            .next()
            .unwrap_or("");
        match name {
            "w:p" if closing => {
                let text = paragraph.trim();
                if !text.is_empty() {
                    let tag = if heading { "h1" } else { "p" };
                    html.push_str(&format!("<{tag}>{}</{tag}>\n", escape(text)));
                }
                paragraph.clear();
                heading = false;
            }
            "w:p" if !self_closing => {
                paragraph.clear();
                heading = false;
            }
            "w:pStyle" => {
                let value = attribute(tag, "w:val").unwrap_or("").to_ascii_lowercase();
                heading =
                    value.starts_with("heading") || value.starts_with("titre") || value == "title";
            }
            "w:t" => in_text = !closing && !self_closing,
            "w:tab" | "w:br" | "w:cr" => paragraph.push(' '),
            _ => {}
        }
    }
    Ok(html)
}

fn attribute<'a>(tag: &'a str, name: &str) -> Option<&'a str> {
    let at = tag.find(&format!("{name}=\""))? + name.len() + 2;
    let end = tag[at..].find('"')? + at;
    Some(&tag[at..end])
}

fn decode(text: &str) -> Result<String, MeasureError> {
    let mut out = String::with_capacity(text.len());
    let mut rest = text;
    while let Some(amp) = rest.find('&') {
        out.push_str(&rest[..amp]);
        let end = rest[amp..].find(';').ok_or(MeasureError::InvalidDocument)? + amp;
        let entity = &rest[amp + 1..end];
        let c = match entity {
            "amp" => '&',
            "lt" => '<',
            "gt" => '>',
            "quot" => '"',
            "apos" => '\'',
            _ => entity
                .strip_prefix("#x")
                .and_then(|h| u32::from_str_radix(h, 16).ok())
                .or_else(|| entity.strip_prefix('#').and_then(|d| d.parse().ok()))
                .and_then(char::from_u32)
                .ok_or(MeasureError::InvalidDocument)?,
        };
        out.push(c);
        rest = &rest[end + 1..];
    }
    out.push_str(rest);
    Ok(out)
}

fn escape(text: &str) -> String {
    text.replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
}

#[cfg(test)]
pub(crate) mod tests {
    use super::*;
    use std::io::Write;

    /// Archive ZIP minimale (une entrée), stockée ou compressée.
    pub(crate) fn zip_with(name: &str, content: &[u8], deflate: bool) -> Vec<u8> {
        let data = if deflate {
            let mut encoder =
                flate2::write::DeflateEncoder::new(Vec::new(), flate2::Compression::default());
            encoder.write_all(content).unwrap();
            encoder.finish().unwrap()
        } else {
            content.to_vec()
        };
        let method: u16 = if deflate { 8 } else { 0 };
        let mut zip = Vec::new();
        let local = zip.len() as u32;
        zip.extend_from_slice(&0x0403_4b50u32.to_le_bytes());
        zip.extend_from_slice(&[20, 0, 0, 0]);
        zip.extend_from_slice(&method.to_le_bytes());
        zip.extend_from_slice(&[0; 8]);
        zip.extend_from_slice(&(data.len() as u32).to_le_bytes());
        zip.extend_from_slice(&(content.len() as u32).to_le_bytes());
        zip.extend_from_slice(&(name.len() as u16).to_le_bytes());
        zip.extend_from_slice(&0u16.to_le_bytes());
        zip.extend_from_slice(name.as_bytes());
        zip.extend_from_slice(&data);
        let central = zip.len() as u32;
        zip.extend_from_slice(&0x0201_4b50u32.to_le_bytes());
        zip.extend_from_slice(&[20, 0, 20, 0, 0, 0]);
        zip.extend_from_slice(&method.to_le_bytes());
        zip.extend_from_slice(&[0; 8]);
        zip.extend_from_slice(&(data.len() as u32).to_le_bytes());
        zip.extend_from_slice(&(content.len() as u32).to_le_bytes());
        zip.extend_from_slice(&(name.len() as u16).to_le_bytes());
        zip.extend_from_slice(&[0; 12]);
        zip.extend_from_slice(&local.to_le_bytes());
        zip.extend_from_slice(name.as_bytes());
        let central_len = zip.len() as u32 - central;
        zip.extend_from_slice(&0x0605_4b50u32.to_le_bytes());
        zip.extend_from_slice(&[0, 0, 0, 0, 1, 0, 1, 0]);
        zip.extend_from_slice(&central_len.to_le_bytes());
        zip.extend_from_slice(&central.to_le_bytes());
        zip.extend_from_slice(&[0, 0]);
        zip
    }

    pub(crate) fn document(paragraphs: &[(&str, &str)]) -> String {
        let mut xml = String::from(
            r#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>"#,
        );
        for (style, text) in paragraphs {
            xml.push_str("<w:p>");
            if !style.is_empty() {
                xml.push_str(&format!(r#"<w:pPr><w:pStyle w:val="{style}"/></w:pPr>"#));
            }
            xml.push_str(&format!(
                r#"<w:r><w:t xml:space="preserve">{text}</w:t></w:r></w:p>"#
            ));
        }
        xml.push_str("</w:body></w:document>");
        xml
    }

    #[test]
    fn reads_headings_and_paragraphs() {
        let xml = document(&[
            ("Heading1", "Résumé"),
            ("", "Le projet avance &amp; le budget &lt;tient&gt;."),
            ("Titre2", "Décisions"),
        ]);
        for deflate in [false, true] {
            let html = docx_to_html(&zip_with(DOCUMENT, xml.as_bytes(), deflate)).unwrap();
            assert_eq!(
                html,
                "<h1>Résumé</h1>\n<p>Le projet avance &amp; le budget &lt;tient&gt;.</p>\n<h1>Décisions</h1>\n"
            );
        }
    }

    #[test]
    fn refuses_doctype_and_entities() {
        let xml = r#"<?xml version="1.0"?><!DOCTYPE w [<!ENTITY x SYSTEM "http://example.com/x">]><w:document><w:body><w:p><w:r><w:t>&x;</w:t></w:r></w:p></w:body></w:document>"#;
        assert_eq!(
            docx_to_html(&zip_with(DOCUMENT, xml.as_bytes(), true)),
            Err(MeasureError::InvalidDocument)
        );
        let unknown = document(&[("", "a &nbsp; b")]);
        assert_eq!(
            docx_to_html(&zip_with(DOCUMENT, unknown.as_bytes(), false)),
            Err(MeasureError::InvalidDocument)
        );
    }

    #[test]
    fn stops_decompression_at_the_limit() {
        let bomb = vec![b'a'; (MAX_XML_BYTES + 1024) as usize];
        let mut zip = zip_with(DOCUMENT, &bomb, true);
        // Taille annoncée falsifiée : le plafond tient quand même.
        let central = zip
            .windows(4)
            .rposition(|w| w == [0x50, 0x4b, 0x01, 0x02])
            .unwrap();
        zip[central + 24..central + 28].copy_from_slice(&1000u32.to_le_bytes());
        assert_eq!(docx_to_html(&zip), Err(MeasureError::TooLarge));
    }

    #[test]
    fn refuses_archives_without_a_document_or_malformed() {
        assert_eq!(
            docx_to_html(&zip_with("word/other.xml", b"<x/>", false)),
            Err(MeasureError::InvalidDocument)
        );
        assert_eq!(
            docx_to_html(b"not a zip"),
            Err(MeasureError::InvalidDocument)
        );
        assert_eq!(
            docx_to_html(&vec![0u8; MAX_DOCX_BYTES + 1]),
            Err(MeasureError::TooLarge)
        );
    }
}
