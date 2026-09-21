/**
 * Wrap `src/client.js` into the bundle the browser module loader expects.
 *
 * A static client plugin's browser half is one script that only REGISTERS a
 * factory; every side effect (CSS injection included) runs when the module is
 * first materialized:
 *
 *     window.__ModuleLoader__.load({ id, factory: (require) => {
 *       var module = { exports: {} }
 *       var exports = module.exports
 *       …module code…
 *       return module.exports
 *     }})
 *
 * `id` must be the package name: `<id>/client` normalizes onto the same graph
 * row, which is how the loader ties this file to the package's host half.
 *
 * No bundler is involved. The source has no imports, so this script only:
 *
 *   1. binds `React` and the hooks `src/client.js` uses as free variables,
 *   2. turns its `export const inject` / `export function apply` into the
 *      CommonJS exports the loader reads,
 *   3. wraps the result in the envelope above.
 *
 * Usage:
 *   node tools/build-client.mjs            # write lib/client.js
 *   node tools/build-client.mjs --check    # fail when lib/client.js is stale
 */

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const SOURCE = join(ROOT, 'src', 'client.js')
const TARGET = join(ROOT, 'lib', 'client.js')

/** The package name, which is also the loader's module id for this bundle. */
const PACKAGE_NAME = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')).name

/** Named exports the loader copies off `module.exports`. */
const EXPORTS = ['inject', 'apply']

/** React symbols the source uses without importing them. */
const REACT_BINDINGS = ['useState', 'useEffect', 'useCallback', 'useMemo', 'createElement']

/**
 * Build the bundle text.
 * @param {string} source - contents of `src/client.js`.
 * @param {string} id - the loader module id.
 * @returns {string} the bundle.
 */
export function build(source, id) {
  if (source.includes('</script')) {
    throw new Error('source contains a literal closing script tag; it cannot be inlined safely')
  }
  for (const name of EXPORTS) {
    if (!new RegExp(`export (const|function) ${name}\\b`).test(source)) {
      throw new Error(`source does not export \`${name}\``)
    }
  }
  const lines = []
  lines.push('window.__ModuleLoader__.load({')
  lines.push(`id:${JSON.stringify(id)},`)
  lines.push('factory:(require)=>{var module={exports:{}};var exports=module.exports;')
  lines.push("'use strict';")
  lines.push("const React = require('react');")
  lines.push(`const { ${REACT_BINDINGS.join(', ')} } = React;`)
  for (const name of EXPORTS) {
    lines.push(`exports.${name} = undefined;`)
  }
  // Strip only the leading `export ` keyword; every declaration stays verbatim.
  lines.push(source.replace(/^export (?=(const|function) )/gm, ''))
  for (const name of EXPORTS) {
    lines.push(`exports.${name} = ${name};`)
  }
  lines.push('return module.exports;}});')
  return lines.join('\n') + '\n'
}

const built = build(readFileSync(SOURCE, 'utf8'), PACKAGE_NAME)

if (process.argv.includes('--check')) {
  let committed = null
  try {
    committed = readFileSync(TARGET, 'utf8').replace(/\r\n/g, '\n')
  } catch {
    console.error(`missing ${TARGET} — run: node tools/build-client.mjs`)
    process.exit(1)
  }
  if (committed !== built) {
    console.error(`STALE ${TARGET} (committed ${committed.length}, built ${built.length}) — run: node tools/build-client.mjs`)
    process.exit(1)
  }
  console.log(`ok       lib/client.js (${built.length} chars)`)
} else {
  mkdirSync(dirname(TARGET), { recursive: true })
  writeFileSync(TARGET, built, 'utf8')
  console.log(`wrote lib/client.js: ${readFileSync(SOURCE, 'utf8').length} → ${built.length} chars`)
}
