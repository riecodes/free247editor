use keyring::Entry;
use tauri::Manager;

/// The Groq key lives in Windows Credential Manager as "groq.free247editor", never in a file.
fn groq_entry() -> keyring::Result<Entry> {
    Entry::new("free247editor", "groq")
}

/// Saves the key and hands it to engines started from now on (they inherit this process's environment).
#[tauri::command]
fn set_groq_key(key: String) -> Result<(), String> {
    let key = key.trim();
    if key.is_empty() {
        return Err("Walang key.".into());
    }
    groq_entry()
        .and_then(|entry| entry.set_password(key))
        .map_err(|e| e.to_string())?;
    std::env::set_var("GROQ_API_KEY", key);
    Ok(())
}

#[tauri::command]
fn has_groq_key() -> bool {
    groq_entry().and_then(|entry| entry.get_password()).is_ok()
}

pub fn run() {
    // The engine sidecar inherits this environment, so it gets the key without a file on disk.
    if let Ok(key) = groq_entry().and_then(|entry| entry.get_password()) {
        std::env::set_var("GROQ_API_KEY", key);
    }
    tauri::Builder::default()
        // A second launch focuses the open window instead of starting a second engine.
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.unminimize();
                let _ = window.set_focus();
            }
        }))
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![set_groq_key, has_groq_key])
        .run(tauri::generate_context!())
        .expect("error while running free247editor");
}
