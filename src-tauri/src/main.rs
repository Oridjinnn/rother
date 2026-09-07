use std::net::TcpStream;
use std::sync::Mutex;
use std::time::{Duration, Instant};

use tauri::Manager;
use tauri::webview::Url;
use tauri_plugin_shell::ShellExt;

struct Sidecar(Mutex<Option<tauri_plugin_shell::process::CommandChild>>);

fn port_ready(port: u16) -> bool {
    TcpStream::connect(("127.0.0.1", port)).is_ok()
}

fn wait_for_sidecar(port: u16, timeout: Duration) -> bool {
    let deadline = Instant::now() + timeout;
    while Instant::now() < deadline {
        if port_ready(port) {
            return true;
        }
        std::thread::sleep(Duration::from_millis(200));
    }
    port_ready(port)
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .manage(Sidecar(Mutex::new(None)))
        .setup(|app| {
            let port: u16 = 4632;

            if cfg!(debug_assertions) {
                return Ok(());
            }

            let resource_dir = app
                .path()
                .resource_dir()
                .expect("failed to resolve resource dir");

            let app_data_dir = app
                .path()
                .app_data_dir()
                .expect("failed to resolve app data dir");
            std::fs::create_dir_all(&app_data_dir).ok();

            // NOTE: Rother's live data layer is JSON-file based (src/lib/gbp/server-data.ts).
            // Prisma/SQLite is dead code (TD-M03 / RISK-026), so no DATABASE_URL is injected.
            let sidecar = app
                .shell()
                .sidecar("node")
                .expect("node sidecar binary not found in bundle")
                .args(["standalone/server.js"])
                .current_dir(&resource_dir)
                .env("PORT", port.to_string())
                .env("NODE_ENV", "production")
                .env("HOSTNAME", "127.0.0.1")
                // Point the JSON data layer (src/lib/gbp/server-data.ts) at the
                // bundled runtime data instead of the repo's gbp-monitor dir.
                .env(
                    "GBP_ROOT",
                    resource_dir.join("rother-data").to_string_lossy().to_string(),
                );

            let (mut rx, child) = sidecar.spawn().expect("failed to spawn node sidecar");

            app.state::<Sidecar>()
                .0
                .lock()
                .unwrap()
                .replace(child);

            let _handle = app.handle().clone();
            std::thread::spawn(move || {
                while let Some(event) = rx.blocking_recv() {
                    if let tauri_plugin_shell::process::CommandEvent::Terminated(_) = event {
                        break;
                    }
                }
            });

            let app_handle = app.handle().clone();
            std::thread::spawn(move || {
                let ready = wait_for_sidecar(port, Duration::from_secs(30));
                if ready {
                    if let Some(window) = app_handle.get_webview_window("main") {
                        let _ = window.navigate(
                            Url::parse(&format!("http://127.0.0.1:{}/", port)).unwrap(),
                        );
                    }
                }
            });

            Ok(())
        })
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::Destroyed = event {
                let state = window.app_handle().state::<Sidecar>();
                let child = {
                    let mut guard = state.0.lock().unwrap();
                    guard.take()
                };
                if let Some(child) = child {
                    let _ = child.kill();
                }
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running Rother desktop app");
}
