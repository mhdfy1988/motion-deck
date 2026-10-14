#requires -Version 7.0
param([Parameter(Mandatory=$true)][string]$Installer)
$ErrorActionPreference='Stop'
$repoRoot=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$resolvedInstaller=[IO.Path]::GetFullPath($Installer)
if (-not $resolvedInstaller.StartsWith((Join-Path $repoRoot 'output')+'\') -or [IO.Path]::GetFileName($resolvedInstaller) -notlike 'MotionDeckAcceptance-*-setup-x64.exe') { throw 'Only the isolated acceptance installer is allowed.' }
Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName UIAutomationTypes
Add-Type @'
using System;
using System.Runtime.InteropServices;
public static class MotionDeckInstallerWindow {
 public delegate bool Callback(IntPtr hwnd,IntPtr param);
 [DllImport("user32.dll")] public static extern bool EnumWindows(Callback callback,IntPtr param);
 [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hwnd,out uint pid);
 [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr hwnd,int command);
 [DllImport("user32.dll",CharSet=CharSet.Unicode,EntryPoint="SendMessageW")] public static extern IntPtr SendText(IntPtr hwnd,uint message,IntPtr wparam,string text);
 [DllImport("user32.dll",EntryPoint="PostMessageW")] public static extern bool PostMessage(IntPtr hwnd,uint message,IntPtr wparam,IntPtr lparam);
 [DllImport("user32.dll",CharSet=CharSet.Unicode,EntryPoint="SendMessageW")] public static extern IntPtr GetText(IntPtr hwnd,uint message,IntPtr count,System.Text.StringBuilder text);
}
'@
function Find-Control($Root,[string]$Name) {
 $condition=New-Object Windows.Automation.PropertyCondition([Windows.Automation.AutomationElement]::NameProperty,$Name)
 $Root.FindFirst([Windows.Automation.TreeScope]::Descendants,$condition)
}
function Invoke-Control($Control) {
 if ($null -eq $Control) { throw 'Control not found.' }
 [void][MotionDeckInstallerWindow]::PostMessage([IntPtr]$Control.Current.NativeWindowHandle,0xF5,[IntPtr]::Zero,[IntPtr]::Zero)
}
function Find-BrowseDialog {
 $installerIds=@(Get-Process | Where-Object { $_.Path -eq $resolvedInstaller } | ForEach-Object Id)
 $script:motionDeckBrowseDialog=$null
 [MotionDeckInstallerWindow]::EnumWindows({param($handle,$unused)
  $owner=0;[void][MotionDeckInstallerWindow]::GetWindowThreadProcessId($handle,[ref]$owner)
  if ($owner -in $installerIds) {
   $candidate=[Windows.Automation.AutomationElement]::FromHandle($handle)
   if ($candidate.Current.Name -eq '浏览文件夹') { $script:motionDeckBrowseDialog=$candidate;return $false }
  }
  return $true
 },[IntPtr]::Zero) | Out-Null
 $script:motionDeckBrowseDialog
}
function Wait-BrowseDialog {
 $deadline=[DateTime]::UtcNow.AddSeconds(10)
 do {
  $candidate=Find-BrowseDialog
  if ($null -ne $candidate -and $null -ne (Find-Control $candidate '确定')) { return $candidate }
  Start-Sleep -Milliseconds 100
 } while ([DateTime]::UtcNow -lt $deadline)
 throw 'Folder browser dialog was not ready.'
}
function Read-Directory($Edit) {
 $text=New-Object Text.StringBuilder 4096
 [void][MotionDeckInstallerWindow]::GetText([IntPtr]$Edit.Current.NativeWindowHandle,0xD,[IntPtr]$text.Capacity,$text)
 $text.ToString()
}
$installerProcess=Start-Process -FilePath $resolvedInstaller -WindowStyle Hidden -PassThru
$rootWindow=$null
try {
 $deadline=[DateTime]::UtcNow.AddSeconds(20)
 do {
  $installerIds=@(Get-Process | Where-Object { $_.Path -eq $resolvedInstaller } | ForEach-Object Id)
  [MotionDeckInstallerWindow]::EnumWindows({param($handle,$unused)
   $owner=0;[void][MotionDeckInstallerWindow]::GetWindowThreadProcessId($handle,[ref]$owner)
   if ($owner -in $installerIds) { [void][MotionDeckInstallerWindow]::ShowWindow($handle,4) }
   return $true
  },[IntPtr]::Zero) | Out-Null
  $editCondition=New-Object Windows.Automation.PropertyCondition([Windows.Automation.AutomationElement]::ClassNameProperty,'Edit')
  foreach ($installerId in $installerIds) {
   $condition=New-Object Windows.Automation.PropertyCondition([Windows.Automation.AutomationElement]::ProcessIdProperty,$installerId)
   foreach ($candidate in [Windows.Automation.AutomationElement]::RootElement.FindAll([Windows.Automation.TreeScope]::Children,$condition)) {
    if ($null -ne $candidate.FindFirst([Windows.Automation.TreeScope]::Descendants,$editCondition)) { $rootWindow=$candidate;break }
   }
  }
  if ($null -ne $rootWindow) { break }
  Start-Sleep -Milliseconds 200
 } while ([DateTime]::UtcNow -lt $deadline)
 if ($null -eq $rootWindow) { throw 'Installer window not found.' }
 $editCondition=New-Object Windows.Automation.PropertyCondition([Windows.Automation.AutomationElement]::ClassNameProperty,'Edit')
 $deadline=[DateTime]::UtcNow.AddSeconds(10)
 do {
  $edit=$rootWindow.FindFirst([Windows.Automation.TreeScope]::Descendants,$editCondition)
  if ($null -ne $edit) { break }
  Start-Sleep -Milliseconds 200
 } while ([DateTime]::UtcNow -lt $deadline)
 if ($null -eq $edit) {
  $rootWindow.FindAll([Windows.Automation.TreeScope]::Descendants,[Windows.Automation.Condition]::TrueCondition) | ForEach-Object { Write-Output ($_.Current.ControlType.ProgrammaticName+': '+$_.Current.Name) }
  throw 'Directory edit control not found.'
 }
 [void][MotionDeckInstallerWindow]::SendText([IntPtr]$edit.Current.NativeWindowHandle,0xC,[IntPtr]::Zero,'D:\')
 if ((Read-Directory $edit) -ne 'D:\') { throw 'Setting directory edit failed.' }
 Invoke-Control (Find-Control $rootWindow '浏览…')
 $browseDialog=Wait-BrowseDialog
 Invoke-Control (Find-Control $browseDialog '确定')
 Start-Sleep -Milliseconds 300
 $actual=Read-Directory $edit
 if ($actual -ne 'D:\MotionDeckAcceptance') { throw "Unexpected normalized path: $actual" }
 # 已有具名目录不重复追加应用名；只检查显示，不执行安装。
 $namedDirectory=Join-Path $repoRoot 'output\acceptance\installer-named-MotionDeckAcceptance'
 New-Item -ItemType Directory -Path $namedDirectory -Force | Out-Null
 [void][MotionDeckInstallerWindow]::SendText([IntPtr]$edit.Current.NativeWindowHandle,0xC,[IntPtr]::Zero,$namedDirectory)
 Invoke-Control (Find-Control $rootWindow '浏览…')
 $browseDialog=Wait-BrowseDialog
 Invoke-Control (Find-Control $browseDialog '确定')
 Start-Sleep -Milliseconds 300
 if ((Read-Directory $edit) -ne $namedDirectory) { throw 'Named directory was changed or duplicated.' }
 $actual=$namedDirectory
 Invoke-Control (Find-Control $rootWindow '浏览…')
 $browseDialog=Wait-BrowseDialog
 Invoke-Control (Find-Control $browseDialog '取消')
 if ((Read-Directory $edit) -ne $actual) { throw 'Cancel changed the selected directory.' }
 Write-Output 'PASS D:\ becomes D:\MotionDeckAcceptance; named directory and cancel preserved; no installation performed.'
} finally {
 $candidate=Find-BrowseDialog
 if ($null -ne $candidate) { Invoke-Control (Find-Control $candidate '取消');Start-Sleep -Milliseconds 200 }
 if ($null -ne $rootWindow) {
  [void][MotionDeckInstallerWindow]::PostMessage([IntPtr]$rootWindow.Current.NativeWindowHandle,0x10,[IntPtr]::Zero,[IntPtr]::Zero)
  Start-Sleep -Milliseconds 300
  $confirm=Find-Control $rootWindow '是(Y)'
  if ($null -ne $confirm) { Invoke-Control $confirm }
 }
}
