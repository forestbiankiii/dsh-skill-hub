/**
 * Produce the minified deployment copy from the annotated one.
 *
 * `deploy/demo.*.js` is what a human reads; `deploy/min/demo.*.min.js` is what
 * gets typed into a `cordis_define` call. This script keeps the second derived
 * from the first, so there is exactly one place to edit and `--check` still
 * proves the committed payloads match their sources.
 *
 * Usage:
 *   node tools/build-min.mjs           # write deploy/min/
 *   node tools/build-min.mjs --check   # fail when deploy/min/ is stale
 */

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { ROOT } from './payload.mjs'
import { minify } from './minify.mjs'

const PAIRS = [
  { from: 'deploy/demo.host.js', to: 'deploy/min/demo.host.min.js' },
  { from: 'deploy/demo.client.js', to: 'deploy/min/demo.client.min.js' },
]

const check = process.argv.includes('--check')
let stale = 0

for (const pair of PAIRS) {
  const source = readFileSync(join(ROOT, pair.from), 'utf8')
  const minified = minify(source)
  const target = join(ROOT, pair.to)
  if (check) {
    let committed = null
    try {
      committed = readFileSync(target, 'utf8').replace(/\r\n/g, '\n')
    } catch (error) {
      process.stdout.write(`missing  ${pair.to}\n`)
      stale += 1
      continue
    }
    if (committed === minified) {
      process.stdout.write(`ok       ${pair.to} (${minified.length} chars)\n`)
      continue
    }
    process.stdout.write(`STALE    ${pair.to} (committed ${committed.length}, built ${minified.length})\n`)
    stale += 1
    continue
  }
  mkdirSync(dirname(target), { recursive: true })
  writeFileSync(target, minified, 'utf8')
  process.stdout.write(`wrote ${pair.to}: ${source.length} → ${minified.length} chars\n`)
}

if (check) {
  process.stdout.write(stale === 0 ? '\nminified sources are current\n' : `\n${stale} file(s) stale — run: node tools/build-min.mjs\n`)
  process.exitCode = stale === 0 ? 0 : 1
}
