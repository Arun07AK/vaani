//! System-audio capture via ScreenCaptureKit + upload pipeline.
//!
//! Wait order on startup: SCStream starts immediately (so the first system
//! audio samples aren't lost), but the drain+upload loop blocks on
//! `state.frontend_ready` — signalled by the TS bridge via
//! `invoke("frontend_ready")` — so no `vaani-transcript` event is emitted
//! before the frontend has registered its Tauri listeners.
//!
//! Every boundary gets a tracing line so a pipeline stall can be localised
//! by reading the log alone:
//!   first_sample_arrived        → SCStream delivered audio
//!   buffer_push                 → samples appended to ring buffer
//!   chunk_drained               → 3 s of mono pulled
//!   silence_skip                → chunk dropped by RMS gate
//!   wav_encoded                 → chunk serialised to WAV
//!   http_pre / http_post        → upload begin / server response
//!   emit_transcript             → event fired to frontend
//!   emit_failed                 → event emit returned Err

use anyhow::Result;
use parking_lot::Mutex;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter};

use crate::state::AppState;

const INPUT_SAMPLE_RATE: u32 = 48_000;
const OUTPUT_SAMPLE_RATE: u32 = 16_000;
const CHUNK_SECONDS: usize = 3;
const SILENCE_RMS: f32 = 0.003;

#[derive(Default)]
struct RingBuffer {
    mono_48k: Vec<f32>,
}

impl RingBuffer {
    fn drain_if_ready(&mut self) -> Option<Vec<f32>> {
        let need = INPUT_SAMPLE_RATE as usize * CHUNK_SECONDS;
        if self.mono_48k.len() < need {
            return None;
        }
        Some(self.mono_48k.drain(..need).collect())
    }
}

fn rms(samples: &[f32]) -> f32 {
    if samples.is_empty() {
        return 0.0;
    }
    let sum: f32 = samples.iter().map(|s| s * s).sum();
    (sum / samples.len() as f32).sqrt()
}

/// Naive 48k → 16k: keep every 3rd sample. Whisper tolerates it.
fn resample_48k_to_16k(input: &[f32]) -> Vec<f32> {
    input.iter().step_by(3).copied().collect()
}

fn encode_wav(samples_16k: &[f32]) -> Result<Vec<u8>> {
    let spec = hound::WavSpec {
        channels: 1,
        sample_rate: OUTPUT_SAMPLE_RATE,
        bits_per_sample: 16,
        sample_format: hound::SampleFormat::Int,
    };
    let mut cursor = std::io::Cursor::new(Vec::<u8>::new());
    {
        let mut writer = hound::WavWriter::new(&mut cursor, spec)?;
        for s in samples_16k {
            let clipped = s.clamp(-1.0, 1.0);
            let int_sample = (clipped * i16::MAX as f32) as i16;
            writer.write_sample(int_sample)?;
        }
        writer.finalize()?;
    }
    Ok(cursor.into_inner())
}

fn emit_status(app: &AppHandle, kind: &str, message: &str) {
    let _ = app.emit(
        "vaani-status",
        serde_json::json!({ "kind": kind, "message": message }),
    );
}

