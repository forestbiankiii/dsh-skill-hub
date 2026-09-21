/**
 * dsh-skill-hub — persistent Host half.
 *
 * The same job the dynamic Package's host half did, running as an ordinary
 * plugin in the DSH host process. Three things get simpler, because this half
 * is not sandboxed:
 *
 *   - `node:os` and `node:fs` are available, so the home directory, the
 *     repository and the settings document are read directly instead of through
 *     `directoryPickerController` and `ctx.fs`;
 *   - the code is read from this file rather than pasted into a tool call, so
 *     editing it and reloading is the whole workflow;
 *   - `setInterval` exists, so the poll needs no timer service.
 *
 * What does NOT change is the mechanism that matters. `ctx.skills` is wrapped so
 * a disabled skill leaves the model catalog, the `skill` tool and the
 * user-invocation path at once, and a rank-450 provider publishes the shared
 * repository into the registry's global layer.
 *
 * Settings are read straight from `$DSH_HOME/settings.yaml` under the `skill-hub`
 * key. That file is the same one the panel writes, so the two halves agree
 * without sharing a live object — which a plugin reload would break anyway.
 */

import { readFile, readdir, stat, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'

/** The shared skill repository, home-relative so another machine resolves its own. */
const DEFAULT_REPO = '~/.agents/skills'

/** The namespace this plugin owns in the DSH settings document. */
const SETTINGS_NS = 'skill-hub'

/** The repository's install ledger, one level above the repository. */
const LOCK_NAME = '.skill-lock.json'

/** Kebab-case, exactly as the registry validates skill names. */
const NAME_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

/**
 * Provider rank inside the registry's global layer. DSH's own roots are
 * 100 project-dsh / 200 project-agents / 300 custom / 400 user-dsh /
 * 500 user-agents / 600 bundled, so this sits between `user-dsh` and
 * `user-agents`: it outranks nothing it should not, and once `skill-filesystem`
 * serves the same directory the filesystem entry wins outright.
 */
const PROVIDER_NAME = 'agents-repo'
const PROVIDER_RANK = 450

/** How often the repository and the settings document are re-read. */
const POLL_MS = 5000

export const inject = ['skills']

/** The settings document path. */
function settingsDocument() {
  const home = process.env.DSH_HOME ?? join(homedir(), '.dsh')
  return join(home, 'settings.yaml')
}

/** Expand a leading `~`, the spelling the settings document stores. */
function expandHome(value) {
  const text = String(value ?? '').trim()
  if (text === '') return join(homedir(), '.agents', 'skills')
  if (text === '~') return homedir()
  if (text.startsWith('~/') || text.startsWith('~\\')) return join(homedir(), text.slice(2))
  return text
}

/** Strip a leading home prefix so the stored value stays portable. */
function contractHome(value) {
  const home = homedir()
  const text = String(value ?? '')
  if (text === home) return '~'
  if (text.startsWith(`${home}\\`) || text.startsWith(`${home}/`)) {
    return `~/${text.slice(home.length + 1).replaceAll('\\', '/')}`
  }
  return text
}

/** Undo JSON quoting, which is how every scalar in the document is written. */
function unquote(value) {
  const text = String(value ?? '').trim()
  if (text.length >= 2) {
    const first = text.charAt(0)
    const last = text.charAt(text.length - 1)
    if ((first === '"' && last === '"') || (first === "'" && last === "'")) {
      return text.slice(1, text.length - 1)
    }
  }
  return text
}

/**
 * Read the `skill-hub:` block: `repo`, `disabled`, and one `workspaces` entry per
 * configured workspace. This is a targeted reader, not a YAML parser — it knows
 * the shape this plugin writes, and leaves every other section untouched.
 */
function readSection(text) {
  const out = { repo: DEFAULT_REPO, disabled: [], workspaces: {} }
  const lines = text.split('\n')
  let inside = false
  let where = ''
  let key = ''
  for (const line of lines) {
    if (/^[^\s#]/.test(line)) {
      inside = line.startsWith(`${SETTINGS_NS}:`)
      where = ''
      key = ''
      continue
    }
    if (!inside) continue
    if (line.trim() === '' || line.trim().startsWith('#')) continue
    const indent = line.length - line.trimStart().length
    const body = line.trim()
    if (indent === 2) {
      where = ''
      key = ''
      if (body.startsWith('repo:')) {
        out.repo = unquote(body.slice(5)) || DEFAULT_REPO
      } else if (body.startsWith('disabled:')) {
        where = 'disabled'
      } else if (body.startsWith('workspaces:')) {
        where = 'workspaces'
      }
      continue
    }
    if (where === 'disabled' && indent >= 4 && body.startsWith('- ')) {
      out.disabled.push(unquote(body.slice(2)))
      continue
    }
    if (where === 'workspaces' && indent === 4 && body.endsWith(':')) {
      key = unquote(body.slice(0, -1))
      out.workspaces[key] = { disabled: [] }
      continue
    }
    if (where === 'workspaces' && key !== '' && indent >= 6 && body.startsWith('- ')) {
      out.workspaces[key].disabled.push(unquote(body.slice(2)))
    }
  }
  return out
}

/** Parse the flat `key: value` frontmatter a SKILL.md carries. */
function parseFrontmatter(raw) {
  let text = raw
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1)
  if (text.slice(0, 3) !== '---') return null
  const firstBreak = text.indexOf('\n')
  if (firstBreak < 0) return null
  const lines = text.slice(firstBreak + 1).split('\n')
  const data = {}
  const body = []
  let closed = false
  for (const line of lines) {
    const bare = line.replace(/\r$/, '')
    if (closed) {
      body.push(bare)
      continue
    }
    if (bare.trim() === '---') {
      closed = true
      continue
    }
    if (/^\s/.test(bare)) continue
    const colon = bare.indexOf(':')
    if (colon <= 0) continue
    const key = bare.slice(0, colon).trim()
    const value = bare.slice(colon + 1).trim()
    if (key !== '' && value !== '') data[key] = value
  }
  if (!closed) return null
  return { data, body: body.join('\n') }
}

/**
 * @param {object} ctx - the Host context this plugin is mounted in.
 */
export function apply(ctx) {
  const skills = ctx.skills
  const definitions = []
  const sources = new Map()

  let repo = DEFAULT_REPO
  let signature
  let lockSignature
  let lockLedger = null
  let scanning
  let documentSignature
  let poll

  const homedirPath = homedir()

  /* ----------------------------------------------------------- settings IO */

  /**
   * Read the settings document when it moved, and adopt what it says. Returns
   * whether anything changed, so callers can decide to republish the catalog.
   */
  const reload = async function () {
    let text = ''
    let info
    try {
      info = await stat(settingsDocument())
      text = await readFile(settingsDocument(), 'utf8')
    } catch {
      return false
    }
    const nextSignature = String(info.mtimeMs)
    if (nextSignature === documentSignature) return false
    documentSignature = nextSignature
    const settings = readSection(text)
    lastSettings = settings
    const changedRepo = settings.repo !== repo
    repo = settings.repo
    if (changedRepo) {
      definitions.length = 0
      sources.clear()
      signature = undefined
      lockSignature = undefined
      lockLedger = null
    }
    invalidate()
    return true
  }

  /* ------------------------------------------------------- repository scan */

  const listDirectory = async function (dir) {
    try {
      return await readdir(dir, { withFileTypes: true })
    } catch {
      return []
    }
  }

  /**
   * The ledger sits beside the repository, not inside it, so the parent
   * directory is searched too. The parsed map is cached by mtime and handed back
   * on every later read, because the caller clears its per-skill source table.
   */
  const readLock = async function (root, parent) {
    let file
    for (const entry of await listDirectory(root)) {
      if (entry.isFile() && entry.name === LOCK_NAME) file = join(root, entry.name)
    }
    if (file === undefined && parent !== undefined) {
      for (const entry of await listDirectory(parent)) {
        if (entry.isFile() && entry.name === LOCK_NAME) file = join(parent, entry.name)
      }
    }
    if (file === undefined) {
      lockSignature = undefined
      lockLedger = null
      return null
    }
    let info
    try {
      info = await stat(file)
    } catch {
      return lockLedger
    }
    const next = String(info.mtimeMs)
    if (next === lockSignature) return lockLedger
    lockSignature = next
    let parsed
    try {
      parsed = JSON.parse(await readFile(file, 'utf8'))
    } catch (error) {
      ctx.logger?.warn?.(`skill-hub: ${LOCK_NAME} is not valid JSON: ${String(error)}`)
      lockLedger = null
      return null
    }
    const found = new Map()
    const rows = Array.isArray(parsed?.skills) ? parsed.skills : []
    for (const row of rows) {
      if (row === null || typeof row !== 'object') continue
      const name = String(row.name ?? '')
      if (name === '') continue
      found.set(name, { type: String(row.type ?? ''), repo: String(row.repo ?? '') })
    }
    lockLedger = found
    return found
  }

  const sourceOf = function (name, ledger) {
    const row = ledger === null ? undefined : ledger.get(name)
    if (row === undefined) {
      return { series: name, upstream: '', url: '', note: `来源不明：不在 ${LOCK_NAME} 里` }
    }
    if (row.type === 'github' && row.repo !== '') {
      const series = row.repo.split('/')[1] ?? row.repo
      return { series, upstream: row.repo, url: `https://github.com/${row.repo}`, note: '' }
    }
    if (row.type === 'well-known') {
      return { series: name, upstream: '', url: '', note: '来自远端 well-known 索引，没有 GitHub 仓库' }
    }
    return { series: name, upstream: '', url: '', note: '本地自制，没有上游仓库' }
  }

  const parseSkill = function (raw) {
    const parsed = parseFrontmatter(raw)
    if (parsed === null) return null
    const name = unquote(parsed.data.name)
    const description = unquote(parsed.data.description)
    if (name === '' || description === '' || !NAME_PATTERN.test(name)) return null
    const modelFlag = parsed.data.modelInvocable
    const userFlag = parsed.data.userInvocable
    return {
      name,
      description,
      whenToUse: parsed.data.whenToUse === undefined ? '' : unquote(parsed.data.whenToUse),
      modelInvocable: modelFlag === undefined || unquote(modelFlag).toLowerCase() !== 'false',
      userInvocable: userFlag === undefined || unquote(userFlag).toLowerCase() !== 'false',
      content: parsed.body.trim(),
    }
  }

  /** Every skill file in the repository, as a locator plus a readiness mark. */
  const collect = async function () {
    const root = expandHome(repo)
    const found = []
    const marks = []
    for (const entry of await listDirectory(root)) {
      const path = join(root, entry.name)
      if (entry.isDirectory()) {
        for (const inner of await listDirectory(path)) {
          if (!inner.isFile() || inner.name !== 'SKILL.md') continue
          found.push({ path: join(path, inner.name), base: path })
          try {
            marks.push(`${entry.name}:${String((await stat(join(path, inner.name))).mtimeMs)}`)
          } catch {
            marks.push(`${entry.name}:?`)
          }
        }
        continue
      }
      if (!entry.isFile() || !entry.name.toLowerCase().endsWith('.md')) continue
      if (entry.name === LOCK_NAME) continue
      found.push({ path, base: root })
      try {
        marks.push(`${entry.name}:${String((await stat(path)).mtimeMs)}`)
      } catch {
        marks.push(`${entry.name}:?`)
      }
    }
    return { found, marks: marks.join('|') }
  }

  const scan = async function () {
    await reload()
    const { found, marks } = await collect()
    if (marks === signature) return
    signature = marks
    const ledger = await readLock(expandHome(repo), join(expandHome(repo), '..'))
    const built = []
    for (const item of found) {
      let raw
      try {
        raw = await readFile(item.path, 'utf8')
      } catch {
        continue
      }
      const skill = parseSkill(raw)
      if (skill === null) continue
      if (built.some((existing) => existing.name === skill.name)) continue
      skill.base = item.base
      built.push(skill)
      sources.set(skill.name, sourceOf(skill.name, ledger))
    }
    definitions.length = 0
    definitions.push(...built)
    invalidate()
  }

  const ensure = function () {
    scanning ??= scan()
      .catch((error) => {
        ctx.logger?.warn?.(`skill-hub: repository scan failed: ${String(error)}`)
      })
      .finally(() => {
        scanning = undefined
      })
    return scanning
  }

  /* ------------------------------------------------------------ enforcement */

  let invalidate = function () {}

  const originalSnapshot = skills.snapshot.bind(skills)
  const originalGet = skills.get.bind(skills)
  const originalList = skills.list.bind(skills)

  /**
   * The registry asks for a catalog per viewing scope, and `options.scope` is the
   * agent doing the asking. That is the hook that makes the switch set
   * per-workspace: the disable list is hoisted from the settings document for
   * exactly this agent's workspace, so the research workspace sees research
   * skills while the coding workspace sees coding ones.
   */
  /** The most recent document read, which the per-scope sets are derived from. */
  let lastSettings = { repo: DEFAULT_REPO, disabled: [], workspaces: {} }

  const scopeOfAgent = function (scope) {
    const registry = ctx.get('workspaceRegistry')
    const sessionId = String(scope?.session?.id ?? scope?.sessionId ?? '')
    if (registry === undefined) return null
    let workspaces
    try {
      workspaces = registry.list()
    } catch {
      return null
    }
    for (const workspace of workspaces) {
      const ids = workspace.sessionIds ?? []
      for (const id of ids) {
        if (String(id) === sessionId) return String(workspace.path ?? '')
      }
    }
    return null
  }

  /** Disable set for one workspace key, derived from the last document read. */
  const disabledFor = function (key) {
    const settings = lastSettings ?? { disabled: [], workspaces: {} }
    const own = key === null ? undefined : settings.workspaces[key]
    const list = Array.isArray(own?.disabled) ? own.disabled : settings.disabled
    return new Set(list)
  }

  skills.snapshot = async function (options) {
    const snapshot = await originalSnapshot(options)
    const set = disabledFor(scopeOfAgent(options?.scope))
    return {
      skills: (snapshot.skills ?? []).filter((skill) => !set.has(skill.name)),
      complete: snapshot.complete,
    }
  }
  skills.list = async function (options) {
    return (await skills.snapshot(options)).skills
  }
  skills.get = async function (name, options) {
    const set = disabledFor(scopeOfAgent(options?.scope))
    if (set.has(name)) return undefined
    return originalGet(name, options)
  }

  /* ---------------------------------------------------------------- wiring */

  ctx.skills.registerProvider((control) => {
    invalidate = () => control.invalidate()
    void ensure()
    return {
      name: PROVIDER_NAME,
      async list() {
        await ensure()
        return definitions.map((definition) => {
          const source = sources.get(definition.name)
          return {
            name: definition.name,
            description: definition.description,
            ...(definition.whenToUse !== '' ? { whenToUse: definition.whenToUse } : {}),
            invocation: {
              modelInvocable: definition.modelInvocable,
              userInvocable: definition.userInvocable,
            },
            source: 'user-agents',
            provider: PROVIDER_NAME,
            rank: PROVIDER_RANK,
            locator: definition.name,
            path: join(expandHome(repo), definition.name, 'SKILL.md'),
            resourceBase: { kind: 'directory', path: definition.base ?? expandHome(repo) },
            ...(source === undefined ? {} : {
              metadata: {
                series: source.series,
                upstream: source.upstream,
                url: source.url,
                note: source.note,
              },
            }),
          }
        })
      },
      async get(candidate) {
        const definition = definitions.find((entry) => entry.name === candidate.name)
        if (definition === undefined) return undefined
        return {
          name: definition.name,
          description: definition.description,
          ...(definition.whenToUse !== '' ? { whenToUse: definition.whenToUse } : {}),
          invocation: {
            modelInvocable: definition.modelInvocable,
            userInvocable: definition.userInvocable,
          },
          source: 'user-agents',
          provider: PROVIDER_NAME,
          path: join(expandHome(repo), definition.name, 'SKILL.md'),
          resourceBase: { kind: 'directory', path: definition.base ?? expandHome(repo) },
          content: definition.content,
        }
      },
    }
  })

  /* --------------------------------------------------------- panel (RPC) */

  /**
   * The workspaces a session could switch between, for the scope selector.
   * Paths are the settings keys, so they are what the client sends back.
   */
  const listWorkspaces = function () {
    const registry = ctx.get('workspaceRegistry')
    if (registry === undefined) return []
    let all
    try {
      all = registry.list()
    } catch {
      return []
    }
    const out = []
    for (const workspace of all) {
      const key = String(workspace.path ?? '')
      if (key === '') continue
      const title = String(workspace.title ?? '')
      out.push({ key, title: title === '' ? key : title })
    }
    return out
  }

  /** The workspace key a session belongs to, or '' when it belongs to none. */
  const scopeOfSession = function (sessionId) {
    const registry = ctx.get('workspaceRegistry')
    if (registry === undefined || typeof sessionId !== 'string' || sessionId === '') return ''
    let all
    try {
      all = registry.list()
    } catch {
      return ''
    }
    for (const workspace of all) {
      for (const id of workspace.sessionIds ?? []) {
        if (String(id) === sessionId) return String(workspace.path ?? '')
      }
    }
    return ''
  }

  /** One panel row: what the list shows, and whether it is switched on. */
  const rowFor = function (definition, disabledNow) {
    const source = sources.get(definition.name)
    return {
      name: definition.name,
      description: definition.description,
      whenToUse: definition.whenToUse ?? '',
      series: source?.series ?? definition.name,
      upstream: source?.upstream ?? '',
      url: source?.url ?? '',
      note: source?.note ?? '',
      enabled: !disabledNow.has(definition.name),
    }
  }

  /** The disable list that applies to one scope key, falling back to global. */
  const disabledForScope = function (key) {
    const settings = lastSettings ?? { disabled: [], workspaces: {} }
    if (key === '') return new Set(settings.disabled ?? [])
    const own = settings.workspaces?.[key]
    const list = Array.isArray(own?.disabled) ? own.disabled : (settings.disabled ?? [])
    return new Set(list)
  }

  const panel = {
    async state(payload) {
      const requested = typeof payload?.workspace === 'string' ? payload.workspace : undefined
      const sessionScope = scopeOfSession(payload?.sessionId)
      const active = requested === undefined ? sessionScope : requested
      const disabledNow = disabledForScope(active)
      const scopes = listWorkspaces()
      const activeTitle = active === '' ? '全局' : (scopes.find((s) => s.key === active)?.title ?? active)
      const own = active === '' ? true : Array.isArray(lastSettings?.workspaces?.[active]?.disabled)
      const rows = definitions.map((definition) => rowFor(definition, disabledNow))
      rows.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))
      return {
        ok: true,
        value: {
          rows,
          total: rows.length,
          offCount: rows.filter((row) => !row.enabled).length,
          scopes,
          active,
          activeTitle,
          inherited: !own,
          repo,
          repoDefault: DEFAULT_REPO,
          repoStored: repo !== DEFAULT_REPO,
          repoLoaded: definitions.length,
          lockFile: LOCK_NAME,
        },
      }
    },

    async flip(payload) {
      const key = typeof payload?.workspace === 'string' ? payload.workspace : ''
      const names = Array.isArray(payload?.names) ? payload.names : []
      const enabled = payload?.enabled !== false
      const next = disabledForScope(key)
      for (const name of names) {
        if (typeof name !== 'string' || name === '') continue
        if (enabled) next.delete(name)
        else next.add(name)
      }
      await writeScope(key, [...next])
      return { ok: true, value: { offCount: next.size } }
    },

    async flipAll(payload) {
      const key = typeof payload?.workspace === 'string' ? payload.workspace : ''
      const enabled = payload?.enabled !== false
      const names = Array.isArray(payload?.names) ? payload.names : []
      const list = enabled ? [] : names.filter((name) => typeof name === 'string' && name !== '')
      await writeScope(key, list)
      return { ok: true, value: { offCount: list.length } }
    },

    async repo(payload) {
      const wanted = typeof payload?.repo === 'string' ? payload.repo.trim() : ''
      const target = wanted === '' ? DEFAULT_REPO : wanted
      if (wanted !== '') {
        try {
          await stat(expandHome(target))
        } catch {
          return { ok: false, error: { code: 'bad-path', message: `路径无法解析：${target}` } }
        }
      }
      const settings = lastSettings ?? { disabled: [], workspaces: {} }
      await writeSettingsSection({
        repo: target,
        disabled: settings.disabled ?? [],
        workspaces: settings.workspaces ?? {},
      })
      await ensure()
      return { ok: true, value: { repo: target, repoStored: target !== DEFAULT_REPO } }
    },
  }

  /** Replace one scope's disable list, leaving every other scope untouched. */
  const writeScope = async function (key, list) {
    const settings = lastSettings ?? { disabled: [], workspaces: {} }
    if (key === '') {
      await writeSettingsSection({
        repo: lastSettings?.repo ?? repo,
        disabled: list,
        workspaces: settings.workspaces ?? {},
      })
      return
    }
    const workspaces = { ...(settings.workspaces ?? {}) }
    workspaces[key] = { disabled: list }
    await writeSettingsSection({
      repo: lastSettings?.repo ?? repo,
      disabled: settings.disabled ?? [],
      workspaces,
    })
  }

  ctx.inject(['connection'], (connectionContext) => connectionContext.effect(
    () => registerTransport(connectionContext.connection, (endpoint, payload) => {
      const handler = panel[endpoint === 'flip-all' ? 'flipAll' : endpoint]
      if (typeof handler !== 'function') {
        return { ok: false, error: { code: 'unknown-endpoint', message: `unknown endpoint ${endpoint}` } }
      }
      return handler(payload)
    }),
    'skill-hub: panel rpc',
  ))

  poll = setInterval(() => {
    void ensure()
  }, POLL_MS)
  if (typeof poll.unref === 'function') poll.unref()

  ctx.on('dispose', () => {
    clearInterval(poll)
    skills.snapshot = originalSnapshot
    skills.list = originalList
    skills.get = originalGet
  })

  void (async () => {
    await ensure()
    ctx.logger?.info?.(
      `skill-hub: ${definitions.length} skills from ${contractHome(expandHome(repo))}`,
    )
  })()

  /* Exposed for the profile's own diagnostics; not part of the panel contract. */
  globalThis.__dshSkillHub = {
    repo: () => repo,
    disabled: () => (lastSettings.disabled ?? []).slice(),
    skills: () => definitions.map((definition) => definition.name),
  }
}

