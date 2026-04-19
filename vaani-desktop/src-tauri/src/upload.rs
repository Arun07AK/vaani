//! HTTP uploader for WAV chunks → /api/transcribe.

use anyhow::Result;
use reqwest::multipart::{Form, Part};
use serde::Deserialize;
use std::time::Duration;

use crate::TRANSCRIBE_URL;

#[derive(Debug, Deserialize)]
pub struct TranscribeResponse {
    pub transcript: String,
    #[serde(default)]
    #[allow(dead_code)]
    pub language: Option<String>,
}

/// Upload a WAV chunk to /api/transcribe. Returns None if the response was
/// empty or whisper rejected the chunk; returns Err for transport failures.
pub async fn upload_chunk(
    client: &reqwest::Client,
    wav_bytes: Vec<u8>,
    lang: &str,
) -> Result<Option<TranscribeResponse>> {
    let part = Part::bytes(wav_bytes)
        .file_name("chunk.wav")
        .mime_str("audio/wav")?;
    let form = Form::new()
        .part("audio", part)
        .text("lang", lang.to_string());

    let res = client
        .post(TRANSCRIBE_URL)
        .timeout(Duration::from_secs(15))
        .multipart(form)
        .send()
        .await?;

    let status = res.status();
    if !status.is_success() {
        let body = res.text().await.unwrap_or_default();
        anyhow::bail!("transcribe {status}: {body}");
    }

    let parsed: TranscribeResponse = res.json().await?;
    if parsed.transcript.trim().is_empty() {
        return Ok(None);
    }
    Ok(Some(parsed))
}

pub fn http_client() -> reqwest::Client {
    reqwest::Client::builder()
        .user_agent("vaani-desktop/0.1")
        .timeout(Duration::from_secs(20))
        .build()
        .expect("reqwest client")
}
