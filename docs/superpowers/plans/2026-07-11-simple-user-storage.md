# Simple User Storage Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add email/password accounts, server-side sessions, and user-scoped project storage so a signed-in user can access only their own projects and files.

**Architecture:** The Rust API owns identity and authorization. It persists user records and opaque sessions beneath the server data directory, keeps password hashes only, and derives the current user from an `HttpOnly` session cookie on every protected request. Each account receives a private project root and a separate project index; API handlers resolve a project only through that authenticated user's index.

**Tech Stack:** Rust, Axum 0.7, Argon2 password hashing, UUID session/user identifiers, React 18, TypeScript, Vite.

## Global Constraints

- Never store a plaintext password, authentication token, or absolute browser-local path.
- Store account data outside the deployable application directory, under `SCRIPTORIUM_DATA_DIR` (default: `<workspace>/.scriptorium/data`).
- Use `HttpOnly`, `SameSite=Strict`, path-scoped session cookies; set `Secure` when `SCRIPTORIUM_COOKIE_SECURE=true` in production HTTPS deployments.
- Every project/file/compile/review endpoint requires an authenticated session and must use that session's user ID to locate the project index.
- New projects and uploads must be stored under `data/users/<user-id>/projects/`, never under the source checkout.
- The browser must continue using the platform-provider boundary; React components must not call filesystem APIs directly.

---

## File Structure

- Create: `scriptorium/apps/local-server-rs/src/auth.rs` — user persistence, Argon2 password verification, session persistence, cookie parsing, and current-user extraction.
- Modify: `scriptorium/apps/local-server-rs/src/config.rs` — data root and production-cookie configuration.
- Modify: `scriptorium/apps/local-server-rs/src/types.rs` — account and auth request/response JSON contracts.
- Modify: `scriptorium/apps/local-server-rs/src/project_index.rs` — user-specific project index and project-root construction.
- Modify: `scriptorium/apps/local-server-rs/src/server.rs` — auth routes and authorization on all project routes.
- Modify: `scriptorium/apps/local-server-rs/src/lib.rs` and `scriptorium/apps/local-server-rs/Cargo.toml` — expose auth and add Argon2/UUID dependencies.
- Modify: `scriptorium/packages/platform/src/index.ts` — auth-provider interfaces.
- Modify: `scriptorium/apps/web/src/platform/webProviders.ts` — API-backed auth provider and credentialed requests.
- Modify: `scriptorium/apps/web/src/app/useScriptoriumApp.ts` — session bootstrap, sign-up/sign-in/sign-out actions, and project-state reset on sign-out.
- Modify: `scriptorium/apps/web/src/App.tsx`, `scriptorium/apps/web/src/views/ProjectHome.tsx`, and `scriptorium/apps/web/src/styles.css` — a compact sign-in/sign-up screen and signed-in account controls.
- Modify: `scriptorium/README.md` — data-directory, account, and deployment configuration documentation.

### Task 1: Persist users and sessions securely

**Files:**
- Create: `scriptorium/apps/local-server-rs/src/auth.rs`
- Modify: `scriptorium/apps/local-server-rs/src/config.rs`
- Modify: `scriptorium/apps/local-server-rs/src/types.rs`
- Modify: `scriptorium/apps/local-server-rs/src/lib.rs`
- Modify: `scriptorium/apps/local-server-rs/Cargo.toml`

**Interfaces:**
- Produces: `AuthStore::register(&self, email: &str, password: &str) -> AppResult<UserSummary>`.
- Produces: `AuthStore::sign_in(&self, email: &str, password: &str) -> AppResult<Session>`.
- Produces: `AuthStore::current_user(&self, cookie_header: Option<&HeaderValue>) -> AppResult<UserSummary>`.
- Produces: `AuthStore::sign_out(&self, cookie_header: Option<&HeaderValue>) -> AppResult<()>`.

- [ ] **Step 1: Write failing auth-store tests**

```rust
#[test]
fn registration_hashes_password_and_session_resolves_only_its_user() {
    let store = AuthStore::load(temp.path().join("data"), false).unwrap();
    let user = store.register("writer@example.com", "correct horse battery staple").unwrap();
    let saved = fs::read_to_string(temp.path().join("data/users.json")).unwrap();
    assert!(!saved.contains("correct horse battery staple"));
    let session = store.sign_in("writer@example.com", "correct horse battery staple").unwrap();
    assert_eq!(store.current_user_from_token(&session.token).unwrap().user_id, user.user_id);
    assert!(store.sign_in("writer@example.com", "wrong password").is_err());
}
```

- [ ] **Step 2: Run the focused test to verify it fails**

Run: `cargo test -p scriptorium-local-server registration_hashes_password_and_session_resolves_only_its_user`

Expected: FAIL because `auth` and `AuthStore` do not exist.

- [ ] **Step 3: Add the minimal persistent store and contracts**

