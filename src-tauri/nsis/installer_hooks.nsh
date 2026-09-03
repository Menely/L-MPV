; ==============================================================================
; L-MPV: NSIS Installer Hooks
; Интерактивная регистрация ассоциаций файлов и интеграция с Windows Default Apps
; ==============================================================================

!macro REGISTER_EXT EXT PROGID
  WriteRegStr SHCTX "Software\Classes\${EXT}" "" "${PROGID}"
  WriteRegStr SHCTX "Software\Classes\${EXT}\OpenWithProgids" "${PROGID}" ""
  WriteRegStr SHCTX "Software\L-MPV\Capabilities\FileAssociations" "${EXT}" "${PROGID}"
!macroend

!macro UNREGISTER_EXT EXT PROGID
  ReadRegStr $0 SHCTX "Software\Classes\${EXT}" ""
  StrCmp $0 "${PROGID}" 0 +2
    DeleteRegValue SHCTX "Software\Classes\${EXT}" ""
  DeleteRegValue SHCTX "Software\Classes\${EXT}\OpenWithProgids" "${PROGID}"
!macroend

!macro NSIS_HOOK_PREINSTALL
!macroend

!macro NSIS_HOOK_POSTINSTALL
  ; При тихой установке (/S) пропускаем диалоговые окна
  IfSilent skip_file_associations

  ; Запрос у пользователя подтверждения ассоциаций файлов
  MessageBox MB_YESNO|MB_ICONQUESTION "Связать видео- и аудиофайлы (.mp4, .mkv, .avi, .mp3 и др.) с L-MPV и сделать его плеером по умолчанию?" IDNO skip_file_associations

  ; Регистрация ProgID для видеофайлов
  WriteRegStr SHCTX "Software\Classes\L-MPV.Video" "" "Видеофайл L-MPV"
  WriteRegStr SHCTX "Software\Classes\L-MPV.Video\DefaultIcon" "" "$INSTDIR\L-MPV.exe,0"
  WriteRegStr SHCTX "Software\Classes\L-MPV.Video\shell\open\command" "" "$\"$INSTDIR\L-MPV.exe$\" $\"%1$\""

  ; Регистрация ProgID для аудиофайлов
  WriteRegStr SHCTX "Software\Classes\L-MPV.Audio" "" "Аудиофайл L-MPV"
  WriteRegStr SHCTX "Software\Classes\L-MPV.Audio\DefaultIcon" "" "$INSTDIR\L-MPV.exe,0"
  WriteRegStr SHCTX "Software\Classes\L-MPV.Audio\shell\open\command" "" "$\"$INSTDIR\L-MPV.exe$\" $\"%1$\""

  ; Регистрация возможностей программы (Capabilities) для страницы "Приложения по умолчанию" Windows 10/11
  WriteRegStr SHCTX "Software\L-MPV\Capabilities" "ApplicationName" "L-MPV"
  WriteRegStr SHCTX "Software\L-MPV\Capabilities" "ApplicationDescription" "Современный легковесный медиаплеер L-MPV"
  WriteRegStr SHCTX "Software\RegisteredApplications" "L-MPV" "Software\L-MPV\Capabilities"

  ; Регистрация видеоформатов
  !insertmacro REGISTER_EXT ".mp4" "L-MPV.Video"
  !insertmacro REGISTER_EXT ".mkv" "L-MPV.Video"
  !insertmacro REGISTER_EXT ".avi" "L-MPV.Video"
  !insertmacro REGISTER_EXT ".mov" "L-MPV.Video"
  !insertmacro REGISTER_EXT ".webm" "L-MPV.Video"
  !insertmacro REGISTER_EXT ".ts" "L-MPV.Video"
  !insertmacro REGISTER_EXT ".m4v" "L-MPV.Video"
  !insertmacro REGISTER_EXT ".flv" "L-MPV.Video"
  !insertmacro REGISTER_EXT ".wmv" "L-MPV.Video"
  !insertmacro REGISTER_EXT ".3gp" "L-MPV.Video"
  !insertmacro REGISTER_EXT ".mpeg" "L-MPV.Video"
  !insertmacro REGISTER_EXT ".mpg" "L-MPV.Video"

  ; Регистрация аудиоформатов
  !insertmacro REGISTER_EXT ".mp3" "L-MPV.Audio"
  !insertmacro REGISTER_EXT ".flac" "L-MPV.Audio"
  !insertmacro REGISTER_EXT ".wav" "L-MPV.Audio"
  !insertmacro REGISTER_EXT ".aac" "L-MPV.Audio"
  !insertmacro REGISTER_EXT ".ogg" "L-MPV.Audio"
  !insertmacro REGISTER_EXT ".m4a" "L-MPV.Audio"
  !insertmacro REGISTER_EXT ".opus" "L-MPV.Audio"
  !insertmacro REGISTER_EXT ".wma" "L-MPV.Audio"

  ; Оповещение Проводника Windows об обновлении ассоциаций и иконок
  System::Call 'Shell32::SHChangeNotify(i 0x08000000, i 0, i 0, i 0)'

  ; Открытие системного диалога "Приложения по умолчанию" Windows
  ExecShell "open" "ms-settings:defaultapps"

  skip_file_associations:
