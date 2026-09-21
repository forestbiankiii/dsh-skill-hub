# Roll back the dsh-skill-hub profile integration.
#
# The persistent plugin touches exactly three things in the profile:
#
#   1. package.json        — a `file:` dependency and one entry in
#                            `dsh.profile.bundles`
#   2. node_modules/       — the linked package itself
#   3. cordis.patch.yml    — NOT touched by the persistent install; the plugin
#                            brings its own bundle patch. This script verifies
#                            that is still true rather than assuming it.
#
# Run it if the composition stops booting after the install:
#
#   pwsh -NoLogo -NoProfile -File rollback.ps1
#
# It removes both package.json edits and the linked package, then reports what to
# do next. It never touches settings.yaml, the skill repository, or the plugin
# source under ~/.dsh/local-plugins/dsh-skill-hub.

$ErrorActionPreference = 'Stop'

$profile = Join-Path $env:USERPROFILE '.dsh\profiles\desktop'
$manifest = Join-Path $profile 'package.json'
$linked = Join-Path $profile 'node_modules\dsh-skill-hub'
$workspace = Join-Path $profile 'pnpm-workspace.yaml'

if (-not (Test-Path -LiteralPath $manifest)) {
  throw "profile manifest not found: $manifest"
}

Write-Host "== before =="
$before = Get-Content -LiteralPath $manifest -Raw
Write-Host $before

# Strip the dependency line and the bundles entry, leaving every other key byte
# for byte as it was. A regex is used rather than a JSON round-trip so unknown or
# commented content survives untouched.
$after = $before
$after = $after -replace '(?m)^\s*"dsh-skill-hub"\s*:\s*"file:[^"]*",?\r?\n', ''
$after = $after -replace '(?m)^(\s*)"dsh-skill-hub",\r?\n', ''
$after = $after -replace ',(\s*\r?\n\s*])', '$1'
$after = $after -replace ',(\s*\r?\n\s*})', '$1'

Set-Content -LiteralPath $manifest -Value $after -NoNewline -Encoding utf8
Write-Host "== after =="
Write-Host (Get-Content -LiteralPath $manifest -Raw)

if (Test-Path -LiteralPath $linked) {
  Remove-Item -LiteralPath $linked -Recurse -Force
  Write-Host "removed $linked"
} else {
  Write-Host "no installed package to remove at $linked"
}

# A row for this id in the USER patch layer is not part of a correct install, and
# it is the exact shape that produced a boot failure once: a user-patch row
# resolves against the Desktop installation rather than the profile, where this
# plugin does not exist. Delete it if it is still there, because leaving it
# behind would keep the composition from booting after the dependency is gone.
$patch = Join-Path $profile 'cordis.patch.yml'
if (Test-Path -LiteralPath $patch) {
  $patchText = Get-Content -LiteralPath $patch -Raw
  if ($patchText -match '(?m)^\s*-\s*id:\s*[''"]?skill-hub[''"]?\s*$') {
    Write-Host ''
    Write-Host "WARNING: $patch still declares a skill-hub row."
    Write-Host 'That row cannot resolve now that the package is gone, and it WILL stop DSH from booting.'
    Write-Host 'Delete this block from that file (and its `- insert:` line if it becomes empty):'
    Write-Host ''
    Write-Host '  - insert:'
    Write-Host '      - id: skill-hub'
    Write-Host "        name: 'dsh-skill-hub'"
    Write-Host ''
  } else {
    Write-Host "$patch carries no skill-hub row (correct)"
  }
}

Write-Host ''
Write-Host 'done. next steps:'
Write-Host '  1. restart DSH Desktop so the composition is rebuilt without the row'
Write-Host '  2. the plugin source stays at ' + (Join-Path $env:USERPROFILE '.dsh\local-plugins\dsh-skill-hub')
Write-Host '     delete that directory only when you want it gone for good'