```rust
#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UserSummary { pub user_id: String, pub email: String }

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CredentialsRequest { pub email: Option<String>, pub password: Option<String> }

pub const SESSION_COOKIE: &str = "scriptorium_session";

pub fn session_cookie(token: &str, secure: bool) -> String {
    format!("{SESSION_COOKIE}={token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=2592000{}",
        if secure { "; Secure" } else { "" })
}
```

Use `argon2::Argon2::default()` with a fresh `SaltString::generate(&mut OsRng)` for registration, and `PasswordHash` plus `verify_password` for sign-in. Serialize only `password_hash` in `users.json`; serialize randomly generated UUID strings, user IDs, and expiry timestamps in `sessions.json`. Reject malformed email/password input with `AppError::bad_request` and return one generic invalid-credentials error for an unknown email or password mismatch.

- [ ] **Step 4: Run focused auth tests**

Run: `cargo test -p scriptorium-local-server auth`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add scriptorium/apps/local-server-rs/Cargo.toml scriptorium/apps/local-server-rs/src/auth.rs scriptorium/apps/local-server-rs/src/config.rs scriptorium/apps/local-server-rs/src/lib.rs scriptorium/apps/local-server-rs/src/types.rs
git commit -m "feat: add persistent account sessions"
```

### Task 2: Scope all projects and files to the authenticated account

**Files:**
- Modify: `scriptorium/apps/local-server-rs/src/project_index.rs`
- Modify: `scriptorium/apps/local-server-rs/src/server.rs`
- Test: `scriptorium/apps/local-server-rs/src/project_index.rs`

**Interfaces:**
- Consumes: `UserSummary.user_id`, `ServerConfig.data_root`, and `AuthStore::current_user`.
- Produces: `ProjectIndex::load_for_user(user: &UserSummary, config: &ServerConfig) -> AppResult<ProjectIndex>`.
- Produces: `project_for_user(state: &AppState, user: &UserSummary, project_id: &str) -> AppResult<ProjectSummary>`.

- [ ] **Step 1: Write failing user-storage tests**

```rust
#[test]
fn users_receive_separate_project_roots_and_indexes() {
    let config = test_config(temp.path());
    let alice = UserSummary { user_id: "alice".into(), email: "alice@example.com".into() };
    let bob = UserSummary { user_id: "bob".into(), email: "bob@example.com".into() };
    let alice_project = ProjectIndex::load_for_user(&alice, &config).unwrap()
        .create_project(CreateProjectRequest { name: Some("Paper".into()), parent_path: None, template: Some("blank".into()) }).unwrap();
    assert!(Path::new(&alice_project.root_path).starts_with(config.data_root.join("users/alice/projects")));
    assert!(ProjectIndex::load_for_user(&bob, &config).unwrap().get_project(&alice_project.project_id).is_err());
}
```

- [ ] **Step 2: Run the focused test to verify it fails**

Run: `cargo test -p scriptorium-local-server users_receive_separate_project_roots_and_indexes`

Expected: FAIL because there is no user-scoped index.

- [ ] **Step 3: Replace global index lookup with per-user lookup**

```rust
let user_root = config.data_root.join("users").join(&user.user_id);
let project_root = user_root.join("projects");
let index_path = user_root.join("projects.json");
fs::create_dir_all(&project_root)?;
ProjectIndex::load(project_root, index_path, project_root)
```

Make every `/api/projects...` handler extract `CurrentUser` before looking up its index. Remove the web-facing `POST /api/projects/open` route and its browser UI action: arbitrary server paths cannot be made safe for a hosted multi-user product. Return `401 Unauthorized` for no/invalid session and `404 Not Found` for a project ID that is absent from the signed-in user's index; never reveal another account's project path or contents.

- [ ] **Step 4: Run all Rust tests**

Run: `cargo test -p scriptorium-local-server`

Expected: PASS, including existing project-file, review-session, and project-index tests.

- [ ] **Step 5: Commit**

```bash
git add scriptorium/apps/local-server-rs/src/project_index.rs scriptorium/apps/local-server-rs/src/server.rs
git commit -m "feat: isolate projects by account"
```

### Task 3: Add browser authentication and account controls

**Files:**
- Modify: `scriptorium/packages/platform/src/index.ts`
- Modify: `scriptorium/apps/web/src/platform/webProviders.ts`
- Modify: `scriptorium/apps/web/src/app/useScriptoriumApp.ts`
- Modify: `scriptorium/apps/web/src/App.tsx`
- Modify: `scriptorium/apps/web/src/views/ProjectHome.tsx`
- Modify: `scriptorium/apps/web/src/styles.css`

**Interfaces:**
- Consumes: `GET /api/auth/me`, `POST /api/auth/register`, `POST /api/auth/login`, and `POST /api/auth/logout`.
- Produces: `AuthProvider.currentUser(): Promise<UserSummary | null>`, `register(email, password)`, `signIn(email, password)`, and `signOut()`.

- [ ] **Step 1: Define the platform contract**

```ts
export interface UserSummary { userId: string; email: string; }
export interface AuthProvider {
  currentUser(): Promise<UserSummary | null>;
  register(email: string, password: string): Promise<UserSummary>;
  signIn(email: string, password: string): Promise<UserSummary>;
  signOut(): Promise<void>;
}

