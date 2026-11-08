use std::path::Path;

use crate::{Error, ExportInput};

pub fn export_pdf(path: impl AsRef<Path>, input: impl Into<ExportInput>) -> Result<(), Error> {
    let pdf_bytes = render_pdf(input)?;
    std::fs::write(path.as_ref(), pdf_bytes)?;
    Ok(())
}

// Le PDF en mémoire, pour que l'appelant choisisse comment ouvrir le fichier.
pub fn render_pdf(input: impl Into<ExportInput>) -> Result<Vec<u8>, Error> {
    let input = input.into();
    let typst_content = crate::typst::build_typst_content(&input);
    crate::typst::compile_to_pdf(&typst_content)
}
