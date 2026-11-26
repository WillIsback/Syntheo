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
/// titre (Heading, Titre, Title), `<p>` sinon, `<table>` pour un tableau
/// (cellules fusionnées dépliées) ; texte échappé.
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

/// Nombre maximal de colonnes couvertes par une cellule (`w:gridSpan`) : Word
/// n'en permet pas plus de 63.
const MAX_GRID_SPAN: usize = 64;

/// Tableau Word en cours de lecture (issue 731). Chaque rangée devient une
/// rangée HTML sans fusion, une valeur par colonne de la grille, comme le
/// tableau Markdown généré : une cellule fusionnée verticalement
/// (`w:vMerge`) reprend la valeur de la rangée du dessus, une cellule
/// fusionnée horizontalement (`w:gridSpan`) est répétée sur chaque colonne.
#[derive(Default)]
struct Table {
    /// Profondeur des `w:tbl` : un tableau imbriqué dans une cellule n'est
    /// lu que comme du texte de cette cellule.
    depth: usize,
    row: Vec<String>,
    previous_row: Vec<String>,
    cell: String,
    span: usize,
    continues: bool,
    /// Caractères encore recopiables par `w:vMerge` : une petite cellule
    /// continuée sur des milliers de rangées ne fait pas exploser la sortie.
    copy_budget: usize,
}

impl Table {
    fn start_cell(&mut self) {
        self.cell.clear();
        self.span = 1;
        self.continues = false;
    }

    fn end_cell(&mut self) {
        let value = if self.continues {
            let above = self
                .previous_row
                .get(self.row.len())
                .cloned()
                .unwrap_or_default();
            if above.len() <= self.copy_budget {
                self.copy_budget -= above.len();
                above
            } else {
                String::new()
            }
        } else {
            self.cell.split_whitespace().collect::<Vec<_>>().join(" ")
        };
        for _ in 0..self.span {
            self.row.push(value.clone());
        }
    }

