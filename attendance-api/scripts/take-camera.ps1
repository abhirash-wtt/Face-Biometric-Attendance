# Asks the approved task to restart the webcam, then waits until it is back.
$ErrorActionPreference = 'Stop'
$taskName = 'FaceAttendanceCameraRelease'
$log = Join-Path $env:TEMP 'face-attendance-camera-release.log'

if (-not (Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue)) {
  Write-Output 'Windows needs approval once before this app can take over the camera.'
  $enable = Join-Path $PSScriptRoot 'enable-camera-takeover.ps1'
  $command = "& '$($enable.Replace("'", "''"))'"
  $encoded = [Convert]::ToBase64String([Text.Encoding]::Unicode.GetBytes($command))
  try {
    $proc = Start-Process -FilePath powershell.exe -Verb RunAs -Wait -PassThru -ArgumentList @(
      '-NoProfile', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', $encoded
    )
  } catch {
    Write-Error 'Camera takeover was not approved.'
    exit 1
  }
  if (-not $proc -or $proc.ExitCode -ne 0) {
    Write-Error 'Camera takeover was not approved.'
    exit 1
  }
} else {
  # Keep the task action pointed at the current release script.
  $release = Join-Path $PSScriptRoot 'release-camera.ps1'
  $action = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument "-NoProfile -Sta -WindowStyle Hidden -ExecutionPolicy Bypass -File `"$release`""
  try { Set-ScheduledTask -TaskName $taskName -Action $action -ErrorAction Stop | Out-Null } catch {}
}

Remove-Item -Path $log -ErrorAction SilentlyContinue
Start-ScheduledTask -TaskName $taskName -ErrorAction Stop
$ready = $false
for ($i = 0; $i -lt 80; $i++) {
  if (Test-Path $log) {
    $text = (Get-Content -Path $log -Raw).Trim()
    if ($text -eq 'ok' -or $text -like 'ok *') { $ready = $true; break }
    if ($text -like 'fail*') {
      Write-Error $text
      exit 1
    }
  }
  Start-Sleep -Milliseconds 250
}
if (-not $ready) {
  Write-Error 'The camera was not released.'
  exit 1
}
# Give Windows a moment to re-enumerate the webcam before the browser opens it.
Start-Sleep -Milliseconds 500
exit 0
