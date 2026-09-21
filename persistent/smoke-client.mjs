/**
 * Smoke-run the built client bundle without a browser.
 *
 * A client half that fails to parse, fails to register, or throws inside
 * `apply` breaks the settings page for the whole app — and the only way to notice
 * would otherwise be a restart. This reproduces the loader's contract in Node:
 *
 *   - `window.__ModuleLoader__.load({ id, factory })` is captured, not executed,
 *     exactly as the real loader does on script arrival;
 *   - `factory(require)` is then called with a React stub, and its exports are
 *     checked;
 *   - `apply(ctx)` runs against stub `slots` / `connection` / `document` services,
 *     with the page's first data call exercised through a stubbed `rpc.call`.
 *
 * Usage: node smoke-client.mjs
 */

import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)))
const BUNDLE = join(ROOT, 'lib', 'client.js')
const bundle = readFileSync(BUNDLE, 'utf8')

let failures = 0
const check = (label, condition, detail) => {
  if (condition) {
    console.log(`  ok   ${label}`)
    return
  }
  failures += 1
  console.log(`  FAIL ${label}${detail === undefined ? '' : ` — ${detail}`}`)
}

/* ------------------------------------------------------------ loader capture */

let registered
const windowStub = {
  open: () => {},
  __ModuleLoader__: {
    load: (entry) => {
      registered = entry
    },
  },
}

/* ------------------------------------------------------------- document stub */

const styles = []
const documentStub = {
  head: {
    appendChild: (tag) => {
      styles.push(tag)
    },
  },
  createElement: (tag) => ({
    tag,
    dataset: {},
    textContent: '',
    removed: false,
    remove() {
      this.removed = true
    },
  }),
}

/* ---------------------------------------------------------------- react stub */

const reactStub = {
  // A minimal function-component renderer: a function `type` is invoked the way
  // React invokes it, so rendering the section actually reaches `Hub` and its
  // effect. Host elements just become plain records.
  createElement: (type, props, ...children) =>
    (typeof type === 'function' ? type({ ...(props ?? {}), children }) : { type, props, children }),
  useState: (initial) => [typeof initial === 'function' ? initial() : initial, () => {}],
  // Invoke the effect the way React does after a mount, so the component's first
  // data request actually happens in this test instead of being registered and
  // forgotten.
  useEffect: (effect) => {
    if (typeof effect === 'function') effect()
  },
  useCallback: (fn) => fn,
  useMemo: (fn) => fn(),
}

/* ------------------------------------------------------------ service stubs */

const calls = { registered: [], injected: [], effects: 0, rpc: [] }

const slotsStub = {
  inject: (name, callback) => {
    calls.injected.push(name)
    callback()
    return () => {}
  },
  register: (options, component) => {
    calls.registered.push({ ...options, component })
    return () => {}
  },
}

const connectionStub = {
  rpc: {
    call: async (channel, method, payload) => {
      calls.rpc.push({ channel, method, payload })
      return { ok: true, value: { rows: [], total: 0, offCount: 0, scopes: [], active: '', activeTitle: '全局', inherited: false, repo: '~/.agents/skills', repoDefault: '~/.agents/skills', repoStored: false, repoLoaded: 0, lockFile: '.skill-lock.json' } }
    },
  },
}

const ctxStub = {
  get: (name) => {
    if (name === 'slots') return slotsStub
    if (name === 'connection') return connectionStub
    return undefined
  },
  effect: (callback) => {
    calls.effects += 1
    const disposer = callback()
    return typeof disposer === 'function' ? disposer : () => {}
  },
  logger: { warn: () => {}, info: () => {} },
}

/* --------------------------------------------------------------------- run */

console.log('client bundle')

// 1. Executing the script must only REGISTER a factory.
try {
  const evaluate = new Function('window', 'document', bundle)
  evaluate(windowStub, documentStub)
  check('executes and registers a factory', registered !== undefined)
} catch (error) {
  check('executes and registers a factory', false, String(error && error.message ? error.message : error))
}

