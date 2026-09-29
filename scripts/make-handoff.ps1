# Run on the sender's Windows PowerShell from any working directory.
# Package the current Git working tree, including untracked source, without machine data.
param(
  [string]$OutputZip
)

$ErrorActionPreference = 'Stop'
$repo = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
if (-not $OutputZip) {
  $OutputZip = Join-Path (Split-Path $repo -Parent) ("PetConnect-handoff-{0}.zip" -f (Get-Date -Format 'yyyyMMdd-HHmmss'))
}
$OutputZip = [System.IO.Path]::GetFullPath($OutputZip)
if (Test-Path -LiteralPath $OutputZip) {
  throw "Refusing to overwrite existing ZIP: $OutputZip"
}

Push-Location $repo
try {
  $gitPaths = @(git -c core.quotepath=false ls-files --cached --others --exclude-standard)
  if ($LASTEXITCODE -ne 0) { throw 'git ls-files failed. Run this script inside the PetConnect Git working tree.' }
  if ($gitPaths.Count -eq 0) { throw 'Git found no project files.' }

  $stage = Join-Path ([System.IO.Path]::GetTempPath()) ("petconnect-handoff-" + [guid]::NewGuid().ToString('N'))
  New-Item -ItemType Directory -Path $stage | Out-Null
  try {
    $included = New-Object System.Collections.Generic.List[string]
    $excluded = New-Object System.Collections.Generic.List[string]
    foreach ($path in $gitPaths) {
      $relative = $path.Replace('\', '/')
      $parts = $relative.Split('/')
      $leaf = $parts[-1]
      $badPart = @($parts | Where-Object {
        $_ -in @(
          '.git', 'node_modules', '.expo', '.firebase', '.handoff-stage',
          'uploads', 'backups', 'test-results', 'playwright-report',
          'coverage', 'dist', 'dist-android', 'dist-ios', 'web-build',
          '.relai-handoff-backups', '.relai-handoff-mysql',
          '.relai-handoff-uploads'
        ) -or $_ -like '.relai-*'
      }).Count -gt 0
      $privateName = (
        ($leaf -match '^\.env($|\.)' -and $leaf -ne '.env.example') -or
        $leaf -match 'service.account.*\.json$|firebase.adminsdk.*\.json$|firebase.admin.*\.json$|clinic.input.*\.json$' -or
        $leaf -match '\.(pem|key|p8|p12|jks|mobileprovision|sqlite|db|log|zip)$' -or
        $leaf -match '(^npm-debug|^yarn-debug|^yarn-error)' -or
        $leaf -eq 'expo-env.d.ts'
      )
      $generated = ($relative -match '^backend/api/lib/|^backend/functions/lib/|^frontend/ios/|^frontend/android/|^ios/|^android/')
      if ($badPart -or $privateName -or $generated) {
        $excluded.Add($relative)
        continue
      }
      if ($relative.StartsWith('../') -or [System.IO.Path]::IsPathRooted($relative)) {
        throw "Unsafe source path: $relative"
      }
      $source = Join-Path $repo $path
      $item = Get-Item -LiteralPath $source -ErrorAction Stop
      if ($item.PSIsContainer -or ($item.Attributes -band [System.IO.FileAttributes]::ReparsePoint)) {
        throw "Review unusual directory or symlink before packaging: $relative"
      }
      $destination = Join-Path $stage $relative
      $destinationDir = Split-Path $destination -Parent
      New-Item -ItemType Directory -Force -Path $destinationDir | Out-Null
      Copy-Item -LiteralPath $source -Destination $destination
      $included.Add($relative)
    }

    foreach ($required in @(
      'README.md', 'HANDOFF_SETUP.md', 'PRODUCTION_DEPLOYMENT.md',
      '.gitignore', '.github/workflows/backend.yml', 'package-lock.json',
      'backend/api/package-lock.json', 'frontend/package-lock.json',
      'sql/schema.sql', 'backend/api/src/server.ts', 'frontend/src/app/_layout.tsx'
    )) {
      if (-not (Test-Path -LiteralPath (Join-Path $stage $required) -PathType Leaf)) {
        throw "Critical project file missing from ZIP: $required"
      }
    }
    if (-not (Get-ChildItem -LiteralPath (Join-Path $stage 'sql/migrations') -Filter '*.sql' -File -ErrorAction SilentlyContinue)) {
      throw 'No SQL migrations were packaged.'
    }
    $manifest = @(
      'PetConnect source handoff (working tree snapshot)'
      'Review every path before sharing. Do not include account credentials or user data.'
      ''
      'Files:'
    ) + @($included | Sort-Object)
    [System.IO.File]::WriteAllLines(
      (Join-Path $stage 'HANDOFF_MANIFEST.txt'),
      [string[]]$manifest,
      (New-Object System.Text.UTF8Encoding($false))
    )

    Add-Type -AssemblyName System.IO.Compression
    Add-Type -AssemblyName System.IO.Compression.FileSystem
    $zipStream = [System.IO.File]::Open($OutputZip, [System.IO.FileMode]::CreateNew)
    try {
      $archive = [System.IO.Compression.ZipArchive]::new(
        $zipStream, [System.IO.Compression.ZipArchiveMode]::Create, $false
      )
      try {
        foreach ($relative in $included) {
          [System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile(
            $archive, (Join-Path $stage $relative), $relative,
            [System.IO.Compression.CompressionLevel]::Optimal
          ) | Out-Null
        }
        [System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile(
          $archive, (Join-Path $stage 'HANDOFF_MANIFEST.txt'), 'HANDOFF_MANIFEST.txt',
          [System.IO.Compression.CompressionLevel]::Optimal
        ) | Out-Null
      }
      finally {
        $archive.Dispose()
      }
    }
    finally {
      $zipStream.Dispose()
    }
    Write-Host "ZIP: $OutputZip"
    Write-Host "Source files: $($included.Count)"
    Write-Host 'Read HANDOFF_MANIFEST.txt inside the ZIP before sending.'
    if ($excluded.Count) {
      Write-Host "Excluded local/generated paths ($($excluded.Count)):"
      $excluded | Sort-Object | ForEach-Object { Write-Host "  $_" }
    }
  }
  finally {
    if (Test-Path -LiteralPath $stage) {
      Remove-Item -LiteralPath $stage -Recurse -Force
    }
  }
}
finally {
  Pop-Location
}
