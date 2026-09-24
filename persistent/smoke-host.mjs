/**
 * Smoke-run the persistent host half against stub services.
 *
 * The point is to catch a throw inside `apply` BEFORE the plugin is loaded by
 * the real composition, where a failure would show up in the DSH logs and cost a
 * restart to diagnose. This does not test the panel — only that the module
 * mounts, registers its provider, wraps the registry, and serves a catalog.
 *
 * Usage: node smoke-host.mjs
 */

let failures = 0
function check(label, condition, detail) {
  if (condition) {
    console.log(`  ok   ${label}`)
    return
  }
  failures += 1
  console.log(`  FAIL ${label}${detail === undefined ? '' : ` — ${detail}`}`)
}

const mod = await import('./lib/index.js')

const literal = mod.parseFrontmatter('---\nname: example\ndescription: |\n  First line.\n  Second line.\nlicense: MIT\n---\n# Content')
check('literal descriptions are text, not a pipe', literal?.data.description === 'First line.\nSecond line.\n')
check('block descriptions preserve subsequent fields and body', literal?.data.license === 'MIT' && literal?.body === '# Content')
const folded = mod.parseFrontmatter('---\r\nname: example\r\ndescription: >-\r\n  First line.\r\n  Second line.\r\n---\r\nBody')
check('folded descriptions handle CRLF and strip chomping', folded?.data.description === 'First line. Second line.')

/* ------------------------------------------------------------------- stubs */

const calls = { providers: 0, handlers: [], disposers: [], injected: [], routes: [], effects: 0 }

const skillsStub = {
  snapshot: async () => ({
    skills: [
      { name: 'alpha', description: 'a', invocation: { modelInvocable: true, userInvocable: true } },
      { name: 'beta', description: 'b', invocation: { modelInvocable: true, userInvocable: true } },
    ],
    complete: true,
  }),
  list: async () => (await skillsStub.snapshot()).skills,
  get: async (name) => ({ name, description: 'x', content: 'body', invocation: {} }),
  invalidateCache: () => {},
  registerProvider: (factory) => {
    calls.providers += 1
    const provider = factory({ invalidate: () => {} })
    calls.provider = provider
    if (provider === null || typeof provider.name !== 'string' || typeof provider.list !== 'function') {
      throw new Error('registerProvider factory did not return a provider')
    }
    return () => {}
  },
}

/** The Host connection service; only `fetch.register` is used by this plugin. */
const connectionStub = {
  fetch: {
    register: (route) => {
      calls.routes.push(route)
      return () => {}
    },
  },
}

const makeEffect = (callback) => {
  if (typeof callback !== 'function') throw new Error('ctx.effect expects a callback')
  calls.effects += 1
  const disposer = callback()
  return typeof disposer === 'function' ? disposer : () => {}
}

const ctxStub = {
  skills: skillsStub,
  logger: { info: () => {}, warn: (line) => console.log(`       [warn] ${line}`) },
  get: (name) => (name === 'workspaceRegistry' ? { list: () => [] } : undefined),
  on: (event, listener) => {
    calls.handlers.push(event)
    calls.disposers.push(listener)
    return () => {}
  },
  effect: makeEffect,
  /**
   * Cordis' late-injection helper. `apply` uses it to wait for the Host
   * `connection` service, so the stub hands back a context carrying it.
   */
  inject: (dependencies, callback) => {
    calls.injected.push(dependencies.join(','))
    if (dependencies.includes('connection')) {
      callback({ connection: connectionStub, effect: makeEffect })
    }
    return () => {}
  },
}

/* -------------------------------------------------------------- run apply */

console.log('persistent host half')
try {
  const plugin = mod
  check('declares inject [skills]', JSON.stringify(plugin.inject) === '["skills"]', JSON.stringify(plugin.inject))
  check('exports apply', typeof plugin.apply === 'function')
  plugin.apply(ctxStub)
  check('applied without throwing', true)
} catch (error) {
  check('applied without throwing', false, `${error?.message ?? String(error)}`)
}

check('registered one provider', calls.providers === 1, `got ${calls.providers}`)
check('subscribed to dispose', calls.handlers.includes('dispose'), calls.handlers.join(', '))

/* ---------------------------------------------------- exercise the surface */

