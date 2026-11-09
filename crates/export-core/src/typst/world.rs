use std::sync::OnceLock;

use chrono::{Datelike, Timelike};
use typst::diag::{FileError, FileResult};
use typst::foundations::{Bytes, Datetime};
use typst::syntax::{FileId, Source};
use typst::text::{Font, FontBook};
use typst::utils::LazyHash;
use typst::{Library, LibraryExt, World};

static LIBRARY: OnceLock<LazyHash<Library>> = OnceLock::new();
static FONTS: OnceLock<(Vec<Font>, LazyHash<FontBook>)> = OnceLock::new();

// Inherited Syntheo logo; its website source no longer exists in this repo.
static WORDMARK: &[u8] = include_bytes!("../../assets/syntheo-logo.svg");

fn library() -> &'static LazyHash<Library> {
    LIBRARY.get_or_init(|| LazyHash::new(Library::default()))
}

fn fonts() -> &'static (Vec<Font>, LazyHash<FontBook>) {
    FONTS.get_or_init(|| {
        // Only the faces the template asks for, instead of the whole
        // `typst-assets` set (8.9 MB, mostly math fonts the export never uses):
        // Pretendard for the body, Libertinus Serif Bold for the title and
        // level 1 headings, DejaVu Sans Mono for code. System fonts are not
        // searched, so the PDF looks the same on every machine.
        const FONT_FILES: [&[u8]; 7] = [
            include_bytes!("../../fonts/Pretendard-Regular.otf"),
            include_bytes!("../../fonts/Pretendard-Medium.otf"),
            include_bytes!("../../fonts/Pretendard-SemiBold.otf"),
            include_bytes!("../../fonts/Pretendard-Bold.otf"),
            include_bytes!("../../fonts/LibertinusSerif-Bold.otf"),
            include_bytes!("../../fonts/DejaVuSansMono.ttf"),
            include_bytes!("../../fonts/DejaVuSansMono-Bold.ttf"),
        ];

        let fonts: Vec<Font> = FONT_FILES
            .into_iter()
            .flat_map(|data| Font::iter(Bytes::new(data)))
            .collect();

        let font_book = FontBook::from_fonts(fonts.iter());
        (fonts, LazyHash::new(font_book))
    })
}

pub struct TypstWorld {
    source: Source,
}

impl TypstWorld {
    pub fn new(content: String) -> Self {
        let source = Source::detached(content);
        Self { source }
    }
}

impl World for TypstWorld {
    fn library(&self) -> &LazyHash<Library> {
        library()
    }

    fn book(&self) -> &LazyHash<FontBook> {
        &fonts().1
    }

    fn main(&self) -> FileId {
        self.source.id()
    }

    fn source(&self, id: FileId) -> FileResult<Source> {
        if id == self.source.id() {
            Ok(self.source.clone())
        } else {
            Err(FileError::NotFound(id.vpath().as_rootless_path().into()))
        }
    }

    fn file(&self, id: FileId) -> FileResult<Bytes> {
        if id.vpath().as_rootless_path().as_os_str() == "syntheo-logo.svg" {
            return Ok(Bytes::new(WORDMARK));
        }
        Err(FileError::NotFound(id.vpath().as_rootless_path().into()))
    }

    fn font(&self, index: usize) -> Option<Font> {
        fonts().0.get(index).cloned()
    }

    fn today(&self, _offset: Option<i64>) -> Option<Datetime> {
        let now = chrono::Local::now();
        Datetime::from_ymd_hms(
            now.year(),
            now.month().try_into().ok()?,
            now.day().try_into().ok()?,
            now.hour().try_into().ok()?,
            now.minute().try_into().ok()?,
            now.second().try_into().ok()?,
        )
    }
}

#[cfg(test)]
mod tests {
    use std::collections::BTreeSet;

    use typst::layout::{Frame, FrameItem, PagedDocument};

    use super::TypstWorld;
    use crate::typst::build_typst_content;
    use crate::{ExportInput, ExportMetadata};

    fn collect_families(frame: &Frame, families: &mut BTreeSet<String>) {
        for (_, item) in frame.items() {
            match item {
                FrameItem::Group(group) => collect_families(&group.frame, families),
                FrameItem::Text(text) => {
                    families.insert(text.font.info().family.clone());
                }
                _ => {}
            }
        }
    }

    // The template names three families; each must resolve to a bundled face,
    // without the `typst-assets` fonts and without falling back silently.
    #[test]
    fn template_fonts_are_bundled() {
        let input = ExportInput {
            enhanced_md: "# Décisions\n\nTexte `nightly --seed`.\n\n```rust\nfn main() {}\n```\n"
                .to_string(),
            memo_md: None,
            transcript: None,
            metadata: Some(ExportMetadata {
                title: "Réunion".to_string(),
                created_at: "lundi 9 novembre 2026".to_string(),
                participants: vec![],
                event_title: None,
                duration: None,
            }),
            labels: None,
        };
        let world = TypstWorld::new(build_typst_content(&input));
        let warned = typst::compile::<PagedDocument>(&world);
        let font_warnings: Vec<_> = warned
            .warnings
            .iter()
            .filter(|warning| warning.message.contains("font"))
            .map(|warning| warning.message.to_string())
            .collect();
        assert!(font_warnings.is_empty(), "{font_warnings:?}");

        let document = warned.output.expect("the export compiles");
        let mut families = BTreeSet::new();
        for page in &document.pages {
            collect_families(&page.frame, &mut families);
        }
        for family in ["Pretendard", "Libertinus Serif", "DejaVu Sans Mono"] {
            assert!(
                families.contains(family),
                "{family} missing from {families:?}"
            );
        }
    }
}
