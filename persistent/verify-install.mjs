/**
 * Verify the profile integration without restarting DSH.
 *
 * This exists because the first install shipped a boot failure. The row for this
 * plugin was declared in TWO patch layers, and a row declared in the profile's
 * user patch layer resolves against the Desktop installation rather than the
 * profile — where this plugin does not exist:
 *
 *     PackageOverlayNotFoundError: cannot resolve package "dsh-skill-hub"
 *     from the Desktop installation or active Profile
 *
 * The lesson is a shape, not a typo: a bundle plugin declares its row ONCE, in
 * its own bundled patch. This script asserts that shape, plus the profile pieces
 * that make the bundle entry resolvable at all, so the next install is checked
 * before a restart rather than by one.
 *
 * Usage: node verify-install.mjs
 *
 * Read-only: it reports, it never repairs. Exit code 1 means do not restart yet.
 */

import { readFile, readdir, stat } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'

const PACKAGE_NAME = 'dsh-skill-hub'
const ROW_ID = 'skill-hub'

/**
 * Path overrides, so the guard itself can be exercised against a deliberately
 * broken layout instead of being trusted. `DSH_SKILL_HUB_PROFILE` points the
 * whole check at another profile directory:
 *
 *   DSH_SKILL_HUB_PROFILE=/tmp/broken node verify-install.mjs   # expected to FAIL
 */
const profileDir = process.env.DSH_SKILL_HUB_PROFILE ?? join(homedir(), '.dsh', 'profiles', 'desktop')
const pluginDir = process.env.DSH_SKILL_HUB_PLUGIN ?? join(homedir(), '.dsh', 'local-plugins', PACKAGE_NAME)
const manifestPath = join(profileDir, 'package.json')
const userPatchPath = join(profileDir, 'cordis.patch.yml')
const bundledPatchPath = join(pluginDir, 'cordis.patch.yml')

let failures = 0
const check = function (label, condition, detail) {
  if (condition) {
    console.log(`  ok   ${label}`)
    return
  }
  failures += 1
  console.log(`  FAIL ${label}${detail === undefined ? '' : ` — ${detail}`}`)
}

const readText = async function (path) {
  try {
    return await readFile(path, 'utf8')
  } catch {
    return undefined
  }
}

/**
 * Count `- id: skill-hub` rows in a patch document.
 *
 * Deliberately a text scan rather than a YAML parse: this script must not depend
 * on the app's bundled `yaml`, and the question ("how many rows for this id?") is
 * answerable without one. A patch list keeps every row at one indent level, so a
 * line match is unambiguous here.
 */
const countRows = function (text) {
  if (text === undefined) return { total: 0, inserts: 0 }
  const lines = text.split('\n')
  let total = 0
  let inserts = 0
  let insertDepth = null
  for (const raw of lines) {
    const line = raw.replace(/\r$/, '')
    const trimmed = line.trim()
    if (trimmed === '' || trimmed.startsWith('#')) continue
    const indent = line.length - line.trimStart().length
    if (insertDepth !== null && indent <= insertDepth) insertDepth = null
    if (/^- insert:\s*$/.test(trimmed)) {
      insertDepth = indent
      continue
    }
    const match = /^-\s*id:\s*['"]?([^'"\s]+)['"]?\s*$/.exec(trimmed)
    if (match === null) continue
    if (match[1] !== ROW_ID) continue
    total += 1
    if (insertDepth !== null && indent > insertDepth) inserts += 1
  }
  return { total, inserts }
}

console.log(`${PACKAGE_NAME} profile integration`)
console.log(`  profile: ${profileDir}`)
console.log('')

/* ------------------------------------------------------------ profile pieces */

console.log('profile declares the bundle')
const manifestText = await readText(manifestPath)
if (manifestText === undefined) {
  check('profile package.json is readable', false, manifestPath)
} else {
  let manifest
  try {
    manifest = JSON.parse(manifestText)
  } catch (error) {
    check('profile package.json parses', false, String(error))
    manifest = undefined
  }
  if (manifest !== undefined) {
    const dependency = manifest.dependencies?.[PACKAGE_NAME]
    check(
      'dependency is a file: spec',
      typeof dependency === 'string' && dependency.startsWith('file:'),
      String(dependency),
    )
    const bundles = manifest.dsh?.profile?.bundles ?? []
    check('listed in dsh.profile.bundles', bundles.includes(PACKAGE_NAME))
    check(
      'listed exactly once',
      bundles.filter((name) => name === PACKAGE_NAME).length === 1,
      `${bundles.filter((name) => name === PACKAGE_NAME).length} occurrences`,
    )
  }
}

