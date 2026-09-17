/**
 * Sanity-check the built payloads without touching the real runtime.
 *
 * The DSH host runner evaluates a Package's halves with
 * `new Function('ctx', 'harness', source)` inside a vm sandbox, and the browser
 * runner does the same for the client half with its own facade. This script
 * reproduces the parse-and-shape step for BOTH variants — the reference build
 * from `src/` and the compact deployment build from `deploy/` — and executes
 * each `apply` against a recording stub so the registrations can be asserted.
 *
 * Usage: node tools/verify-payload.mjs
 */

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { ROOT, compact, reference } from './payload.mjs'

let failures = 0

function check(label, condition, detail) {
  if (condition) {
    process.stdout.write(`  ok   ${label}\n`)
    return
  }
  failures += 1
  process.stdout.write(`  FAIL ${label}${detail === undefined ? '' : ` — ${detail}`}\n`)
}

/**
 * Drop block and line comments so the string audit judges executable text
 * rather than prose. Backticks are legal JavaScript but this project stays
 * quote-only, and the audit would otherwise trip over a `ctx.fs` mention.
 * @param {string} source - the payload text.
 * @returns {string} the text with comments removed.
 */
function stripComments(source) {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
}

/* --------------------------------------------------- committed bytes audit */

process.stdout.write('committed payloads\n')
const committed = [
  { label: 'reference host', file: 'payload/host.txt', expected: reference().host },
  { label: 'reference client', file: 'payload/client.txt', expected: reference().client },
  { label: 'reference json', file: 'payload/code.json', expected: JSON.stringify(reference()) },
  { label: 'compact host', file: 'payload/compact.host.txt', expected: compact().host },
  { label: 'compact client', file: 'payload/compact.client.txt', expected: compact().client },
  { label: 'compact json', file: 'payload/compact.json', expected: JSON.stringify(compact()) },
]
for (const entry of committed) {
  let actual = null
  try {
    actual = readFileSync(join(ROOT, entry.file), 'utf8').replace(/\r\n/g, '\n')
  } catch (error) {
    check(`${entry.label}: readable`, false, error.message)
    continue
  }
  check(`${entry.label}: byte-identical to its sources`, actual === entry.expected)
}

/* ------------------------------------------------------------ string audits */

