[CmdletBinding()]
param(
  [Parameter(Mandatory)][string]$BackupPath,
  [Parameter()][string]$RestoreDatabaseUrl = $env:RESTORE_DATABASE_URL
)

$ErrorActionPreference = 'Stop'
$resolvedBackup = [IO.Path]::GetFullPath($BackupPath)
if (-not (Test-Path -LiteralPath $resolvedBackup -PathType Leaf)) { throw 'Backup não encontrado.' }
if (-not $RestoreDatabaseUrl) { throw 'Informe RESTORE_DATABASE_URL ou use -RestoreDatabaseUrl.' }
$uri = [Uri]$RestoreDatabaseUrl
$database = $uri.AbsolutePath.TrimStart('/')
if ($database -notmatch '(restore|staging|test)') {
  throw "Restauração recusada: o banco '$database' deve ser descartável e conter restore, staging ou test no nome."
}
$parts = $uri.UserInfo.Split(':', 2)
if ($parts.Count -ne 2) { throw 'RESTORE_DATABASE_URL não contém usuário e senha.' }
$port = if ($uri.Port -gt 0) { $uri.Port } else { 3306 }
$tempDirectory = Join-Path ([IO.Path]::GetTempPath()) "gestaopredios-restore-$([guid]::NewGuid())"
$defaultsFile = Join-Path $tempDirectory 'mysql.cnf'
[IO.Directory]::CreateDirectory($tempDirectory) | Out-Null

try {
  Expand-Archive -LiteralPath $resolvedBackup -DestinationPath $tempDirectory
  $sql = Get-ChildItem -LiteralPath $tempDirectory -Filter '*.sql' | Select-Object -First 1
  if (-not $sql) { throw 'O arquivo ZIP não contém um dump .sql.' }
  @"
[client]
host=$($uri.Host)
port=$port
user=$([Uri]::UnescapeDataString($parts[0]))
password=$([Uri]::UnescapeDataString($parts[1]))
default-character-set=utf8mb4
"@ | Set-Content -LiteralPath $defaultsFile -Encoding utf8NoBOM
  $process = Start-Process -FilePath 'mysql' -ArgumentList @("--defaults-extra-file=$defaultsFile", $database) -RedirectStandardInput $sql.FullName -Wait -PassThru -NoNewWindow
  if ($process.ExitCode -ne 0) { throw "mysql restore falhou com código $($process.ExitCode)." }
  $tables = & mysql "--defaults-extra-file=$defaultsFile" --batch --skip-column-names -e "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = DATABASE();" $database
  if ($LASTEXITCODE -ne 0 -or [int]$tables -lt 1) { throw 'Restauração sem tabelas verificáveis.' }
  [pscustomobject]@{ Status = 'verified'; Database = $database; Tables = [int]$tables; VerifiedAtUtc = (Get-Date).ToUniversalTime().ToString('o') }
}
finally {
  if (Test-Path -LiteralPath $tempDirectory) { Remove-Item -LiteralPath $tempDirectory -Recurse -Force }
}