console.log('plugin is installed into the profile')
const installed = join(profileDir, 'node_modules', PACKAGE_NAME)
try {
  const info = await stat(installed)
  check('node_modules entry exists', info.isDirectory())
  const entries = await readdir(installed)
  check('carries an entry point', entries.includes('lib'))
  check('carries its bundled patch', entries.includes('cordis.patch.yml'))
} catch (error) {
  check('node_modules entry exists', false, `run pnpm install in ${profileDir}`)
}

/* ------------------------------------------------------------- the browser half */

console.log('the plugin carries a loadable browser half')
const installedManifest = await readText(join(installed, 'package.json'))
if (installedManifest === undefined) {
  check('installed manifest is readable', false, join(installed, 'package.json'))
} else {
  let pluginManifest
  try {
    pluginManifest = JSON.parse(installedManifest)
  } catch (error) {
    check('installed manifest parses', false, String(error))
    pluginManifest = undefined
  }
  if (pluginManifest !== undefined) {
    const client = pluginManifest.dsh?.client
    check('declares dsh.client', client !== undefined && typeof client === 'object')
    check('dsh.client.platform is web', client?.platform === 'web', String(client?.platform))
    check(
      'dsh.client declares the connection dependency',
      Array.isArray(client?.inject) && client.inject.some((name) => String(name).includes('connection')),
      JSON.stringify(client?.inject ?? null),
    )
    const exportEntry = pluginManifest.exports?.['./client']
    check(
      'exports "./client"',
      exportEntry !== undefined,
      JSON.stringify(pluginManifest.exports ?? null),
    )
  }
}

const clientBundlePath = join(installed, 'lib', 'client.js')
const clientBundle = await readText(clientBundlePath)
check('lib/client.js exists', clientBundle !== undefined, clientBundlePath)
if (clientBundle !== undefined) {
  check('bundle is a ModuleLoader factory', clientBundle.startsWith('window.__ModuleLoader__.load({'))
  check(
    'bundle is registered under the package name',
    /(^|\n)id:"dsh-skill-hub"/.test(clientBundle),
    'the loader id must be the package name so <id>/client resolves',
  )
  check(
    'bundle has no static imports',
    !/(^|\n)\s*(import|export)\s/.test(clientBundle.replace(/\bexports\./g, '')),
    'the factory only receives require(); ESM syntax would not parse',
  )
  const sourceBundle = await readText(join(pluginDir, 'lib', 'client.js'))
  check(
    'installed bundle matches the built source',
    sourceBundle !== undefined && sourceBundle === clientBundle,
    sourceBundle === undefined
      ? 'build it with: node tools/build-client.mjs --write'
      : 'stale install — re-run pnpm install in the profile',
  )
}

/*
 * pnpm imports a `file:` dependency as a HARD-LINK FARM: the profile's copy is
 * the same inode as the source file, so an in-place rewrite (node's writeFile,
 * which truncates) reaches the profile by itself. The trap is the reverse — any
 * tool that writes a temp file and renames it breaks the link silently, leaving
 * the profile on the old bytes while the source looks correct. Comparing bytes
 * catches exactly that, for the files the host actually loads.
 */
console.log('the profile copy is still the source, not a stale fork')
for (const relative of ['package.json', 'cordis.patch.yml', join('lib', 'index.js'), join('lib', 'client.js')]) {
  const source = await readText(join(pluginDir, relative))
  const installedCopy = await readText(join(installed, relative))
  check(
    `profile copy of ${relative} matches the source`,
    source !== undefined && source === installedCopy,
    source === undefined
      ? `${relative} is missing from ${pluginDir}`
      : 'the hard link was replaced — delete the installed directory and re-run pnpm install in the profile',
  )
}

/* -------------------------------------------------------------- the row shape */

console.log('the row is declared exactly once, in the bundled patch')
const bundledText = await readText(bundledPatchPath)
const userText = await readText(userPatchPath)
const bundled = countRows(bundledText)
const user = countRows(userText)

check('bundled patch declares one row', bundled.total === 1, `found ${bundled.total}`)
check('bundled row is inside an insert list', bundled.inserts === 1, `found ${bundled.inserts}`)
check(
  'user patch layer declares zero rows',
  user.total === 0,
  user.total === 0
    ? undefined
    : `found ${user.total} in ${userPatchPath} — this is the boot failure: a user-patch row resolves against the Desktop installation, not the profile. Delete it and keep the bundled patch as the only declaration.`,
)

console.log(failures === 0 ? '\nintegration looks correct — safe to restart' : `\n${failures} check(s) failed — do NOT restart until they pass`)
process.exit(failures === 0 ? 0 : 1)