process.stdout.write('payload audit\n')
for (const variant of [{ name: 'reference', halves: reference() }, { name: 'compact', halves: compact() }]) {
  for (const half of ['host', 'client']) {
    const source = variant.halves[half]
    const code = stripComments(source)
    const where = `${variant.name} ${half}`
    check(`${where}: no literal closing script tag`, !source.includes('</script>'))
    check(`${where}: no bare closing tag`, !source.includes('</'), 'a literal closing tag can end an inline script')
    check(`${where}: no backtick template`, !code.includes('`'), 'quote-only strings keep the source auditable')
    check(`${where}: no dynamic import or require`, !/\brequire\s*\(/.test(code) && !/\bimport\s*\(/.test(code))
  }
}

/* ------------------------------------------------------------------- stubs */

const calls = { providers: 0, handlers: [], effects: 0, intervals: 0 }

const skillsStub = {
  snapshot: async () => ({ skills: [], complete: true }),
  list: async () => [],
  get: async () => undefined,
  invalidateCache: () => {},
  registerProvider: (factory) => {
    calls.providers += 1
    const provider = factory({ invalidate: () => {} })
    if (provider === null || typeof provider.name !== 'string' || typeof provider.list !== 'function') {
      throw new Error('registerProvider factory did not return a provider')
    }
    return () => {}
  },
}

const fsStub = {
  resolve: async (path) => ({ targetKey: 'stub', displayPath: path }),
  listDir: async () => [],
  readText: async () => '',
}

/**
 * The host façade hands timer verbs through as `ctx.interval(callback, delay)`
 * after the `timer` declaration. `effect` runs its callback the way cordis
 * does, because the repository poll is registered from inside one — a stub that
 * merely counted effects would never observe it.
 */
function makeCtxStub() {
  return {
    skills: skillsStub,
    get: (name) => (name === 'fs' ? fsStub : undefined),
    effect: (callback) => {
      if (typeof callback !== 'function') throw new Error('ctx.effect expects a callback')
      calls.effects += 1
      const disposer = callback()
      return typeof disposer === 'function' ? disposer : () => {}
    },
    interval: (callback, delay) => {
      if (typeof callback !== 'function' || typeof delay !== 'number') {
        throw new Error('ctx.interval expects (callback, delay)')
      }
      calls.intervals += 1
      return () => {}
    },
  }
}

/* ------------------------------------------------------------ host halves */

for (const variant of [{ name: 'reference', halves: reference() }, { name: 'compact', halves: compact() }]) {
  process.stdout.write(`${variant.name} host\n`)
  calls.providers = 0
  calls.handlers = []
  calls.effects = 0
  calls.intervals = 0

  let factory = null
  try {
    factory = new Function('ctx', 'harness', variant.halves.host)
    check('compiles as a function body', true)
  } catch (error) {
    check('compiles as a function body', false, error.message)
  }
  if (factory === null) continue

  const harnessStub = {
    handle: (method) => {
      calls.handlers.push(method)
      return () => {}
    },
  }
  try {
    const plugin = factory(makeCtxStub(), harnessStub)
    check('returns { apply }', plugin !== null && typeof plugin.apply === 'function')
    check(
      'declares inject [skills, timer]',
      Array.isArray(plugin.inject) && plugin.inject.join(',') === 'skills,timer',
      JSON.stringify(plugin.inject),
    )
    plugin.apply(makeCtxStub())
    check('registers one skill provider', calls.providers === 1, `got ${calls.providers}`)
    check('registers one poll interval', calls.intervals === 1, `got ${calls.intervals}`)
    check('registers two effects', calls.effects === 2, `got ${calls.effects}`)
    check(
      'registers a client RPC surface',
      calls.handlers.length >= 3,
      calls.handlers.join(', '),
    )
  } catch (error) {
    check('apply runs against a stub ctx', false, error.message)
  }
}

/* ---------------------------------------------------------- client halves */

for (const variant of [{ name: 'reference', halves: reference() }, { name: 'compact', halves: compact() }]) {
  process.stdout.write(`${variant.name} client\n`)
  const registered = []
  const injected = []
  const slotsStub = {
    inject: (name, callback) => {
      injected.push(name)
      callback()
      return () => {}
    },
    register: (options) => {
      registered.push(options)
      return () => {}
    },
  }
  const reactStub = {
    createElement: (type, props, ...children) => ({ type, props, children }),
    useState: (initial) => [typeof initial === 'function' ? initial() : initial, () => {}],
    useEffect: () => {},
    useCallback: (callback) => callback,
  }
  try {
    const factory = new Function('React', 'host', 'styles', 'ctx', variant.halves.client)
    check('compiles as a function body', true)
    const plugin = factory(reactStub, { call: async () => ({}) }, { insert: () => {} }, makeCtxStub())
    check('returns { apply }', plugin !== null && typeof plugin.apply === 'function')
    plugin.apply({ get: (name) => (name === 'slots' ? slotsStub : undefined) })
    check('injects three slots', injected.length === 3, injected.join(', '))
    check(
      'registers settings.section id=skills',
      registered.some((entry) => entry.name === 'settings.section' && entry.id === 'skills'),
    )
    check(
      'registers settings.general.item id=skill-hub',
      registered.some((entry) => entry.name === 'settings.general.item' && entry.id === 'skill-hub'),
    )
    check(
      'registers tool.view.cordis key=self',
      registered.some((entry) => entry.name === 'tool.view.cordis' && entry.key === 'self'),
    )
  } catch (error) {
    check('client half runs against a stub facade', false, error.message)
  }
}

process.stdout.write(failures === 0 ? '\nall checks passed\n' : `\n${failures} check(s) failed\n`)
process.exitCode = failures === 0 ? 0 : 1
