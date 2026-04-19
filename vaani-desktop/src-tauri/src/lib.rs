mod audio;
mod state;
mod upload;

use std::sync::Arc;

use state::AppState;
use tauri::{
    menu::{Menu, MenuItem, PredefinedMenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    ActivationPolicy, AppHandle, Emitter, Manager, Runtime,
};
use tauri_plugin_global_shortcut::{Code, GlobalShortcutExt, Modifiers, Shortcut, ShortcutState};

pub const TRANSCRIBE_URL: &str = "https://vaani-gold.vercel.app/api/transcribe";

/// Called by the TypeScript bridge once every Tauri listener + the
/// `window.addEventListener("message")` are wired. Unblocks the audio
/// drain loop so it starts emitting `vaani-transcript` events into a
/// frontend that is guaranteed to be listening.
#[tauri::command]
fn frontend_ready(state: tauri::State<'_, Arc<AppState>>) {
    let first = state.mark_frontend_ready();
    if first {
        tracing::info!("frontend_ready signalled by TS bridge");
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| "info,vaani_desktop_lib=debug".into()),
        )
        .init();

    let state = Arc::new(AppState::new());

    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![frontend_ready])
        .plugin(tauri_plugin_opener::init())
        .plugin(
            tauri_plugin_global_shortcut::Builder::new()
                .with_handler(|app, shortcut, event| {
                    if event.state() != ShortcutState::Pressed {
                        return;
                    }
                    if shortcut.matches(Modifiers::ALT | Modifiers::SUPER, Code::KeyV) {
                        toggle_visibility(app.clone());
                    }
                })
                .build(),
        )
        .manage(state.clone())
        .setup(move |app| {
            #[cfg(target_os = "macos")]
            app.set_activation_policy(ActivationPolicy::Accessory);

            build_tray(app.handle())?;
            register_shortcut(app.handle())?;

            // Spin up the audio + upload pipeline.
            let handle = app.handle().clone();
            let state_clone = state.clone();
            tauri::async_runtime::spawn(async move {
                if let Err(e) = audio::run_pipeline(handle, state_clone).await {
                    tracing::error!("audio pipeline ended: {e:?}");
                }
            });

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

fn build_tray<R: Runtime>(app: &AppHandle<R>) -> tauri::Result<()> {
    let pause = MenuItem::with_id(app, "pause", "Pause", true, None::<&str>)?;
    let lang_en = MenuItem::with_id(app, "lang-en", "Language: English", true, None::<&str>)?;
    let lang_hi = MenuItem::with_id(app, "lang-hi", "Language: Hindi", true, None::<&str>)?;
    let show = MenuItem::with_id(app, "toggle", "Show / Hide", true, Some("Alt+Cmd+V"))?;
    let sep = PredefinedMenuItem::separator(app)?;
    let quit = MenuItem::with_id(app, "quit", "Quit VAANI", true, Some("Cmd+Q"))?;

    let menu = Menu::with_items(
        app,
        &[&pause, &sep, &lang_en, &lang_hi, &sep, &show, &sep, &quit],
    )?;

    TrayIconBuilder::with_id("vaani-tray")
        .tooltip("VAANI — listening to system audio")
        .menu(&menu)
        .show_menu_on_left_click(true)
        .on_menu_event(move |app, event| match event.id.as_ref() {
            "pause" => {
                let state = app.state::<Arc<AppState>>();
                let now_running = state.toggle_running();
                let label = if now_running { "Pause" } else { "Resume" };
                let _ = event.id.as_ref();
                let _ = pause.set_text(label);
                if !now_running {
                    let _ = app.emit("vaani-reset", ());
                }
                let _ = app.emit(
                    "vaani-status",
                    serde_json::json!({
                        "kind": if now_running { "listening" } else { "idle" },
                        "message": if now_running { "listening to system audio" } else { "paused" },
                    }),
                );
            }
            "lang-en" => {
                app.state::<Arc<AppState>>().set_lang("en-IN");
                let _ = app.emit("vaani-reset", ());
            }
            "lang-hi" => {
                app.state::<Arc<AppState>>().set_lang("hi-IN");
                let _ = app.emit("vaani-reset", ());
            }
            "toggle" => toggle_visibility(app.clone()),
            "quit" => app.exit(0),
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                let _ = tray;
            }
        })
        .build(app)?;

    Ok(())
}

fn register_shortcut<R: Runtime>(app: &AppHandle<R>) -> anyhow::Result<()> {
    let toggle_shortcut = Shortcut::new(Some(Modifiers::ALT | Modifiers::SUPER), Code::KeyV);
    app.global_shortcut()
        .register(toggle_shortcut)
        .map_err(|e| anyhow::anyhow!("register global shortcut: {e}"))?;
    Ok(())
}

fn toggle_visibility<R: Runtime>(app: AppHandle<R>) {
    if let Some(window) = app.get_webview_window("main") {
        let visible = window.is_visible().unwrap_or(false);
        if visible {
            let _ = window.hide();
        } else {
            let _ = window.show();
            let _ = window.set_focus();
        }
    }
}
