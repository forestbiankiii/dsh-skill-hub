/**
 * Build the payload strings a `cordis_define` call needs.
 *
 * A dynamic Cordis Package carries its code as a function BODY: the host runner
 * evaluates it with `new Function('ctx', 'harness', source)` inside a vm sandbox
 * that withholds `require`, `process` and every module system. The `src/` files
 * in this repository are therefore written as readable modules and converted
 * here — the source keeps its named export so an editor and a linter treat it as
 * a normal file, and this script swaps that export for the sandbox wrapper.
 *
 * Usage:
 *   node tools/build-payload.mjs            # human-readable, on stdout
 *   node tools/build-payload.mjs --json     # {"host":"…","client":"…"}
 *
 * The output goes into the `code.host` / `code.client` fields of a
 * `cordis_define` call. Nothing else in this repository needs Node.
 */

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = join(HERE, '..')

/**
 * Turn one source file into a sandbox payload.
 *
 * The returned text is what the sandbox compiles: the source with its `export`
 * keyword removed, wrapped so that `apply` and (when declared) `inject` are the
 * plugin object the runner expects.
 *
 * @param {string} relativePath - path under the repository root.
 * @param {string} exportName - the named export to expose.
 * @param {boolean} declaresInject - whether the source also defines `inject`.
 * @returns {string} the wrapped function body.
 */
function payload(relativePath, exportName, declaresInject) {
  const source = readFileSync(join(ROOT, relativePath), 'utf8')
  const marker = `export function ${exportName}`
  if (!source.includes(marker)) {
    throw new Error(`${relativePath}: expected "${marker}"`)
  }
  const body = source.replace(marker, `function ${exportName}`)
  const shape = declaresInject
    ? `{ inject: inject, apply: ${exportName} }`
    : `{ apply: ${exportName} }`
  return `'use strict'\n${body}\nreturn ${shape}`
}

const built = {
  host: payload('src/host/host.js', 'apply', true),
  client: payload('src/client/client.js', 'apply', false),
}

if (process.argv.includes('--json')) {
  process.stdout.write(JSON.stringify({ host: built.host, client: built.client }))
} else {
  for (const half of ['host', 'client']) {
    process.stdout.write(`=== ${half} (${built[half].length} chars) ===\n`)
    process.stdout.write(`${built[half]}\n\n`)
  }
}
