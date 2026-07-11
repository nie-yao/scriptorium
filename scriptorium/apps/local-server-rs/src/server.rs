use std::{
    fs,
    net::{IpAddr, Ipv4Addr, SocketAddr},
    path::{Path, PathBuf},
    sync::{Arc, Mutex},
};

use axum::{
    body::Body,
    extract::{Path as AxumPath, Query, State},
    http::{header, HeaderMap, StatusCode},
    response::{IntoResponse, Response},
    routing::{get, post},
    Json, Router,
};
use serde::{Deserialize, Serialize};

use crate::{
    auth::{cookie_token, expired_session_cookie, session_cookie, AuthStore},
    config::ServerConfig,
    errors::{AppError, AppResult},
    latex_compiler::compile_latex,
    project_files::{
        ensure_text_file, ensure_user_directory_path, ensure_user_entry_path, normalize_project_path, read_project_tree,
        resolve_inside_project, upload_file,
    },
    review_sessions::{create_and_save_review_session, read_review_session, CreateReviewSessionRequest},
    types::{
        CompileRequest, CreateDirectoryRequest, CreateProjectRequest, CredentialsRequest, LogResponse, MoveEntryRequest,
        OkResponse, ProjectWorkspace, ReadTextFileResponse, UserSummary, WriteTextFileRequest,
    },
};

#[derive(Clone)]
struct AppState {
    config: ServerConfig,
    auth: Arc<Mutex<AuthStore>>,
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
    let state = AppState {
        config: config.clone(),
        auth: Arc::new(Mutex::new(AuthStore::load(config.data_root.clone())?)),
    };
    let app = router(state);
    let address = SocketAddr::new(IpAddr::V4(Ipv4Addr::LOCALHOST), config.port);

    println!("Scriptorium Rust local API listening on http://127.0.0.1:{}", config.port);
    println!("User data root: {}", config.data_root.display());

    let listener = tokio::net::TcpListener::bind(address).await?;
    axum::serve(listener, app)
        .await
        .map_err(|error| AppError::internal(error.to_string()))
}

fn router(state: AppState) -> Router {
    Router::new()
        .route("/api/health", get(health))
        .route("/api/auth/me", get(current_user))
        .route("/api/auth/register", post(register))
        .route("/api/auth/login", post(sign_in))
        .route("/api/auth/logout", post(sign_out))
        .route("/api/projects", get(list_projects).post(create_project))
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
    json_response(HealthResponse {
        ok: true,
        workspace_root: state.config.data_root.display().to_string(),
        projects: Vec::new(),
    })
}

async fn current_user(State(state): State<AppState>, headers: HeaderMap) -> AppResult<Response> {
    json_response(authenticated_user(&state, &headers)?)
}

async fn register(
    State(state): State<AppState>,
    Json(body): Json<CredentialsRequest>,
) -> AppResult<Response> {
    let email = body.email.unwrap_or_default();
    let password = body.password.unwrap_or_default();
    let mut auth = lock_auth(&state)?;
    let user = auth.register(&email, &password)?;
    let token = auth.sign_in(&email, &password)?;
    json_response_with_cookie(user, session_cookie(&token, state.config.cookie_secure))
}

async fn sign_in(
    State(state): State<AppState>,
    Json(body): Json<CredentialsRequest>,
) -> AppResult<Response> {
    let email = body.email.unwrap_or_default();
    let password = body.password.unwrap_or_default();
    let mut auth = lock_auth(&state)?;
    let token = auth.sign_in(&email, &password)?;
    let user = auth.current_user(Some(&token))?;
    json_response_with_cookie(user, session_cookie(&token, state.config.cookie_secure))
}

async fn sign_out(State(state): State<AppState>, headers: HeaderMap) -> AppResult<Response> {
    let token = request_session_token(&headers);
    lock_auth(&state)?.sign_out(token)?;
    json_response_with_cookie(OkResponse { ok: true }, expired_session_cookie(state.config.cookie_secure))
}

async fn list_projects(State(state): State<AppState>, headers: HeaderMap) -> AppResult<Response> {
    let user = authenticated_user(&state, &headers)?;
    json_response(project_index_for_user(&state, &user)?.list_projects())
}

async fn create_project(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(body): Json<CreateProjectRequest>,
) -> AppResult<Response> {
    let user = authenticated_user(&state, &headers)?;
    let project = project_index_for_user(&state, &user)?.create_project(body)?;
    json_response(project)
}

async fn open_project(State(state): State<AppState>, headers: HeaderMap, AxumPath(project_id): AxumPath<String>) -> AppResult<Response> {
    let user = authenticated_user(&state, &headers)?;
    let project = project_for_user(&state, &user, &project_id)?;
    let tree = read_project_tree(Path::new(&project.root_path), "")?;
    json_response(ProjectWorkspace { project, tree })
}

async fn project_tree(State(state): State<AppState>, headers: HeaderMap, AxumPath(project_id): AxumPath<String>) -> AppResult<Response> {
    let user = authenticated_user(&state, &headers)?;
    let project = project_for_user(&state, &user, &project_id)?;
    json_response(read_project_tree(Path::new(&project.root_path), "")?)
}