#[cfg(target_os = "macos")]
pub async fn run_pipeline(app: AppHandle, state: Arc<AppState>) -> Result<()> {
    use screencapturekit::cm::CMSampleBuffer;
    use screencapturekit::shareable_content::SCShareableContent;
    use screencapturekit::stream::{
        configuration::SCStreamConfiguration, content_filter::SCContentFilter,
        output_trait::SCStreamOutputTrait, output_type::SCStreamOutputType, sc_stream::SCStream,
    };

    // Shared flag the callback flips on its first useful sample. Cheap atomic
    // so we can log once without paying for tracing on every frame.
    let first_sample_seen = Arc::new(AtomicBool::new(false));

    struct AudioHandler {
        buffer: Arc<Mutex<RingBuffer>>,
        first_sample_seen: Arc<AtomicBool>,
        app: AppHandle,
    }

    impl SCStreamOutputTrait for AudioHandler {
        fn did_output_sample_buffer(
            &self,
            sample: CMSampleBuffer,
            of_type: SCStreamOutputType,
        ) {
            if of_type != SCStreamOutputType::Audio {
                return;
            }
            let Some(abl) = sample.audio_buffer_list() else {
                return;
            };
            let n = abl.num_buffers();
            if n == 0 {
                return;
            }

            let first = abl.get(0).unwrap();
            let frames = first.data_bytes_size as usize / 4;
            if frames == 0 {
                return;
            }

            // Non-interleaved Float32: one AudioBuffer per channel, same
            // frame count. Mono downmix = per-frame average across channels.
            let mut mixed = vec![0.0f32; frames];
            let mut actual_channels = 0usize;
            for buf in abl.iter() {
                let bytes = buf.data();
                if bytes.len() != frames * 4 {
                    continue;
                }
                let floats: &[f32] = unsafe {
                    std::slice::from_raw_parts(bytes.as_ptr() as *const f32, frames)
                };
                for (i, s) in floats.iter().enumerate() {
                    mixed[i] += *s;
                }
                actual_channels += 1;
            }
            if actual_channels == 0 {
                return;
            }
            let inv = 1.0 / actual_channels as f32;
            for s in mixed.iter_mut() {
                *s *= inv;
            }

            // First-sample tracing is a one-shot event.
            if !self.first_sample_seen.swap(true, Ordering::SeqCst) {
                tracing::info!(
                    frames = frames,
                    channels = actual_channels,
                    rate = INPUT_SAMPLE_RATE,
                    "first_sample_arrived"
                );
                emit_status(&self.app, "listening", "listening to system audio");
            }

            let mut b = self.buffer.lock();
            b.mono_48k.extend(&mixed);
            let total = b.mono_48k.len();
            drop(b);
            tracing::debug!(frames = frames, total_mono = total, "buffer_push");
        }
    }

    let buffer = Arc::new(Mutex::new(RingBuffer::default()));
    let client = crate::upload::http_client();

    tracing::info!("SCShareableContent::get — requesting permission-gated handle");
    let content = match SCShareableContent::get() {
        Ok(c) => c,
        Err(e) => {
            tracing::error!("SCShareableContent::get failed: {e:?}");
            emit_status(
                &app,
                "error",
                "permission: grant Screen Recording in System Settings",
            );
            return Err(anyhow::anyhow!("screencapturekit access denied: {e:?}"));
        }
    };
    let displays = content.displays();
    let Some(display) = displays.first() else {
        emit_status(&app, "error", "no displays available");
        return Err(anyhow::anyhow!("no displays available"));
    };
    let filter = SCContentFilter::create()
        .with_display(display)
        .with_excluding_windows(&[])
        .build();

    let config = SCStreamConfiguration::new()
        .with_captures_audio(true)
        .with_sample_rate(INPUT_SAMPLE_RATE as i32)
        .with_channel_count(2);

    let mut stream = SCStream::new(&filter, &config);
    let handler = AudioHandler {
        buffer: buffer.clone(),
        first_sample_seen: first_sample_seen.clone(),
        app: app.clone(),
    };
    stream.add_output_handler(handler, SCStreamOutputType::Audio);

    if let Err(e) = stream.start_capture() {
        tracing::error!("SCStream start_capture failed: {e:?}");
        emit_status(
            &app,
            "error",
            "couldn't start capture — grant Screen Recording",
        );
        return Err(anyhow::anyhow!("start_capture: {e:?}"));
    }

    tracing::info!("SCStream capturing system audio at 48 kHz — awaiting frontend_ready");
    emit_status(&app, "listening", "waiting for first audio sample");

    // Block until the TS bridge has wired everything. This closes the IPC
    // race where `vaani-transcript` emitted during DOM/webview warmup got
    // dropped by listeners that hadn't registered yet.
    state.frontend_ready.notified().await;
    tracing::info!("frontend ready — entering drain loop");

    let drain_loop = async move {
        let _stream_owner = stream; // keep alive for the lifetime of the loop
        loop {
            tokio::time::sleep(Duration::from_millis(250)).await;
            if !state.running() {
                continue;
            }
            let chunk = { buffer.lock().drain_if_ready() };
            let Some(samples_48k) = chunk else {
                continue;
            };
            tracing::debug!(samples = samples_48k.len(), "chunk_drained");
            let level = rms(&samples_48k);
            if level < SILENCE_RMS {
                tracing::debug!(rms = level, "silence_skip");
                emit_status(&app, "listening", "silent — skipping chunk");
                continue;
            }
            let samples_16k = resample_48k_to_16k(&samples_48k);
            let wav = match encode_wav(&samples_16k) {
                Ok(w) => {
                    tracing::debug!(bytes = w.len(), "wav_encoded");
                    w
                }
                Err(e) => {
                    tracing::warn!("wav_encode_failed: {e:?}");
                    continue;
                }
            };
            // Whisper wants ISO 639-1 ("en", "hi"), not "en-IN".
            let lang_full = state.lang();
            let lang = lang_full
                .split(['-', '_'])
                .next()
                .unwrap_or(&lang_full)
                .to_lowercase();
            let client_clone = client.clone();
            let app_clone = app.clone();
            let state_clone = state.clone();
            let wav_len = wav.len();
            tokio::spawn(async move {
                emit_status(
                    &app_clone,
                    "processing",
                    &format!("uploading… ({} kB)", wav_len / 1024),
                );
                tracing::info!(bytes = wav_len, "http_pre");
                let t0 = Instant::now();
                match crate::upload::upload_chunk(&client_clone, wav, &lang).await {
                    Ok(Some(resp)) => {
                        let dt = t0.elapsed();
                        tracing::info!(
                            status = 200,
                            latency_ms = dt.as_millis() as u64,
                            "http_post"
                        );
                        tracing::info!(transcript = %resp.transcript, "transcribed");
                        state_clone.set_last_transcript(resp.transcript.clone());
                        let emit_res = app_clone.emit(
                            "vaani-transcript",
                            serde_json::json!({ "text": resp.transcript }),
                        );
                        match emit_res {
                            Ok(()) => tracing::info!(
                                bytes = resp.transcript.len(),
                                "emit_transcript"
                            ),
                            Err(e) => tracing::error!("emit_failed: {e:?}"),
                        }
                        emit_status(&app_clone, "listening", "listening to system audio");
                    }
                    Ok(None) => {
                        let dt = t0.elapsed();
                        tracing::info!(
                            status = 200,
                            latency_ms = dt.as_millis() as u64,
                            "http_post empty_transcript"
                        );
                        emit_status(&app_clone, "listening", "listening to system audio");
                    }
                    Err(e) => {
                        let dt = t0.elapsed();
                        let full = format!("{e}");
                        tracing::warn!(
                            latency_ms = dt.as_millis() as u64,
                            "http_post error: {full}"
                        );
                        let short = full.chars().take(90).collect::<String>();
                        emit_status(&app_clone, "error", &format!("upload: {short}"));
                    }
                }
            });
        }
    };
    drain_loop.await
}

#[cfg(not(target_os = "macos"))]
pub async fn run_pipeline(app: AppHandle, _state: Arc<AppState>) -> Result<()> {
    emit_status(&app, "error", "macOS required for system audio");
    loop {
        tokio::time::sleep(Duration::from_secs(60)).await;
    }
}