export interface ScriptoriumPlatform { auth: AuthProvider; projects: ProjectManagerProvider; files: FileSystemProvider; latex: LatexCompilerProvider; }
```

- [ ] **Step 2: Implement credentialed API calls and bootstrapping**

```ts
const response = await fetch(path, { credentials: "same-origin", ...init });

useEffect(() => {
  platform.auth.currentUser().then(setCurrentUser).catch(() => setCurrentUser(null));
}, [platform.auth]);
```

On a successful registration or sign-in, clear stale workspace state, set `currentUser`, then load that user's projects. On sign-out, call the API, clear `currentUser`, projects, selected project, editor state, and notices; do not retain account data in `localStorage`.

- [ ] **Step 3: Create the compact access screen**

```tsx
if (!app.currentUser) {
  return <AuthScreen onSignIn={app.signIn} onRegister={app.register} notice={app.notice} />;
}
```

The screen has Email and Password fields, “Sign in” and “Create account” actions, disables submission while an API request is in flight, and displays the API error as plain text. The authenticated project home shows the current email and a Sign out button. Remove “Open Project,” since server-side arbitrary paths are intentionally unsupported.

- [ ] **Step 4: Run the frontend build**

Run: `npm run build`

Expected: exits 0 and writes `scriptorium/dist/web`.

- [ ] **Step 5: Commit**

```bash
git add scriptorium/packages/platform/src/index.ts scriptorium/apps/web/src/platform/webProviders.ts scriptorium/apps/web/src/app/useScriptoriumApp.ts scriptorium/apps/web/src/App.tsx scriptorium/apps/web/src/views/ProjectHome.tsx scriptorium/apps/web/src/styles.css
git commit -m "feat: add account access screen"
```

### Task 4: Verify authorization boundaries and document deployment

**Files:**
- Modify: `scriptorium/apps/local-server-rs/src/server.rs`
- Modify: `scriptorium/README.md`

**Interfaces:**
- Consumes: a valid session cookie and a project ID generated for another user.
- Produces: `401` for missing session; `404` for another user's project; `200` for the owning user's project.

- [ ] **Step 1: Add handler-level authorization tests**

```rust
#[tokio::test]
async fn project_routes_require_ownership() {
    let app = test_router_with_users().await;
    assert_eq!(request(&app, "GET", "/api/projects", None).await.status(), StatusCode::UNAUTHORIZED);
    let alice_cookie = register_and_login(&app, "alice@example.com").await;
    let project_id = create_project(&app, &alice_cookie).await;
    let bob_cookie = register_and_login(&app, "bob@example.com").await;
    assert_eq!(request(&app, "GET", &format!("/api/projects/{project_id}"), Some(&bob_cookie)).await.status(), StatusCode::NOT_FOUND);
}
```

- [ ] **Step 2: Run the authorization test to verify it fails before handler guards**

Run: `cargo test -p scriptorium-local-server project_routes_require_ownership`

Expected: FAIL before the guards exist; PASS after Task 2 has been completed.

- [ ] **Step 3: Document deployment configuration**

```markdown
For deployment, set `SCRIPTORIUM_DATA_DIR=/var/lib/scriptorium` and mount or back up that directory separately from the application release. Serve the API over HTTPS and set `SCRIPTORIUM_COOKIE_SECURE=true`. The server stores one private project root per account at `users/<user-id>/projects`; `users.json` contains Argon2 hashes, and `sessions.json` contains revocable opaque session records.
```

Also document that registration is open in this MVP and should be placed behind invitations, SSO, or an admin-approved signup policy before a public launch.

- [ ] **Step 4: Run the complete regression suite**

Run: `npm test && npm run build`

Expected: all core/Rust tests pass and the Vite production build exits 0.

- [ ] **Step 5: Commit**

```bash
git add scriptorium/apps/local-server-rs/src/server.rs scriptorium/README.md
git commit -m "test: verify account authorization"
```

## Self-Review

- Spec coverage: Tasks 1–2 provide the requested identity layer, private persistent storage, and enforcement; Task 3 makes the system usable from the web UI; Task 4 verifies and documents a server deployment.
- Placeholder scan: no deferred implementation markers or unspecified test commands remain.
- Type consistency: `UserSummary`, `AuthProvider`, `AuthStore`, `ServerConfig.data_root`, and user-scoped `ProjectIndex` use the same names across all tasks.