if (calls.provider !== undefined) {
  try {
    const listed = await calls.provider.list()
    check('provider.list() returns an array', Array.isArray(listed), typeof listed)
    console.log(`       provider published ${listed.length} skill(s) from the configured repository`)
    if (listed.length > 0) {
      const first = listed[0]
      check('candidate carries lossless JSON only', (() => {
        try {
          JSON.parse(JSON.stringify(first))
          return true
        } catch {
          return false
        }
      })())
      check('candidate has a rank', typeof first.rank === 'number', String(first.rank))
      const loaded = await calls.provider.get({ name: first.name })
      check('provider.get() loads a definition', loaded !== undefined && typeof loaded.content === 'string')
    }
  } catch (error) {
    check('provider surface runs', false, `${error?.message ?? String(error)}`)
  }
}

try {
  const snap = await skillsStub.snapshot({})
  check('wrapped snapshot still returns skills', Array.isArray(snap.skills), typeof snap.skills)
  check('wrapped snapshot keeps complete', typeof snap.complete === 'boolean')
} catch (error) {
  check('wrapped snapshot runs', false, `${error?.message ?? String(error)}`)
}

/* ------------------------------------------------------ browser rpc surface */

check('waited for the connection service', calls.injected.includes('connection'), calls.injected.join(', ') || '(none)')
check('registered 4 routes', calls.routes.length === 4, `got ${calls.routes.length}`)

const expectedPaths = ['state', 'flip', 'flip-all', 'repo'].map((endpoint) => `/api/skill-hub/${endpoint}`)
const seenPaths = calls.routes.map((route) => route.path)
check(
  'routes cover every endpoint',
  expectedPaths.every((path) => seenPaths.includes(path)),
  seenPaths.join(', '),
)
check(
  'routes are buffered POSTs',
  calls.routes.every((route) => route.methods.join() === 'POST' && route.requestBody === 'buffered'),
  calls.routes.map((route) => `${route.methods.join('/')}:${route.requestBody}`).join(', '),
)

/** Post one RPC envelope at a registered route, exactly as the browser would. */
const rpcCall = async (endpoint, envelope, headers = { 'content-type': 'application/json' }) => {
  const route = calls.routes.find((candidate) => candidate.path === `/api/skill-hub/${endpoint}`)
  if (route === undefined) throw new Error(`no route for ${endpoint}`)
  const body = typeof envelope === 'string' ? envelope : JSON.stringify(envelope)
  /* `Request` only accepts an absolute URL; the loader hands routes a real one. */
  return route.fetch(new Request(`http://127.0.0.1${route.path}`, { method: 'POST', headers, body }))
}

try {
  const response = await rpcCall('state', { type: 'client-request', rpcId: 'r1', method: 'skill-hub/state', payload: {} })
  check('state answers 200', response.status === 200, `got ${response.status}`)
  const body = await response.json()
  check('response is a server-response envelope', body.type === 'server-response' && body.rpcId === 'r1', JSON.stringify(body).slice(0, 120))
  check('result is ok', body.result?.ok === true, JSON.stringify(body.result?.error ?? null))
  const value = body.result?.value ?? {}
  check('panel state carries rows', Array.isArray(value.rows), typeof value.rows)
  check('panel state carries the scope list', Array.isArray(value.scopes), typeof value.scopes)
  check('panel state reports the repository', typeof value.repo === 'string' && value.repo !== '', String(value.repo))
  check(
    'every row is enabled-flag + source metadata',
    value.rows.every((row) => typeof row.name === 'string' && typeof row.enabled === 'boolean' && typeof row.series === 'string'),
    JSON.stringify(value.rows[0] ?? null),
  )
  console.log(`       panel state: ${value.total} skill(s), ${value.offCount} off, repo ${value.repo}`)
} catch (error) {
  check('state round-trips through the envelope', false, `${error?.message ?? String(error)}`)
}

try {
  const wrongType = await rpcCall('state', { type: 'client-request', rpcId: 'r2', method: 'skill-hub/state' }, { 'content-type': 'text/plain' })
  check('non-JSON content type is refused', wrongType.status === 415, `got ${wrongType.status}`)
  const badJson = await rpcCall('state', '{not json')
  check('malformed JSON is refused', badJson.status === 400, `got ${badJson.status}`)
  const badMethod = await rpcCall('state', { type: 'client-request', rpcId: 'r3', method: 'skill-hub/flip', payload: {} })
  check('mismatched envelope method is refused', badMethod.status === 400, `got ${badMethod.status}`)
} catch (error) {
  check('refusal paths run', false, `${error?.message ?? String(error)}`)
}

/* --------------------------------------------------------------- teardown */

for (const dispose of calls.disposers) {
  try {
    dispose()
  } catch (error) {
    check('disposer runs clean', false, `${error?.message ?? String(error)}`)
  }
}
check('disposers ran', true)

console.log(failures === 0 ? '\nall checks passed' : `\n${failures} check(s) failed`)
process.exit(failures === 0 ? 0 : 1)
