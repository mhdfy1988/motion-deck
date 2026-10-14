!ifndef MOTIONDECK_INSTALLER_INCLUDED
!define MOTIONDECK_INSTALLER_INCLUDED
!include nsDialogs.nsh
!include FileFunc.nsh
!include LogicLib.nsh

; Force current-user installation; never remove personal data.
!macro customInstallMode
  StrCpy $isForceCurrentInstall "1"
  StrCpy $isForceMachineInstall "0"
!macroend

!macro customInit
  Call MotionDeckNormalizeDirectory
!macroend

!macro customPageAfterChangeDir
  Page custom MotionDeckDirectoryCreate MotionDeckDirectoryLeave
!macroend

; Expand after the builder has registered its plugins and Modern UI macros.
!macro customHeader
!ifndef BUILD_UNINSTALLER
Var MotionDeckDirectoryEdit

; Browsing a drive must display the actual application folder, not its root.
Function MotionDeckNormalizeDirectory
  Push $0
  ${GetRoot} "$INSTDIR" $0
  ${If} $0 != ""
    ${If} $INSTDIR == $0
    ${OrIf} $INSTDIR == "$0\"
      StrCpy $INSTDIR "$0\${APP_FILENAME}"
    ${EndIf}
  ${EndIf}
  Pop $0
FunctionEnd

Function MotionDeckDirectoryCreate
  ${If} ${isUpdated}
    Abort
  ${EndIf}
  !insertmacro MUI_HEADER_TEXT "安装位置" "选择 ${PRODUCT_NAME} 的程序安装目录"
  nsDialogs::Create 1018
  Pop $0
  ${If} $0 == error
    MessageBox MB_OK|MB_ICONSTOP "无法创建安装目录选择页。"
    SetErrorLevel 1
    Quit
  ${EndIf}
  ${NSD_CreateLabel} 0 0 100% 30u "选择磁盘时会自动使用 ${APP_FILENAME} 子文件夹。个人数据和素材目录独立管理。"
  Pop $0
  ${NSD_CreateText} 0 40u 78% 14u "$INSTDIR"
  Pop $MotionDeckDirectoryEdit
  ${NSD_CreateBrowseButton} 80% 40u 20% 14u "浏览…"
  Pop $0
  ${NSD_OnClick} $0 MotionDeckDirectoryBrowse
  !define /math MOTIONDECK_REQUIRED_MB ${APP_64_UNPACKED_SIZE} / 1024
  ${NSD_CreateLabel} 0 65u 100% 14u "所需空间：约 ${MOTIONDECK_REQUIRED_MB} MB"
  Pop $0
  nsDialogs::Show
FunctionEnd

Function MotionDeckDirectoryBrowse
  Pop $0
  ${NSD_GetText} $MotionDeckDirectoryEdit $INSTDIR
  nsDialogs::SelectFolderDialog "选择安装目录" "$INSTDIR"
  Pop $0
  ${If} $0 != error
    StrCpy $INSTDIR $0
    Call MotionDeckNormalizeDirectory
    ${NSD_SetText} $MotionDeckDirectoryEdit "$INSTDIR"
  ${EndIf}
FunctionEnd

Function MotionDeckDirectoryLeave
  ${NSD_GetText} $MotionDeckDirectoryEdit $INSTDIR
  Call MotionDeckNormalizeDirectory
  ${NSD_SetText} $MotionDeckDirectoryEdit "$INSTDIR"
  ${GetRoot} "$INSTDIR" $0
  ${If} $0 == ""
    MessageBox MB_OK|MB_ICONEXCLAMATION "请选择有效的绝对安装目录。"
    Abort
  ${EndIf}
  StrLen $1 $0
  StrCpy $2 $INSTDIR 1 $1
  ${If} $2 != "\"
    MessageBox MB_OK|MB_ICONEXCLAMATION "请选择绝对目录，例如 D:\MotionDeck。"
    Abort
  ${EndIf}
  ClearErrors
  ${DriveSpace} "$0\" "/D=F /S=K" $1
  ${If} ${Errors}
    MessageBox MB_OK|MB_ICONEXCLAMATION "无法读取目标磁盘，请选择可用目录。"
    Abort
  ${EndIf}
  System::Int64Op $1 < ${APP_64_UNPACKED_SIZE}
  Pop $0
  ${If} $0 != 0
    MessageBox MB_OK|MB_ICONEXCLAMATION "目标磁盘可用空间不足。"
    Abort
  ${EndIf}
FunctionEnd
!endif
!macroend
!endif
