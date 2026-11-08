use std::io::Write;
use std::path::Path;

use tempfile::NamedTempFile;

pub fn atomic_write(target: &Path, content: &str) -> std::io::Result<()> {
    let parent = target.parent().ok_or_else(|| {
        std::io::Error::new(std::io::ErrorKind::InvalidInput, "target has no parent")
    })?;
    std::fs::create_dir_all(parent)?;

    let mut temp = NamedTempFile::new_in(parent)?;
    temp.write_all(content.as_bytes())?;
    temp.as_file().sync_all()?;
    temp.persist(target)?;
    Ok(())
}

pub async fn atomic_write_async(target: &Path, content: &str) -> std::io::Result<()> {
    let parent = target.parent().ok_or_else(|| {
        std::io::Error::new(std::io::ErrorKind::InvalidInput, "target has no parent")
    })?;
    tokio::fs::create_dir_all(parent).await?;

    let temp = NamedTempFile::new_in(parent)?;
    tokio::fs::write(temp.path(), content).await?;
    temp.persist(target)?;
    Ok(())
}

pub fn copy_dir_recursive(
    src: &Path,
    dst: &Path,
    skip_filename: Option<&str>,
) -> std::io::Result<()> {
    for entry in std::fs::read_dir(src)? {
        let entry = entry?;
        let src_path = entry.path();
        let file_name = entry.file_name();
        // Le nom vient de `read_dir` ; le contrôle refuse surtout d'écrire à
        // travers un lien symbolique de `dst` qui pointerait ailleurs.
        let dst_path = crate::safe_path::join_under_base(dst, &file_name)?;

        if let Some(skip) = skip_filename
            && file_name == skip
        {
            continue;
        }

        if entry.file_type()?.is_dir() {
            std::fs::create_dir_all(&dst_path)?;
            copy_dir_recursive(&src_path, &dst_path, skip_filename)?;
        } else {
            std::fs::copy(&src_path, &dst_path)?;
        }
    }

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use tempfile::tempdir;

    #[test]
    fn atomic_write_creates_parent_dirs() {
        let temp = tempdir().unwrap();
        let target = temp.path().join("nested").join("dir").join("file.json");

        atomic_write(&target, "content").unwrap();

        assert_eq!(fs::read_to_string(&target).unwrap(), "content");
    }

    #[test]
    fn atomic_write_overwrites_existing() {
        let temp = tempdir().unwrap();
        let target = temp.path().join("file.json");
        fs::write(&target, "old").unwrap();

        atomic_write(&target, "new").unwrap();

        assert_eq!(fs::read_to_string(&target).unwrap(), "new");
    }

    #[tokio::test]
    async fn atomic_write_async_creates_parent_dirs() {
        let temp = tempdir().unwrap();
        let target = temp.path().join("async").join("nested").join("file.json");

        atomic_write_async(&target, "async content").await.unwrap();

        assert_eq!(fs::read_to_string(&target).unwrap(), "async content");
    }

    #[test]
    fn copy_dir_recursive_copies_subdirs() {
        let temp = tempdir().unwrap();
        let src = temp.path().join("src");
        let dst = temp.path().join("dst");

        fs::create_dir_all(src.join("subdir")).unwrap();
        fs::write(src.join("subdir").join("nested.txt"), "nested content").unwrap();

        fs::create_dir_all(&dst).unwrap();
        copy_dir_recursive(&src, &dst, None).unwrap();

        assert_eq!(
            fs::read_to_string(dst.join("subdir").join("nested.txt")).unwrap(),
            "nested content"
        );
    }

    #[test]
    fn copy_dir_recursive_skips_specified_file() {
        let temp = tempdir().unwrap();
        let src = temp.path().join("src");
        let dst = temp.path().join("dst");

        fs::create_dir_all(&src).unwrap();
        fs::write(src.join("keep.txt"), "keep").unwrap();
        fs::write(src.join("skip.txt"), "skip").unwrap();

        fs::create_dir_all(&dst).unwrap();
        copy_dir_recursive(&src, &dst, Some("skip.txt")).unwrap();

        assert!(dst.join("keep.txt").exists());
        assert!(!dst.join("skip.txt").exists());
    }

    #[cfg(unix)]
    #[test]
    fn atomic_write_replaces_a_symlink_without_touching_its_target() {
        let temp = tempdir().unwrap();
        let vault = temp.path().join("vault");
        let outside = temp.path().join("outside.json");
        fs::create_dir_all(&vault).unwrap();
        fs::write(&outside, "sentinel").unwrap();
        std::os::unix::fs::symlink(&outside, vault.join("settings.json")).unwrap();

        atomic_write(&vault.join("settings.json"), "new").unwrap();

        assert_eq!(fs::read_to_string(&outside).unwrap(), "sentinel");
        assert!(
            !fs::symlink_metadata(vault.join("settings.json"))
                .unwrap()
                .file_type()
                .is_symlink()
        );
        assert_eq!(
            fs::read_to_string(vault.join("settings.json")).unwrap(),
            "new"
        );
    }

    #[cfg(unix)]
    #[test]
    fn copy_dir_recursive_refuses_to_write_through_a_symlink_leaving_dst() {
        let temp = tempdir().unwrap();
        let src = temp.path().join("src");
        let dst = temp.path().join("dst");
        let outside = temp.path().join("outside.json");

        fs::create_dir_all(&src).unwrap();
        fs::create_dir_all(&dst).unwrap();
        fs::write(src.join("settings.json"), "new").unwrap();
        fs::write(&outside, "untouched").unwrap();
        std::os::unix::fs::symlink(&outside, dst.join("settings.json")).unwrap();

        assert!(copy_dir_recursive(&src, &dst, None).is_err());
        assert_eq!(fs::read_to_string(&outside).unwrap(), "untouched");
    }
}
