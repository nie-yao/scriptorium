use std::{
    fs,
    net::{IpAddr, Ipv4Addr, SocketAddr},
    path::{Path, PathBuf},
    sync::{Arc, Mutex},
};

use axum::{
    body::Body,
    extract::{Path as AxumPath, Query, State},
    http::{header, StatusCode},
    response::{IntoResponse, Response},
    routing::{get, post},
    Json, Router,
};
use serde::{Deserialize, Serialize};

use crate::{
    config::ServerConfig,
    errors::{AppError, AppResult},
    latex_compiler::compile_latex,
    project_files::{
        ensure_text_file, ensure_user_directory_path, ensure_user_entry_path, normalize_project_path, read_project_tree,
        resolve_inside_project, upload_file,
    },
    project_index::ProjectIndex,
    review_sessions::{create_and_save_review_session, read_review_session, CreateReviewSessionRequest},
    types::{
        CompileRequest, CreateDirectoryRequest, CreateProjectRequest, LogResponse, MoveEntryRequest, OkResponse,
        OpenProjectRequest, ProjectWorkspace, ReadTextFileResponse, WriteTextFileRequest,
    },
};

#[derive(Clone)]
struct AppState {
    config: ServerConfig,
    project_index: Arc<Mutex<ProjectIndex>>,
}

