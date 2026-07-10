use std::{
    fs,
    path::{Component, Path, PathBuf},
};

use base64::{engine::general_purpose, Engine as _};

use crate::{
    errors::{AppError, AppResult},
    types::{ProjectTreeNode, ProjectTreeNodeType, UploadFileRequest},
};

const TEXT_EXTENSIONS: &[&str] = &[".tex", ".bib", ".cls", ".sty", ".bst", ".txt", ".md"];
const VISIBLE_EXTENSIONS: &[&str] = &[".tex", ".bib", ".cls", ".sty", ".bst", ".png", ".jpg", ".jpeg", ".pdf"];
const UPLOAD_EXTENSIONS: &[&str] = &[".tex", ".bib", ".cls", ".sty", ".bst", ".png", ".jpg", ".jpeg", ".pdf"];
const IGNORED_NAMES: &[&str] = &[".latex-review", ".git", "node_modules", ".scriptorium"];
const IGNORED_EXTENSIONS: &[&str] = &[".aux", ".log", ".out", ".toc", ".bbl", ".blg", ".fls", ".fdb_latexmk", ".synctex.gz"];

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum ConflictPolicy {
    Error,
    Replace,
    KeepBoth,
}

pub fn read_project_tree(directory: &Path, relative_path: &str) -> AppResult<ProjectTreeNode> {
    let mut children = Vec::new();
    for entry in fs::read_dir(directory)? {
        let entry = entry?;
        let name = entry.file_name().to_string_lossy().into_owned();
        if is_ignored_name(&name) || name.starts_with('.') {
            continue;
        }

        let child_relative_path = join_project_path(relative_path, &name);
        let child_absolute_path = entry.path();
        let metadata = entry.metadata()?;

        if metadata.is_dir() {
            children.push(read_project_tree(&child_absolute_path, &child_relative_path)?);
            continue;
        }

        let extension = get_extension(&name);
        if contains(VISIBLE_EXTENSIONS, &extension) && !contains(IGNORED_EXTENSIONS, &extension) {
            children.push(ProjectTreeNode {
                name: name.clone(),
                path: child_relative_path,
                node_type: ProjectTreeNodeType::File,
                children: None,
            });
        }
    }

    children.sort_by(|left, right| match (&left.node_type, &right.node_type) {
        (ProjectTreeNodeType::Directory, ProjectTreeNodeType::File) => std::cmp::Ordering::Less,
        (ProjectTreeNodeType::File, ProjectTreeNodeType::Directory) => std::cmp::Ordering::Greater,
        _ => left.name.cmp(&right.name),
    });

    Ok(ProjectTreeNode {
        name: if relative_path.is_empty() {
            directory
                .file_name()
                .map(|name| name.to_string_lossy().into_owned())
                .unwrap_or_else(|| directory.display().to_string())
        } else {
            Path::new(relative_path)
                .file_name()
                .map(|name| name.to_string_lossy().into_owned())
                .unwrap_or_else(|| relative_path.to_string())
        },
        path: relative_path.to_string(),
        node_type: ProjectTreeNodeType::Directory,
        children: Some(children),
    })
}

pub fn upload_file(project_root: &Path, body: UploadFileRequest) -> AppResult<ProjectTreeNode> {
    let target_directory = normalize_project_path(body.target_directory.unwrap_or_default());
    let file_name = sanitize_file_name(&body.file_name.unwrap_or_default())?;
    let conflict_policy = normalize_conflict_policy(body.conflict_policy.as_deref());
    let extension = get_extension(&file_name);

    if !contains(UPLOAD_EXTENSIONS, &extension) {
        return Err(AppError::internal("Unsupported upload file type"));
    }

    ensure_user_directory_path(&target_directory)?;
    let target_root = resolve_inside_project(project_root, &target_directory)?;
    let target_path = resolve_conflict_path(&target_root.join(file_name), conflict_policy)?;
    let bytes = general_purpose::STANDARD
        .decode(body.content_base64.unwrap_or_default())
        .map_err(|error| AppError::internal(error.to_string()))?;
    fs::write(target_path, bytes)?;
    read_project_tree(project_root, "")
}

pub fn move_entry(
    project_root: &Path,
    source_path: String,
    target_directory: String,
    conflict_policy: Option<String>,
) -> AppResult<ProjectTreeNode> {
    let source_path = normalize_project_path(source_path);
    let target_directory = normalize_project_path(target_directory);
    let conflict_policy = normalize_conflict_policy(conflict_policy.as_deref());

    ensure_user_entry_path(&source_path)?;
    ensure_user_directory_path(&target_directory)?;

    let source_absolute_path = resolve_inside_project(project_root, &source_path)?;
    let target_root = resolve_inside_project(project_root, &target_directory)?;
    let file_name = Path::new(&source_path)
        .file_name()
        .ok_or_else(|| AppError::internal("Path is required"))?;
    let destination_path = resolve_conflict_path(&target_root.join(file_name), conflict_policy)?;

    if fs::metadata(&source_absolute_path)?.is_dir() && path_is_inside_or_equal(&destination_path, &source_absolute_path) {
        return Err(AppError::internal("Cannot move a folder into itself"));
    }

    fs::rename(source_absolute_path, destination_path)?;
    read_project_tree(project_root, "")
}