if (registered !== undefined) {
  check('registered id is the package name', registered.id === 'dsh-skill-hub', String(registered.id))
  check('factory is a function', typeof registered.factory === 'function')

  let exports
  try {
    // `require` is a function in the real loader, not the module it returns.
    const requireStub = (name) => {
      if (name === 'react') return reactStub
      throw new Error(`unexpected require(${JSON.stringify(name)})`)
    }
    exports = registered.factory(requireStub)
    check('factory materializes', true)
  } catch (error) {
    check('factory materializes', false, String(error && error.message ? error.message : error))
  }

  if (exports !== undefined) {
    check('exports apply', typeof exports.apply === 'function')
    check(
      'exports inject [slots, connection]',
      Array.isArray(exports.inject) && exports.inject.join(',') === 'slots,connection',
      JSON.stringify(exports.inject),
    )

    try {
      exports.apply(ctxStub)
      check('apply runs against stub services', true)
    } catch (error) {
      check('apply runs against stub services', false, String(error && error.message ? error.message : error))
    }

    check('injected the settings section slot', calls.injected.includes('settings.section'), calls.injected.join(', '))
    check(
      'registered settings.section id=skills',
      calls.registered.some((entry) => entry.name === 'settings.section' && entry.id === 'skills'),
    )
    check('installed one stylesheet', styles.length === 1, `${styles.length} style tag(s)`)
    if (styles.length === 1) {
      const tag = styles[0]
      check('stylesheet is tagged with the package name', tag.dataset.plugin === 'dsh-skill-hub', String(tag.dataset.plugin))
      check('stylesheet has content', typeof tag.textContent === 'string' && tag.textContent.length > 100)
      check('stylesheet uses the shipped font token', tag.textContent.includes('--dsw-font-family'))
    }

    // 2. Render the registered section once, the way the settings shell will,
    //    and confirm the first data call goes through the authenticated bridge.
    const section = calls.registered.find((entry) => entry.name === 'settings.section')
    check('the section registered a component', section !== undefined && typeof section.component === 'function')
    if (section !== undefined && typeof section.component === 'function') {
      // `useSessions` is a standard prop of every settings.section occupant. The
      // stub records the selector, so the test can tell a hook call during render
      // from one smuggled into the request callback.
      const hookCalls = []
      const props = {
        close: () => {},
        useSessions: (selector) => {
          hookCalls.push(selector)
          return selector({ current: 'session-1', byId: {} })
        },
      }
      try {
        const tree = section.component(props)
        check('the component renders', tree !== undefined && tree !== null)
      } catch (error) {
        check('the component renders', false, String(error && error.message ? error.message : error))
      }
      check('read the current session through the hook', hookCalls.length === 1, `${hookCalls.length} call(s)`)
      if (hookCalls.length > 0) {
        check(
          'the selector resolves the session id',
          hookCalls[0]({ current: 'session-1' }) === 'session-1',
          String(hookCalls[0]({ current: 'session-1' })),
        )
        check('the selector tolerates a null snapshot', hookCalls[0](null) === '')
      }
      await new Promise((resolve) => setTimeout(resolve, 30))
      check('the panel called the host on mount', calls.rpc.length > 0, `${calls.rpc.length} call(s)`)
      if (calls.rpc.length > 0) {
        const first = calls.rpc[0]
        check('call went to the /api channel', first.channel === '/api', String(first.channel))
        check('call addressed a skill-hub endpoint', /^skill-hub\//.test(String(first.method)), String(first.method))
        check(
          'the call carried the viewed session',
          first.payload.sessionId === 'session-1',
          JSON.stringify(first.payload),
        )
      }
      // A second render must not reach for a hook outside render: calling the
      // callback again (as a click does) may not add hook calls.
      if (hookCalls.length === 1) {
        try {
          section.component(props)
          check('a second render keeps the hook order', hookCalls.length === 2, `${hookCalls.length} call(s)`)
        } catch (error) {
          check('a second render keeps the hook order', false, String(error && error.message ? error.message : error))
        }
      }
    }
  }
}

console.log(failures === 0 ? '\nall checks passed' : `\n${failures} check(s) failed`)
process.exit(failures === 0 ? 0 : 1)
