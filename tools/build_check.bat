@echo off
rem L-MPV: быстрая проверка бэкенда (запускать из корня репозитория: tools\build_check.bat)
rem Требует установленный Rust + MSVC (vcvarsall подхватывается автоматически, если есть).

if defined VSCMD_VER goto :check
if exist "%ProgramFiles%\Microsoft Visual Studio\2022\Community\VC\Auxiliary\Build\vcvarsall.bat" (
  call "%ProgramFiles%\Microsoft Visual Studio\2022\Community\VC\Auxiliary\Build\vcvarsall.bat" x64 >nul
) else if exist "%ProgramFiles(x86)%\Microsoft Visual Studio\2019\Community\VC\Auxiliary\Build\vcvarsall.bat" (
  call "%ProgramFiles(x86)%\Microsoft Visual Studio\2019\Community\VC\Auxiliary\Build\vcvarsall.bat" x64 >nul
)

:check
cd /d "%~dp0..\src-tauri"
cargo check 2>&1
