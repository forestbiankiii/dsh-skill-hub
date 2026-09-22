# Install dsh-skill-hub into a DSH Desktop profile.
#
#   pwsh -NoLogo -NoProfile -File install.ps1
#
# Optional:
#   -Source <dir>      plugin source (default ~/.dsh/local-plugins/dsh-skill-hub)
#   -Profile <dir>     profile      (default ~/.dsh/profiles/desktop)
#   -Dependency <spec> dependency value (default: file: path relative to the profile)
#   -SkipInstall       edit package.json only; do not run pnpm
#
# The install is two edits in the profile's package.json plus the linked package:
#
#   1. dependencies["dsh-skill-hub"] = "file:<source>"
#   2. dsh.profile.bundles[] += "dsh-skill-hub"
#   3. node_modules/dsh-skill-hub   (pnpm imports the file: dependency)
#
# The loader ROW is deliberately NOT written anywhere here: it ships inside the
# plugin as its own `cordis.patch.yml` (`dsh.bundle.patch`). A second declaration
# in the profile's user patch layer resolves against the Desktop installation
# instead of the profile and stops DSH from booting, so this script refuses to run
# while such a row exists.
#
# Idempotent: running it twice changes nothing the second time.

[CmdletBinding()]
param(
  [string]$Source = (Join-Path $env:USERPROFILE '.dsh\local-plugins\dsh-skill-hub'),
  [string]$Profile = (Join-Path $env:USERPROFILE '.dsh\profiles\desktop'),
  [string]$Dependency,
  [switch]$SkipInstall
)

$ErrorActionPreference = 'Stop'