pub fn resolve_conflict_path(candidate: &Path, conflict_policy: ConflictPolicy) -> AppResult<PathBuf> {
    if !candidate.exists() {
        return Ok(candidate.to_path_buf());
    }

    match conflict_policy {
        ConflictPolicy::Replace => Ok(candidate.to_path_buf()),
        ConflictPolicy::KeepBoth => unique_path(candidate),
        ConflictPolicy::Error => Err(AppError::internal("Target already exists")),
    }
}

pub fn unique_path(candidate: &Path) -> AppResult<PathBuf> {
    if !candidate.exists() {
        return Ok(candidate.to_path_buf());
    }

    let parent = candidate.parent().unwrap_or_else(|| Path::new(""));
    let stem = candidate.file_stem().and_then(|value| value.to_str()).unwrap_or("untitled");
    let extension = candidate.extension().and_then(|value| value.to_str());

    for index in 2..1000 {
        let file_name = match extension {
            Some(extension) if !extension.is_empty() => format!("{stem}-{index}.{extension}"),
            _ => format!("{stem}-{index}"),
        };
        let next_path = parent.join(file_name);
        if !next_path.exists() {
            return Ok(next_path);
        }
    }

    Err(AppError::internal("Could not find an available path"))
}

pub fn resolve_inside_workspace(workspace_root: &Path, input_path: &str) -> AppResult<PathBuf> {
    let absolute_path = if Path::new(input_path).is_absolute() {
        normalize_absolute_path(PathBuf::from(input_path))
    } else {
        normalize_absolute_path(workspace_root.join(input_path))
    };
    let workspace_root = normalize_absolute_path(workspace_root.to_path_buf());

    if !absolute_path.starts_with(&workspace_root) {
        return Err(AppError::internal("Path escapes the workspace root"));
    }

    Ok(absolute_path)
}

pub fn resolve_inside_project(project_root: &Path, relative_path: &str) -> AppResult<PathBuf> {
    if Path::new(relative_path).is_absolute() {
        return Err(AppError::internal("Path must be relative to the project root"));
    }

    let normalized = normalize_project_path(relative_path);
    let project_root = normalize_absolute_path(project_root.to_path_buf());
    let absolute_path = normalize_absolute_path(project_root.join(normalized));

    if !absolute_path.starts_with(&project_root) {
        return Err(AppError::internal("Path escapes the project root"));
    }

    Ok(absolute_path)
}

pub fn normalize_project_path(relative_path: impl AsRef<str>) -> String {
    let replaced = relative_path.as_ref().replace('\\', "/");
    let trimmed = replaced.trim_start_matches('/');
    let mut parts: Vec<&str> = Vec::new();

    for part in trimmed.split('/') {
        if part.is_empty() || part == "." {
            continue;
        }
        if part == ".." {
            if matches!(parts.last(), Some(last) if *last != "..") {
                parts.pop();
            } else {
                parts.push(part);
            }
            continue;
        }
        parts.push(part);
    }

    parts.join("/")
}

pub fn ensure_user_directory_path(relative_path: &str) -> AppResult<()> {
    if relative_path.is_empty() {
        return Ok(());
    }
    ensure_user_entry_path(relative_path)
}

pub fn ensure_user_entry_path(relative_path: &str) -> AppResult<()> {
    let normalized = normalize_project_path(relative_path);
    let parts: Vec<&str> = normalized.split('/').filter(|part| !part.is_empty()).collect();
    if parts.is_empty() {
        return Err(AppError::internal("Path is required"));
    }

    for part in parts {
        if part == "." || part == ".." || is_ignored_name(part) || part.starts_with('.') {
            return Err(AppError::internal("Path contains a reserved name"));
        }
    }

    Ok(())
}

pub fn sanitize_file_name(name: &str) -> AppResult<String> {
    let trimmed = name.trim();
    if trimmed.is_empty() || trimmed == "." || trimmed == ".." {
        return Err(AppError::internal("Name is required"));
    }
    if trimmed.contains('/') || trimmed.contains(':') || trimmed.contains('\\') {
        return Err(AppError::internal("Name cannot contain path separators"));
    }
    Ok(trimmed.to_string())
}

pub fn normalize_conflict_policy(value: Option<&str>) -> ConflictPolicy {
    match value {
        Some("replace") => ConflictPolicy::Replace,
        Some("keep-both") => ConflictPolicy::KeepBoth,
        _ => ConflictPolicy::Error,
    }
}

