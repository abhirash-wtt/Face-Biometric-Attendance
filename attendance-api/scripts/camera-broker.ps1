# Captures the local webcam and writes length-prefixed JPEG frames to stdout.
# Diagnostics go to stderr. Prefer POST /camera/release + browser getUserMedia
# for takeover; this broker is only used for local MJPEG preview.
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'

Add-Type -AssemblyName System.Runtime.WindowsRuntime | Out-Null

function Get-AsTaskMethod([string]$ParameterTypeName) {
  return @([System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object {
    $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq $ParameterTypeName
  })[0]
}

$AsTaskOp = Get-AsTaskMethod 'IAsyncOperation`1'
$AsTaskAction = Get-AsTaskMethod 'IAsyncAction'

function Await-WinRt($Task) {
  try {
    if (-not $Task.Wait(12000)) { throw 'The camera did not respond.' }
  } catch {
    throw $_.Exception.GetBaseException()
  }
  if ($Task.IsFaulted) { throw $Task.Exception.GetBaseException() }
}

function Await-Op($Operation, [Type]$ResultType) {
  $task = $AsTaskOp.MakeGenericMethod($ResultType).Invoke($null, @($Operation))
  Await-WinRt $task
  return $task.Result
}

function Await-Action($Action) {
  $task = $AsTaskAction.Invoke($null, @($Action))
  Await-WinRt $task
}

function Log([string]$Message) {
  [Console]::Error.WriteLine($Message)
}

[Windows.Media.Capture.MediaCapture, Windows.Media.Capture, ContentType = WindowsRuntime] | Out-Null
[Windows.Media.Capture.MediaCaptureInitializationSettings, Windows.Media.Capture, ContentType = WindowsRuntime] | Out-Null
[Windows.Media.Capture.MediaCaptureSharingMode, Windows.Media.Capture, ContentType = WindowsRuntime] | Out-Null
[Windows.Media.Capture.StreamingCaptureMode, Windows.Media.Capture, ContentType = WindowsRuntime] | Out-Null
[Windows.Media.Capture.LowLagPhotoCapture, Windows.Media.Capture, ContentType = WindowsRuntime] | Out-Null
[Windows.Media.Capture.CapturedPhoto, Windows.Media.Capture, ContentType = WindowsRuntime] | Out-Null
[Windows.Media.MediaProperties.ImageEncodingProperties, Windows.Media.MediaProperties, ContentType = WindowsRuntime] | Out-Null
[Windows.Devices.Enumeration.DeviceInformation, Windows.Devices.Enumeration, ContentType = WindowsRuntime] | Out-Null
[Windows.Devices.Enumeration.DeviceClass, Windows.Devices.Enumeration, ContentType = WindowsRuntime] | Out-Null
[Windows.Devices.Enumeration.DeviceInformationCollection, Windows.Devices.Enumeration, ContentType = WindowsRuntime] | Out-Null
[Windows.Storage.Streams.DataReader, Windows.Storage.Streams, ContentType = WindowsRuntime] | Out-Null

function Get-CameraDeviceId {
  $devices = Await-Op ([Windows.Devices.Enumeration.DeviceInformation]::FindAllAsync([Windows.Devices.Enumeration.DeviceClass]::VideoCapture)) ([Windows.Devices.Enumeration.DeviceInformationCollection])
  foreach ($device in @($devices)) {
    if ($device.Name -match 'infrared|\bIR\b|depth') { continue }
    return [string]$device.Id
  }
  if ($devices.Count -gt 0) { return [string]$devices[0].Id }
  throw 'No camera was found.'
}

function Read-StreamBytes($Stream) {
  $size = [int64]$Stream.Size
  if ($size -le 0 -or $size -gt 8000000) { return $null }
  $Stream.Seek(0)
  $data = New-Object Windows.Storage.Streams.DataReader ($Stream.GetInputStreamAt(0))
  try {
    $loaded = Await-Op ($data.LoadAsync([uint32]$size)) ([uint32])
    $bytes = New-Object byte[] $loaded
    $data.ReadBytes($bytes)
    return ,$bytes
  } finally {
    $data.Dispose()
  }
}

function Open-Session([string]$DeviceId) {
  $capture = New-Object Windows.Media.Capture.MediaCapture
  $photo = $null
  try {
    $settings = New-Object Windows.Media.Capture.MediaCaptureInitializationSettings
    $settings.VideoDeviceId = $DeviceId
    $settings.SharingMode = [Windows.Media.Capture.MediaCaptureSharingMode]::ExclusiveControl
    $settings.StreamingCaptureMode = [Windows.Media.Capture.StreamingCaptureMode]::Video
    Await-Action ($capture.InitializeAsync($settings))
    $props = [Windows.Media.MediaProperties.ImageEncodingProperties]::CreateJpeg()
    try {
      $props.Width = 640
      $props.Height = 480
    } catch {}
    try {
      $photo = Await-Op ($capture.PrepareLowLagPhotoCaptureAsync($props)) ([Windows.Media.Capture.LowLagPhotoCapture])
    } catch {
      $props = [Windows.Media.MediaProperties.ImageEncodingProperties]::CreateJpeg()
      $photo = Await-Op ($capture.PrepareLowLagPhotoCaptureAsync($props)) ([Windows.Media.Capture.LowLagPhotoCapture])
    }
    $shot = Await-Op ($photo.CaptureAsync()) ([Windows.Media.Capture.CapturedPhoto])
    return @{ Capture = $capture; Photo = $photo; Shot = $shot }
  } catch {
    try { if ($photo) { Await-Action ($photo.FinishAsync()) } } catch {}
    try { $capture.Dispose() } catch {}
    throw
  }
}

function Close-Session($Session) {
  if (-not $Session) { return }
  try { if ($Session.Shot) { $Session.Shot.Dispose() } } catch {}
  try { if ($Session.Photo) { Await-Action ($Session.Photo.FinishAsync()) } } catch {}
  try { if ($Session.Capture) { $Session.Capture.Dispose() } } catch {}
}

function Write-Jpeg($Bytes) {
  if (-not $Bytes -or $Bytes.Length -lt 100) { return }
  $header = [BitConverter]::GetBytes([uint32]$Bytes.Length)
  $script:Stdout.Write($header, 0, 4)
  $script:Stdout.Write($Bytes, 0, $Bytes.Length)
  $script:Stdout.Flush()
}

$deviceId = Get-CameraDeviceId
Log 'Opening the camera.'
$session = Open-Session $deviceId
$Stdout = [Console]::OpenStandardOutput()
try {
  $first = Read-StreamBytes $session.Shot.Frame
  Write-Jpeg $first
  while ($true) {
    $shot = Await-Op ($session.Photo.CaptureAsync()) ([Windows.Media.Capture.CapturedPhoto])
    try {
      $bytes = Read-StreamBytes $shot.Frame
      Write-Jpeg $bytes
    } finally {
      try { $shot.Dispose() } catch {}
    }
  }
} finally {
  Close-Session $session
}
