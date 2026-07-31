mod commands;
mod email;
mod env_config;
mod error;
mod models;
mod play_api;
mod report;
mod scheduler;
mod settings_store;
mod stats;

use crate::error::{AppError, AppResult};
use tauri::Manager;
use tauri::menu::{Menu, MenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::WindowEvent;
use tauri_plugin_autostart::ManagerExt;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    env_config::load_dotenv_files();

    tauri::Builder::default()
        .plugin(
            tauri_plugin_autostart::Builder::new()
                .args(["--autostart"])
                .build(),
        )
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .setup(|app| {
            setup_tray(app)?;
            sync_autostart(app.handle())?;
            hide_window_for_autostart(app.handle())?;

            let scheduler =
                tauri::async_runtime::block_on(scheduler::start_scheduler(app.handle().clone()))?;
            app.manage(scheduler);
            Ok(())
        })
        .on_window_event(|window, event| {
            if let WindowEvent::CloseRequested { api, .. } = event {
                api.prevent_close();
                let _ = window.hide();
            }
        })
        .invoke_handler(tauri::generate_handler![
            commands::get_stats,
            commands::list_reviews,
            commands::get_settings,
            commands::set_service_account_path,
            commands::set_service_account_json,
            commands::get_schedule_settings,
            commands::set_schedule_settings,
            commands::run_daily_report_now,
            commands::send_report_now,
            commands::set_autostart_enabled,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

fn setup_tray(app: &mut tauri::App) -> AppResult<()> {
    let open_item = MenuItem::with_id(app, "open", "Mở ứng dụng", true, None::<&str>)
        .map_err(|err| AppError::Message(err.to_string()))?;
    let run_now_item = MenuItem::with_id(app, "run_report_now", "Chạy báo cáo ngay", true, None::<&str>)
        .map_err(|err| AppError::Message(err.to_string()))?;
    let quit_item = MenuItem::with_id(app, "quit", "Thoát", true, None::<&str>)
        .map_err(|err| AppError::Message(err.to_string()))?;
    let menu = Menu::with_items(app, &[&open_item, &run_now_item, &quit_item])
        .map_err(|err| AppError::Message(err.to_string()))?;

    let icon = app
        .default_window_icon()
        .ok_or_else(|| AppError::Message("Thiếu icon mặc định cho tray.".to_string()))?
        .clone();

    TrayIconBuilder::with_id("main-tray")
        .icon(icon)
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| match event.id().as_ref() {
            "open" => {
                let _ = show_main_window(app);
            }
            "run_report_now" => {
                let app_handle = app.clone();
                tauri::async_runtime::spawn(async move {
                    if let Err(err) = scheduler::run_daily_report_job(&app_handle, true).await {
                        eprintln!("manual report failed: {err}");
                    }
                });
            }
            "quit" => {
                app.exit(0);
            }
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                let _ = show_main_window(tray.app_handle());
            }
        })
        .build(app)
        .map_err(|err| AppError::Message(err.to_string()))?;

    Ok(())
}

fn show_main_window(app: &tauri::AppHandle) -> AppResult<()> {
    let window = app
        .get_webview_window("main")
        .ok_or_else(|| AppError::Message("Không tìm thấy cửa sổ chính.".to_string()))?;
    let _ = window.unminimize();
    let _ = window.show();
    let _ = window.set_focus();
    Ok(())
}

fn hide_window_for_autostart(app: &tauri::AppHandle) -> AppResult<()> {
    let is_autostart_launch = std::env::args().any(|arg| arg == "--autostart");
    if !is_autostart_launch {
        return Ok(());
    }

    let settings = settings_store::load_schedule_settings(app)?;
    if !settings.start_minimized {
        return Ok(());
    }

    if let Some(window) = app.get_webview_window("main") {
        let _ = window.hide();
    }
    Ok(())
}

fn sync_autostart(app: &tauri::AppHandle) -> AppResult<()> {
    let settings = settings_store::load_schedule_settings(app)?;
    let manager = app.autolaunch();
    let is_enabled = manager
        .is_enabled()
        .map_err(|err| AppError::Message(format!("Không đọc được trạng thái autostart: {err}")))?;

    if settings.autostart_enabled && !is_enabled {
        manager
            .enable()
            .map_err(|err| AppError::Message(format!("Không bật được autostart: {err}")))?;
    } else if !settings.autostart_enabled && is_enabled {
        manager
            .disable()
            .map_err(|err| AppError::Message(format!("Không tắt được autostart: {err}")))?;
    }

    Ok(())
}
