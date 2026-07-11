use std::{
    fs,
    path::{Path, PathBuf},
};

use chrono::{SecondsFormat, Utc};
use serde::{Deserialize, Serialize};
use sha1::{Digest, Sha1};

use crate::{
    config::ServerConfig,
    errors::{AppError, AppResult},
    project_files::{resolve_inside_workspace, sanitize_file_name, unique_path},
    types::{CreateProjectRequest, ProjectSummary, UserSummary},
};

#[derive(Debug)]
pub struct ProjectIndex {
    project_index_path: PathBuf,
    projects: Vec<ProjectSummary>,
    workspace_root: PathBuf,
}

#[derive(Debug, Serialize, Deserialize)]
struct ProjectIndexFile {
    projects: Vec<ProjectSummary>,
}

impl ProjectIndex {
    pub fn load(project_index_path: PathBuf, workspace_root: PathBuf) -> AppResult<Self> {
        if let Some(parent) = project_index_path.parent() {
            fs::create_dir_all(parent)?;
        }
        fs::create_dir_all(&workspace_root)?;

        let projects = match fs::read_to_string(&project_index_path)
            .ok()
            .and_then(|content| serde_json::from_str::<ProjectIndexFile>(&content).ok())
        {
            Some(parsed) => parsed.projects,
            None => {
                let content = serde_json::to_string_pretty(&ProjectIndexFile {
                    projects: Vec::new(),
                })?;
                fs::write(&project_index_path, content)?;
                Vec::new()
            }
        };

        Ok(Self {
            project_index_path,
            projects,
            workspace_root,
        })
    }

    pub fn load_for_user(user: &UserSummary, config: &ServerConfig) -> AppResult<Self> {
        let user_root = config.data_root.join("users").join(&user.user_id);
        let project_root = user_root.join("projects");
        Self::load(user_root.join("projects.json"), project_root)
    }

    pub fn list_projects(&self) -> Vec<ProjectSummary> {
        self.projects.clone()
    }

    pub fn create_project(&mut self, input: CreateProjectRequest) -> AppResult<ProjectSummary> {
        let name = input.name.unwrap_or_else(|| "Untitled Project".to_string());
        let safe_name = sanitize_file_name(&name)?;
        let parent = match input.parent_path {
            Some(parent_path) => resolve_inside_workspace(&self.workspace_root, &parent_path)?,
            None => self.workspace_root.clone(),
        };
        let root_path = unique_path(&parent.join(&safe_name))?;
        fs::create_dir(&root_path)?;
        fs::create_dir_all(root_path.join("figures"))?;

        if input.template.as_deref() != Some("blank") {
            fs::write(root_path.join("main.tex"), default_main_tex(&safe_name))?;
        }

        let project = make_project_summary(&root_path, name);
        self.upsert_and_save(project.clone())?;
        Ok(project)
    }

    pub fn get_project(&self, project_id: &str) -> AppResult<ProjectSummary> {
        self.projects
            .iter()
            .find(|project| project.project_id == project_id)
            .cloned()
            .ok_or_else(|| AppError::not_found("Project not found"))
    }

    fn upsert_and_save(&mut self, project: ProjectSummary) -> AppResult<()> {
        self.projects.retain(|item| item.project_id != project.project_id);
        self.projects.push(project);
        self.save()
    }

    fn save(&self) -> AppResult<()> {
        if let Some(parent) = self.project_index_path.parent() {
            fs::create_dir_all(parent)?;
        }
        let content = serde_json::to_string_pretty(&ProjectIndexFile {
            projects: self.projects.clone(),
        })?;
        fs::write(&self.project_index_path, content)?;
        Ok(())
    }
}

pub fn make_project_summary(root_path: &Path, name: impl Into<String>) -> ProjectSummary {
    ProjectSummary {
        project_id: create_project_id(root_path),
        name: name.into(),
        root_path: root_path.display().to_string(),
        compile_entry: "main.tex".to_string(),
        created_at: Utc::now().to_rfc3339_opts(SecondsFormat::Millis, true),
    }
}

fn create_project_id(root_path: &Path) -> String {
    let mut hasher = Sha1::new();
    hasher.update(root_path.display().to_string().as_bytes());
    let digest = hasher.finalize();
    hex::encode(digest)[..12].to_string()
}

fn default_main_tex(safe_name: &str) -> String {
    vec![
        "\\documentclass{article}".to_string(),
        "\\usepackage{graphicx}".to_string(),
        String::new(),
        format!("\\title{{{}}}", safe_name.replace('_', " ")),
        "\\author{}".to_string(),
        "\\date{\\today}".to_string(),
        String::new(),
        "\\begin{document}".to_string(),
        "\\maketitle".to_string(),
        String::new(),
        "\\section{Introduction}".to_string(),
        "Start writing here.".to_string(),
        String::new(),
        "\\end{document}".to_string(),
        String::new(),
    ]
    .join("\n")
}

#[cfg(test)]
mod tests {
    use tempfile::tempdir;

    use super::*;

    #[test]
    fn creates_projects_inside_user_workspace() {
        let temp = tempdir().unwrap();
        let index_path = temp.path().join(".scriptorium").join("projects.json");

        let mut index = ProjectIndex::load(index_path, temp.path().join("projects")).unwrap();
        assert!(index.list_projects().is_empty());

        let created = index
            .create_project(CreateProjectRequest {
                name: Some("New Paper".to_string()),
                parent_path: None,
                template: Some("basic-paper".to_string()),
            })
            .unwrap();

        assert_eq!(created.name, "New Paper");
        assert!(Path::new(&created.root_path).join("main.tex").exists());
    }

    #[test]
    fn users_receive_separate_project_roots_and_indexes() {
        let temp = tempdir().unwrap();
        let config = ServerConfig {
            cookie_secure: false,
            data_root: temp.path().join("data"),
            default_project_root: temp.path().join("sample-project"),
            port: 4317,
            project_index_path: temp.path().join("unused-projects.json"),
            repo_root: temp.path().to_path_buf(),
            workspace_root: temp.path().to_path_buf(),
        };
        let alice = UserSummary { user_id: "alice".into(), email: "alice@example.com".into() };
        let bob = UserSummary { user_id: "bob".into(), email: "bob@example.com".into() };
        let created = ProjectIndex::load_for_user(&alice, &config)
            .unwrap()
            .create_project(CreateProjectRequest { name: Some("Paper".into()), parent_path: None, template: Some("blank".into()) })
            .unwrap();

        assert!(Path::new(&created.root_path).starts_with(config.data_root.join("users/alice/projects")));
        assert!(ProjectIndex::load_for_user(&bob, &config).unwrap().get_project(&created.project_id).is_err());
    }
}