/* ------------------------------------------------------------- rpc transport */

/** The endpoints this plugin serves to its own browser half. */
export const PANEL_ENDPOINTS = Object.freeze(['state', 'flip', 'flip-all', 'repo'])

/**
 * Mount this plugin's endpoints on DSH's authenticated `/api` bridge.
 *
 * The client half calls `connection.rpc.call('/api', 'skill-hub/<endpoint>', payload)`,
 * which is an HTTP POST to `/api/skill-hub/<endpoint>`. That bridge already
 * applies the Host/Origin fence and browser authentication before a request
 * reaches a route, so this only has to speak the envelope:
 *
 *   in   { type: 'client-request', rpcId, method, payload }
 *   out  { type: 'server-response', rpcId, result }
 *
 * where `result` is `{ ok: true, value }` or `{ ok: false, error }` — the shape
 * the client's `rpc.call` unwraps.
 *
 * @param {object} connection - the Host `connection` service.
 * @param {(endpoint: string, payload: unknown) => Promise<object>} handler - endpoint dispatcher.
 * @returns {() => void} the disposer removing every route it registered.
 */
export function registerTransport(connection, handler) {
  const disposers = []
  try {
    for (const endpoint of PANEL_ENDPOINTS) {
      const method = `skill-hub/${endpoint}`
      disposers.push(connection.fetch.register({
        path: `/api/${method}`,
        methods: ['POST'],
        requestBody: 'buffered',
        async fetch(request) {
          const type = request.headers.get('content-type')?.split(';', 1)[0]?.trim().toLowerCase()
          if (type !== 'application/json') {
            return new Response('content type must be application/json', { status: 415 })
          }
          let body
          try {
            body = await request.json()
          } catch {
            return new Response('invalid JSON', { status: 400 })
          }
          if (body === null || typeof body !== 'object' || body.method !== method) {
            return new Response('invalid RPC envelope', { status: 400 })
          }
          let result
          try {
            result = await handler(endpoint, body.payload)
          } catch (error) {
            result = {
              ok: false,
              error: {
                code: 'internal',
                message: error instanceof Error ? error.message : String(error),
              },
            }
          }
          return Response.json({ type: 'server-response', rpcId: body.rpcId, result })
        },
      }))
    }
  } catch (error) {
    for (const dispose of disposers.reverse()) dispose()
    throw error
  }
  return () => {
    for (const dispose of disposers.reverse()) dispose()
  }
}