!macroend

!macro NSIS_HOOK_PREUNINSTALL
!macroend

!macro NSIS_HOOK_POSTUNINSTALL
  ; Удаление зарегистрированных ключей ProgID и Capabilities
  DeleteRegKey SHCTX "Software\Classes\L-MPV.Video"
  DeleteRegKey SHCTX "Software\Classes\L-MPV.Audio"
  DeleteRegKey SHCTX "Software\L-MPV"
  DeleteRegValue SHCTX "Software\RegisteredApplications" "L-MPV"

  ; Очистка видеоформатов
  !insertmacro UNREGISTER_EXT ".mp4" "L-MPV.Video"
  !insertmacro UNREGISTER_EXT ".mkv" "L-MPV.Video"
  !insertmacro UNREGISTER_EXT ".avi" "L-MPV.Video"
  !insertmacro UNREGISTER_EXT ".mov" "L-MPV.Video"
  !insertmacro UNREGISTER_EXT ".webm" "L-MPV.Video"
  !insertmacro UNREGISTER_EXT ".ts" "L-MPV.Video"
  !insertmacro UNREGISTER_EXT ".m4v" "L-MPV.Video"
  !insertmacro UNREGISTER_EXT ".flv" "L-MPV.Video"
  !insertmacro UNREGISTER_EXT ".wmv" "L-MPV.Video"
  !insertmacro UNREGISTER_EXT ".3gp" "L-MPV.Video"
  !insertmacro UNREGISTER_EXT ".mpeg" "L-MPV.Video"
  !insertmacro UNREGISTER_EXT ".mpg" "L-MPV.Video"

  ; Очистка аудиоформатов
  !insertmacro UNREGISTER_EXT ".mp3" "L-MPV.Audio"
  !insertmacro UNREGISTER_EXT ".flac" "L-MPV.Audio"
  !insertmacro UNREGISTER_EXT ".wav" "L-MPV.Audio"
  !insertmacro UNREGISTER_EXT ".aac" "L-MPV.Audio"
  !insertmacro UNREGISTER_EXT ".ogg" "L-MPV.Audio"
  !insertmacro UNREGISTER_EXT ".m4a" "L-MPV.Audio"
  !insertmacro UNREGISTER_EXT ".opus" "L-MPV.Audio"
  !insertmacro UNREGISTER_EXT ".wma" "L-MPV.Audio"

  ; Оповещение Проводника Windows об очистке ассоциаций
  System::Call 'Shell32::SHChangeNotify(i 0x08000000, i 0, i 0, i 0)'
!macroend
