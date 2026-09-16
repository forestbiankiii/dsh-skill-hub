/**
 * Sanity-check the built payloads without touching the real runtime.
 *
 * The DSH host runner evaluates a Package's halves with
 * `new Function('ctx', 'harness', source)` inside a vm sandbox, and the browser
 * runner does the same for the client half with its own facade. This script
 * reproduces the parse-and-shape step: it compiles both payloads, audits the
 * string sequences that are unsafe inside an inline script, and executes each
 * `apply` against a recording stub so the registrations can be asserted.
 *
 * Usage: node tools/verify-payload.mjs
 */

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = join(HERE, '..')
const built = JSON.parse(readFileSync(join(ROOT, 'payload', 'code.json'), 'utf8'))

let failures = 0

function check(label, condition, detail) {
  if (condition) {
    process.stdout.write(`  ok   ${label}\n`)
    return
  }
  failures += 1
  process.stdout.write(`  FAIL ${label}${detail === undefined ? '' : ` — ${detail}`}\n`)
}

/* ------------------------------------------------------------ string audits */

/**
 * Drop block and line comments so the string audit judges executable text
 * rather than prose. Backticks are legal JavaScript but this project stays
 * quote-only, and the audit would otherwise trip over every `ctx.fs` mention.
 * @param {string} source - the payload text.
 * @returns {string} the text with comments removed.
 */
function stripComments(source) {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
}

process.stdout.write('payload audit\n')
for (const half of ['host', 'client']) {
  const source = built[half]
  const code = stripComments(source)
  check(`${half}: no literal </script>`, !source.includes('</script>'))
  check(`${half}: no bare </`, !source.includes('</'), 'a literal closing tag can terminate an inline script')
  check(`${half}: no backtick template`, !code.includes('`'), 'quote-only strings keep the source auditable')
  check(`${half}: no dynamic import or require`, !/\brequire\s*\(/.test(code) && !/\bimport\s*\(/.test(code))
}

/* ------------------------------------------------------------------- stubs */

const calls = { providers: 0, handlers: [], effects: 0, intervals: 0, labels: [] }

const skillsStub = {
  snapshot: async () => ({ skills: [], complete: true }),
  list: async () => [],
  get: async () => undefined,
  invalidateCache: () => {},
  registerProvider: (factory) => {
    calls.providers += 1
    // Exercise the factory so a bad provider shape fails here, not at runtime.
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
 * after the `timer` declaration, so the stub mirrors that shape rather than
 * hanging the verb off the timer service itself.
 *
 * `effect` runs its callback the way cordis does, because some registrations
 * only happen inside one — the repository poll is registered from an effect, so
 * a stub that merely counts effects would never observe it.
 */
function makeCtxStub() {
  return {
    skills: skillsStub,
    get: (name) => (name === 'fs' ? fsStub : undefined),
    effect: (callback, label) => {
      if (typeof callback !== 'function') throw new Error('ctx.effect expects a callback')
      calls.effects += 1
      calls.labels.push(String(label))
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

/* ---------------------------------------------------------------- host half */

process.stdout.write('host half\n')
let hostPluginFactory = null
try {
  hostPluginFactory = new Function('ctx', 'harness', built.host)
  check('compiles as a function body', true)
} catch (error) {
  check('compiles as a function body', false, error.message)
}

if (hostPluginFactory !== null) {
  const harnessStub = {
    handle: (method) => {
      calls.handlers.push(method)
      return () => {}
    },
  }
  try {
    const plugin = hostPluginFactory(makeCtxStub(), harnessStub)
    check('returns { apply }', plugin !== null && typeof plugin.apply === 'function')
    check(
      'declares inject [skills, timer]',
      Array.isArray(plugin.inject)
        && plugin.inject.length === 2
        && plugin.inject[0] === 'skills'
        && plugin.inject[1] === 'timer',
      JSON.stringify(plugin.inject),
    )
    plugin.apply(makeCtxStub())
    check('registers one skill provider', calls.providers === 1, `got ${calls.providers}`)
    check(
      'registers the three client RPC handlers',
      calls.handlers.includes('skills:state')
        && calls.handlers.includes('skills:toggle')
        && calls.handlers.includes('skills:toggle-all'),
      calls.handlers.join(', '),
    )
    check('registers one poll interval', calls.intervals === 1, `got ${calls.intervals}`)
    check('registers two effects', calls.effects === 2, `got ${calls.effects}`)
  } catch (error) {
    check('apply runs against a stub ctx', false, error.message)
  }
}

/* -------------------------------------------------------------- client half */

process.stdout.write('client half\n')
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
  const factory = new Function('React', 'host', 'styles', 'ctx', built.client)
  check('compiles as a function body', true)
  const plugin = factory(reactStub, { call: async () => ({}) }, { insert: () => {} }, makeCtxStub())
  check('returns { apply }', plugin !== null && typeof plugin.apply === 'function')
  plugin.apply({
    get: (name) => (name === 'slots' ? slotsStub : undefined),
  })
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

process.stdout.write(failures === 0 ? '\nall checks passed\n' : `\n${failures} check(s) failed\n`)
process.exitCode = failures === 0 ? 0 : 1