async fn read_text_file(
    State(state): State<AppState>,
    headers: HeaderMap,
    AxumPath(project_id): AxumPath<String>,
    Query(query): Query<FilePathQuery>,
) -> AppResult<Response> {
    let user = authenticated_user(&state, &headers)?;
    let project = project_for_user(&state, &user, &project_id)?;
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
    headers: HeaderMap,
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
    let user = authenticated_user(&state, &headers)?;
    let project = project_for_user(&state, &user, &project_id)?;
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
    headers: HeaderMap,
    AxumPath(project_id): AxumPath<String>,
    Json(body): Json<CreateDirectoryRequest>,
) -> AppResult<Response> {
    let user = authenticated_user(&state, &headers)?;
    let project = project_for_user(&state, &user, &project_id)?;
    let folder_path = normalize_project_path(body.path.unwrap_or_default());
    ensure_user_directory_path(&folder_path)?;
    fs::create_dir(resolve_inside_project(Path::new(&project.root_path), &folder_path)?)?;
    json_response(read_project_tree(Path::new(&project.root_path), "")?)
}

async fn upload_project_file(
    State(state): State<AppState>,
    headers: HeaderMap,
    AxumPath(project_id): AxumPath<String>,
    Json(body): Json<crate::types::UploadFileRequest>,
) -> AppResult<Response> {
    let user = authenticated_user(&state, &headers)?;
    let project = project_for_user(&state, &user, &project_id)?;
    json_response(upload_file(Path::new(&project.root_path), body)?)
}

async fn move_project_entry(
    State(state): State<AppState>,
    headers: HeaderMap,
    AxumPath(project_id): AxumPath<String>,
    Json(body): Json<MoveEntryRequest>,
) -> AppResult<Response> {
    let user = authenticated_user(&state, &headers)?;
    let project = project_for_user(&state, &user, &project_id)?;
    json_response(crate::project_files::move_entry(
        Path::new(&project.root_path),
        body.source_path.unwrap_or_default(),
        body.target_directory.unwrap_or_default(),
        body.conflict_policy,
    )?)
}

async fn create_review_session_handler(
    State(state): State<AppState>,
    headers: HeaderMap,
    AxumPath(project_id): AxumPath<String>,
    Json(body): Json<CreateReviewSessionRequest>,
) -> AppResult<Response> {
    let user = authenticated_user(&state, &headers)?;
    let project = project_for_user(&state, &user, &project_id)?;
    json_response(create_and_save_review_session(Path::new(&project.root_path), body)?)
}

async fn read_review_session_handler(
    State(state): State<AppState>,
    headers: HeaderMap,
    AxumPath((project_id, session_id)): AxumPath<(String, String)>,
) -> AppResult<Response> {
    let user = authenticated_user(&state, &headers)?;
    let project = project_for_user(&state, &user, &project_id)?;
    json_response(read_review_session(Path::new(&project.root_path), &session_id)?)
}

async fn compile_project(
    State(state): State<AppState>,
    headers: HeaderMap,
    AxumPath(project_id): AxumPath<String>,
    Json(body): Json<CompileRequest>,
) -> AppResult<Response> {
    let user = authenticated_user(&state, &headers)?;
    let project = project_for_user(&state, &user, &project_id)?;
    let entry = body.entry.unwrap_or_else(|| project.compile_entry.clone());
    let entry_path = resolve_inside_project(Path::new(&project.root_path), &entry)?;
    if entry_path.extension().and_then(|value| value.to_str()) != Some("tex") {
        return Err(AppError::bad_request("Compile entry must be a .tex file"));
    }
    json_response(compile_latex(Path::new(&project.root_path), &entry).await)
}

async fn read_pdf(
    State(state): State<AppState>,
    headers: HeaderMap,
    AxumPath(project_id): AxumPath<String>,
    Query(query): Query<FilePathQuery>,
) -> AppResult<Response> {
    let user = authenticated_user(&state, &headers)?;
    let project = project_for_user(&state, &user, &project_id)?;
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
    headers: HeaderMap,
    AxumPath(project_id): AxumPath<String>,
    Query(query): Query<FilePathQuery>,
) -> AppResult<Response> {
    let user = authenticated_user(&state, &headers)?;
    let project = project_for_user(&state, &user, &project_id)?;
    let file_path = resolve_inside_project(Path::new(&project.root_path), &query.path)?;
    if file_path.extension().and_then(|value| value.to_str()) != Some("log") {
        return Err(AppError::bad_request("Only .log files can be read through this endpoint"));
    }
    json_response(LogResponse {
        log: fs::read_to_string(file_path)?,
    })
}

fn project_index_for_user(state: &AppState, user: &UserSummary) -> AppResult<crate::project_index::ProjectIndex> {
    crate::project_index::ProjectIndex::load_for_user(user, &state.config)
}

fn project_for_user(state: &AppState, user: &UserSummary, project_id: &str) -> AppResult<crate::types::ProjectSummary> {
    project_index_for_user(state, user)?.get_project(project_id)
}

fn lock_auth(state: &AppState) -> AppResult<std::sync::MutexGuard<'_, AuthStore>> {
    state
        .auth
        .lock()
        .map_err(|_| AppError::internal("Authentication lock is poisoned"))
}

fn request_session_token(headers: &HeaderMap) -> Option<&str> {
    headers.get(header::COOKIE).and_then(|value| value.to_str().ok()).and_then(|value| cookie_token(Some(value)))
}

fn authenticated_user(state: &AppState, headers: &HeaderMap) -> AppResult<UserSummary> {
    lock_auth(state)?.current_user(request_session_token(headers))
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

fn json_response_with_cookie<T: Serialize>(value: T, cookie: String) -> AppResult<Response> {
    let body = serde_json::to_vec(&value)?;
    Ok((
        StatusCode::OK,
        [
            (header::CONTENT_TYPE, "application/json; charset=utf-8"),
            (header::CACHE_CONTROL, "no-store"),
            (header::SET_COOKIE, cookie.as_str()),
        ],
        Body::from(body),
    )
        .into_response())
}
