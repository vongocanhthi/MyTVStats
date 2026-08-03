mod commands;
mod deepseek;
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
use crate::models::{ScheduleRunStatus, ScheduleSettings};
use tauri::menu::{Menu, MenuItem, PredefinedMenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{Emitter, Manager, WindowEvent};
use tauri_plugin_autostart::ManagerExt;

struct TrayMenuState {
    schedule_item: MenuItem<tauri::Wry>,
    last_run_item: MenuItem<tauri::Wry>,
}

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
            refresh_tray_status(app.handle());

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
            commands::get_deepseek_settings,
            commands::set_deepseek_settings,
            commands::generate_deepseek_report,
            commands::save_deepseek_report_text,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

fn setup_tray(app: &mut tauri::App) -> AppResult<()> {
    let schedule_item = MenuItem::with_id(app, "schedule_info", "Lịch gửi: …", false, None::<&str>)
        .map_err(|err| AppError::Message(err.to_string()))?;
    let last_run_item = MenuItem::with_id(app, "last_run_info", "Lần chạy: …", false, None::<&str>)
        .map_err(|err| AppError::Message(err.to_string()))?;
    let separator_top = PredefinedMenuItem::separator(app)
        .map_err(|err| AppError::Message(err.to_string()))?;
    let open_item = MenuItem::with_id(app, "open", "Mở ứng dụng", true, None::<&str>)
        .map_err(|err| AppError::Message(err.to_string()))?;
    let settings_item = MenuItem::with_id(app, "open_settings", "Mở Cài đặt", true, None::<&str>)
        .map_err(|err| AppError::Message(err.to_string()))?;
    let run_now_item =
        MenuItem::with_id(app, "run_report_now", "Chạy báo cáo ngay", true, None::<&str>)
            .map_err(|err| AppError::Message(err.to_string()))?;
    let separator_bottom = PredefinedMenuItem::separator(app)
        .map_err(|err| AppError::Message(err.to_string()))?;
    let quit_item = MenuItem::with_id(app, "quit", "Thoát", true, None::<&str>)
        .map_err(|err| AppError::Message(err.to_string()))?;

    let menu = Menu::with_items(
        app,
        &[
            &schedule_item,
            &last_run_item,
            &separator_top,
            &open_item,
            &settings_item,
            &run_now_item,
            &separator_bottom,
            &quit_item,
        ],
    )
    .map_err(|err| AppError::Message(err.to_string()))?;

    app.manage(TrayMenuState {
        schedule_item,
        last_run_item,
    });

    let icon = app
        .default_window_icon()
        .ok_or_else(|| AppError::Message("Thiếu icon mặc định cho tray.".to_string()))?
        .clone();

    TrayIconBuilder::with_id("main-tray")
        .icon(icon)
        .tooltip("MyTV Stats")
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| match event.id().as_ref() {
            "open" => {
                let _ = show_main_window(app);
            }
            "open_settings" => {
                let _ = show_main_window(app);
                let _ = app.emit("navigate-tab", "settings");
            }
            "run_report_now" => {
                let app_handle = app.clone();
                tauri::async_runtime::spawn(async move {
                    if let Err(err) = scheduler::run_daily_report_job(&app_handle, true).await {
                        eprintln!("manual report failed: {err}");
                    }
                    refresh_tray_status(&app_handle);
                });
            }
            "quit" => {
                app.exit(0);
            }
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            // Cập nhật giờ lịch / lần chạy trước khi mở menu.
            refresh_tray_status(tray.app_handle());
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

/// Cập nhật dòng lịch + tooltip tray theo settings hiện tại.
pub fn refresh_tray_status(app: &tauri::AppHandle) {
    let settings = match settings_store::load_schedule_settings(app) {
        Ok(value) => value,
        Err(err) => {
            eprintln!("refresh tray status failed: {err}");
            return;
        }
    };

    let schedule_text = format_schedule_menu_label(&settings);
    let last_run_text = format_last_run_menu_label(&settings);
    let tooltip = format_tray_tooltip(&settings);

    if let Some(state) = app.try_state::<TrayMenuState>() {
        let _ = state.schedule_item.set_text(schedule_text);
        let _ = state.last_run_item.set_text(last_run_text);
    }

    if let Some(tray) = app.tray_by_id("main-tray") {
        let _ = tray.set_tooltip(Some(tooltip));
    }
}

fn format_schedule_menu_label(settings: &ScheduleSettings) -> String {
    if settings.enabled {
        format!(
            "Lịch gửi: {:02}:{:02} · Đang bật",
            settings.hour, settings.minute
        )
    } else {
        format!(
            "Lịch gửi: {:02}:{:02} · Đang tắt",
            settings.hour, settings.minute
        )
    }
}

fn format_last_run_menu_label(settings: &ScheduleSettings) -> String {
    let status = match settings.last_run_status.as_ref() {
        Some(ScheduleRunStatus::Success) => "thành công",
        Some(ScheduleRunStatus::Failed) => "thất bại",
        Some(ScheduleRunStatus::Skipped) => "bỏ qua",
        None => "chưa chạy",
    };
    match settings.last_run_at {
        Some(ts) => {
            let datetime = chrono::DateTime::from_timestamp(ts, 0)
                .map(|dt| {
                    dt.with_timezone(&chrono_tz::Asia::Ho_Chi_Minh)
                        .format("%d/%m %H:%M")
                        .to_string()
                })
                .unwrap_or_else(|| "—".to_string());
            format!("Lần chạy: {status} · {datetime}")
        }
        None => format!("Lần chạy: {status}"),
    }
}

fn format_tray_tooltip(settings: &ScheduleSettings) -> String {
    if settings.enabled {
        format!(
            "MyTV Stats · Lịch {:02}:{:02} (bật)",
            settings.hour, settings.minute
        )
    } else {
        format!(
            "MyTV Stats · Lịch {:02}:{:02} (tắt)",
            settings.hour, settings.minute
        )
    }
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
