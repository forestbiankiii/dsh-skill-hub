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

import { readFileSync, writeFileSync } from 'node:fs'
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
      check(
        'repository links have the light-blue GitHub treatment',
        tag.textContent.includes('.hub-github-icon') && tag.textContent.includes('#79c0ff'),
      )
    }
    check(
      'bundle renders a native external GitHub link',
      bundle.includes("createElement('a'") && bundle.includes('hub-github-icon') && bundle.includes('noreferrer noopener'),
    )

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

// Exercise the populated list, not just Hub's loading state. The same rendered
// tree can be written to an HTML fixture for a real-browser layout check.
const source = readFileSync(join(ROOT, 'src', 'client.js'), 'utf8').replace(/^export /gm, '')
let expanded = false
const page = new Function('createElement', 'useState', source + '\nreturn { PageSkills, css }')(
  reactStub.createElement,
  (initial) => [initial && typeof initial === 'object' ? { 'series:ponytail': expanded } : initial, () => {}],
)
const row = (name, description, series = name, url = '', upstream = '') => ({
  name, description, series, url, upstream, note: url ? '' : '本地自制，没有上游仓库', whenToUse: '', enabled: true,
})
const sample = {
  rows: [
    row('cinema-dna-21x9x3', '将人物、空间、产品、建筑、历史、神话或一句简单故事，转译为真人实景电影感的 21:9 单帧、三联镜头或九镜故事板。'.repeat(4), 'cinema-dna-21x9x3', 'https://github.com/dacnay816y62-hub/cinema-dna-21x9x3', 'dacnay816y62-hub/cinema-dna-21x9x3'),
    row('humanizer', 'Rewrite AI-sounding text so it reads like the writer without changing what it says.', 'humanizer', 'https://github.com/blader/humanizer', 'blader/humanizer'),
    row('karpathy-guidelines', 'Behavioral guidelines to reduce common LLM coding mistakes.', 'andrej-karpathy-skills', 'https://github.com/forrestchang/andrej-karpathy-skills', 'forrestchang/andrej-karpathy-skills'),
    row('ponytail', 'The simplest solution that works.', 'ponytail', 'https://github.com/dietrichEbert/ponytail', 'dietrichEbert/ponytail'),
    row('ponytail-review', 'Review code for unnecessary complexity.', 'ponytail', 'https://github.com/dietrichEbert/ponytail', 'dietrichEbert/ponytail'),
    row('powershell-safe-invocation', 'PowerShell 安全调用规约：避免嵌套 pwsh，优先原生命令。'),
  ], scopes: [], active: '', total: 6, offCount: 0, inherited: false,
}
const renderList = () => page.PageSkills({ data: sample, scope: '', setScope() {}, setData() {}, reload() {} })
const nodes = (tree) => tree == null || typeof tree !== 'object' ? []
  : Array.isArray(tree) ? tree.flatMap(nodes) : [tree, ...nodes(tree.children)]
const hasClass = (node, name) => node.props?.className?.split(' ').includes(name)
const tree = renderList()
const all = nodes(tree)
const cards = all.filter((node) => hasClass(node, 'hub-group'))
check('populated list groups multiple skills into one card', cards.length === 5)
check('single card title is skill name, not the upstream repo name', all.some((node) => hasClass(node, 'hub-series') && node.children.includes('karpathy-guidelines')))
check('every header keeps title and switch separate from metadata', all.filter((node) => hasClass(node, 'hub-head')).every((head) => head.children[1]?.props?.role === 'switch' && hasClass(head.children[2], 'hub-meta')))
check('single descriptions have a shared padded container', all.filter((node) => hasClass(node, 'hub-single-body')).length === 4)
check('long description has a native expand/collapse control', all.some((node) => node.type === 'details'))
check('repo links live in metadata and retain an accessible icon', all.filter((node) => hasClass(node, 'hub-meta')).every((meta) => nodes(meta).filter((node) => node.type === 'a').every((a) => a.props.target === '_blank' && nodes(a).some((n) => n.type === 'svg'))))
const closedPanel = all.find((node) => hasClass(node, 't-acc-panel'))
check('collapsed panel stays mounted but is inert and hidden from accessibility', closedPanel?.props.inert === '' && closedPanel?.props['aria-hidden'] === true && nodes(closedPanel).filter((node) => hasClass(node, 'hub-item')).length === 2)
check('collapsed series exposes the animation state', all.some((node) => hasClass(node, 't-acc') && node.props['data-open'] === 'false'))
expanded = true
const openTree = renderList()
const opened = nodes(openTree)
check('expanded series renders each skill with its own switch and description', opened.filter((node) => hasClass(node, 'hub-item')).length === 2)
check('expanded panel restores interaction', opened.find((node) => hasClass(node, 't-acc-panel'))?.props.inert === undefined && opened.some((node) => hasClass(node, 't-acc') && node.props['data-open'] === 'true'))
check('animation includes reduced-motion guard and intrinsic description height', page.css.includes('prefers-reduced-motion: reduce') && page.css.includes('interpolate-size:allow-keywords') && page.css.includes('grid-template-rows: 0fr'))

const preview = process.argv.indexOf('--preview')
if (preview !== -1) {
  const escape = (text) => String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;')
  const html = (node) => node == null || node === false ? '' : Array.isArray(node) ? node.map(html).join('')
    : typeof node !== 'object' ? escape(node)
    : '<' + node.type + Object.entries(node.props ?? {}).filter(([key, value]) => !['key', 'style', 'children'].includes(key) && !key.startsWith('on') && value != null && !(value === false && ['disabled', 'open', 'checked'].includes(key))).map(([key, value]) => ' ' + (key === 'className' ? 'class' : key) + '="' + escape(value) + '"').join('') + '>' + html(node.children) + (['input', 'path'].includes(node.type) ? (node.type === 'path' ? '</path>' : '') : '</' + node.type + '>')
  writeFileSync(process.argv[preview + 1], '<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><style>body{margin:0;background:#292929;color:#eee;font-family:Arial,sans-serif}.hub{max-width:780px;margin:24px auto}*{box-sizing:border-box}' + page.css + '</style><main class="hub">' + html(openTree) + '</main>')
}

console.log(failures === 0 ? '\nall checks passed' : `\n${failures} check(s) failed`)
process.exit(failures === 0 ? 0 : 1)
