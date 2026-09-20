/**
 * Byte-level minifier for this project's own sources.
 *
 * It exists for one reason: the text that actually runs in a dynamic Package has
 * to be typed out, and the annotated sources are too long to reproduce safely.
 * Stripping comments and indentation roughly halves a payload without changing
 * behaviour, so the deployed string stays small enough to verify by eye.
 *
 * It is deliberately conservative and string-aware — no AST, no renaming, no
 * semicolon insertion games. It handles exactly the constructs these files use:
 * single/double-quoted strings, regex literals, `/* … *​/` and `//` comments.
 * Anything it cannot prove is a comment is copied through untouched.
 *
 * Usage:
 *   node tools/minify.mjs deploy/demo.host.js            # to stdout
 *   node tools/minify.mjs deploy/demo.host.js --in-place  # rewrite the file
 *
 * @module tools/minify
 */

import { readFileSync, writeFileSync } from 'node:fs'
import { isAbsolute, join } from 'node:path'
import { ROOT } from './payload.mjs'

/** Characters that can follow a token after which `/` starts a regex. */
const REGEX_PRECEDERS = new Set([
  '(', ',', '=', ':', '[', '!', '&', '|', '?', '+', '-', '*', '%', '^', '~',
  '{', '}', ';', '\n', '',
])

/**
 * Whether the last significant character allows a following `/` to open a
 * regular expression rather than being a division operator.
 * @param {string} last - the last emitted non-space character, or ''.
 * @returns {boolean} whether a regex may start here.
 */
function regexAllowed(last) {
  if (REGEX_PRECEDERS.has(last)) return true
  return false
}

/**
 * Remove comments and collapse indentation, preserving strings and regexes.
 * @param {string} source - the file text.
 * @returns {string} the minified text.
 */
export function minify(source) {
  const out = []
  let index = 0
  let last = ''
  let atLineStart = true

  const push = function (text) {
    out.push(text)
    for (let i = text.length - 1; i >= 0; i -= 1) {
      const ch = text.charAt(i)
      if (ch !== ' ' && ch !== '\t' && ch !== '\n' && ch !== '\r') {
        last = ch
        break
      }
    }
  }

  while (index < source.length) {
    const ch = source.charAt(index)
    const next = source.charAt(index + 1)

    // Line comment.
    if (ch === '/' && next === '/') {
      while (index < source.length && source.charAt(index) !== '\n') index += 1
      continue
    }

    // Block comment.
    if (ch === '/' && next === '*') {
      index += 2
      while (index < source.length && !(source.charAt(index) === '*' && source.charAt(index + 1) === '/')) {
        index += 1
      }
      index += 2
      continue
    }

    // String literal: copy verbatim, escapes included.
    if (ch === '"' || ch === "'") {
      const start = index
      index += 1
      while (index < source.length) {
        const inner = source.charAt(index)
        if (inner === '\\') {
          index += 2
          continue
        }
        index += 1
        if (inner === ch) break
      }
      push(source.slice(start, index))
      atLineStart = false
      continue
    }

    // Regex literal: only where one may legally start.
    if (ch === '/' && (atLineStart === true || regexAllowed(last))) {
      const start = index
      index += 1
      let inClass = false
      let closed = false
      while (index < source.length) {
        const inner = source.charAt(index)
        if (inner === '\\') {
          index += 2
          continue
        }
        if (inner === '[') inClass = true
        else if (inner === ']') inClass = false
        else if (inner === '/' && !inClass) {
          index += 1
          closed = true
          break
        } else if (inner === '\n') {
          break
        }
        index += 1
      }
      if (!closed) {
        // Not a regex after all; emit the slash and continue.
        push(source.slice(start, index))
        atLineStart = false
        continue
      }
      while (index < source.length && /[a-z]/.test(source.charAt(index))) index += 1
      push(source.slice(start, index))
      atLineStart = false
      continue
    }

    // Newline: keep it, because automatic semicolon insertion depends on line
    // breaks. Only runs of blank lines collapse.
    if (ch === '\n') {
      index += 1
      atLineStart = true
      if (last !== '') {
        out.push('\n')
        last = ''
      }
      continue
    }

    // Horizontal whitespace: drop indentation, keep a separating space only
    // where two word characters would otherwise fuse.
    if (ch === ' ' || ch === '\t' || ch === '\r') {
      let end = index
      while (end < source.length && /[ \t\r]/.test(source.charAt(end))) end += 1
      const after = source.charAt(end)
      const needsSpace = /[A-Za-z0-9_$]/.test(last) && /[A-Za-z0-9_$]/.test(after)
      if (needsSpace) push(' ')
      index = end
      continue
    }

    push(ch)
    if (ch !== ' ') atLineStart = false
    index += 1
  }

  return out
    .join('')
    .split('\n')
    .map(function (line) { return line.replace(/[ \t]+$/, '') })
    .join('\n')
    .replace(/\n{2,}/g, '\n')
    .trim()
    .concat('\n')
}

const argv = process.argv.slice(2)
const target = argv.find(function (arg) { return arg.endsWith('.js') })
if (target !== undefined) {
  const path = isAbsolute(target) ? target : join(ROOT, target)
  const source = readFileSync(path, 'utf8')
  const minified = minify(source)
  if (argv.includes('--in-place')) {
    writeFileSync(path, minified, 'utf8')
    process.stdout.write(`minified ${target}: ${source.length} → ${minified.length} chars\n`)
  } else {
    process.stdout.write(minified)
  }
}
