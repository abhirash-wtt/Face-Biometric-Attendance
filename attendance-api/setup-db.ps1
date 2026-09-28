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
$envFile = Join-Path $PSScriptRoot ".env"

# The app role and database are created with the same credentials the API uses.
function Read-DotEnv([string]$Path) {
  $values = @{}
  if (-not (Test-Path $Path)) { return $values }
  foreach ($line in Get-Content $Path) {
    $trimmed = $line.Trim()
    if (-not $trimmed -or $trimmed.StartsWith('#')) { continue }
    $i = $trimmed.IndexOf('=')
    if ($i -lt 1) { continue }
    $values[$trimmed.Substring(0, $i).Trim()] = $trimmed.Substring($i + 1).Trim().Trim('"').Trim("'")
  }
  return $values
}

$dotEnv = Read-DotEnv $envFile
$appUser = if ($env:DATABASE_USER) { $env:DATABASE_USER } elseif ($dotEnv.DATABASE_USER) { $dotEnv.DATABASE_USER } else { "app" }
$appPassword = if ($env:DATABASE_PASSWORD) { $env:DATABASE_PASSWORD } else { $dotEnv.DATABASE_PASSWORD }
$appDb = if ($env:DATABASE_NAME) { $env:DATABASE_NAME } elseif ($dotEnv.DATABASE_NAME) { $dotEnv.DATABASE_NAME } else { "attendance" }

if (-not $appPassword -or $appPassword -match '^<.*>$') {
  Write-Host "DATABASE_PASSWORD is not set. Copy .env.example to .env and set DATABASE_PASSWORD first."
  exit 1
}

function Invoke-SetupSql {
  param([string]$User, [string]$Password, [bool]$UseTrust)
  $vars = @("-v", "db_user=$appUser", "-v", "db_password=$appPassword", "-v", "db_name=$appDb")
  if ($UseTrust) {
    Remove-Item Env:PGPASSWORD -ErrorAction SilentlyContinue
    & $psql -U $User -h $HostName -d postgres -w @vars -f $sqlFile
  } else {
    $env:PGPASSWORD = $Password
    & $psql -U $User -h $HostName -d postgres @vars -f $sqlFile
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
  Write-Host "Database $appDb and user $appUser are ready."
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
  Write-Host "Database $appDb and user $appUser are ready."
}
finally {
  Copy-Item $backup $hba -Force
  & $pgCtl reload -D $dataDir | Out-Null
  if ($LASTEXITCODE -ne 0) {
    Restart-Service postgresql-x64-16 -ErrorAction SilentlyContinue
  }
}
