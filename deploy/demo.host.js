/**
 * dsh-skill-hub — demo host half.
 *
 * Two things this build adds over a flat list:
 *
 *   1. the disable set is PER WORKSPACE. A session resolves to the workspace
 *      that owns its directory, and only that workspace's set applies; a
 *      session with no workspace falls back to the global set. That is what
 *      makes "research workspace sees research skills, coding workspace sees
 *      coding skills" work.
 *   2. every skill carries its upstream source, read from the shared
 *      repository's `.skill-lock.json` — the GitHub repo it was installed from,
 *      or a plain statement of why it has none.
 *
 * The repository path is a user setting too: it resolves through `ctx.settings`
 * and persists to the DSH settings document.
 */

/** Used when the settings document carries no override. */
const DEFAULT_REPO = '~/.agents/skills'

/** The namespace this plugin owns in the DSH settings document. */
const SETTINGS_NS = 'skill-hub'

/** The repository's install ledger: skill name → where it came from. */
const LOCK_NAME = '.skill-lock.json'

/** Kebab-case, exactly as the registry validates skill names. */
const NAME = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

const inject = ['skills', 'settings', 'timer']

/**
 * A schemastery-shaped schema, built by hand.
 *
 * The sandbox withholds `require`, so `@deepseek-ai/schemastery` is not
 * reachable from a dynamic package. The settings service needs only three
 * things from a schema: it must be callable to resolve a value, it must carry
 * `toJSON()` for the configuration descriptor, and it must describe its
 * container shape (`type` plus `dict`) for secret redaction. That is the whole
 * contract this object satisfies.
 */
function makeSchema(defaults) {
  const asList = function (value) {
    const out = []
    if (!Array.isArray(value)) return out
    for (let i = 0; i < value.length; i += 1) {
      if (typeof value[i] === 'string' && value[i] !== '') out.push(value[i])
    }
    return out
  }
  const asWorkspaces = function (value) {
    const out = {}
    const raw = value !== null && typeof value === 'object' ? value : {}
    const keys = Object.keys(raw)
    for (let i = 0; i < keys.length; i += 1) {
      const entry = raw[keys[i]]
      out[keys[i]] = { disabled: asList(entry !== null && typeof entry === 'object' ? entry.disabled : undefined) }
    }
    return out
  }
  const schema = function (input) {
    const source = input !== null && typeof input === 'object' ? input : {}
    const raw = typeof source.repo === 'string' ? source.repo.trim() : ''
    return {
      repo: raw === '' ? defaults.repo : raw,
      disabled: asList(source.disabled),
      workspaces: asWorkspaces(source.workspaces),
    }
  }
  schema.type = 'object'
  schema.dict = {}
  schema.meta = { default: defaults }
  schema.toJSON = function () {
    return {
      type: 'object',
      properties: {
        repo: { type: 'string', default: defaults.repo },
        disabled: { type: 'array', items: { type: 'string' } },
        workspaces: { type: 'object' },
      },
      default: defaults,
    }
  }
  return schema
}

/**
 * @param {object} ctx - the guarded Cordis context a host half receives.
 */
