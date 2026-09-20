/**
 * Split a built payload onto disk in bounded slices.
 *
 * A payload is one very long line, and a reader that caps line length can never
 * hand the whole thing back. Writing the same bytes as fixed-width lines makes
 * the payload readable in order — concatenating the slices reproduces the
 * payload exactly, which is what `--check` verifies.
 *
 * Usage:
 *   node tools/slice-payload.mjs demo      # write payload/slices/demo.*.txt
 *   node tools/slice-payload.mjs demo --check
 */

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { ROOT, compact, demo, reference } from './payload.mjs'

const WIDTH = 900

const VARIANTS = { reference, compact, demo }

const variant = process.argv[2]
if (!Object.prototype.hasOwnProperty.call(VARIANTS, variant)) {
  process.stderr.write(`usage: node tools/slice-payload.mjs <${Object.keys(VARIANTS).join('|')}> [--check]\n`)
  process.exit(1)
}

const built = VARIANTS[variant]()

/** Break one payload into fixed-width lines, preserving every byte. */
function slice(text) {
  const lines = []
  for (let at = 0; at < text.length; at += WIDTH) lines.push(text.slice(at, at + WIDTH))
  return lines.join('\n')
}

const dir = join(ROOT, 'payload', 'slices')
mkdirSync(dir, { recursive: true })

const outputs = [
  { file: join(dir, `${variant}.host.txt`), text: slice(built.host) },
  { file: join(dir, `${variant}.client.txt`), text: slice(built.client) },
]

if (process.argv.includes('--check')) {
  let bad = 0
  for (const output of outputs) {
    let committed = null
    try {
      committed = readFileSync(output.file, 'utf8').replace(/\r?\n$/, '').replace(/\r\n/g, '\n')
    } catch (error) {
      process.stdout.write(`missing  ${output.file}\n`)
      bad += 1
      continue
    }
    const text = output.text.replace(/\r?\n$/, '')
    if (committed === text) {
      process.stdout.write(`ok       ${output.file} (${output.text.split('\n').length} slices)\n`)
      continue
    }
    process.stdout.write(`STALE    ${output.file}\n`)
    bad += 1
  }
  process.stdout.write(bad === 0 ? '\nslices reproduce their payloads\n' : `\n${bad} slice file(s) stale — rerun without --check\n`)
  process.exitCode = bad === 0 ? 0 : 1
} else {
  for (const output of outputs) {
    writeFileSync(output.file, `${output.text}\n`, 'utf8')
    const count = output.text.split('\n').length
    process.stdout.write(`wrote ${output.file} (${count} slices of ${WIDTH})\n`)
  }
}
