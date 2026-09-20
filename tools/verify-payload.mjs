/**
 * Sanity-check the built payloads without touching the real runtime.
 *
 * The DSH host runner evaluates a Package's halves with
 * `new Function('ctx', 'harness', source)` inside a vm sandbox, and the browser
 * runner does the same for the client half with its own facade. This script
 * reproduces the parse-and-shape step for EVERY variant — the reference build
 * from `src/`, the compact one and the demo one from `deploy/` — and executes
 * each `apply` against a recording stub so the registrations can be asserted.
 *
 * Usage: node tools/verify-payload.mjs
 */

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { ROOT, compact, demo, reference } from './payload.mjs'

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

/** The three build variants, in the order the reports print them. */
const VARIANTS = [
  { name: 'reference', halves: reference(), dir: 'payload' },
  { name: 'compact', halves: compact(), dir: 'payload' },
  { name: 'demo', halves: demo(), dir: 'payload' },
]

/* --------------------------------------------------- committed bytes audit */

process.stdout.write('committed payloads\n')
const committed = [
  { label: 'reference host', file: 'payload/host.txt', expected: reference().host },
  { label: 'reference client', file: 'payload/client.txt', expected: reference().client },
  { label: 'reference json', file: 'payload/code.json', expected: JSON.stringify(reference()) },
  { label: 'compact host', file: 'payload/compact.host.txt', expected: compact().host },
  { label: 'compact client', file: 'payload/compact.client.txt', expected: compact().client },
  { label: 'compact json', file: 'payload/compact.json', expected: JSON.stringify(compact()) },
  { label: 'demo host', file: 'payload/demo.host.txt', expected: demo().host },
  { label: 'demo client', file: 'payload/demo.client.txt', expected: demo().client },
  { label: 'demo json', file: 'payload/demo.json', expected: JSON.stringify(demo()) },
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
for (const variant of VARIANTS) {
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
 * A stand-in for `ctx.settings` that mirrors the real contract closely enough to
 * catch a misuse: `register(ns, schema)` returns a scope whose `get()` is the
 * resolved value, whose `update()` persists a patch, and whose `watch()`
 * notifies. The real service also calls the schema with the merged layers, so
 * the stub does too — a schema that is not callable fails here.
 */
function makeSettingsStub() {
  const state = { repo: '' }
  const watchers = new Set()
  let schemaSeen = null

  const scope = {
    get: () => schemaSeen({ repo: state.repo }),
    watch: (callback) => {
      watchers.add(callback)
      return () => watchers.delete(callback)
    },
    update: async (patch) => {
      if (patch !== null && typeof patch === 'object' && typeof patch.repo === 'string') {
        state.repo = patch.repo
        for (const callback of watchers) callback()
      }
    },
    replace: async (section) => {
      state.repo = section !== null && typeof section === 'object' ? String(section.repo ?? '') : ''
      for (const callback of watchers) callback()
    },
  }

  return {
    service: {
      writable: true,
      register: (ns, schema) => {
        if (typeof schema !== 'function') throw new Error('settings.register needs a callable schema')
        if (typeof schema.toJSON !== 'function') throw new Error('settings.describe needs schema.toJSON()')
        schemaSeen = schema
        return scope
      },
      get: () => undefined,
      describe: () => [],
    },
    state,
  }
}

/**
 * The host façade hands timer verbs through as `ctx.interval(callback, delay)`
 * after the `timer` declaration. `effect` runs its callback the way cordis
 * does, because the repository poll is registered from inside one — a stub that
 * merely counted effects would never observe it.
 */
function makeCtxStub(settings) {
  return {
    skills: skillsStub,
    settings: settings.service,
    get: (name) => {
      if (name === 'fs') return fsStub
      if (name === 'settings') return settings.service
      return undefined
    },
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

/**
 * The service each host half declares, per variant, plus how many fiber effects
 * it owns. The demo build reads its repository path through the settings
 * service — hence the extra declaration and the third effect (the settings
 * watcher) — while the other two keep the path as a constant.
 */
const HOST_INJECT = {
  reference: 'skills,timer',
  compact: 'skills,timer',
  demo: 'skills,settings,timer',
}

const HOST_EFFECTS = {
  reference: 2,
  compact: 2,
  demo: 3,
}

for (const variant of VARIANTS) {
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

  const settings = makeSettingsStub()
  const harnessStub = {
    handle: (method) => {
      calls.handlers.push(method)
      return () => {}
    },
  }
  try {
    const plugin = factory(makeCtxStub(settings), harnessStub)
    check('returns { apply }', plugin !== null && typeof plugin.apply === 'function')
    check(
      `declares inject [${HOST_INJECT[variant.name]}]`,
      Array.isArray(plugin.inject) && plugin.inject.join(',') === HOST_INJECT[variant.name],
      JSON.stringify(plugin.inject),
    )
    plugin.apply(makeCtxStub(settings))
    check('registers one skill provider', calls.providers === 1, `got ${calls.providers}`)
    check('registers one poll interval', calls.intervals === 1, `got ${calls.intervals}`)
    check(
      `registers ${HOST_EFFECTS[variant.name]} effects`,
      calls.effects === HOST_EFFECTS[variant.name],
      `got ${calls.effects}`,
    )
    check(
      'registers a client RPC surface',
      calls.handlers.length >= 2,
      calls.handlers.join(', '),
    )
    check(
      'exposes a catalog read and a toggle handler',
      calls.handlers.some((name) => name.endsWith(':rows') || name.endsWith(':state'))
        && calls.handlers.some((name) => name.endsWith(':flip') || name.endsWith(':toggle')),
      calls.handlers.join(', '),
    )
  } catch (error) {
    check('apply runs against a stub ctx', false, error.message)
  }
}

/* ---------------------------------------------------------- client halves */

/**
 * What each variant contributes. The demo build deliberately drops the General
 * settings shortcut to stay small, so the expectation is per variant rather
 * than one shape for all three.
 */
const CLIENT_SURFACE = {
  reference: { slots: 3, shortcut: true },
  compact: { slots: 3, shortcut: true },
  demo: { slots: 2, shortcut: false },
}

for (const variant of VARIANTS) {
  process.stdout.write(`${variant.name} client\n`)
  const surface = CLIENT_SURFACE[variant.name]
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
    const plugin = factory(reactStub, { call: async () => ({}) }, { insert: () => {} }, makeCtxStub(makeSettingsStub()))
    check('returns { apply }', plugin !== null && typeof plugin.apply === 'function')
    plugin.apply({ get: (name) => (name === 'slots' ? slotsStub : undefined) })
    check(`injects ${surface.slots} slots`, injected.length === surface.slots, injected.join(', '))
    check(
      'registers settings.section id=skills',
      registered.some((entry) => entry.name === 'settings.section' && entry.id === 'skills'),
    )
    if (surface.shortcut) {
      check(
        'registers settings.general.item id=skill-hub',
        registered.some((entry) => entry.name === 'settings.general.item' && entry.id === 'skill-hub'),
      )
    } else {
      check(
        'skips the General shortcut, as the demo build intends',
        !registered.some((entry) => entry.name === 'settings.general.item'),
      )
    }
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
