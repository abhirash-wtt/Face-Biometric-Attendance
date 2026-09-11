param(
  [string]$PostgresPassword,
  [string]$PostgresUser = "postgres",
  [string]$HostName = "127.0.0.1",
  [switch]$LocalTrustBootstrap
)

$ErrorActionPreference = "Stop"
$psql = "C:\Program Files\PostgreSQL\16\bin\psql.exe"
$pgCtl = "C:\Program Files\PostgreSQL\16\bin\pg_ctl.exe"
$dataDir = "C:\Program Files\PostgreSQL\16\data"
$hba = Join-Path $dataDir "pg_hba.conf"
$sqlFile = Join-Path $PSScriptRoot "src\database\setup-db.sql"

function Invoke-SetupSql {
  param([string]$User, [string]$Password, [bool]$UseTrust)
  if ($UseTrust) {
    Remove-Item Env:PGPASSWORD -ErrorAction SilentlyContinue
    & $psql -U $User -h $HostName -d postgres -w -f $sqlFile
  } else {
    $env:PGPASSWORD = $Password
    & $psql -U $User -h $HostName -d postgres -f $sqlFile
  }
  return $LASTEXITCODE
}

if (-not $LocalTrustBootstrap) {
  if (-not $PostgresPassword -or $PostgresPassword -match '[<>]|your postgres superuser password') {
    Write-Host @"
PostgreSQL rejected the login.

You need the real password chosen when PostgreSQL 16 was installed, not the placeholder.
Example:

  .\setup-db.ps1 -PostgresPassword "the-password-you-set"

If you do not remember that password, run this in an elevated PowerShell:

  .\setup-db.ps1 -LocalTrustBootstrap
"@
    exit 1
  }

  $code = Invoke-SetupSql -User $PostgresUser -Password $PostgresPassword -UseTrust:$false
  if ($code -ne 0) {
    Write-Host @"
Password authentication failed for user '$PostgresUser'.

If you forgot the password, open an Administrator PowerShell in this folder and run:

  .\setup-db.ps1 -LocalTrustBootstrap
"@
    exit $code
  }
  Write-Host "Database attendance and user app are ready."
  exit 0
}

$backup = "$hba.bak-attendance"
Copy-Item $hba $backup -Force
$original = Get-Content $hba -Raw
$trustBlock = @"
# TEMP attendance bootstrap
host    all             all             127.0.0.1/32            trust
host    all             all             ::1/128                 trust

"@
Set-Content -Path $hba -Value ($trustBlock + $original) -Encoding ascii

try {
  & $pgCtl reload -D $dataDir
  if ($LASTEXITCODE -ne 0) {
    Restart-Service postgresql-x64-16
  }
  Start-Sleep -Seconds 2
  $code = Invoke-SetupSql -User $PostgresUser -Password "" -UseTrust:$true
  if ($code -ne 0) {
    throw "Failed to apply setup-db.sql while trust auth was enabled."
  }
  Write-Host "Database attendance and user app are ready."
}
finally {
  Copy-Item $backup $hba -Force
  & $pgCtl reload -D $dataDir | Out-Null
  if ($LASTEXITCODE -ne 0) {
    Restart-Service postgresql-x64-16 -ErrorAction SilentlyContinue
  }
}
