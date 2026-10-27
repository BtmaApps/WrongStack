use crate::{err, now, Result};
use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::path::{Path, PathBuf};
use uuid::Uuid;

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Project {
    pub id: String,
    pub name: String,
    pub root: String,
    pub created_at: i64,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Session {
    pub id: String,
    pub project_id: String,
    pub title: String,
    pub kind: String,
    pub workdir: String,
    pub status: String,
    pub created_at: i64,
    pub updated_at: i64,
    pub exit_code: Option<i32>,
    pub error: Option<String>,
}

pub struct Registry {
    db: Connection,
    pub dir: PathBuf,
}
impl Registry {
    pub fn open(dir: &Path) -> Result<Self> {
        std::fs::create_dir_all(dir).map_err(err)?;
        let db = Connection::open(dir.join("workspace.sqlite")).map_err(err)?;
        db.busy_timeout(std::time::Duration::from_secs(2))
            .map_err(err)?;
        db.execute_batch("PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;
          CREATE TABLE IF NOT EXISTS projects (id TEXT PRIMARY KEY, name TEXT NOT NULL, root TEXT NOT NULL UNIQUE, created_at INTEGER NOT NULL);
          CREATE TABLE IF NOT EXISTS sessions (id TEXT PRIMARY KEY, project_id TEXT NOT NULL REFERENCES projects(id), title TEXT NOT NULL, kind TEXT NOT NULL, workdir TEXT NOT NULL, status TEXT NOT NULL, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, exit_code INTEGER, error TEXT);
          CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);").map_err(err)?;
        Ok(Self {
            db,
            dir: dir.to_owned(),
        })
    }
    pub fn register(&self, root: &str) -> Result<Project> {
        let path = std::fs::canonicalize(root).map_err(err)?;
        if !path.is_dir() {
            return Err("Project root must be a directory".into());
        }
        let canonical = path.to_string_lossy().into_owned();
        if let Some(project) = self.projects()?.into_iter().find(|p| p.root == canonical) {
            return Ok(project);
        }
        let project = Project {
            id: Uuid::new_v4().to_string(),
            name: path
                .file_name()
                .unwrap_or_default()
                .to_string_lossy()
                .into_owned(),
            root: canonical,
            created_at: now(),
        };
        self.db
            .execute(
                "INSERT INTO projects VALUES (?1,?2,?3,?4)",
                params![project.id, project.name, project.root, project.created_at],
            )
            .map_err(err)?;
        Ok(project)
    }
    pub fn projects(&self) -> Result<Vec<Project>> {
        let mut q = self
            .db
            .prepare("SELECT id,name,root,created_at FROM projects ORDER BY created_at")
            .map_err(err)?;
        let rows = q
            .query_map([], |r| {
                Ok(Project {
                    id: r.get(0)?,
                    name: r.get(1)?,
                    root: r.get(2)?,
                    created_at: r.get(3)?,
                })
            })
            .map_err(err)?;
        rows.collect::<std::result::Result<Vec<_>, _>>()
            .map_err(err)
    }
    pub fn workdir(&self, project_id: &str, requested: Option<&str>) -> Result<PathBuf> {
        let project = self
            .projects()?
            .into_iter()
            .find(|p| p.id == project_id)
            .ok_or("Unknown project")?;
        let root = PathBuf::from(project.root);
        let path = requested.map(PathBuf::from).unwrap_or_else(|| root.clone());
        let path = std::fs::canonicalize(if path.is_absolute() {
            path
        } else {
            root.join(path)
        })
        .map_err(err)?;
        if !path.is_dir() || !path.starts_with(&root) {
            return Err("Workdir must be inside the registered project".into());
        }
        Ok(path)
    }
    pub fn insert(&self, s: &Session) -> Result<()> {
        self.db
            .execute(
                "INSERT INTO sessions VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10)",
                params![
                    s.id,
                    s.project_id,
                    s.title,
                    s.kind,
                    s.workdir,
                    s.status,
                    s.created_at,
                    s.updated_at,
                    s.exit_code,
                    s.error
                ],
            )
            .map_err(err)?;
        Ok(())
    }
    pub fn sessions(&self) -> Result<Vec<Session>> {
        let mut q = self.db.prepare("SELECT id,project_id,title,kind,workdir,status,created_at,updated_at,exit_code,error FROM sessions ORDER BY created_at DESC").map_err(err)?;
        let rows = q
            .query_map([], |r| {
                Ok(Session {
                    id: r.get(0)?,
                    project_id: r.get(1)?,
                    title: r.get(2)?,
                    kind: r.get(3)?,
                    workdir: r.get(4)?,
                    status: r.get(5)?,
                    created_at: r.get(6)?,
                    updated_at: r.get(7)?,
                    exit_code: r.get(8)?,
                    error: r.get(9)?,
                })
            })
            .map_err(err)?;
        rows.collect::<std::result::Result<Vec<_>, _>>()
            .map_err(err)
    }
    pub fn state(
        &self,
        id: &str,
        status: &str,
        code: Option<i32>,
        error: Option<&str>,
    ) -> Result<()> {
        self.db
            .execute(
                "UPDATE sessions SET status=?2,updated_at=?3,exit_code=?4,error=?5 WHERE id=?1",
                params![id, status, now(), code, error],
            )
            .map_err(err)?;
        Ok(())
    }
    pub fn recover(&self) -> Result<()> {
        self.db.execute("UPDATE sessions SET status='interrupted',error='Session host stopped. Transcript is available; start a new session to continue.' WHERE status IN ('running','starting')", []).map_err(err)?;
        Ok(())
    }
    pub fn setting(&self, key: &str) -> Result<Option<String>> {
        use rusqlite::OptionalExtension;
        self.db
            .query_row("SELECT value FROM settings WHERE key=?1", [key], |r| {
                r.get(0)
            })
            .optional()
            .map_err(err)
    }
    pub fn draft(&self, id: &str) -> Result<String> {
        self.ensure_agent(id)?;
        Ok(self.setting(&format!("draft:{id}"))?.unwrap_or_default())
    }
    pub fn draft_mode(&self, id: &str) -> Result<String> {
        self.ensure_agent(id)?;
        let mode = self
            .setting(&format!("draftmode:{id}"))?
            .unwrap_or_else(|| "btw".into());
        if !["btw", "queue", "steer"].contains(&mode.as_str()) {
            return Err("Invalid saved delivery mode".into());
        }
        Ok(mode)
    }
    pub fn save_draft_mode(&self, id: &str, mode: &str) -> Result<()> {
        self.ensure_agent(id)?;
        if !["btw", "queue", "steer"].contains(&mode) {
            return Err("Invalid delivery mode".into());
        }
        let key = format!("draftmode:{id}");
        if mode == "btw" {
            self.db
                .execute("DELETE FROM settings WHERE key=?1", [key])
                .map_err(err)?;
        } else {
            self.db.execute("INSERT INTO settings VALUES (?1,?2) ON CONFLICT(key) DO UPDATE SET value=excluded.value", params![key, mode]).map_err(err)?;
        }
        Ok(())
    }
    pub fn draft_part(&self, id: &str, part: &str) -> Result<String> {
        self.ensure_agent(id)?;
        let prefix = match part {
            "references" => "draftrefs",
            "attachments" => "draftmedia",
            _ => return Err("Unknown draft part".into()),
        };
        Ok(self
            .setting(&format!("{prefix}:{id}"))?
            .unwrap_or_else(|| "[]".into()))
    }
    fn ensure_agent(&self, id: &str) -> Result<()> {
        if Uuid::parse_str(id).is_err()
            || !self
                .db
                .query_row(
                    "SELECT EXISTS(SELECT 1 FROM sessions WHERE id=?1 AND kind='agent')",
                    [id],
                    |row| row.get::<_, bool>(0),
                )
                .map_err(err)?
        {
            return Err("Unknown agent session".into());
        }
        Ok(())
    }
    pub fn save_draft(&self, id: &str, text: &str) -> Result<()> {
        self.ensure_agent(id)?;
        if text.len() > 2 * 1024 * 1024 {
            return Err("Draft exceeds the 2 MB storage limit".into());
        }
        let key = format!("draft:{id}");
        if text.is_empty() {
            self.db
                .execute("DELETE FROM settings WHERE key=?1", [key])
                .map_err(err)?;
        } else {
            self.db.execute("INSERT INTO settings VALUES (?1,?2) ON CONFLICT(key) DO UPDATE SET value=excluded.value", params![key, text]).map_err(err)?;
        }
        Ok(())
    }
    pub fn save_draft_part(&self, id: &str, part: &str, value: &str) -> Result<()> {
        self.ensure_agent(id)?;
        let (prefix, limit) = match part {
            "references" => ("draftrefs", 2 * 1024 * 1024),
            "attachments" => ("draftmedia", 18 * 1024 * 1024),
            _ => return Err("Unknown draft part".into()),
        };
        if value.len() > limit {
            return Err("Draft data exceeds the storage limit".into());
        }
        let parsed: Value = serde_json::from_str(value).map_err(err)?;
        if !parsed.is_array() {
            return Err("Draft data must be a list".into());
        }
        let key = format!("{prefix}:{id}");
        if parsed.as_array().is_some_and(|items| items.is_empty()) {
            self.db
                .execute("DELETE FROM settings WHERE key=?1", [key])
                .map_err(err)?;
        } else {
            self.db.execute("INSERT INTO settings VALUES (?1,?2) ON CONFLICT(key) DO UPDATE SET value=excluded.value", params![key, value]).map_err(err)?;
        }
        Ok(())
    }
    pub fn set_setting(&self, key: &str, value: &str) -> Result<()> {
        if key != "layout"
            && key != "appearance"
            && !key
                .strip_prefix("layout:")
                .is_some_and(|id| Uuid::parse_str(id).is_ok())
        {
            return Err("Unknown setting".into());
        }
        self.db.execute("INSERT INTO settings VALUES (?1,?2) ON CONFLICT(key) DO UPDATE SET value=excluded.value", [key,value]).map_err(err)?;
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn registry_persists_projects_sessions_and_rejects_escape() {
        let dir = std::env::temp_dir().join(Uuid::new_v4().to_string());
        let project_dir = dir.join("repo");
        std::fs::create_dir_all(project_dir.join("src")).unwrap();
        let db = Registry::open(&dir.join("state")).unwrap();
        let p = db.register(project_dir.to_str().unwrap()).unwrap();
        assert_eq!(p.id, db.register(project_dir.to_str().unwrap()).unwrap().id);
        assert!(db.workdir(&p.id, Some("src")).is_ok());
        assert!(db.workdir(&p.id, Some("..")).is_err());
        assert!(db.workdir("missing", None).is_err());
        let s = Session {
            id: Uuid::new_v4().to_string(),
            project_id: p.id,
            title: "test".into(),
            kind: "terminal".into(),
            workdir: project_dir.to_string_lossy().into(),
            status: "running".into(),
            created_at: now(),
            updated_at: now(),
            exit_code: None,
            error: None,
        };
        db.insert(&s).unwrap();
        let a = Session {
            id: Uuid::new_v4().to_string(),
            kind: "agent".into(),
            ..s.clone()
        };
        let b = Session {
            id: Uuid::new_v4().to_string(),
            kind: "agent".into(),
            ..s.clone()
        };
        db.insert(&a).unwrap();
        db.insert(&b).unwrap();
        db.save_draft(&a.id, "first project draft").unwrap();
        db.save_draft(&b.id, "second project draft").unwrap();
        db.save_draft_mode(&a.id, "queue").unwrap();
        assert!(db.save_draft_mode(&a.id, "unsupported").is_err());
        let refs = r#"[{"path":"src/app.ts"}]"#;
        let media = r#"[{"id":"one","name":"image.png","mediaType":"image/png","data":"AA+/==","bytes":3}]"#;
        db.save_draft_part(&a.id, "references", refs).unwrap();
        db.save_draft_part(&a.id, "attachments", media).unwrap();
        assert!(db.save_draft_part(&a.id, "attachments", "{}").is_err());
        assert!(db.save_draft_part(&a.id, "unknown", "[]").is_err());
        assert!(db.save_draft(&s.id, "terminal").is_err());
        assert!(db
            .save_draft(&Uuid::new_v4().to_string(), "unknown")
            .is_err());
        db.set_setting("appearance", "{\"mode\":\"light\",\"accent\":\"ocean\"}")
            .unwrap();
        assert!(db.set_setting("unknown", "value").is_err());
        drop(db);
        let db = Registry::open(&dir.join("state")).unwrap();
        assert_eq!(
            db.setting("appearance").unwrap().as_deref(),
            Some("{\"mode\":\"light\",\"accent\":\"ocean\"}")
        );
        assert_eq!(db.draft(&a.id).unwrap(), "first project draft");
        assert_eq!(db.draft(&b.id).unwrap(), "second project draft");
        assert_eq!(db.draft_mode(&a.id).unwrap(), "queue");
        assert_eq!(db.draft_mode(&b.id).unwrap(), "btw");
        db.save_draft_mode(&a.id, "btw").unwrap();
        assert_eq!(db.draft_mode(&a.id).unwrap(), "btw");
        assert_eq!(db.draft_part(&a.id, "references").unwrap(), refs);
        assert_eq!(db.draft_part(&a.id, "attachments").unwrap(), media);
        assert_eq!(db.draft_part(&b.id, "attachments").unwrap(), "[]");
        db.save_draft_part(&a.id, "attachments", "[]").unwrap();
        assert_eq!(db.draft_part(&a.id, "attachments").unwrap(), "[]");
        db.save_draft(&a.id, "").unwrap();
        assert_eq!(db.draft(&a.id).unwrap(), "");
        assert_eq!(db.draft(&b.id).unwrap(), "second project draft");
        db.recover().unwrap();
        assert!(db
            .sessions()
            .unwrap()
            .iter()
            .all(|s| s.status == "interrupted"));
        drop(db);
        std::fs::remove_dir_all(dir).unwrap();
    }
}
