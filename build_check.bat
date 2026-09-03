@echo off
call "D:\Program\Visual Studio Community\VC\Auxiliary\Build\vcvarsall.bat" x64
cd /d D:\My-programs\L-MPV\src-tauri
cargo check 2>&1
