use std::{collections::HashMap, env, path::PathBuf};

use crate::errors::{AppError, AppResult};

#[derive(Clone, Debug)]
pub struct ServerConfig {
    pub cookie_secure: bool,
    pub data_root: PathBuf,
    pub default_project_root: PathBuf,
    pub port: u16,
    pub project_index_path: PathBuf,
    pub repo_root: PathBuf,
    pub workspace_root: PathBuf,
}

impl ServerConfig {
    pub fn from_args<I, S>(args: I) -> AppResult<Self>
    where
        I: IntoIterator<Item = S>,
        S: Into<String>,
    {
        let parsed = parse_args(args);
        let repo_root = env::current_dir().map_err(AppError::from)?;
        let workspace_root = repo_root.join(parsed.get("--workspace").map(String::as_str).unwrap_or("."));
        let data_root = env::var_os("SCRIPTORIUM_DATA_DIR")
            .map(PathBuf::from)
            .unwrap_or_else(|| workspace_root.join(".scriptorium").join("data"));
        let default_project_root = repo_root.join(parsed.get("--root").map(String::as_str).unwrap_or("sample-project"));
        let port = parsed
            .get("--port")
            .map(|value| value.parse::<u16>())
            .transpose()
            .map_err(|_| AppError::bad_request("Port must be a valid number"))?
            .unwrap_or(4317);

        Ok(Self {
            cookie_secure: env::var("SCRIPTORIUM_COOKIE_SECURE").ok().as_deref() == Some("true"),
            data_root,
            default_project_root,
            port,
            project_index_path: workspace_root.join(".scriptorium").join("projects.json"),
            repo_root,
            workspace_root,
        })
    }
}

fn parse_args<I, S>(args: I) -> HashMap<String, String>
where
    I: IntoIterator<Item = S>,
    S: Into<String>,
{
    let mut parsed = HashMap::new();
    let mut iter = args.into_iter().map(Into::into);
    while let Some(key) = iter.next() {
        if let Some(value) = iter.next() {
            parsed.insert(key, value);
        }
    }
    parsed
}
