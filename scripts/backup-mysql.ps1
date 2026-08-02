[CmdletBinding()]
param(
  [Parameter()][string]$DatabaseUrl = $env:DATABASE_URL,
  [Parameter()][string]$OutputDirectory = (Join-Path $PSScriptRoot '..\backups')
)

$ErrorActionPreference = 'Stop'
if (-not $DatabaseUrl) { throw 'Informe DATABASE_URL ou use -DatabaseUrl.' }
$uri = [Uri]$DatabaseUrl
if ($uri.Scheme -ne 'mysql') { throw 'A URL deve usar o esquema mysql://.' }
$parts = $uri.UserInfo.Split(':', 2)
if ($parts.Count -ne 2) { throw 'DATABASE_URL não contém usuário e senha.' }
$database = $uri.AbsolutePath.TrimStart('/')
if (-not $database) { throw 'DATABASE_URL não contém o banco.' }
$port = if ($uri.Port -gt 0) { $uri.Port } else { 3306 }
$user = [Uri]::UnescapeDataString($parts[0])
$password = [Uri]::UnescapeDataString($parts[1])
$resolvedOutput = [IO.Path]::GetFullPath($OutputDirectory)
[IO.Directory]::CreateDirectory($resolvedOutput) | Out-Null
$stamp = (Get-Date).ToUniversalTime().ToString('yyyyMMddTHHmmssZ')
$sqlPath = Join-Path $resolvedOutput "$database-$stamp.sql"
$zipPath = Join-Path $resolvedOutput "$database-$stamp.zip"
$defaultsFile = Join-Path ([IO.Path]::GetTempPath()) "gestaopredios-mysql-$([guid]::NewGuid()).cnf"

try {
  @"
[client]
host=$($uri.Host)
port=$port
user=$user
password=$password
default-character-set=utf8mb4
"@ | Set-Content -LiteralPath $defaultsFile -Encoding utf8NoBOM

  & mysqldump "--defaults-extra-file=$defaultsFile" --single-transaction --quick --routines --triggers --events --hex-blob --default-character-set=utf8mb4 --skip-lock-tables $database | Set-Content -LiteralPath $sqlPath -Encoding utf8NoBOM
  if ($LASTEXITCODE -ne 0) { throw "mysqldump falhou com código $LASTEXITCODE." }
  Compress-Archive -LiteralPath $sqlPath -DestinationPath $zipPath -CompressionLevel Optimal
  $hash = Get-FileHash -Algorithm SHA256 -LiteralPath $zipPath
  Remove-Item -LiteralPath $sqlPath -Force
  [pscustomobject]@{ Backup = $zipPath; Sha256 = $hash.Hash; CreatedAtUtc = (Get-Date).ToUniversalTime().ToString('o') }
}
finally {
  if (Test-Path -LiteralPath $defaultsFile) { Remove-Item -LiteralPath $defaultsFile -Force }
}