$packageName = 'dsh-skill-hub'
$manifest = Join-Path $Profile 'package.json'
$patch = Join-Path $Profile 'cordis.patch.yml'
$linked = Join-Path $Profile ('node_modules\' + $packageName)

function Write-Utf8NoBom([string]$Path, [string]$Text) {
  # Set-Content would add a BOM on Windows PowerShell, and JSON.parse in the
  # loader rejects one.
  $utf8 = New-Object System.Text.UTF8Encoding($false)
  [System.IO.File]::WriteAllText($Path, $Text, $utf8)
}

# ---------------------------------------------------------------- preconditions

foreach ($required in @('package.json', 'cordis.patch.yml', 'lib\index.js', 'lib\client.js')) {
  $path = Join-Path $Source $required
  if (-not (Test-Path -LiteralPath $path)) {
    throw "plugin source is incomplete: missing $path"
  }
}
if (-not (Test-Path -LiteralPath $manifest)) {
  throw "profile manifest not found: $manifest"
}

$sourceManifest = Get-Content -LiteralPath (Join-Path $Source 'package.json') -Raw | ConvertFrom-Json
if ($sourceManifest.name -ne $packageName) {
  throw "unexpected package name '$($sourceManifest.name)' in $Source"
}
if ($null -eq $sourceManifest.dsh.client) {
  throw "the plugin at $Source declares no dsh.client; its browser half would never load"
}

# A row for this id in the USER patch layer is fatal at boot, and it is not part
# of a correct install. Stop rather than install into a composition that cannot
# start.
if (Test-Path -LiteralPath $patch) {
  $patchText = Get-Content -LiteralPath $patch -Raw
  if ($patchText -match '(?m)^\s*-\s*id:\s*[''"]?skill-hub[''"]?\s*$') {
    Write-Host "STOP: $patch declares a skill-hub row." -ForegroundColor Red
    Write-Host 'A row in the user patch layer resolves against the Desktop installation, not the'
    Write-Host 'profile, where this package does not exist — DSH will not boot. Delete this block'
    Write-Host "(and its `- insert:` line if it becomes empty), then run this script again:"
    Write-Host ''
    Write-Host '  - insert:'
    Write-Host '      - id: skill-hub'
    Write-Host "        name: 'dsh-skill-hub'"
    Write-Host ''
    exit 1
  }
}

if (-not $Dependency) {
  try {
    $relative = [System.IO.Path]::GetRelativePath($Profile, $Source) -replace '\\', '/'
    $Dependency = 'file:' + $relative
  } catch {
    $Dependency = 'file:../../local-plugins/dsh-skill-hub'
  }
}

# ------------------------------------------------------------- edit the manifest

$before = Get-Content -LiteralPath $manifest -Raw
$after = $before
$changed = @()

if ($after -notmatch ('(?m)^\s*"' + [regex]::Escape($packageName) + '"\s*:')) {
  # Keep the dependencies object sorted: insert before the first key that sorts
  # after this one, else before the closing brace.
  $key = '"' + $packageName + '": "' + $Dependency + '",'
  $lines = $after -split "`n"
  $depStart = -1
  $depEnd = -1
  $insertAt = -1
  for ($i = 0; $i -lt $lines.Count; $i++) {
    if ($depStart -lt 0 -and $lines[$i] -match '^\s*"dependencies"\s*:\s*\{\s*$') { $depStart = $i; continue }
    if ($depStart -ge 0 -and $depEnd -lt 0) {
      if ($lines[$i] -match '^\s*\}\s*,?\s*$') { $depEnd = $i; break }
      if ($insertAt -lt 0) {
        $match = [regex]::Match($lines[$i], '^\s*"([^"]+)"\s*:')
        if ($match.Success -and $match.Groups[1].Value -gt $packageName) { $insertAt = $i }
      }
    }
  }
  if ($depStart -lt 0) { throw "no 'dependencies' object in $manifest" }
  if ($insertAt -lt 0) { $insertAt = $depEnd }
  $rebuilt = @()
  $rebuilt += $lines[0..($insertAt - 1)]
  $rebuilt += ('    ' + $key)
  $rebuilt += $lines[$insertAt..($lines.Count - 1)]
  $after = $rebuilt -join "`n"
  $changed += "dependency  $packageName -> $Dependency"
}

if ($after -notmatch ('(?m)^\s*"' + [regex]::Escape($packageName) + '"\s*,?\s*$[\r\n]')) {
  if ($after -notmatch '(?m)"bundles"\s*:\s*\[') {
    throw "no dsh.profile.bundles array in $manifest; add `"$packageName`" to it by hand"
  }
  $after = $after -replace '(?m)("bundles"\s*:\s*\[\r?\n)', ('$1' + '        "' + $packageName + '",' + "`n")
  $changed += "bundles     += $packageName"
}

if ($changed.Count -gt 0) {
  Write-Utf8NoBom $manifest $after
  Write-Host "== $manifest =="
  foreach ($line in $changed) { Write-Host "  + $line" }
} else {
  Write-Host "$manifest already declares the dependency and the bundle entry"
}

# ------------------------------------------------------------------ link it in

if ($SkipInstall) {
  Write-Host '-SkipInstall: skipped pnpm; run it before restarting'
} else {
  $pnpm = $null
  $onPath = Get-Command pnpm -ErrorAction SilentlyContinue
  if ($onPath) {
    $pnpm = $onPath.Source
  } else {
    # The Desktop ships its own pnpm under %APPDATA%\DSH Desktop\runtime-commands.
    $generations = Join-Path $env:APPDATA 'DSH Desktop\runtime-commands\generations'
    if (Test-Path -LiteralPath $generations) {
      $candidate = Get-ChildItem -LiteralPath $generations -Directory -ErrorAction SilentlyContinue |
        Sort-Object LastWriteTime -Descending |
        ForEach-Object { Join-Path $_.FullName 'bin\pnpm.cmd' } |
        Where-Object { Test-Path -LiteralPath $_ } |
        Select-Object -First 1
      if ($candidate) { $pnpm = $candidate }
    }
  }
  if (-not $pnpm) {
    throw 'pnpm not found on PATH or under DSH Desktop\runtime-commands'
  }

  Write-Host "using $pnpm"
  Push-Location $Profile
  try {
    # The profile manifest may legitimately have changed since its last install;
    # do not delete a working plugin and then let --frozen-lockfile strand it.
    & $pnpm install --no-frozen-lockfile --prefer-offline
    if ($LASTEXITCODE -ne 0) { throw "pnpm install exited $LASTEXITCODE" }
  } finally {
    Pop-Location
  }

  if (-not (Test-Path -LiteralPath $linked)) {
    throw "pnpm finished but did not create $linked"
  }

  # A file: dependency is normally a hard-link farm. Editors that replace files
  # and source files added after the install can still drift, so refresh ONLY
  # missing/different files. Equal hard links are left alone — copying one onto
  # its other name would truncate the source as well.
  $sourceRoot = (Resolve-Path -LiteralPath $Source).Path.TrimEnd('\')
  $copied = 0
  Get-ChildItem -LiteralPath $sourceRoot -Recurse -File |
    Where-Object { $_.FullName -notmatch '[\\/](node_modules|\.git)[\\/]' } |
    ForEach-Object {
      $relative = $_.FullName.Substring($sourceRoot.Length + 1)
      $target = Join-Path $linked $relative
      $same = Test-Path -LiteralPath $target
      if ($same) {
        $same = (Get-FileHash -LiteralPath $_.FullName -Algorithm SHA256).Hash -eq
          (Get-FileHash -LiteralPath $target -Algorithm SHA256).Hash
      }
      if (-not $same) {
        New-Item -ItemType Directory -Path (Split-Path -Parent $target) -Force | Out-Null
        Copy-Item -LiteralPath $_.FullName -Destination $target -Force
        $copied += 1
      }
    }
  Write-Host "refreshed $copied changed plugin file(s)"
}

# ------------------------------------------------------------------- verify now

$verify = Join-Path $Source 'verify-install.mjs'
if (Test-Path -LiteralPath $verify) {
  Write-Host ''
  $env:DSH_SKILL_HUB_PROFILE = $Profile
  $env:DSH_SKILL_HUB_PLUGIN = $Source
  & node $verify
  $code = $LASTEXITCODE
  Remove-Item Env:\DSH_SKILL_HUB_PROFILE -ErrorAction SilentlyContinue
  Remove-Item Env:\DSH_SKILL_HUB_PLUGIN -ErrorAction SilentlyContinue
  if ($code -ne 0) {
    Write-Host ''
    Write-Host 'the integration guard failed — fix the reported items before restarting' -ForegroundColor Red
    exit $code
  }
}

Write-Host ''
Write-Host 'installed. next steps:'
Write-Host '  1. restart DSH Desktop (a new loader row is not hot-applied)'
Write-Host '  2. Settings → Skills 技能 appears; the browser half then arrives with the page'
Write-Host '  3. to undo: pwsh -NoLogo -NoProfile -File rollback.ps1'
