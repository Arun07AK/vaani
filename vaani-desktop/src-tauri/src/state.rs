use parking_lot::Mutex;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use tokio::sync::Notify;

pub struct AppState {
    running: AtomicBool,
    lang: Mutex<String>,
    last_transcript: Mutex<String>,
    /// Signalled by the frontend once it has registered all Tauri listeners.
    /// The audio drain loop waits on this before emitting any transcripts so
    /// the TS side doesn't miss early events.
    pub frontend_ready: Arc<Notify>,
    ready_once: AtomicBool,
}

impl AppState {
    pub fn new() -> Self {
        Self {
            running: AtomicBool::new(true),
            lang: Mutex::new("en-IN".into()),
            last_transcript: Mutex::new(String::new()),
            frontend_ready: Arc::new(Notify::new()),
            ready_once: AtomicBool::new(false),
        }
    }

    pub fn running(&self) -> bool {
        self.running.load(Ordering::SeqCst)
    }

    /// Flip running state and return the NEW value.
    pub fn toggle_running(&self) -> bool {
        let prev = self.running.fetch_xor(true, Ordering::SeqCst);
        !prev
    }

    pub fn lang(&self) -> String {
        self.lang.lock().clone()
    }

    pub fn set_lang(&self, lang: &str) {
        *self.lang.lock() = lang.into();
    }

    pub fn set_last_transcript(&self, t: String) {
        *self.last_transcript.lock() = t;
    }

    #[allow(dead_code)]
    pub fn last_transcript(&self) -> String {
        self.last_transcript.lock().clone()
    }

    /// Idempotent: the first caller marks ready and notifies; later calls noop.
    pub fn mark_frontend_ready(&self) -> bool {
        let was_ready = self.ready_once.swap(true, Ordering::SeqCst);
        if !was_ready {
            self.frontend_ready.notify_waiters();
            true
        } else {
            false
        }
    }
}
