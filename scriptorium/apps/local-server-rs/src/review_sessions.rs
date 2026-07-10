use std::{fs, path::Path};

use chrono::{SecondsFormat, Utc};
use serde::{Deserialize, Serialize};

use crate::errors::AppResult;

const CONTEXT_LINES: usize = 3;

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateReviewSessionRequest {
    pub file_path: Option<String>,
    pub original_text: Option<String>,
    pub proposed_text: Option<String>,
    pub working_text: Option<String>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ReviewAnchor {
    pub context_before: String,
    pub context_after: String,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ReviewHunk {
    pub id: String,
    pub original_range: [usize; 2],
    pub proposed_range: [usize; 2],
    pub working_anchor: ReviewAnchor,
    pub status: String,
    pub original_text: String,
    pub proposed_text: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub current_text: Option<String>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ReviewSession {
    pub session_id: String,
    pub file_path: String,
    pub created_at: String,
    pub original_text: String,
    pub proposed_text: String,
    pub working_text: String,
    pub hunks: Vec<ReviewHunk>,
}

#[derive(Clone, Debug)]
struct DiffOp {
    kind: DiffKind,
    text: String,
    original_line: usize,
    proposed_line: usize,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum DiffKind {
    Equal,
    Delete,
    Insert,
}

#[derive(Debug)]
struct PendingHunk {
    original_start: usize,
    proposed_start: usize,
    original_parts: Vec<String>,
    proposed_parts: Vec<String>,
}

pub fn create_and_save_review_session(project_root: &Path, body: CreateReviewSessionRequest) -> AppResult<ReviewSession> {
    let original_text = body.original_text.unwrap_or_default();
    let proposed_text = body.proposed_text.unwrap_or_default();
    let session = create_review_session(
        body.file_path.unwrap_or_default(),
        original_text,
        proposed_text,
        body.working_text,
    );
    let directory = session_directory(project_root);
    fs::create_dir_all(&directory)?;
    fs::write(
        directory.join(format!("{}.json", session.session_id)),
        serde_json::to_string_pretty(&session)?,
    )?;
    Ok(session)
}

pub fn read_review_session(project_root: &Path, session_id: &str) -> AppResult<ReviewSession> {
    let safe_session_id: String = session_id
        .chars()
        .filter(|ch| ch.is_ascii_alphanumeric() || matches!(ch, '.' | '_' | '-'))
        .collect();
    let content = fs::read_to_string(session_directory(project_root).join(format!("{safe_session_id}.json")))?;
    Ok(serde_json::from_str(&content)?)
}

fn create_review_session(
    file_path: String,
    original_text: String,
    proposed_text: String,
    working_text: Option<String>,
) -> ReviewSession {
    let hunks = create_line_hunks(&original_text, &proposed_text);
    ReviewSession {
        session_id: format!("session-{}", base36_timestamp()),
        file_path,
        created_at: Utc::now().to_rfc3339_opts(SecondsFormat::Millis, true),
        working_text: working_text.unwrap_or_else(|| proposed_text.clone()),
        original_text,
        proposed_text,
        hunks,
    }
}

fn create_line_hunks(original_text: &str, proposed_text: &str) -> Vec<ReviewHunk> {
    let original_lines = split_lines_preserve(original_text);
    let proposed_lines = split_lines_preserve(proposed_text);
    let ops = diff_lines(&original_lines, &proposed_lines);
    let original_offsets = build_utf16_offsets(&original_lines);
    let proposed_offsets = build_utf16_offsets(&proposed_lines);
    let mut hunks = Vec::new();
    let mut pending: Option<PendingHunk> = None;

    for op in ops {
        if op.kind == DiffKind::Equal {
            flush_pending(
                pending.take(),
                &mut hunks,
                &original_lines,
                &proposed_lines,
                &original_offsets,
                &proposed_offsets,
            );
            continue;
        }

        if pending.is_none() {
            pending = Some(PendingHunk {
                original_start: op.original_line,
                proposed_start: op.proposed_line,
                original_parts: Vec::new(),
                proposed_parts: Vec::new(),
            });
        }

        let pending = pending.as_mut().expect("pending hunk exists");
        match op.kind {
            DiffKind::Delete => pending.original_parts.push(op.text),
            DiffKind::Insert => pending.proposed_parts.push(op.text),
            DiffKind::Equal => {}
        }
    }

    flush_pending(
        pending.take(),
        &mut hunks,
        &original_lines,
        &proposed_lines,
        &original_offsets,
        &proposed_offsets,
    );
    hunks
}

fn flush_pending(
    pending: Option<PendingHunk>,
    hunks: &mut Vec<ReviewHunk>,
    _original_lines: &[String],
    proposed_lines: &[String],
    original_offsets: &[usize],
    proposed_offsets: &[usize],
) {
    let Some(pending) = pending else {
        return;
    };

    let hunk_count = pending.original_parts.len().max(pending.proposed_parts.len());
    for index in 0..hunk_count {
        let original_text = pending.original_parts.get(index).cloned().unwrap_or_default();
        let proposed_text = pending.proposed_parts.get(index).cloned().unwrap_or_default();
        if original_text == proposed_text {
            continue;
        }

        let original_start_line = pending.original_start + index.min(pending.original_parts.len());
        let original_end_line = original_start_line + usize::from(!original_text.is_empty());
        let proposed_start_line = pending.proposed_start + index.min(pending.proposed_parts.len());
        let proposed_end_line = proposed_start_line + usize::from(!proposed_text.is_empty());

        hunks.push(ReviewHunk {
            id: format!("hunk-{}", hunks.len() + 1),
            original_range: [
                *original_offsets.get(original_start_line).unwrap_or(&0),
                *original_offsets.get(original_end_line).unwrap_or(original_offsets.last().unwrap_or(&0)),
            ],
            proposed_range: [
                *proposed_offsets.get(proposed_start_line).unwrap_or(&0),
                *proposed_offsets.get(proposed_end_line).unwrap_or(proposed_offsets.last().unwrap_or(&0)),
            ],
            working_anchor: ReviewAnchor {
                context_before: proposed_lines
                    [proposed_start_line.saturating_sub(CONTEXT_LINES)..proposed_start_line.min(proposed_lines.len())]
                    .join(""),
                context_after: proposed_lines
                    [proposed_end_line.min(proposed_lines.len())..(proposed_end_line + CONTEXT_LINES).min(proposed_lines.len())]
                    .join(""),
            },
            status: "pending".to_string(),
            original_text,
            proposed_text: proposed_text.clone(),
            current_text: Some(proposed_text),
        });
    }
}

fn diff_lines(original_lines: &[String], proposed_lines: &[String]) -> Vec<DiffOp> {
    let n = original_lines.len();
    let m = proposed_lines.len();
    let mut dp = vec![vec![0usize; m + 1]; n + 1];

    for i in (0..n).rev() {
        for j in (0..m).rev() {
            dp[i][j] = if original_lines[i] == proposed_lines[j] {
                dp[i + 1][j + 1] + 1
            } else {
                dp[i + 1][j].max(dp[i][j + 1])
            };
        }
    }

    let mut ops = Vec::new();
    let mut i = 0;
    let mut j = 0;

    while i < n && j < m {
        if original_lines[i] == proposed_lines[j] {
            ops.push(DiffOp {
                kind: DiffKind::Equal,
                text: original_lines[i].clone(),
                original_line: i,
                proposed_line: j,
            });
            i += 1;
            j += 1;
        } else if dp[i + 1][j] >= dp[i][j + 1] {
            ops.push(DiffOp {
                kind: DiffKind::Delete,
                text: original_lines[i].clone(),
                original_line: i,
                proposed_line: j,
            });
            i += 1;
        } else {
            ops.push(DiffOp {
                kind: DiffKind::Insert,
                text: proposed_lines[j].clone(),
                original_line: i,
                proposed_line: j,
            });
            j += 1;
        }
    }

    while i < n {
        ops.push(DiffOp {
            kind: DiffKind::Delete,
            text: original_lines[i].clone(),
            original_line: i,
            proposed_line: j,
        });
        i += 1;
    }

    while j < m {
        ops.push(DiffOp {
            kind: DiffKind::Insert,
            text: proposed_lines[j].clone(),
            original_line: i,
            proposed_line: j,
        });
        j += 1;
    }

    ops
}

fn split_lines_preserve(text: &str) -> Vec<String> {
    if text.is_empty() {
        return Vec::new();
    }

    let mut lines = Vec::new();
    let mut start = 0;
    let bytes = text.as_bytes();
    let mut index = 0;

    while index < bytes.len() {
        if bytes[index] == b'\r' {
            let end = if bytes.get(index + 1) == Some(&b'\n') {
                index + 2
            } else {
                index + 1
            };
            lines.push(text[start..end].to_string());
            start = end;
            index = end;
            continue;
        }
        if bytes[index] == b'\n' {
            let end = index + 1;
            lines.push(text[start..end].to_string());
            start = end;
        }
        index += 1;
    }

    if start < text.len() {
        lines.push(text[start..].to_string());
    }

    lines
}

fn build_utf16_offsets(lines: &[String]) -> Vec<usize> {
    let mut offsets = vec![0usize];
    for line in lines {
        let next = offsets.last().copied().unwrap_or(0) + line.encode_utf16().count();
        offsets.push(next);
    }
    offsets
}

fn base36_timestamp() -> String {
    let mut value = Utc::now().timestamp_millis().max(0) as u64;
    if value == 0 {
        return "0".to_string();
    }

    let mut chars = Vec::new();
    while value > 0 {
        let digit = (value % 36) as u8;
        chars.push(match digit {
            0..=9 => (b'0' + digit) as char,
            _ => (b'a' + digit - 10) as char,
        });
        value /= 36;
    }
    chars.into_iter().rev().collect()
}

fn session_directory(project_root: &Path) -> std::path::PathBuf {
    project_root.join(".latex-review").join("sessions")
}

#[cfg(test)]
mod tests {
    use tempfile::tempdir;

    use super::*;

    #[test]
    fn creates_line_hunks_matching_core_shape() {
        let original = "\\section{Intro}\nThis is a draft.\nMore text.\n";
        let proposed = "\\section{Introduction}\nThis is a stronger draft.\nMore text.\n";
        let session = create_review_session(
            "main.tex".to_string(),
            original.to_string(),
            proposed.to_string(),
            None,
        );

        assert_eq!(session.hunks.len(), 2);
        assert_eq!(session.hunks[0].original_text, "\\section{Intro}\n");
        assert_eq!(session.hunks[0].proposed_text, "\\section{Introduction}\n");
        assert_eq!(session.hunks[1].original_text, "This is a draft.\n");
        assert_eq!(session.hunks[1].proposed_text, "This is a stronger draft.\n");
        assert_eq!(session.working_text, proposed);
    }

    #[test]
    fn saves_and_reads_review_session() {
        let temp = tempdir().unwrap();
        let session = create_and_save_review_session(
            temp.path(),
            CreateReviewSessionRequest {
                file_path: Some("main.tex".to_string()),
                original_text: Some("old\n".to_string()),
                proposed_text: Some("new\n".to_string()),
                working_text: None,
            },
        )
        .unwrap();

        let read = read_review_session(temp.path(), &session.session_id).unwrap();
        assert_eq!(read.file_path, "main.tex");
        assert_eq!(read.hunks.len(), 1);
    }
}