pub fn ensure_text_file(file_path: &Path) -> AppResult<()> {
    let extension = get_extension(&file_path.to_string_lossy());
    if !contains(TEXT_EXTENSIONS, &extension) {
        return Err(AppError::internal("Only LaTeX project text files can be edited"));
    }
    Ok(())
}

pub fn get_extension(file_path: &str) -> String {
    let lower = file_path.to_lowercase();
    if lower.ends_with(".synctex.gz") {
        return ".synctex.gz".to_string();
    }
    Path::new(&lower)
        .extension()
        .map(|extension| format!(".{}", extension.to_string_lossy()))
        .unwrap_or_default()
}

pub fn safe_read_existing(file_path: &Path) -> String {
    fs::read_to_string(file_path).unwrap_or_default()
}

fn join_project_path(parent: &str, child: &str) -> String {
    if parent.is_empty() {
        child.to_string()
    } else {
        format!("{parent}/{child}")
    }
}

fn normalize_absolute_path(path: PathBuf) -> PathBuf {
    let mut normalized = PathBuf::new();
    for component in path.components() {
        match component {
            Component::CurDir => {}
            Component::ParentDir => {
                normalized.pop();
            }
            Component::Normal(part) => normalized.push(part),
            Component::RootDir | Component::Prefix(_) => normalized.push(component.as_os_str()),
        }
    }
    normalized
}

fn path_is_inside_or_equal(path: &Path, root: &Path) -> bool {
    let path = normalize_absolute_path(path.to_path_buf());
    let root = normalize_absolute_path(root.to_path_buf());
    path == root || path.starts_with(root)
}

fn contains(values: &[&str], value: &str) -> bool {
    values.iter().any(|item| *item == value)
}

fn is_ignored_name(name: &str) -> bool {
    IGNORED_NAMES.iter().any(|ignored| *ignored == name)
}

#[cfg(test)]
mod tests {
    use std::io::Write;

    use tempfile::tempdir;

    use super::*;

    #[test]
    fn reads_visible_project_tree_and_filters_outputs() {
        let temp = tempdir().unwrap();
        let root = temp.path().join("sample-project");
        fs::create_dir_all(root.join("sections")).unwrap();
        fs::write(root.join("main.tex"), "\\section{Draft}\n").unwrap();
        fs::write(root.join("paper.pdf"), "pdf").unwrap();
        fs::write(root.join("main.aux"), "ignored").unwrap();
        fs::write(root.join(".hidden.tex"), "ignored").unwrap();

        let tree = read_project_tree(&root, "").unwrap();
        let paths: Vec<String> = tree.children.unwrap().into_iter().map(|child| child.path).collect();

        assert_eq!(paths, vec!["sections", "main.tex", "paper.pdf"]);
    }

    #[test]
    fn uploads_with_keep_both_and_rejects_escape_paths() {
        let temp = tempdir().unwrap();
        let root = temp.path().join("sample-project");
        fs::create_dir_all(root.join("sections")).unwrap();

        let content = general_purpose::STANDARD.encode("\\section{Uploaded}\n");
        upload_file(
            &root,
            UploadFileRequest {
                target_directory: Some("sections".to_string()),
                file_name: Some("draft.tex".to_string()),
                content_base64: Some(content.clone()),
                conflict_policy: Some("keep-both".to_string()),
            },
        )
        .unwrap();
        upload_file(
            &root,
            UploadFileRequest {
                target_directory: Some("sections".to_string()),
                file_name: Some("draft.tex".to_string()),
                content_base64: Some(content),
                conflict_policy: Some("keep-both".to_string()),
            },
        )
        .unwrap();

        assert!(root.join("sections").join("draft.tex").exists());
        assert!(root.join("sections").join("draft-2.tex").exists());
        assert!(resolve_inside_project(&root, "../escape.tex").is_err());
        assert!(ensure_text_file(&root.join("figure.png")).is_err());
    }

    #[test]
    fn generated_reference_target_must_be_a_visible_text_path() {
        assert!(ensure_user_entry_path("references.generated.tex").is_ok());
        assert!(ensure_user_entry_path("generated/references.generated.tex").is_ok());
        assert!(ensure_user_entry_path(".scriptorium/references.generated.tex").is_err());
        assert!(ensure_user_entry_path("../references.generated.tex").is_err());
    }

    #[test]
    fn moves_entries_between_project_directories() {
        let temp = tempdir().unwrap();
        let root = temp.path().join("sample-project");
        fs::create_dir_all(root.join("sections")).unwrap();
        fs::create_dir_all(root.join("archive")).unwrap();
        let mut file = fs::File::create(root.join("sections").join("draft.tex")).unwrap();
        writeln!(file, "\\section{{Draft}}").unwrap();

        move_entry(
            &root,
            "sections/draft.tex".to_string(),
            "archive".to_string(),
            Some("error".to_string()),
        )
        .unwrap();

        assert!(root.join("archive").join("draft.tex").exists());
    }
}
