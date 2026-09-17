/**
 * Build the payload strings a `cordis_define` call needs.
 *
 * Usage:
 *   node tools/build-payload.mjs                  # both variants, on stdout
 *   node tools/build-payload.mjs --json           # reference: {"host":"…","client":"…"}
 *   node tools/build-payload.mjs --compact        # compact:  {"host":"…","client":"…"}
 *   node tools/build-payload.mjs --write          # refresh every payload/ file
 *   node tools/build-payload.mjs --check          # fail when payload/ is stale
 *
 * `--check` is the one that matters for the repository: it rebuilds both
 * variants from `src/` and `deploy/` and compares the result byte-for-byte with
 * the committed `payload/` files. A hand-edited payload, or a source change
 * that was never rebuilt, fails there instead of silently shipping.
 */

import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { ROOT, compact, reference } from './payload.mjs'

const ARTIFACTS = [
  { file: 'payload/host.txt', text: () => reference().host },
  { file: 'payload/client.txt', text: () => reference().client },
  { file: 'payload/code.json', text: () => JSON.stringify(reference()) },
  { file: 'payload/compact.host.txt', text: () => compact().host },
  { file: 'payload/compact.client.txt', text: () => compact().client },
  { file: 'payload/compact.json', text: () => JSON.stringify(compact()) },
]

const argv = process.argv.slice(2)

if (argv.includes('--check')) {
  let stale = 0
  for (const artifact of ARTIFACTS) {
    const expected = artifact.text()
    let committed = null
    try {
      committed = readFileSync(join(ROOT, artifact.file), 'utf8')
    } catch (error) {
      process.stdout.write(`missing  ${artifact.file}\n`)
      stale += 1
      continue
    }
    const normalized = committed.replace(/\r\n/g, '\n')
    if (normalized === expected) {
      process.stdout.write(`ok       ${artifact.file} (${expected.length} chars)\n`)
      continue
    }
    process.stdout.write(`STALE    ${artifact.file} (committed ${normalized.length}, built ${expected.length})\n`)
    stale += 1
  }
  process.stdout.write(stale === 0 ? '\npayloads are current\n' : `\n${stale} artifact(s) need rebuilding — run: node tools/build-payload.mjs --write\n`)
  process.exitCode = stale === 0 ? 0 : 1
} else if (argv.includes('--write')) {
  for (const artifact of ARTIFACTS) {
    writeFileSync(join(ROOT, artifact.file), artifact.text(), 'utf8')
    process.stdout.write(`wrote ${artifact.file}\n`)
  }
} else {
  const which = argv.includes('--compact') ? compact() : reference()
  if (argv.includes('--json')) {
    process.stdout.write(JSON.stringify(which))
  } else {
    for (const half of ['host', 'client']) {
      process.stdout.write(`=== ${half} (${which[half].length} chars) ===\n`)
      process.stdout.write(`${which[half]}\n\n`)
    }
  }
}
