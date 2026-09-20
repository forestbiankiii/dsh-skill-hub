/**
 * dsh-skill-hub — host half.
 *
 * Runs inside the DSH host process as a dynamic Cordis Plugin. It owns:
 *
 *   1. the skills catalog the settings panel renders (list + enable/disable);
 *   2. the enforcement behind those switches — a wrapped `ctx.skills` that
 *      hides a disabled skill from the `skill` tool, from the model's
 *      available-skills catalog, and from the human slash-command path;
 *   3. a live provider over the shared skill repository at SKILL_REPO.
 *
 * The dynamic-plugin sandbox withholds `require`, `process` and native timers,
 * so everything here goes through cordis services: `ctx.fs` for files,
 * `ctx.interval` for the poll, `ctx.skills` for the registry.
 */

/** The shared skill repository every agent on this machine reads. */
const SKILL_REPO = 'C:\\Users\\17196\\.agents\\skills'

/**
 * Poll cadence. The scan is a two-level directory listing compared against a
 * `name:version` signature; files are only re-read when that signature moves,
 * so an idle repository costs two listings per tick and nothing else.
 */
const POLL_MS = 8000

/** Skill names are kebab-case, exactly as the registry validates them. */
const NAME_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

/**
 * Provider rank inside the registry's global layer. DSH's own roots are
 * 100 project-dsh / 200 project-agents / 300 custom / 400 user-dsh /
 * 500 user-agents / 600 bundled. This provider deliberately sits between
 * `user-dsh` and `user-agents`: it outranks nothing it should not, and once
 * `skill-filesystem` serves the same directory the filesystem entry wins
 * outright.
 */
const PROVIDER_NAME = 'agents-repo'
const PROVIDER_RANK = 450

/**
 * Services this package declares. The sandbox refuses `ctx.<service>` access
 * for an undeclared service, and the declaration is also what makes cordis park
 * this package instead of failing it when a provider goes away.
 */
const inject = ['skills', 'timer']

/**
 * @param {object} ctx - the guarded Cordis context a host half receives.
 */
