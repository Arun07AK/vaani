//! System-audio capture pipeline. Stubbed for v4.3-phase-1 — the shell ships
//! first (menu-bar, window, iframe, bridge). Live capture via ScreenCaptureKit
//! (SCStream with `captures_audio=true`) lands in phase-3 follow-up.
//!
//! Once live, this module will:
//!   1. Acquire an `SCShareableContent` handle, build an `SCContentFilter`
//!      for the primary display, configure `SCStreamConfiguration` with
//!      audio capture enabled at 48 kHz.
//!   2. Attach an `SCStreamOutputTrait` impl that accumulates Float32 PCM
//!      into a ring buffer.
//!   3. Every 3 s, drain the buffer → downmix → decimate 48k→16k →
//!      encode WAV (hound) → POST /api/transcribe (upload::upload_chunk)
//!      → emit `vaani-transcript` event.

use anyhow::Result;
use std::sync::Arc;
use std::time::Duration;
use tauri::{AppHandle, Emitter};

use crate::state::AppState;

pub async fn run_pipeline(app: AppHandle, _state: Arc<AppState>) -> Result<()> {
    tracing::info!("audio pipeline started (stub — live SCStream capture pending)");
    let _ = app.emit(
        "vaani-status",
        serde_json::json!({
            "kind": "listening",
            "message": "shell ready — live capture pending",
        }),
    );
    // Keep the task alive; the rest of the app runs normally.
    loop {
        tokio::time::sleep(Duration::from_secs(60)).await;
    }
}
