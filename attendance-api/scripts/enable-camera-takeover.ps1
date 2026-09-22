# Registers a per-user task that can release the webcam later without another approval.
# Windows shows a single approval prompt the first time.
$ErrorActionPreference = 'Stop'
$log = Join-Path $env:TEMP 'face-attendance-camera-takeover.log'
try {
  $release = Join-Path $PSScriptRoot 'release-camera.ps1'
  $user = [System.Security.Principal.WindowsIdentity]::GetCurrent().Name
  $action = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument "-NoProfile -Sta -WindowStyle Hidden -ExecutionPolicy Bypass -File `"$release`""
  $principal = New-ScheduledTaskPrincipal -UserId $user -LogonType Interactive -RunLevel Highest
  $settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -MultipleInstances IgnoreNew
  Register-ScheduledTask -TaskName 'FaceAttendanceCameraRelease' -Action $action -Principal $principal -Settings $settings -Force | Out-Null
  Set-Content -Path $log -Value 'ok' -Encoding ascii
} catch {
  Set-Content -Path $log -Value $_.Exception.Message -Encoding ascii
  exit 1
}
