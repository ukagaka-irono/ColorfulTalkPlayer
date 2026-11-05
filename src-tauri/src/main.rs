// ColorfulTalkPlayer（Windows / Mac 版）: Web 版と同じ画面を Tauri で包み、コマンドラインからも使えるようにする
// SPDX-License-Identifier: MIT
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod cli;
mod core;

use tauri_plugin_dialog::DialogExt;

/// 画面から WAV を保存する（保存先はダイアログで選ぶ）。保存したパス、取り消したら None
#[tauri::command]
async fn save_wav(app: tauri::AppHandle, name: String, data: Vec<u8>) -> Result<Option<String>, String> {
    let picked = app.dialog().file().set_file_name(&name).add_filter("WAV", &["wav"]).blocking_save_file();
    let Some(p) = picked else { return Ok(None) };
    let path = p.into_path().map_err(|e| e.to_string())?;
    std::fs::write(&path, &data).map_err(|e| e.to_string())?;
    Ok(Some(path.display().to_string()))
}

#[cfg(windows)]
fn attach_console() {
    extern "system" {
        fn AttachConsole(pid: u32) -> i32;
    }
    unsafe { AttachConsole(u32::MAX) }; // 呼び出し元のコンソールに出力する
}

#[cfg(not(windows))]
fn attach_console() {}

fn main() {
    let args: Vec<String> = std::env::args().skip(1).collect();
    let context = tauri::generate_context!();
    if cli::is_cli(&args) {
        attach_console();
        // 画面用に組み込んだ辞書（web/dic/colorful_talk.dic）をコマンドラインでも使う
        let dic = context
            .assets()
            .get(&"dic/colorful_talk.dic".into())
            .map(|c| &*Box::leak(c.into_owned().into_boxed_slice()));
        std::process::exit(cli::run(&args, dic));
    }
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![save_wav])
        .run(context)
        .expect("ColorfulTalkPlayer を起動できませんでした");
}
