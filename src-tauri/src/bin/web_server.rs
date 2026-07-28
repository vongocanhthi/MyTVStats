use mytvstats_lib::run_web_server;

fn env_port(key: &str, default: u16) -> u16 {
    std::env::var(key)
        .ok()
        .and_then(|v| v.parse().ok())
        .unwrap_or(default)
}

#[tokio::main]
async fn main() {
    let port = env_port("MYTVSTATS_WEB_PORT", 3001);
    if let Err(err) = run_web_server(port).await {
        eprintln!("web server failed: {err}");
        std::process::exit(1);
    }
}

