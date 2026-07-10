use std::path::Path;

use tokio::process::Command;

use crate::{
    project_files::{resolve_inside_project, safe_read_existing},
    types::CompileResult,
};

pub async fn compile_latex(project_root: &Path, entry: &str) -> CompileResult {
    let output = Command::new("latexmk")
        .args(["-pdf", "-interaction=nonstopmode", "-halt-on-error", entry])
        .current_dir(project_root)
        .output()
        .await;

    match output {
        Ok(output) => {
            let pdf_path = sibling_output_path(entry, ".pdf");
            let log_path = sibling_output_path(entry, ".log");
            let log = resolve_inside_project(project_root, &log_path)
                .map(|path| safe_read_existing(&path))
                .unwrap_or_default();
            let pdf_exists = resolve_inside_project(project_root, &pdf_path)
                .map(|path| path.exists())
                .unwrap_or(false);

            CompileResult {
                ok: output.status.success() && pdf_exists,
                stdout: String::from_utf8_lossy(&output.stdout).into_owned(),
                stderr: String::from_utf8_lossy(&output.stderr).into_owned(),
                log,
                pdf_path: pdf_exists.then_some(pdf_path),
            }
        }
        Err(error) => CompileResult {
            ok: false,
            stdout: String::new(),
            stderr: error.to_string(),
            log: "latexmk could not be started. Install a LaTeX distribution with latexmk to enable compilation.".to_string(),
            pdf_path: None,
        },
    }
}

fn sibling_output_path(entry: &str, extension: &str) -> String {
    if entry.to_lowercase().ends_with(".tex") {
        format!("{}{}", &entry[..entry.len() - 4], extension)
    } else {
        format!("{entry}{extension}")
    }
}