/** Kept for symmetry with the dynamic half's settings writer. */
export const writeSettingsSection = async function (section) {
  const path = settingsDocument()
  let text = ''
  try {
    text = await readFile(path, 'utf8')
  } catch {
    text = ''
  }
  const lines = text.split('\n')
  const kept = []
  let skipping = false
  for (const line of lines) {
    if (/^[^\s#]/.test(line)) skipping = line.startsWith(`${SETTINGS_NS}:`)
    if (!skipping) kept.push(line)
  }
  const body = [`${SETTINGS_NS}:`, `  repo: ${JSON.stringify(section.repo ?? DEFAULT_REPO)}`]
  const list = Array.isArray(section.disabled) ? section.disabled : []
  if (list.length === 0) body.push('  disabled: []')
  else {
    body.push('  disabled:')
    for (const name of list) body.push(`    - ${JSON.stringify(name)}`)
  }
  const workspaces = section.workspaces ?? {}
  const keys = Object.keys(workspaces)
  if (keys.length === 0) body.push('  workspaces: {}')
  else {
    body.push('  workspaces:')
    for (const key of keys) {
      const names = Array.isArray(workspaces[key]?.disabled) ? workspaces[key].disabled : []
      body.push(`    ${JSON.stringify(key)}:`)
      if (names.length === 0) body.push('      disabled: []')
      else {
        body.push('      disabled:')
        for (const name of names) body.push(`        - ${JSON.stringify(name)}`)
      }
    }
  }
  const head = kept.join('\n').trim() === '' ? '' : `${kept.join('\n').replace(/\s+$/, '')}\n`
  await writeFile(path, head + body.join('\n') + '\n', 'utf8')
}
