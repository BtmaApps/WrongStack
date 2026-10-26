use crate::{err, now, Result};
use serde_json::json;
use std::{
    fs::{File, OpenOptions},
    io::Write,
    path::Path,
    sync::{Arc, Mutex},
};

pub struct Transcript {
    raw: File,
    jsonl: File,
}
impl Transcript {
    pub fn open(dir: &Path, id: &str) -> Result<Arc<Mutex<Self>>> {
        let file = |extension| {
            OpenOptions::new()
                .create(true)
                .append(true)
                .open(dir.join(format!("{id}.{extension}")))
                .map_err(err)
        };
        Ok(Arc::new(Mutex::new(Self {
            raw: file("bin")?,
            jsonl: file("jsonl")?,
        })))
    }
    pub fn append(&mut self, bytes: &[u8]) -> std::io::Result<()> {
        self.raw.write_all(bytes)?;
        serde_json::to_writer(&mut self.jsonl, &json!({"at":now(),"bytes":bytes}))?;
        self.jsonl.write_all(b"\n")
    }
}

/// ConPTY INHERIT_CURSOR blocks startup until its first DSR is answered. The
/// host owns that handshake, even when no terminal pane has ever attached.
/// Remove it from the transcript so replays cannot inject stale cursor replies.
#[derive(Default)]
pub struct CursorHandshake {
    pending: Vec<u8>,
    done: bool,
}
impl CursorHandshake {
    pub fn feed(&mut self, bytes: &[u8]) -> (Vec<u8>, bool) {
        if self.done {
            return (bytes.to_vec(), false);
        }
        self.pending.extend_from_slice(bytes);
        let query = b"\x1b[6n";
        if let Some(index) = self.pending.windows(query.len()).position(|b| b == query) {
            self.pending.drain(index..index + query.len());
            self.done = true;
            return (std::mem::take(&mut self.pending), true);
        }
        let retained = (1..query.len())
            .rev()
            .find(|&n| self.pending.ends_with(&query[..n]))
            .unwrap_or(0);
        let emitted = self.pending.len() - retained;
        (self.pending.drain(..emitted).collect(), false)
    }
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn consumes_only_initial_cursor_handshake_across_split_reads() {
        let mut h = CursorHandshake::default();
        assert_eq!(h.feed(b"before\x1b["), (b"before".to_vec(), false));
        assert_eq!(h.feed(b"6nready"), (b"ready".to_vec(), true));
        assert_eq!(h.feed(b"later\x1b[6n"), (b"later\x1b[6n".to_vec(), false));
    }
    #[test]
    fn ordinary_output_and_unrelated_escape_sequences_are_preserved() {
        let mut h = CursorHandshake::default();
        assert_eq!(h.feed(b"hello"), (b"hello".to_vec(), false));
        assert_eq!(
            h.feed(b"\x1b[31mred\r\n"),
            (b"\x1b[31mred\r\n".to_vec(), false)
        );
    }
}