    fn end_row(&mut self, html: &mut String) {
        html.push_str("<tr>");
        for value in &self.row {
            html.push_str(&format!("<td>{}</td>", escape(value)));
        }
        html.push_str("</tr>\n");
        self.previous_row = std::mem::take(&mut self.row);
    }
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
    // Contenu de repli (`mc:Fallback`) : il double le contenu choisi
    // (`mc:Choice`) pour les anciens lecteurs, on ne le lit pas.
    let mut fallback_depth = 0usize;
    let mut table = Table {
        copy_budget: xml.len(),
        ..Table::default()
    };
    let mut rest = xml;
    while let Some(lt) = rest.find('<') {
        if in_text && fallback_depth == 0 {
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
        if name == "mc:Fallback" && !self_closing {
            fallback_depth = if closing {
                fallback_depth.saturating_sub(1)
            } else {
                fallback_depth + 1
            };
            continue;
        }
        if fallback_depth > 0 {
            continue;
        }
        match name {
            "w:p" if closing => {
                let text = paragraph.trim();
                if table.depth > 0 {
                    // Paragraphe d'une cellule : jamais un titre de section.
                    table.cell.push(' ');
                    table.cell.push_str(text);
                } else if !text.is_empty() {
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
            "w:noBreakHyphen" => paragraph.push('-'),
            "w:tbl" if !self_closing => {
                if closing {
                    table.depth = table.depth.saturating_sub(1);
                    if table.depth == 0 {
                        html.push_str("</table>\n");
                    }
                } else {
                    table.depth += 1;
                    if table.depth == 1 {
                        table.row.clear();
                        table.previous_row.clear();
                        html.push_str("<table>\n");
                    }
                }
            }
            "w:tr" if table.depth == 1 && !self_closing => {
                if closing {
                    table.end_row(&mut html);
                } else {
                    table.row.clear();
                }
            }
            "w:tc" if table.depth == 1 && !self_closing => {
                if closing {
                    table.end_cell();
                } else {
                    table.start_cell();
                }
            }
            "w:tr" | "w:tc" if table.depth > 1 => table.cell.push(' '),
            "w:gridSpan" if table.depth == 1 => {
                table.span = attribute(tag, "w:val")
                    .and_then(|v| v.parse::<usize>().ok())
                    .unwrap_or(1)
                    .clamp(1, MAX_GRID_SPAN);
            }
            "w:vMerge" if table.depth == 1 => {
                // Sans valeur, ou `continue` : suite de la cellule du dessus ;
                // `restart` : première cellule de la fusion.
                table.continues = attribute(tag, "w:val").is_none_or(|v| v == "continue");
            }
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

    fn tables_xml(body: &str) -> String {
        format!(
            r#"<?xml version="1.0"?><w:document xmlns:w="w" xmlns:mc="mc"><w:body>{body}</w:body></w:document>"#
        )
    }

    fn cell(properties: &str, style: &str, text: &str) -> String {
        let style = if style.is_empty() {
            String::new()
        } else {
            format!(r#"<w:pPr><w:pStyle w:val="{style}"/></w:pPr>"#)
        };
        format!(
            r#"<w:tc><w:tcPr>{properties}</w:tcPr><w:p>{style}<w:r><w:t>{text}</w:t></w:r></w:p></w:tc>"#
        )
    }

    // Issue 731 : les cellules fusionnées sont recopiées dans chaque rangée
    // et chaque colonne couvertes ; une cellule de style titre n'ouvre pas de
    // section.
    #[test]
    fn merged_table_cells_are_repeated_in_every_row_and_column() {
        let rows = [
            [
                cell("", "Heading1", "Action"),
                cell("", "Heading1", "Qui"),
                cell("", "Heading1", "Quand"),
            ]
            .concat(),
            [
                cell("", "", "Commander"),
                cell(r#"<w:vMerge w:val="restart"/>"#, "", "Rémi"),
                cell(r#"<w:vMerge w:val="restart"/>"#, "", "lundi"),
            ]
            .concat(),
            [
                cell("", "", "Valider"),
                cell("<w:vMerge/>", "", ""),
                cell(r#"<w:vMerge w:val="continue"/>"#, "", ""),
            ]
            .concat(),
            [
                cell("", "", "Planifier"),
                cell(r#"<w:gridSpan w:val="2"/>"#, "", "À confirmer"),
            ]
            .concat(),
        ];
        let body: String = rows.iter().map(|r| format!("<w:tr>{r}</w:tr>")).collect();
        let html = xml_to_html(&tables_xml(&format!("<w:tbl>{body}</w:tbl>"))).unwrap();
        assert_eq!(
            html,
            "<table>\n\
             <tr><td>Action</td><td>Qui</td><td>Quand</td></tr>\n\
             <tr><td>Commander</td><td>Rémi</td><td>lundi</td></tr>\n\
             <tr><td>Valider</td><td>Rémi</td><td>lundi</td></tr>\n\
             <tr><td>Planifier</td><td>À confirmer</td><td>À confirmer</td></tr>\n\
             </table>\n"
        );
    }

    #[test]
    fn a_nested_table_is_read_as_text_of_its_cell() {
        let inner = format!(
            "<w:tbl><w:tr>{}{}</w:tr></w:tbl>",
            cell("", "", "a"),
            cell("", "", "b")
        );
        let outer = format!(
            "<w:tbl><w:tr><w:tc><w:p><w:r><w:t>avant</w:t></w:r></w:p>{inner}</w:tc>{}</w:tr></w:tbl>",
            cell("", "", "c")
        );
        assert_eq!(
            xml_to_html(&tables_xml(&outer)).unwrap(),
            "<table>\n<tr><td>avant a b</td><td>c</td></tr>\n</table>\n"
        );
    }

    #[test]
    fn fallback_content_is_skipped_and_non_breaking_hyphens_are_kept() {
        let body = r#"<w:p><w:r><w:t>Jean</w:t></w:r><w:r><w:noBreakHyphen/></w:r><w:r><w:t>Paul</w:t></w:r><mc:AlternateContent><mc:Choice Requires="wps"><w:r><w:t xml:space="preserve"> signe</w:t></w:r></mc:Choice><mc:Fallback><w:r><w:t xml:space="preserve"> signe</w:t></w:r></mc:Fallback></mc:AlternateContent></w:p>"#;
        assert_eq!(
            xml_to_html(&tables_xml(body)).unwrap(),
            "<p>Jean-Paul signe</p>\n"
        );
    }

    // Une petite cellule continuée sur un très grand nombre de rangées ne
    // fait pas exploser la sortie : les copies s'arrêtent au budget.
    #[test]
    fn vertical_merge_copies_are_bounded() {
        let big = "x".repeat(10_000);
        let mut body = format!(
            "<w:tbl><w:tr>{}</w:tr>",
            cell(r#"<w:vMerge w:val="restart"/>"#, "", &big)
        );
        let continued = format!("<w:tr>{}</w:tr>", cell("<w:vMerge/>", "", ""));
        body.push_str(&continued.repeat(1000));
        body.push_str("</w:tbl>");
        let xml = tables_xml(&body);
        let html = xml_to_html(&xml).unwrap();
        assert!(html.len() < 2 * xml.len() + big.len(), "{}", html.len());
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