export function apply(ctx) {
  const skills = ctx.skills
  const fs = ctx.get('fs')
  const settings = ctx.get('settings')
  const off = new Set()
  const meta = new Map()
  const sources = new Map()
  let defs = []
  let sig
  let pending
  let poke = function () {}

  let repo = DEFAULT_REPO
  let savedTarget
  let currentTarget
  let parentTarget
  let lockSignature
  let lockLedger = null

  const scope = settings === undefined
    ? undefined
    : settings.register(SETTINGS_NS, makeSchema({ repo: DEFAULT_REPO }))

  const str = function (value) { return typeof value === 'string' ? value : '' }

  const messageOf = function (error) {
    if (error !== null && typeof error === 'object' && typeof error.message === 'string') return error.message
    return String(error)
  }

  /**
   * Expand a leading `~`.
   *
   * The dynamic sandbox withholds `require`, `process` and `node:os`, so the
   * home directory cannot be read directly. `directoryPickerController` answers
   * with it — its listing carries `home` — and that service is the only mounted
   * seam that reports it.
   */
  const home = async function () {
    const picker = ctx.get('directoryPickerController')
    if (picker === undefined) return undefined
    try {
      const listing = await picker.list(undefined, undefined)
      return typeof listing.home === 'string' && listing.home !== '' ? listing.home : undefined
    } catch (error) {
      return undefined
    }
  }

  /** Resolve `~` and `~/…` against the host home directory. */
  const absolute = async function (path) {
    const text = str(path).trim()
    if (text !== '~' && !text.startsWith('~/') && !text.startsWith('~\\')) return text
    const base = await home()
    if (base === undefined) throw new Error('无法展开 ~：directoryPickerController 不可用，请填绝对路径')
    if (text === '~') return base
    return base.replace(/[\\/]+$/, '') + '\\' + text.slice(2).split(/[\\/]+/).join('\\')
  }

  /** The whole resolved settings value, or a bare default when unmounted. */
  const readScope = function () {
    const fallback = { repo: DEFAULT_REPO, disabled: [], workspaces: {} }
    if (scope === undefined) return fallback
    const value = scope.get()
    if (value === null || typeof value !== 'object') return fallback
    const stored = str(value.repo).trim()
    return {
      repo: stored === '' ? DEFAULT_REPO : stored,
      disabled: Array.isArray(value.disabled) ? value.disabled.slice() : [],
      workspaces: value.workspaces !== null && typeof value.workspaces === 'object' ? value.workspaces : {},
    }
  }

  /**
   * Persist by writing the settings document.
   *
   * `scope.update(patch)` cannot work from here. The settings service validates
   * its patch with `proto === Object.prototype`, and an object literal built in
   * this sandbox belongs to another realm, so its prototype is never the host's
   * `Object.prototype` — every write was refused with "must be a plain object".
   * The RPC boundary clones handler RESULTS into the host realm; arguments
   * handed INTO a service are passed through as they are.
   *
   * So the section is serialised and written through `ctx.fs`, which is the same
   * seam every other read here uses. The settings provider watches its document,
   * so the write republishes it and `scope.get()` picks the new value up on the
   * next read — the in-memory state stays consistent because it always reads.
   */
  const YAML_KEY = /^[A-Za-z0-9_-]+$/
  const yamlScalar = function (value) { return JSON.stringify(String(value)) }

  const documentPath = async function () {
    const homeDir = await home()
    if (homeDir === undefined) {
      throw new Error('找不到 home 目录，无法写入设置文件')
    }
    return homeDir.replace(/[\\/]+$/, '') + '\\.dsh\\settings.yaml'
  }

  /** The `skill-hub:` block, normalized so a rewrite never stacks duplicates. */
  const renderSection = function (value) {
    const lines = ['skill-hub:']
    lines.push('  repo: ' + yamlScalar(value.repo))
    const disabled = value.disabled
    if (disabled.length === 0) {
      lines.push('  disabled: []')
    } else {
      lines.push('  disabled:')
      for (let i = 0; i < disabled.length; i += 1) lines.push('    - ' + yamlScalar(disabled[i]))
    }
    const keys = Object.keys(value.workspaces)
    if (keys.length === 0) {
      lines.push('  workspaces: {}')
    } else {
      lines.push('  workspaces:')
      for (let i = 0; i < keys.length; i += 1) {
        const entry = value.workspaces[keys[i]]
        const list = Array.isArray(entry.disabled) ? entry.disabled : []
        lines.push('    ' + yamlScalar(keys[i]) + ':')
        if (list.length === 0) {
          lines.push('      disabled: []')
        } else {
          lines.push('      disabled:')
          for (let j = 0; j < list.length; j += 1) lines.push('        - ' + yamlScalar(list[j]))
        }
      }
    }
    return lines.join('\n') + '\n'
  }

  /** Strip the existing `skill-hub:` block, leaving every other section alone. */
  const stripSection = function (text) {
    const lines = text.split('\n')
    const kept = []
    let skipping = false
    for (let i = 0; i < lines.length; i += 1) {
      const line = lines[i]
      const isTopLevel = /^[^\s#]/.test(line)
      if (isTopLevel) skipping = line.indexOf('skill-hub:') === 0
      if (!skipping) kept.push(line)
    }
    return kept.join('\n').replace(/\n{3,}/g, '\n\n').replace(/^\n+/, '')
  }

  const persist = async function (patch) {
    if (scope === undefined) throw new Error('设置服务未挂载')
    const current = readScope()
    const next = {
      repo: patch.repo === undefined ? current.repo : patch.repo,
      disabled: patch.disabled === undefined ? current.disabled : patch.disabled,
      workspaces: patch.workspaces === undefined ? current.workspaces : patch.workspaces,
    }
    const path = await documentPath()
    const target = await fs.resolve(path)
    let text = ''
    try {
      text = await fs.readText(target)
    } catch (error) {
      text = ''
    }
    const kept = stripSection(text)
    const body = renderSection(next)
    const head = kept.trim() === '' ? '' : kept.replace(/\s+$/, '') + '\n'
    await fs.writeText(target, head + body)
  }

  repo = readScope().repo

  /** Drop everything derived from the previous repository path. */
  const adopt = function (next) {
    const changed = next !== repo
    repo = next
    if (!changed) return false
    defs = []
    meta.clear()
    sources.clear()
    sig = undefined
    lockSignature = undefined
    lockLedger = null
    pending = undefined
    savedTarget = undefined
    currentTarget = undefined
    parentTarget = undefined
    return true
  }

  const unquote = function (value) {
    const s = str(value).trim()
    if (s.length >= 2) {
      const a = s.charAt(0)
      const b = s.charAt(s.length - 1)
      if ((a === '"' && b === '"') || (a === "'" && b === "'")) return s.slice(1, s.length - 1)
    }
    return s
  }

  const remember = function (name, description, whenToUse) {
    meta.set(str(name), { description: str(description), whenToUse: str(whenToUse) })
  }

  /** A flat `key: value` frontmatter reader; null means DSH would refuse it too. */
  const parse = function (raw) {
    let s = raw
    if (s.charCodeAt(0) === 0xfeff) s = s.slice(1)
    if (s.slice(0, 3) !== '---') return null
    const brk = s.indexOf('\n')
    if (brk < 0) return null
    const lines = s.slice(brk + 1).split('\n')
    const data = {}
    const body = []
    let shut = false
    for (let i = 0; i < lines.length; i += 1) {
      const line = lines[i].replace(/\r$/, '')
      if (shut) { body.push(line); continue }
      if (line.trim() === '---') { shut = true; continue }
      if (/^\s/.test(line)) continue
      const c = line.indexOf(':')
      if (c <= 0) continue
      const k = line.slice(0, c).trim()
      const v = line.slice(c + 1).trim()
      if (k !== '' && v !== '') data[k] = v
    }
    if (!shut) return null
    const name = unquote(data.name)
    const description = unquote(data.description)
    if (name === '' || description === '' || !NAME.test(name)) return null
    const whenRaw = data.whenToUse !== undefined ? data.whenToUse : data['when-to-use']
    const when = whenRaw === undefined ? '' : unquote(whenRaw)
    remember(name, description, when)
    return {
      name: name,
      description: description,
      whenToUse: when,
      modelInvocable: data.modelInvocable === undefined || unquote(data.modelInvocable).toLowerCase() !== 'false',
      userInvocable: data.userInvocable === undefined || unquote(data.userInvocable).toLowerCase() !== 'false',
      content: body.join('\n').trim(),
    }
  }

  const entries = async function (dir) {
    try {
      const list = await fs.listDir(dir)
      return Array.isArray(list) ? list : []
    } catch (error) {
      return []
    }
  }

  /**
   * The repository root, plus the directory that holds it. The install ledger
   * lives BESIDE the repository (`<agents home>/.skill-lock.json` next to
   * `<agents home>/skills`), so the parent is resolved by trimming the last
   * segment off the display path.
   */
  const target = async function () {
    if (currentTarget !== undefined && savedTarget === repo) return currentTarget
    const resolved = await fs.resolve(await absolute(repo))
    savedTarget = repo
    currentTarget = resolved
    const display = str(resolved.displayPath).replace(/[\\/]+$/, '')
    const cut = Math.max(display.lastIndexOf('\\'), display.lastIndexOf('/'))
    parentTarget = undefined
    if (cut > 0) {
      try {
        parentTarget = await fs.resolve(display.slice(0, cut))
      } catch (error) {
        parentTarget = undefined
      }
    }
    return resolved
  }

  /**
   * Read the repository's install ledger: `.skill-lock.json` maps each skill
   * directory to the GitHub repo it came from, or marks it `local`.
   *
   * Two things this has to get right. The ledger sits beside the repository, not
   * inside it — `<agents home>/.skill-lock.json` next to `<agents home>/skills` —
   * so the parent directory is searched too. And the cache is keyed on the file's
   * version rather than "have I read it at all": the parsed map is what the
   * second and later scans replay, because the caller clears its per-skill source
   * table every time.
   */
  const readLock = async function (root, parent) {
    let file
    const here = await entries(root)
    for (let i = 0; i < here.length; i += 1) {
      if (here[i].type === 'file' && here[i].name === LOCK_NAME) file = here[i]
    }
    if (file === undefined && parent !== undefined) {
      const above = await entries(parent)
      for (let i = 0; i < above.length; i += 1) {
        if (above[i].type === 'file' && above[i].name === LOCK_NAME) file = above[i]
      }
    }
    if (file === undefined) {
      lockSignature = undefined
      lockLedger = null
      return null
    }
    const signature = String(file.version)
    if (signature === lockSignature) return lockLedger
    let raw
    try {
      raw = await fs.readText(file.target)
    } catch (error) {
      return lockLedger
    }
    lockSignature = signature
    let parsed
    try {
      parsed = JSON.parse(raw)
    } catch (error) {
      console.error('skill-hub: ' + LOCK_NAME + ' is not valid JSON, sources stay unlabelled')
      lockLedger = null
      return null
    }
    const found = new Map()
    const rows = parsed !== null && typeof parsed === 'object' && Array.isArray(parsed.skills) ? parsed.skills : []
    for (let i = 0; i < rows.length; i += 1) {
      const row = rows[i]
      if (row === null || typeof row !== 'object') continue
      const name = str(row.name)
      if (name === '') continue
      found.set(name, { type: str(row.type), repo: str(row.repo) })
    }
    lockLedger = found
    return found
  }

  /**
   * Turn one ledger row into what the panel shows: a group key, a display name,
   * and something that explains the origin when there is no upstream repo.
   */
  const sourceOf = function (name, ledger) {
    const row = ledger === null ? undefined : ledger.get(name)
    if (row === undefined) {
      return { group: name, upstream: '', url: '', note: '来源不明：不在仓库的 ' + LOCK_NAME + ' 里' }
    }
    if (row.type === 'github' && row.repo !== '') {
      const parts = row.repo.split('/')
      return { group: parts[1] === undefined ? row.repo : parts[1], upstream: row.repo, url: 'https://github.com/' + row.repo, note: '' }
    }
    if (row.type === 'well-known') {
      return { group: name, upstream: '', url: '', note: '来自远端 well-known 索引，没有 GitHub 仓库' }
    }
    return { group: name, upstream: '', url: '', note: '本地自制，没有上游仓库' }
  }

  const scan = async function () {
    if (fs === undefined) return
    const root = await target()
    const top = await entries(root)
    const files = []
    const marks = []
    for (let i = 0; i < top.length; i += 1) {
      const item = top[i]
      if (typeof item.name !== 'string' || item.target === undefined) continue
      if (item.type === 'directory') {
        const inner = await entries(item.target)
        for (let j = 0; j < inner.length; j += 1) {
          if (inner[j].type === 'file' && inner[j].name === 'SKILL.md' && inner[j].target !== undefined) {
            files.push(inner[j].target)
            marks.push(item.name + ':' + String(inner[j].version))
          }
        }
      } else if (item.type === 'file' && item.name.toLowerCase().endsWith('.md') && item.name !== LOCK_NAME) {
        files.push(item.target)
        marks.push(item.name + ':' + String(item.version))
      }
    }
    const next = marks.join('|')
    if (next === sig) return
    sig = next
    const ledger = await readLock(root, parentTarget)
    const built = []
    for (let i = 0; i < files.length; i += 1) {
      let raw
      try {
        raw = await fs.readText(files[i])
      } catch (error) {
        continue
      }
      const skill = parse(raw)
      if (skill === null) continue
      if (built.some(function (s) { return s.name === skill.name })) continue
      built.push(skill)
      sources.set(skill.name, sourceOf(skill.name, ledger))
    }
    defs = built
    poke()
  }

  const ensure = function () {
    if (pending !== undefined) return pending
    pending = scan().then(function () { pending = undefined }, function () { pending = undefined })
    return pending
  }

  const snap = skills.snapshot.bind(skills)
  const get = skills.get.bind(skills)
  const kick = function () {
    if (typeof skills.invalidateCache === 'function') skills.invalidateCache()
  }

  skills.snapshot = async function (options) {
    const s = await snap(options)
    return {
      skills: (s.skills || []).filter(function (skill) { return !off.has(skill.name) }),
      complete: s.complete,
    }
  }
  skills.list = async function (options) { return (await skills.snapshot(options)).skills }
  skills.get = async function (name, options) {
    if (off.has(name)) return undefined
    return get(name, options)
  }

  ctx.effect(function () {
    return function () {
      skills.snapshot = snap
      skills.list = async function (options) { return (await snap(options)).skills }
      skills.get = get
      kick()
    }
  }, 'demo restore')

  /** Which workspace owns this session, and the disable list that applies. */
  const loadScope = function (sessionId) {
    const value = readScope()
    const registry = ctx.get('workspaceRegistry')
    let workspace = null
    if (registry !== undefined && typeof sessionId === 'string' && sessionId !== '') {
      try {
        const all = registry.list()
        for (let i = 0; i < all.length; i += 1) {
          const ids = all[i].sessionIds
          for (let j = 0; j < ids.length; j += 1) {
            if (String(ids[j]) === sessionId) workspace = all[i]
          }
        }
      } catch (error) {
        workspace = null
      }
    }
    if (workspace === null) {
      return { key: '', title: '全局', disabled: value.disabled }
    }
    const key = str(workspace.path)
    const title = str(workspace.title)
    const entry = value.workspaces[key]
    const own = entry !== undefined && Array.isArray(entry.disabled)
    return {
      key: key,
      title: title === '' ? key : title,
      disabled: own ? entry.disabled.slice() : value.disabled.slice(),
      inherited: !own,
    }
  }

  const applyOff = function (disabled) {
    off.clear()
    for (let i = 0; i < disabled.length; i += 1) off.add(disabled[i])
  }

  /** The workspaces a session could switch between, for the scope selector. */
  const listWorkspaces = function () {
    const out = []
    const registry = ctx.get('workspaceRegistry')
    if (registry === undefined) return out
    try {
      const all = registry.list()
      for (let i = 0; i < all.length; i += 1) {
        const key = str(all[i].path)
        if (key === '') continue
        const title = str(all[i].title)
        out.push({ key: key, title: title === '' ? key : title })
      }
    } catch (error) {
      return []
    }
    return out
  }

  if (scope !== undefined && typeof scope.watch === 'function') {
    ctx.effect(function () {
      const stop = scope.watch(function () {
        if (adopt(readScope().repo)) {
          kick()
          ensure()
        }
      })
      return function () { stop() }
    }, 'demo settings watch')
  }

  if (fs !== undefined) {
    ctx.skills.registerProvider(function (control) {
      poke = function () { control.invalidate() }
      return {
        name: 'agents-repo',
        list: async function () {
          await ensure()
          return defs.map(function (def) {
            const source = sources.get(def.name)
            const skill = {
              name: def.name,
              description: def.description,
              whenToUse: def.whenToUse,
              invocation: { modelInvocable: def.modelInvocable, userInvocable: def.userInvocable },
              source: 'user-agents',
              provider: 'agents-repo',
              rank: 450,
              locator: def.name,
              resourceBase: { kind: 'directory', path: repo },
            }
            if (source !== undefined) {
              skill.metadata = {
                series: source.group,
                upstream: source.upstream,
                url: source.url,
                note: source.note,
              }
            }
            return skill
          })
        },
        get: async function (candidate) {
          const def = defs.filter(function (s) { return s.name === candidate.name })[0]
          if (def === undefined) return undefined
          return {
            name: def.name,
            description: def.description,
            whenToUse: def.whenToUse,
            invocation: { modelInvocable: def.modelInvocable, userInvocable: def.userInvocable },
            source: 'user-agents',
            provider: 'agents-repo',
            resourceBase: { kind: 'directory', path: repo },
            content: def.content,
          }
        },
      }
    })
    ctx.effect(function () {
      return ctx.interval(function () { ensure() }, 8000)
    }, 'demo poll')
  }

  /** Repository rows first, then whatever the live registries reported. */
  const catalog = function () {
    const out = []
    const seen = new Set()
    for (let i = 0; i < defs.length; i += 1) {
      const def = defs[i]
      seen.add(def.name)
      const source = sources.get(def.name)
      out.push({
        name: def.name,
        description: def.description,
        whenToUse: def.whenToUse,
        origin: 'repo',
        series: source === undefined ? def.name : source.group,
        upstream: source === undefined ? '' : source.upstream,
        url: source === undefined ? '' : source.url,
        note: source === undefined ? '' : source.note,
        enabled: !off.has(def.name),
      })
    }
    meta.forEach(function (info, name) {
      if (seen.has(name)) return
      out.push({
        name: str(name),
        description: str(info.description),
        whenToUse: str(info.whenToUse),
        origin: 'preset',
        series: str(name),
        upstream: '',
        url: '',
        note: '由当前 agent 预设提供，随预设启用，不在技能仓库里',
        enabled: !off.has(name),
      })
    })
    out.sort(function (a, b) { return a.name < b.name ? -1 : a.name > b.name ? 1 : 0 })
    return out
  }

  /**
   * Write a new disabled list for exactly one scope: a workspace path, or the
   * global list when the key is empty.
   */
  const writeScope = async function (key, disabled) {
    if (key === '') {
      await persist({ disabled: disabled })
      return
    }
    const value = readScope()
    const workspaces = {}
    const keys = Object.keys(value.workspaces)
    for (let i = 0; i < keys.length; i += 1) workspaces[keys[i]] = value.workspaces[keys[i]]
    workspaces[key] = { disabled: disabled }
    await persist({ workspaces: workspaces })
  }

  harness.handle('hub:state', async function (args) {
    const req = args === undefined ? {} : args
    await ensure()
    const active = loadScope(req.sessionId)
    const requested = typeof req.workspace === 'string' ? req.workspace : undefined
    if (requested === undefined || requested === active.key) {
      applyOff(active.disabled)
    } else if (requested === '') {
      applyOff(readScope().disabled)
    } else {
      const value = readScope()
      const entry = value.workspaces[requested]
      applyOff(entry !== undefined && Array.isArray(entry.disabled) ? entry.disabled : value.disabled)
    }
    const current = await snap({})
    const live = current.skills || []
    for (let i = 0; i < live.length; i += 1) {
      const name = str(live[i].name)
      if (name === '' || meta.has(name)) continue
      remember(name, live[i].description, live[i].whenToUse)
    }
    const rows = catalog()
    const value = readScope()
    const workspaces = []
    const keys = Object.keys(value.workspaces)
    for (let i = 0; i < keys.length; i += 1) workspaces.push(keys[i])
    return {
      rows: rows,
      total: rows.length,
      offCount: off.size,
      scopes: listWorkspaces(),
      active: active.key,
      activeTitle: active.title,
      inherited: active.inherited === true,
      configured: workspaces,
      repo: repo,
      repoDefault: DEFAULT_REPO,
      repoStored: repo !== DEFAULT_REPO,
      repoWritable: scope !== undefined,
      repoLoaded: defs.length,
      lockFile: LOCK_NAME,
    }
  })

  harness.handle('hub:flip', async function (args) {
    const req = args === undefined ? {} : args
    const key = typeof req.workspace === 'string' ? req.workspace : ''
    const names = Array.isArray(req.names) ? req.names : []
    const enabled = req.enabled !== false
    for (let i = 0; i < names.length; i += 1) {
      const name = names[i]
      if (typeof name !== 'string' || name === '') continue
      if (enabled) off.delete(name)
      else off.add(name)
    }
    const list = Array.from(off)
    try {
      await writeScope(key, list)
    } catch (error) {
      return { ok: false, offCount: off.size, error: '保存失败：' + messageOf(error) }
    }
    kick()
    return { ok: true, offCount: off.size, error: null }
  })

  harness.handle('hub:flip-all', async function (args) {
    const req = args === undefined ? {} : args
    const key = typeof req.workspace === 'string' ? req.workspace : ''
    const enabled = req.enabled !== false
    const names = Array.isArray(req.names) ? req.names : []
    const list = []
    if (!enabled) {
      for (let i = 0; i < names.length; i += 1) {
        if (typeof names[i] === 'string' && names[i] !== '') list.push(names[i])
      }
    }
    try {
      await writeScope(key, list)
    } catch (error) {
      return { ok: false, offCount: off.size, error: '保存失败：' + messageOf(error) }
    }
    applyOff(list)
    kick()
    return { ok: true, offCount: off.size, error: null }
  })

  harness.handle('hub:repo', async function (args) {
    const req = args === undefined ? {} : args
    const wanted = typeof req.repo === 'string' ? req.repo.trim() : ''
    if (wanted === '') {
      try {
        await persist({ repo: DEFAULT_REPO })
      } catch (error) {
        return { ok: false, repo: repo, error: '保存失败：' + messageOf(error) }
      }
      adopt(DEFAULT_REPO)
      await ensure()
      return { ok: true, repo: repo, repoStored: false, error: null }
    }
    if (fs === undefined) return { ok: false, repo: repo, error: '文件系统服务未挂载' }
    try {
      await fs.resolve(await absolute(wanted))
    } catch (error) {
      return { ok: false, repo: repo, error: '路径无法解析：' + messageOf(error) }
    }
    try {
      await persist({ repo: wanted })
    } catch (error) {
      return { ok: false, repo: repo, error: '保存失败：' + messageOf(error) }
    }
    adopt(wanted)
    await ensure()
    return { ok: true, repo: repo, repoStored: true, error: null }
  })
}
