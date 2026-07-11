use std::{fs, path::PathBuf};

use argon2::{
    password_hash::{rand_core::OsRng, PasswordHash, PasswordHasher, PasswordVerifier, SaltString},
    Argon2,
};
use chrono::{Duration, Utc};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::{errors::{AppError, AppResult}, types::UserSummary};

pub const SESSION_COOKIE: &str = "scriptorium_session";
const SESSION_LIFETIME_DAYS: i64 = 30;

#[derive(Debug)]
pub struct AuthStore {
    sessions_path: PathBuf,
    users_path: PathBuf,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
struct UserRecord {
    user_id: String,
    email: String,
    password_hash: String,
}

#[derive(Debug, Default, Serialize, Deserialize)]
struct UserFile {
    users: Vec<UserRecord>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
struct SessionRecord {
    token: String,
    user_id: String,
    expires_at: String,
}

#[derive(Debug, Default, Serialize, Deserialize)]
struct SessionFile {
    sessions: Vec<SessionRecord>,
}

impl AuthStore {
    pub fn load(data_root: PathBuf) -> AppResult<Self> {
        fs::create_dir_all(&data_root)?;
        let store = Self {
            sessions_path: data_root.join("sessions.json"),
            users_path: data_root.join("users.json"),
        };
        if !store.users_path.exists() {
            store.save_users(&UserFile::default())?;
        }
        if !store.sessions_path.exists() {
            store.save_sessions(&SessionFile::default())?;
        }
        Ok(store)
    }

    pub fn register(&mut self, email: &str, password: &str) -> AppResult<UserSummary> {
        let email = normalize_email(email)?;
        validate_password(password)?;
        let mut users = self.read_users()?;
        if users.users.iter().any(|user| user.email == email) {
            return Err(AppError::bad_request("An account already exists for this email"));
        }
        let salt = SaltString::generate(&mut OsRng);
        let password_hash = Argon2::default()
            .hash_password(password.as_bytes(), &salt)
            .map_err(|error| AppError::internal(error.to_string()))?
            .to_string();
        let user = UserRecord { user_id: Uuid::new_v4().to_string(), email, password_hash };
        let summary = user_summary(&user);
        users.users.push(user);
        self.save_users(&users)?;
        Ok(summary)
    }

    pub fn sign_in(&mut self, email: &str, password: &str) -> AppResult<String> {
        let email = normalize_email(email)?;
        let user = self
            .read_users()?
            .users
            .into_iter()
            .find(|user| user.email == email)
            .ok_or_else(invalid_credentials)?;
        let hash = PasswordHash::new(&user.password_hash).map_err(|_| invalid_credentials())?;
        Argon2::default()
            .verify_password(password.as_bytes(), &hash)
            .map_err(|_| invalid_credentials())?;
        let mut sessions = self.read_sessions()?;
        let now = Utc::now();
        sessions.sessions.retain(|session| parse_not_expired(session, now));
        let token = Uuid::new_v4().to_string();
        sessions.sessions.push(SessionRecord {
            token: token.clone(),
            user_id: user.user_id,
            expires_at: (now + Duration::days(SESSION_LIFETIME_DAYS)).to_rfc3339(),
        });
        self.save_sessions(&sessions)?;
        Ok(token)
    }

    pub fn current_user(&mut self, token: Option<&str>) -> AppResult<UserSummary> {
        let token = token.ok_or_else(|| AppError::unauthorized("Sign in is required"))?;
        let mut sessions = self.read_sessions()?;
        let now = Utc::now();
        sessions.sessions.retain(|session| parse_not_expired(session, now));
        self.save_sessions(&sessions)?;
        let user_id = sessions
            .sessions
            .iter()
            .find(|session| session.token == token)
            .map(|session| session.user_id.clone())
            .ok_or_else(|| AppError::unauthorized("Your session has expired. Sign in again."))?;
        self.read_users()?
            .users
            .iter()
            .find(|user| user.user_id == user_id)
            .map(user_summary)
            .ok_or_else(|| AppError::unauthorized("Account no longer exists"))
    }

    pub fn sign_out(&mut self, token: Option<&str>) -> AppResult<()> {
        let Some(token) = token else { return Ok(()); };
        let mut sessions = self.read_sessions()?;
        sessions.sessions.retain(|session| session.token != token);
        self.save_sessions(&sessions)
    }

    fn read_users(&self) -> AppResult<UserFile> {
        let content = fs::read_to_string(&self.users_path)?;
        serde_json::from_str(&content).map_err(AppError::from)
    }

    fn save_users(&self, users: &UserFile) -> AppResult<()> {
        fs::write(&self.users_path, serde_json::to_string_pretty(users)?)?;
        Ok(())
    }

    fn read_sessions(&self) -> AppResult<SessionFile> {
        let content = fs::read_to_string(&self.sessions_path)?;
        serde_json::from_str(&content).map_err(AppError::from)
    }

    fn save_sessions(&self, sessions: &SessionFile) -> AppResult<()> {
        fs::write(&self.sessions_path, serde_json::to_string_pretty(sessions)?)?;
        Ok(())
    }
}

pub fn cookie_token(cookie_header: Option<&str>) -> Option<&str> {
    cookie_header?.split(';').find_map(|part| {
        let (name, value) = part.trim().split_once('=')?;
        (name == SESSION_COOKIE).then_some(value)
    })
}

pub fn session_cookie(token: &str, secure: bool) -> String {
    format!("{SESSION_COOKIE}={token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=2592000{}", if secure { "; Secure" } else { "" })
}

pub fn expired_session_cookie(secure: bool) -> String {
    format!("{SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0{}", if secure { "; Secure" } else { "" })
}

fn normalize_email(value: &str) -> AppResult<String> {
    let email = value.trim().to_lowercase();
    if email.len() < 3 || email.len() > 254 || !email.contains('@') || email.starts_with('@') || email.ends_with('@') {
        return Err(AppError::bad_request("Enter a valid email address"));
    }
    Ok(email)
}

fn validate_password(password: &str) -> AppResult<()> {
    if password.chars().count() < 8 {
        return Err(AppError::bad_request("Password must contain at least 8 characters"));
    }
    Ok(())
}

fn parse_not_expired(session: &SessionRecord, now: chrono::DateTime<Utc>) -> bool {
    chrono::DateTime::parse_from_rfc3339(&session.expires_at)
        .map(|expires_at| expires_at.with_timezone(&Utc) > now)
        .unwrap_or(false)
}

fn invalid_credentials() -> AppError { AppError::unauthorized("Invalid email or password") }

fn user_summary(user: &UserRecord) -> UserSummary {
    UserSummary { user_id: user.user_id.clone(), email: user.email.clone() }
}

#[cfg(test)]
mod tests {
    use std::fs;
    use tempfile::tempdir;
    use super::*;

    #[test]
    fn registration_hashes_password_and_session_resolves_only_its_user() {
        let temp = tempdir().unwrap();
        let mut store = AuthStore::load(temp.path().join("data")).unwrap();
        let user = store.register("writer@example.com", "correct horse battery staple").unwrap();
        let saved = fs::read_to_string(temp.path().join("data/users.json")).unwrap();
        assert!(!saved.contains("correct horse battery staple"));
        let token = store.sign_in("writer@example.com", "correct horse battery staple").unwrap();
        assert_eq!(store.current_user(Some(&token)).unwrap().user_id, user.user_id);
        assert!(store.sign_in("writer@example.com", "wrong password").is_err());
    }
}