#[derive(Debug, Deserialize)]
struct FilePathQuery {
    path: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct HealthResponse {
    ok: bool,
    workspace_root: String,
    projects: Vec<crate::types::ProjectSummary>,
}

pub async fn serve(config: ServerConfig) -> AppResult<()> {
    let project_index = ProjectIndex::load(
        config.default_project_root.clone(),
        config.project_index_path.clone(),
        config.workspace_root.clone(),
    )?;
    let state = AppState {
        config: config.clone(),
        project_index: Arc::new(Mutex::new(project_index)),
    };
    let app = router(state);
    let address = SocketAddr::new(IpAddr::V4(Ipv4Addr::LOCALHOST), config.port);

    println!("Scriptorium Rust local API listening on http://127.0.0.1:{}", config.port);
    println!("Workspace root: {}", config.workspace_root.display());

    let listener = tokio::net::TcpListener::bind(address).await?;
    axum::serve(listener, app)
        .await
        .map_err(|error| AppError::internal(error.to_string()))
}

fn router(state: AppState) -> Router {
    Router::new()
        .route("/api/health", get(health))
        .route("/api/projects", get(list_projects).post(create_project))
        .route("/api/projects/open", post(open_existing_project))
        .route("/api/projects/:project_id", get(open_project))
        .route("/api/projects/:project_id/tree", get(project_tree))
        .route("/api/projects/:project_id/file", get(read_text_file).put(write_text_file))
        .route("/api/projects/:project_id/folders", post(create_folder))
        .route("/api/projects/:project_id/uploads", post(upload_project_file))
        .route("/api/projects/:project_id/move", post(move_project_entry))
        .route("/api/projects/:project_id/review/session", post(create_review_session_handler))
        .route(
            "/api/projects/:project_id/review/session/:session_id",
            get(read_review_session_handler),
        )
        .route("/api/projects/:project_id/compile", post(compile_project))
        .route("/api/projects/:project_id/pdf", get(read_pdf))
        .route("/api/projects/:project_id/log", get(read_log))
        .with_state(state)
}

async fn health(State(state): State<AppState>) -> AppResult<Response> {
    let projects = lock_index(&state)?.list_projects();
    json_response(HealthResponse {
        ok: true,
        workspace_root: state.config.workspace_root.display().to_string(),
        projects,
    })
}

async fn list_projects(State(state): State<AppState>) -> AppResult<Response> {
    json_response(lock_index(&state)?.list_projects())
}

async fn create_project(State(state): State<AppState>, Json(body): Json<CreateProjectRequest>) -> AppResult<Response> {
    let project = lock_index(&state)?.create_project(body)?;
    json_response(project)
}

async fn open_existing_project(State(state): State<AppState>, Json(body): Json<OpenProjectRequest>) -> AppResult<Response> {
    let root_path = body.root_path.unwrap_or_default();
    let project = lock_index(&state)?.add_existing_project(&root_path)?;
    json_response(project)
}

async fn open_project(State(state): State<AppState>, AxumPath(project_id): AxumPath<String>) -> AppResult<Response> {
    let project = project_for_id(&state, &project_id)?;
    let tree = read_project_tree(Path::new(&project.root_path), "")?;
    json_response(ProjectWorkspace { project, tree })
}

async fn project_tree(State(state): State<AppState>, AxumPath(project_id): AxumPath<String>) -> AppResult<Response> {
    let project = project_for_id(&state, &project_id)?;
    json_response(read_project_tree(Path::new(&project.root_path), "")?)
}

async fn read_text_file(
    State(state): State<AppState>,
    AxumPath(project_id): AxumPath<String>,
    Query(query): Query<FilePathQuery>,
) -> AppResult<Response> {
    let project = project_for_id(&state, &project_id)?;
    let file_path = resolve_inside_project(Path::new(&project.root_path), &query.path)?;
    ensure_text_file(&file_path)?;
    let content = fs::read_to_string(file_path)?;
    json_response(ReadTextFileResponse {
        path: query.path,
        content,
    })
}

async fn write_text_file(
    State(state): State<AppState>,
    AxumPath(project_id): AxumPath<String>,
    Query(query): Query<FilePathQuery>,
    Json(body): Json<WriteTextFileRequest>,
) -> AppResult<Response> {
    let Some(content) = body.content else {
        return Err(AppError::bad_request("Expected JSON body with string content"));
    };
    if Path::new(&query.path).is_absolute() {
        return Err(AppError::bad_request("Path must be relative to the project root"));
    }
    ensure_user_entry_path(&query.path)?;
    let project = project_for_id(&state, &project_id)?;
    let file_path = resolve_inside_project(Path::new(&project.root_path), &query.path)?;
    ensure_text_file(&file_path)?;
    if let Some(parent) = file_path.parent() {
        fs::create_dir_all(parent)?;
    }
    let backup_path = PathBuf::from(format!("{}.bak", file_path.display()));
    fs::write(backup_path, crate::project_files::safe_read_existing(&file_path))?;
    fs::write(file_path, content)?;
    json_response(OkResponse { ok: true })
}

async fn create_folder(
    State(state): State<AppState>,
    AxumPath(project_id): AxumPath<String>,
    Json(body): Json<CreateDirectoryRequest>,
) -> AppResult<Response> {
    let project = project_for_id(&state, &project_id)?;
    let folder_path = normalize_project_path(body.path.unwrap_or_default());
    ensure_user_directory_path(&folder_path)?;
    fs::create_dir(resolve_inside_project(Path::new(&project.root_path), &folder_path)?)?;
    json_response(read_project_tree(Path::new(&project.root_path), "")?)
}

async fn upload_project_file(
    State(state): State<AppState>,
    AxumPath(project_id): AxumPath<String>,
    Json(body): Json<crate::types::UploadFileRequest>,
) -> AppResult<Response> {
    let project = project_for_id(&state, &project_id)?;
    json_response(upload_file(Path::new(&project.root_path), body)?)
}

async fn move_project_entry(
    State(state): State<AppState>,
    AxumPath(project_id): AxumPath<String>,
    Json(body): Json<MoveEntryRequest>,
) -> AppResult<Response> {
    let project = project_for_id(&state, &project_id)?;
    json_response(crate::project_files::move_entry(
        Path::new(&project.root_path),
        body.source_path.unwrap_or_default(),
        body.target_directory.unwrap_or_default(),
        body.conflict_policy,
    )?)
}

async fn create_review_session_handler(
    State(state): State<AppState>,
    AxumPath(project_id): AxumPath<String>,
    Json(body): Json<CreateReviewSessionRequest>,
) -> AppResult<Response> {
    let project = project_for_id(&state, &project_id)?;
    json_response(create_and_save_review_session(Path::new(&project.root_path), body)?)
}

async fn read_review_session_handler(
    State(state): State<AppState>,
    AxumPath((project_id, session_id)): AxumPath<(String, String)>,
) -> AppResult<Response> {
    let project = project_for_id(&state, &project_id)?;
    json_response(read_review_session(Path::new(&project.root_path), &session_id)?)
}

async fn compile_project(
    State(state): State<AppState>,
    AxumPath(project_id): AxumPath<String>,
    Json(body): Json<CompileRequest>,
) -> AppResult<Response> {
    let project = project_for_id(&state, &project_id)?;
    let entry = body.entry.unwrap_or_else(|| project.compile_entry.clone());
    let entry_path = resolve_inside_project(Path::new(&project.root_path), &entry)?;
    if entry_path.extension().and_then(|value| value.to_str()) != Some("tex") {
        return Err(AppError::bad_request("Compile entry must be a .tex file"));
    }
    json_response(compile_latex(Path::new(&project.root_path), &entry).await)
}

async fn read_pdf(
    State(state): State<AppState>,
    AxumPath(project_id): AxumPath<String>,
    Query(query): Query<FilePathQuery>,
) -> AppResult<Response> {
    let project = project_for_id(&state, &project_id)?;
    let file_path = resolve_inside_project(Path::new(&project.root_path), &query.path)?;
    if file_path.extension().and_then(|value| value.to_str()) != Some("pdf") {
        return Err(AppError::bad_request("Only PDF files can be read through this endpoint"));
    }
    let bytes = fs::read(file_path)?;
    Ok((
        StatusCode::OK,
        [
            (header::CONTENT_TYPE, "application/pdf"),
            (header::CACHE_CONTROL, "no-store"),
        ],
        bytes,
    )
        .into_response())
}

async fn read_log(
    State(state): State<AppState>,
    AxumPath(project_id): AxumPath<String>,
    Query(query): Query<FilePathQuery>,
) -> AppResult<Response> {
    let project = project_for_id(&state, &project_id)?;
    let file_path = resolve_inside_project(Path::new(&project.root_path), &query.path)?;
    if file_path.extension().and_then(|value| value.to_str()) != Some("log") {
        return Err(AppError::bad_request("Only .log files can be read through this endpoint"));
    }
    json_response(LogResponse {
        log: fs::read_to_string(file_path)?,
    })
}

fn project_for_id(state: &AppState, project_id: &str) -> AppResult<crate::types::ProjectSummary> {
    lock_index(state)?.get_project(project_id)
}

fn lock_index(state: &AppState) -> AppResult<std::sync::MutexGuard<'_, ProjectIndex>> {
    state
        .project_index
        .lock()
        .map_err(|_| AppError::internal("Project index lock is poisoned"))
}

fn json_response<T: Serialize>(value: T) -> AppResult<Response> {
    let body = serde_json::to_vec(&value)?;
    Ok((
        StatusCode::OK,
        [
            (header::CONTENT_TYPE, "application/json; charset=utf-8"),
            (header::CACHE_CONTROL, "no-store"),
        ],
        Body::from(body),
    )
        .into_response())
}
