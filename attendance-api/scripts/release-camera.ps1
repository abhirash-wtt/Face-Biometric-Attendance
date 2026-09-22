# Frees the local webcam so Face Attendance can open it.
# Restarts the Windows camera service while competing apps are paused so they
# cannot reclaim the device before the kiosk opens it.
$ErrorActionPreference = 'Stop'
$log = Join-Path $env:TEMP 'face-attendance-camera-release.log'
Set-Content -Path $log -Value 'running' -Encoding ascii

function Write-Log([string]$Message) {
  Set-Content -Path $log -Value $Message -Encoding ascii
}

function Set-NamedAppsFrozen([string[]]$Names, [bool]$Freeze) {
  if (-not ('FaceCamSuspend' -as [type])) {
    Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public static class FaceCamSuspend {
  [DllImport("ntdll.dll")] public static extern int NtSuspendProcess(IntPtr handle);
  [DllImport("ntdll.dll")] public static extern int NtResumeProcess(IntPtr handle);
  [DllImport("kernel32.dll")] public static extern IntPtr OpenProcess(uint access, bool inherit, int pid);
  [DllImport("kernel32.dll")] public static extern bool CloseHandle(IntPtr handle);
}
'@
  }
  foreach ($name in $Names) {
    Get-Process -Name $name -ErrorAction SilentlyContinue | ForEach-Object {
      $handle = [FaceCamSuspend]::OpenProcess(0x1F0FFF, $false, $_.Id)
      if ($handle -eq [IntPtr]::Zero) { return }
      try {
        if ($Freeze) { [void][FaceCamSuspend]::NtSuspendProcess($handle) }
        else { [void][FaceCamSuspend]::NtResumeProcess($handle) }
      } finally {
        [void][FaceCamSuspend]::CloseHandle($handle)
      }
    }
  }
}

$apps = @('chrome', 'msedge', 'ms-teams', 'Teams', 'Zoom', 'CptHost', 'CptService')
$frozen = $false
try {
  $previousProcId = 0
  $svc = Get-CimInstance Win32_Service -Filter "Name='FrameServer'"
  if ($svc -and [int]$svc.ProcessId -gt 0) {
    $previousProcId = [int]$svc.ProcessId
    $shares = @(Get-CimInstance Win32_Service | Where-Object { [int]$_.ProcessId -eq $previousProcId })
    if ($shares.Count -eq 1 -and $shares[0].Name -eq 'FrameServer') {
      Stop-Process -Id $previousProcId -Force -ErrorAction Stop
      for ($i = 0; $i -lt 40; $i++) {
        if (-not (Get-Process -Id $previousProcId -ErrorAction SilentlyContinue)) { break }
        Start-Sleep -Milliseconds 50
      }
    }
  }

  Set-NamedAppsFrozen $apps $true
  $frozen = $true

  Start-Service FrameServer -ErrorAction SilentlyContinue
  $ready = $false
  for ($i = 0; $i -lt 50; $i++) {
    $again = Get-CimInstance Win32_Service -Filter "Name='FrameServer'"
    if ($again -and [string]$again.State -eq 'Running' -and [int]$again.ProcessId -gt 0 -and [int]$again.ProcessId -ne $previousProcId) {
      $ready = $true
      Start-Sleep -Milliseconds 400
      break
    }
    Start-Sleep -Milliseconds 100
  }
  if (-not $ready) { throw 'Camera service did not start.' }

  Write-Log 'ok'
  # Keep competitors paused while the kiosk page opens the camera.
  Start-Sleep -Milliseconds 4500
  exit 0
} catch {
  Write-Log ("fail " + $_.Exception.Message)
  exit 1
} finally {
  if ($frozen) {
    try { Set-NamedAppsFrozen $apps $false } catch {}
  }
}