export function apply(ctx) {
  const skills = ctx.skills
  const fs = ctx.get('fs')

  const state = {
    /** Skill names switched off in this process. */
    disabled: new Set(),
    /** Parsed definitions of the shared repository, keyed by skill name. */
    definitions: new Map(),
    /** Repository entries that were rejected, with the reason. */
    problems: [],
    /** Signature of the last parsed repository listing. */
    signature: undefined,
    /** In-flight scan, so concurrent readers share one pass. */
    pending: undefined,
    /** Last repository failure, surfaced in the panel. */
    error: null,
  }

  let invalidateRegistry = function () {}

  function messageOf(error) {
    if (error === null || error === undefined) return 'unknown error'
    if (typeof error === 'string') return error
    if (typeof error.message === 'string') return error.message
    return String(error)
  }

  function stringOf(value) {
    return typeof value === 'string' ? value : ''
  }

  function unquote(value) {
    const text = stringOf(value).trim()
    if (text.length >= 2) {
      const first = text.charAt(0)
      const last = text.charAt(text.length - 1)
      if ((first === '"' && last === '"') || (first === "'" && last === "'")) {
        return text.slice(1, text.length - 1)
      }
    }
    return text
  }

  function flagOf(data, key) {
    const raw = data[key]
    if (raw === undefined) return undefined
    const value = unquote(raw).toLowerCase()
    if (value === 'true' || value === 'yes' || value === 'on') return true
    if (value === 'false' || value === 'no' || value === 'off') return false
    return undefined
  }

  /**
   * Parse the flat `key: value` frontmatter a SKILL.md carries. This is
   * deliberately not a YAML parser: the contract only ever uses scalars, and a
   * value that looks like nested YAML is exactly the input DSH itself refuses.
   * Anything left of the first colon on an unindented line is a key.
   */
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
    for (let index = 0; index < lines.length; index += 1) {
      const line = lines[index].replace(/\r$/, '')
      if (closed) {
        body.push(line)
        continue
      }
      if (line.trim() === '---') {
        closed = true
        continue
      }
      if (/^\s/.test(line)) continue
      const colon = line.indexOf(':')
      if (colon <= 0) continue
      const key = line.slice(0, colon).trim()
      const value = line.slice(colon + 1).trim()
      if (key !== '' && value !== '') data[key] = value
    }
    if (!closed) return null
    return { data: data, body: body.join('\n') }
  }

  /** Validate one skill file the way the registry itself will validate it. */
  function parseSkillText(raw) {
    const parsed = parseFrontmatter(raw)
    if (parsed === null) return { error: 'missing YAML frontmatter' }
    const name = unquote(parsed.data.name)
    const description = unquote(parsed.data.description)
    if (name === '') return { error: 'frontmatter requires name' }
    if (!NAME_PATTERN.test(name)) return { error: 'invalid skill name ' + name }
    if (description === '') return { error: 'frontmatter requires description' }
    const rawWhenToUse = parsed.data.whenToUse !== undefined
      ? parsed.data.whenToUse
      : parsed.data['when-to-use']
    const modelFlag = flagOf(parsed.data, 'modelInvocable')
    const userFlag = flagOf(parsed.data, 'userInvocable')
    /**
     * `whenToUse` is always a string, never undefined: this definition travels
     * through the panel RPC, whose return value must be lossless JSON, and an
     * `undefined` field is rejected outright.
     */
    const definition = {
      name: name,
      description: description,
      whenToUse: rawWhenToUse === undefined ? '' : unquote(rawWhenToUse),
      modelInvocable: modelFlag === undefined ? true : modelFlag,
      userInvocable: userFlag === undefined ? true : userFlag,
      content: parsed.body.trim(),
    }
    return { definition: definition }
  }

  /* ---------------------------------------------------- skills enforcement */

  /**
   * The methods are replaced in place on the service instance, so the original
   * bound functions are kept both for the panel's own view and for
   * restore-on-dispose. The registry has no "off" concept of its own: this
   * wrapper is the entire mechanism.
   */
  const originalSnapshot = skills.snapshot.bind(skills)
  const originalGet = skills.get.bind(skills)

  function invalidateCatalog() {
    if (typeof skills.invalidateCache === 'function') skills.invalidateCache()
  }

  /**
   * A disabled skill leaves every consumer at once: `snapshot` feeds the model's
   * catalog, `list` feeds the slash menu and the session skill Remote, and `get`
   * feeds both the `skill` tool and user invocation.
   */
  skills.snapshot = async function (options) {
    const snapshot = await originalSnapshot(options)
    return {
      skills: (snapshot.skills || []).filter(function (skill) {
        return !state.disabled.has(skill.name)
      }),
      complete: snapshot.complete,
    }
  }

  skills.list = async function (options) {
    return (await skills.snapshot(options)).skills
  }

  skills.get = async function (name, options) {
    if (state.disabled.has(name)) return undefined
    return originalGet(name, options)
  }

  function restoreRegistry() {
    skills.snapshot = originalSnapshot
    skills.list = async function (options) {
      return (await originalSnapshot(options)).skills
    }
    skills.get = originalGet
    invalidateCatalog()
  }

  /* --------------------------------------------------------- repository IO */

  function candidateOf(definition) {
    const skill = {
      name: definition.name,
      description: definition.description,
      invocation: {
        modelInvocable: definition.modelInvocable,
        userInvocable: definition.userInvocable,
      },
      source: 'user-agents',
      provider: PROVIDER_NAME,
      resourceBase: { kind: 'directory', path: SKILL_REPO },
    }
    if (definition.whenToUse !== '') skill.whenToUse = definition.whenToUse
    return skill
  }

  async function listDirectory(target) {
    try {
      const entries = await fs.listDir(target)
      return Array.isArray(entries) ? entries : []
    } catch (error) {
      return []
    }
  }

  /**
   * Re-read the repository when its `name:version` signature moved. Versions
   * come from the directory listing, so an unchanged repository costs two
   * `listDir` calls and no file reads at all.
   */
  async function scanRepository() {
    const root = await fs.resolve(SKILL_REPO)
    const entries = await listDirectory(root)
    const files = []
    const signature = []
    for (let index = 0; index < entries.length; index += 1) {
      const entry = entries[index]
      if (typeof entry.name !== 'string' || entry.target === undefined) continue
      if (entry.type === 'directory') {
        const bundle = await listDirectory(entry.target)
        for (let inner = 0; inner < bundle.length; inner += 1) {
          const child = bundle[inner]
          if (child.type === 'file' && child.name === 'SKILL.md' && child.target !== undefined) {
            files.push({ label: entry.name, target: child.target })
            signature.push(entry.name + ':' + String(child.version))
          }
        }
      } else if (entry.type === 'file' && entry.name.toLowerCase().endsWith('.md')) {
        files.push({ label: entry.name.replace(/\.md$/i, ''), target: entry.target })
        signature.push(entry.name + ':' + String(entry.version))
      }
    }

    const nextSignature = signature.join('|')
    if (nextSignature === state.signature) return false

    const found = new Map()
    const problems = []
    for (let index = 0; index < files.length; index += 1) {
      let raw
      try {
        raw = await fs.readText(files[index].target)
      } catch (error) {
        problems.push({ name: files[index].label, reason: 'read failed' })
        continue
      }
      const result = parseSkillText(raw)
      if (result.error !== undefined) {
        problems.push({ name: files[index].label, reason: result.error })
        continue
      }
      if (found.has(result.definition.name)) {
        problems.push({ name: result.definition.name, reason: 'duplicate in repository' })
        continue
      }
      found.set(result.definition.name, result.definition)
    }

    state.definitions = found
    state.problems = problems
    state.signature = nextSignature
    state.error = null
    return true
  }

  function scanIfStale(force) {
    if (force === true) state.signature = undefined
    if (state.pending !== undefined) return state.pending
    state.pending = scanRepository().then(
      function (changed) {
        state.pending = undefined
        if (changed === true) invalidateRegistry()
      },
      function (error) {
        state.pending = undefined
        state.error = messageOf(error)
      },
    )
    return state.pending
  }

  if (fs === undefined) {
    console.error('no filesystem service; the shared skill repository is skipped')
  } else {
    ctx.skills.registerProvider(function (control) {
      invalidateRegistry = function () {
        control.invalidate()
      }
      return {
        name: PROVIDER_NAME,
        list: async function () {
          await scanIfStale(false)
          const out = []
          state.definitions.forEach(function (definition) {
            const skill = candidateOf(definition)
            skill.rank = PROVIDER_RANK
            skill.locator = definition.name
            out.push(skill)
          })
          return out
        },
        get: async function (candidate) {
          const definition = state.definitions.get(candidate.name)
          if (definition === undefined) return undefined
          const skill = candidateOf(definition)
          skill.content = definition.content
          return skill
        },
      }
    })

    ctx.effect(function () {
      return ctx.interval(function () {
        scanIfStale(false)
      }, POLL_MS)
    }, 'skill-hub repository poll')
  }

  ctx.effect(function () {
    return function () {
      restoreRegistry()
    }
  }, 'skill-hub registry restore')

  /* ----------------------------------------------------------- panel reads */

  function registriesFor(sessionId) {
    const scopes = []
    const agents = ctx.get('agents')
    const presets = ctx.get('agentPresets')
    let agent
    if (agents !== undefined) {
      if (typeof sessionId === 'string' && sessionId !== '') agent = agents.get(sessionId)
      if (agent === undefined) {
        const roots = agents.roots()
        agent = roots !== undefined && roots.length > 0 ? roots[0] : undefined
      }
      if (agent === undefined) {
        const all = agents.list()
        agent = all !== undefined && all.length > 0 ? all[0] : undefined
      }
    }
    if (agent === undefined) {
      scopes.push({ scope: undefined, registry: skills })
      return scopes
    }
    const scoped = presets === undefined ? undefined : presets.serviceFor(agent, 'skills')
    scopes.push({ scope: agent, registry: scoped === undefined ? skills : scoped })
    return scopes
  }

  /**
   * Read one registry through its un-wrapped `snapshot`, so the panel sees the
   * disabled rows the enforcement wrapper hides from everyone else.
   */
  async function describeRegistry(registry, scope) {
    if (registry === undefined || typeof registry.snapshot !== 'function') return []
    try {
      const snapshot = await registry.snapshot({ scope: scope })
      const rows = []
      const list = snapshot.skills || []
      for (let index = 0; index < list.length; index += 1) {
        const skill = list[index]
        rows.push({
          name: stringOf(skill.name),
          description: stringOf(skill.description),
          whenToUse: stringOf(skill.whenToUse),
          source: stringOf(skill.source),
          provider: stringOf(skill.provider),
          modelInvocable: !!(skill.invocation && skill.invocation.modelInvocable),
          userInvocable: !!(skill.invocation && skill.invocation.userInvocable),
        })
      }
      return rows
    } catch (error) {
      state.error = messageOf(error)
      return []
    }
  }

  async function readCatalog(sessionId) {
    const scopes = registriesFor(sessionId)
    const rows = []
    const seen = new Set()
    for (let index = 0; index < scopes.length; index += 1) {
      const described = await describeRegistry(scopes[index].registry, scopes[index].scope)
      for (let inner = 0; inner < described.length; inner += 1) {
        const skill = described[inner]
        if (seen.has(skill.name)) continue
        seen.add(skill.name)
        skill.enabled = !state.disabled.has(skill.name)
        rows.push(skill)
      }
    }
    rows.sort(function (left, right) {
      if (left.name < right.name) return -1
      if (left.name > right.name) return 1
      return 0
    })
    return rows
  }

  async function applyToggle(request) {
    const enabled = request.enabled !== false
    const names = Array.isArray(request.names) ? request.names : []
    for (let index = 0; index < names.length; index += 1) {
      const name = names[index]
      if (typeof name !== 'string' || name === '') continue
      if (enabled) state.disabled.delete(name)
      else state.disabled.add(name)
    }
    // Invalidating republishes the session's skill catalog on the next step, so
    // a switch flipped in the panel lands in the model's view immediately.
    invalidateCatalog()
  }

  harness.handle('skills:state', async function (args) {
    const request = args === undefined ? {} : args
    if (request.rescan === true) await scanIfStale(true)
    const skillRows = await readCatalog(request.sessionId)
    const repoRows = []
    state.definitions.forEach(function (definition) {
      repoRows.push({
        name: definition.name,
        description: definition.description,
        modelInvocable: definition.modelInvocable,
        userInvocable: definition.userInvocable,
      })
    })
    const problems = []
    for (let index = 0; index < state.problems.length; index += 1) {
      problems.push({ name: state.problems[index].name, reason: state.problems[index].reason })
    }
    return {
      skills: skillRows,
      disabled: Array.from(state.disabled),
      repo: {
        path: SKILL_REPO,
        available: fs !== undefined,
        skills: repoRows,
        problems: problems,
        error: state.error,
      },
    }
  })

  harness.handle('skills:toggle', async function (args) {
    await applyToggle(args === undefined ? {} : args)
    return { ok: true, disabled: Array.from(state.disabled) }
  })

  harness.handle('skills:toggle-all', async function (args) {
    const request = args === undefined ? {} : args
    if (request.enabled === false) {
      await applyToggle({ names: request.names, enabled: false })
    } else {
      state.disabled.clear()
      invalidateCatalog()
    }
    return { ok: true, disabled: Array.from(state.disabled) }
  })
}
