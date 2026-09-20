/**
 * Source-to-payload conversion for dsh-skill-hub.
 *
 * A dynamic Cordis Package carries its code as a function BODY: the host runner
 * evaluates it with `new Function('ctx', 'harness', source)` inside a vm sandbox
 * that withholds `require`, `process` and every module system. The files under
 * `src/` and `deploy/` are written as readable modules instead, and this module
 * performs the one mechanical swap that turns them into a payload:
 *
 *     export function apply(ctx) { … }   →   function apply(ctx) { … }
 *                                            return { apply: apply }
 *
 * Nothing else about the text changes, so the file on disk stays something a
 * linter and a human can both read.
 *
 * @module tools/payload
 */

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')

/**
 * Build one sandbox payload from a source file.
 * @param {string} relativePath - path under the repository root.
 * @param {string} exportName - the named export to expose.
 * @param {boolean} declaresInject - whether the source also defines `inject`.
 * @returns {string} the wrapped function body.
 */
export function payload(relativePath, exportName, declaresInject) {
  const source = readFileSync(join(ROOT, relativePath), 'utf8')
  const marker = `export function ${exportName}`
  if (!source.includes(marker)) {
    throw new Error(`${relativePath}: expected "${marker}"`)
  }
  if (declaresInject && !source.includes('const inject = [')) {
    throw new Error(`${relativePath}: declaresInject was set but no \`const inject = [\` was found`)
  }
  const body = source.replace(marker, `function ${exportName}`)
  const shape = declaresInject
    ? `{ inject: inject, apply: ${exportName} }`
    : `{ apply: ${exportName} }`
  return `'use strict'\n${body}\nreturn ${shape}`
}

/** The reference implementation under `src/`, with full commentary. */
export function reference() {
  return {
    host: payload('src/host/host.js', 'apply', true),
    client: payload('src/client/client.js', 'apply', false),
  }
}

/**
 * The compact deployment copy under `deploy/`.
 *
 * It is behaviourally the same package as {@link reference}; the difference is
 * only how much prose travels inside the payload. These two strings are the
 * ones a hand-run `cordis_define` actually pastes, so they are what `--check`
 * compares against the committed files.
 */
export function compact() {
  return {
    host: payload('deploy/compact.host.js', 'apply', true),
    client: payload('deploy/compact.client.js', 'apply', false),
  }
}

/**
 * The demo copy under `deploy/demo.*.js`.
 *
 * Smaller still than {@link compact}: no repository diagnostics, no rescan
 * control, and no styling beyond the switches. Its point is that the built
 * payload is short enough to be read back out of the repository and
 * re-submitted verbatim in a single tool call, which is how a running Package
 * receives its code without anyone retyping it.
 */
export function demo() {
  return {
    host: payload('deploy/demo.host.js', 'apply', true),
    client: payload('deploy/demo.client.js', 'apply', false),
  }
}

/**
 * The minified deployment copy under `deploy/min/`.
 *
 * Same behaviour as {@link demo} with comments and indentation stripped, written
 * by `node tools/build-min.mjs`. It exists because the text that actually runs
 * in a dynamic Package has to be reproduced by hand: the annotated source is
 * long enough that a copy of it cannot be checked by eye, while the minified
 * form can be read back line for line and compared.
 *
 * `src/` and `deploy/compact` stay readable — they are the reference copies, and
 * `--check` guards them either way.
 */
export function deployed() {
  return {
    host: payload('deploy/min/demo.host.min.js', 'apply', true),
    client: payload('deploy/min/demo.client.min.js', 'apply', false),
  }
}
