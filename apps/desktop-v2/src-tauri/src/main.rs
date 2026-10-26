#![cfg_attr(
    all(not(debug_assertions), target_os = "windows"),
    windows_subsystem = "windows"
)]

fn main() {
    if std::env::args().any(|arg| arg == "--session-host") {
        if let Err(e) = wrongstack_desktop_v2::host::serve() {
            eprintln!("{e}");
            std::process::exit(1);
        }
        return;
    }
    #[cfg(feature = "desktop")]
    wrongstack_desktop_v2::desktop::run();
}
