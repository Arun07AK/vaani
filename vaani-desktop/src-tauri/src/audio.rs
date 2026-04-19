//! System-audio capture via ScreenCaptureKit.
//!
//! Flow:
//!   SCShareableContent → SCContentFilter(display) → SCStream with
//!   captures_audio(true) → SCStreamOutputTrait delegate pushes Float32
//!   PCM into a shared ring buffer (48 kHz stereo, non-interleaved).
//!
//! Drain loop (every 250 ms): check for a full 3-second chunk, downmix L/R
//! to mono, naive-decimate 48 k → 16 k, hound-encode WAV, POST to
//! /api/transcribe, emit the transcript as `vaani-transcript`.
//!
//! TCC: macOS treats this under "Screen Recording" permission. On first
//! launch the user MUST grant that in System Settings → Privacy & Security.

use anyhow::Result;
use parking_lot::Mutex;
use std::sync::Arc;
use std::time::Duration;
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

/// Naive 48k → 16k: keep every 3rd sample. Whisper tolerates it; a proper
/// low-pass resampler would add a `rubato` dep and is unnecessary for MVP.
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

#[cfg(target_os = "macos")]
pub async fn run_pipeline(app: AppHandle, state: Arc<AppState>) -> Result<()> {
    use screencapturekit::cm::CMSampleBuffer;
    use screencapturekit::shareable_content::SCShareableContent;
    use screencapturekit::stream::{
        configuration::SCStreamConfiguration, content_filter::SCContentFilter,
        output_trait::SCStreamOutputTrait, output_type::SCStreamOutputType, sc_stream::SCStream,
    };

    struct AudioHandler {
        buffer: Arc<Mutex<RingBuffer>>,
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

            // SCStream default: non-interleaved Float32, one AudioBuffer per
            // channel. Mono downmix = average all channels frame-by-frame.
            // Each channel has the same frame count (Float32 bytes / 4).
            let first = abl.get(0).unwrap();
            let frames = first.data_bytes_size as usize / 4;
            if frames == 0 {
                return;
            }

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

            self.buffer.lock().mono_48k.extend(mixed);
        }
    }

    let buffer = Arc::new(Mutex::new(RingBuffer::default()));
    let client = crate::upload::http_client();

    // Build filter on primary display.
    let content = match SCShareableContent::get() {
        Ok(c) => c,
        Err(e) => {
            tracing::error!("SCShareableContent::get failed: {e:?}");
            let _ = app.emit(
                "vaani-status",
                serde_json::json!({
                    "kind": "error",
                    "message": "grant Screen Recording permission (System Settings)",
                }),
            );
            return Err(anyhow::anyhow!("screencapturekit access denied: {e:?}"));
        }
    };
    let displays = content.displays();
    let Some(display) = displays.first() else {
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
    };
    stream.add_output_handler(handler, SCStreamOutputType::Audio);

    if let Err(e) = stream.start_capture() {
        tracing::error!("SCStream start_capture failed: {e:?}");
        let _ = app.emit(
            "vaani-status",
            serde_json::json!({
                "kind": "error",
                "message": "couldn't start capture — grant Screen Recording",
            }),
        );
        return Err(anyhow::anyhow!("start_capture: {e:?}"));
    }

    tracing::info!("SCStream capturing system audio at 48 kHz");
    let _ = app.emit(
        "vaani-status",
        serde_json::json!({"kind": "listening", "message": "listening to system audio"}),
    );

    // Drain + upload loop. Owned by this async task; SCStream stays alive
    // inside this function's scope because we move it into the outer future.
    let drain_loop = async move {
        let _stream_owner = stream; // keep alive
        loop {
            tokio::time::sleep(Duration::from_millis(250)).await;
            if !state.running() {
                continue;
            }
            let chunk = { buffer.lock().drain_if_ready() };
            let Some(samples_48k) = chunk else {
                continue;
            };
            if rms(&samples_48k) < SILENCE_RMS {
                continue;
            }
            let samples_16k = resample_48k_to_16k(&samples_48k);
            let wav = match encode_wav(&samples_16k) {
                Ok(w) => w,
                Err(e) => {
                    tracing::warn!("wav encode failed: {e:?}");
                    continue;
                }
            };
            // Whisper wants ISO 639-1 codes ("en", "hi"), not "en-IN".
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
                tracing::info!(bytes = wav_len, "uploading chunk");
                let _ = app_clone.emit(
                    "vaani-status",
                    serde_json::json!({"kind":"processing","message":"transcribing…"}),
                );
                match crate::upload::upload_chunk(&client_clone, wav, &lang).await {
                    Ok(Some(resp)) => {
                        tracing::info!(transcript = %resp.transcript, "transcribed");
                        state_clone.set_last_transcript(resp.transcript.clone());
                        let _ = app_clone.emit(
                            "vaani-transcript",
                            serde_json::json!({ "text": resp.transcript }),
                        );
                        let _ = app_clone.emit(
                            "vaani-status",
                            serde_json::json!({"kind":"listening","message":"listening to system audio"}),
                        );
                    }
                    Ok(None) => {
                        tracing::info!("empty transcript — chunk was non-speech");
                        let _ = app_clone.emit(
                            "vaani-status",
                            serde_json::json!({"kind":"listening","message":"listening to system audio"}),
                        );
                    }
                    Err(e) => {
                        // Put the actual error string into the status bar so we
                        // can diagnose from the UI alone (network vs server vs
                        // TLS vs body). Truncate so it fits the 320px window.
                        let full = format!("{e}");
                        let short = full.chars().take(90).collect::<String>();
                        tracing::warn!("upload failed: {full}");
                        let _ = app_clone.emit(
                            "vaani-status",
                            serde_json::json!({
                                "kind": "error",
                                "message": format!("upload: {short}"),
                            }),
                        );
                    }
                }
            });
        }
    };
    drain_loop.await
}

#[cfg(not(target_os = "macos"))]
pub async fn run_pipeline(app: AppHandle, _state: Arc<AppState>) -> Result<()> {
    let _ = app.emit(
        "vaani-status",
        serde_json::json!({"kind":"error","message":"macOS required for system audio"}),
    );
    loop {
        tokio::time::sleep(Duration::from_secs(60)).await;
    }
}
