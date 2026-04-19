use parking_lot::Mutex;
use std::sync::atomic::{AtomicBool, Ordering};

pub struct AppState {
    running: AtomicBool,
    lang: Mutex<String>,
    last_transcript: Mutex<String>,
}

impl AppState {
    pub fn new() -> Self {
        Self {
            running: AtomicBool::new(true),
            lang: Mutex::new("en-IN".into()),
            last_transcript: Mutex::new(String::new()),
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
}
