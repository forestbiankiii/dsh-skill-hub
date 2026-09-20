/**
 * dsh-skill-hub — demo browser half.
 *
 * Two pages behind one tab strip:
 *
 *   skills   the grouped list. Skills installed from the same upstream GitHub
 *            repo collapse into one series row; a series holding a single skill
 *            renders as itself. The scope selector above decides whose switch
 *            set is being edited.
 *   settings the skill repository path, plus where the grouping comes from.
 *
 * Typography and radii follow the shipped client: `--dsw-font-family` for prose,
 * `--ds-font-family-code` for identifiers, 6px on buttons.
 */

const css = [
  '.hub{display:flex;flex-direction:column;min-height:0;font-family:var(--dsw-font-family,-apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC","Microsoft YaHei",sans-serif);font-size:13px;color:var(--dsw-alias-label-primary,#fff)}',
  '.hub-tabs{display:flex;gap:2px;padding:0 16px;border-bottom:1px solid var(--dsw-alias-border-l1,#333)}',
  '.hub-tab{padding:7px 12px;border:0;background:none;color:var(--dsw-alias-label-secondary,#aaa);font-family:inherit;font-size:13px;cursor:pointer;border-bottom:2px solid transparent;border-radius:6px 6px 0 0;transition:color 0.15s,background 0.15s}',
  '.hub-tab:hover{color:var(--dsw-alias-label-primary,#fff);background:var(--dsw-alias-bg-layer-1,#2b2b2b)}',
  '.hub-tab-on{color:var(--dsw-alias-brand-primary,#0a84ff);border-bottom-color:var(--dsw-alias-brand-primary,#0a84ff);font-weight:600}',
  '.hub-body{display:flex;flex-direction:column;gap:8px;padding:12px 16px;overflow-y:auto}',
  '.hub-bar{display:flex;align-items:center;gap:8px;flex-wrap:wrap}',
  '.hub-count{color:var(--dsw-alias-label-secondary,#aaa)}',
  '.hub-btn{padding:5px 12px;border-radius:6px;border:1px solid var(--dsw-alias-border-l1,#444);background:var(--dsw-alias-bg-layer-1,#2b2b2b);color:var(--dsw-alias-label-primary,#fff);font-family:inherit;font-size:12px;cursor:pointer;transition:background 0.15s,border-color 0.15s}',
  '.hub-btn:hover:not(:disabled){background:var(--dsw-alias-bg-layer-2,#383838);border-color:var(--dsw-alias-border-l2,#666)}',
  '.hub-btn:disabled{opacity:0.5;cursor:default}',
  '.hub-link{padding:4px 10px;border-radius:6px;border:1px solid transparent;background:none;color:var(--dsw-alias-brand-primary,#0a84ff);font-family:var(--ds-font-family-code,monospace);font-size:11px;cursor:pointer;transition:background 0.15s,border-color 0.15s}',
  '.hub-link:hover{background:var(--dsw-alias-bg-layer-2,#333);border-color:var(--dsw-alias-border-l1,#444)}',
  '.hub-select{padding:5px 10px;border-radius:6px;border:1px solid var(--dsw-alias-border-l1,#444);background:var(--dsw-alias-bg-layer-2,#222);color:var(--dsw-alias-label-primary,#fff);font-family:inherit;font-size:12px;cursor:pointer;transition:border-color 0.15s}',
  '.hub-select:hover{border-color:var(--dsw-alias-border-l2,#666)}',
  '.hub-search{flex:1;min-width:140px;padding:6px 10px;border-radius:6px;border:1px solid var(--dsw-alias-border-l1,#444);background:var(--dsw-alias-bg-layer-2,#222);color:var(--dsw-alias-label-primary,#fff);font-family:inherit;font-size:12px;outline:none;transition:border-color 0.15s}',
  '.hub-search:hover{border-color:var(--dsw-alias-border-l2,#666)}',
  '.hub-search:focus{border-color:var(--dsw-alias-brand-primary,#0a84ff)}',
  '.hub-list{display:flex;flex-direction:column;gap:8px}',
  '.hub-group{border:1px solid var(--dsw-alias-border-l1,#333);border-radius:8px;background:var(--dsw-alias-bg-layer-1,#1e1e1e);overflow:hidden}',
  '.hub-head{display:flex;align-items:center;gap:8px;padding:8px 12px}',
  '.hub-head-open{background:var(--dsw-alias-bg-layer-2,#242426);border-bottom:1px solid var(--dsw-alias-border-l1,#333)}',
  '.hub-caret{width:14px;flex:none;border:0;background:none;color:var(--dsw-alias-label-secondary,#aaa);font-family:inherit;font-size:11px;cursor:pointer;padding:0;transition:color 0.15s}',
  '.hub-caret:hover{color:var(--dsw-alias-label-primary,#fff)}',
  '.hub-series{font-family:var(--ds-font-family-code,monospace);font-weight:600}',
  '.hub-tag{font-size:10px;padding:1px 6px;border-radius:4px;border:1px solid var(--dsw-alias-border-l1,#444);color:var(--dsw-alias-label-secondary,#aaa);white-space:nowrap}',
  '.hub-tag-on{color:var(--dsw-alias-state-success-primary,#22c55e);border-color:var(--dsw-alias-state-success-primary,#22c55e)}',
  '.hub-grow{flex:1;min-width:0}',
  '.hub-items{display:flex;flex-direction:column}',
  '.hub-item{padding:8px 12px;border-top:1px solid var(--dsw-alias-border-l1,#2a2a2a)}',
  '.hub-item:first-child{border-top:0}',
  '.hub-down{opacity:0.55}',
  '.hub-row{display:flex;align-items:center;gap:8px}',
  '.hub-name{font-family:var(--ds-font-family-code,monospace);font-weight:600}',
  '.hub-desc{margin-top:4px;line-height:1.5;color:var(--dsw-alias-label-secondary,#ccc)}',
  '.hub-note{margin-top:4px;line-height:1.5;color:var(--dsw-alias-label-tertiary,#999);word-break:break-all}',
  '.hub-warn{color:var(--dsw-alias-state-warn-primary,#f59e0b)}',
  '.hub-err{color:var(--dsw-alias-state-error-primary,#ef4444)}',
  '.hub-sw{position:relative;width:36px;height:20px;flex:none;border-radius:10px;border:1px solid var(--dsw-alias-border-l2,#52525b);background:var(--dsw-alias-bg-layer-2,#3f3f46);cursor:pointer;padding:0;transition:background 0.18s,border-color 0.18s}',
  '.hub-sw:hover{border-color:var(--dsw-alias-label-tertiary,#8b93a1)}',
  '.hub-sw-on{background:var(--dsw-alias-state-success-primary,#10b981);border-color:var(--dsw-alias-state-success-primary,#10b981)}',
  '.hub-knob{position:absolute;top:2px;left:2px;width:14px;height:14px;border-radius:7px;background:#fff;transition:transform 0.18s}',
  '.hub-sw-on .hub-knob{transform:translateX(16px)}',
  '.hub-card{border:1px solid var(--dsw-alias-border-l1,#333);border-radius:8px;background:var(--dsw-alias-bg-layer-1,#1e1e1e);padding:12px;margin-bottom:8px}',
  '.hub-card-title{font-weight:600;margin-bottom:8px}',
].join('\n')

/* --------------------------------------------------------------- primitives */

function Sw(props) {
  return React.createElement('button', {
    type: 'button',
    role: 'switch',
    'aria-checked': props.on,
    'aria-label': props.label,
    className: 'hub-sw' + (props.on ? ' hub-sw-on' : ''),
    onClick: function (event) { event.stopPropagation(); props.flip(!props.on) },
  }, React.createElement('span', { className: 'hub-knob' }))
}

function Btn(props) {
  return React.createElement('button', {
    type: 'button',
    className: 'hub-btn',
    disabled: props.disabled === true,
    onClick: props.onClick,
  }, props.text)
}

/* -------------------------------------------------------------------- pages */

function PageSkills(props) {
  const data = props.data
  const setData = props.setData
  const reload = props.reload

  const searchState = React.useState('')
  const query = searchState[0]
  const setQuery = searchState[1]
  const openState = React.useState({})
  const open = openState[0]
  const setOpen = openState[1]
  const errState = React.useState(null)
  const actionError = errState[0]
  const setActionError = errState[1]

  const needle = query.trim().toLowerCase()

  const grouped = []
  const index = {}
  for (let i = 0; i < data.rows.length; i += 1) {
    const row = data.rows[i]
    if (needle !== '') {
      const inName = row.name.toLowerCase().indexOf(needle) >= 0
      const inDesc = row.description.toLowerCase().indexOf(needle) >= 0
      const inSeries = row.series.toLowerCase().indexOf(needle) >= 0
      if (!inName && !inDesc && !inSeries) continue
    }
    const key = row.origin === 'repo' ? 'repo:' + row.series : 'preset:' + row.name
    if (index[key] === undefined) {
      index[key] = {
        key: key,
        series: row.series,
        url: row.url,
        upstream: row.upstream,
        note: row.note,
        origin: row.origin,
        skills: [],
      }
      grouped.push(index[key])
    }
    index[key].skills.push(row)
    if (index[key].url === '' && row.url !== '') index[key].url = row.url
  }

  const patch = function (names, enabled) {
    setData(function (prev) {
      return Object.assign({}, prev, {
        rows: prev.rows.map(function (row) {
          return names.indexOf(row.name) >= 0 ? Object.assign({}, row, { enabled: enabled }) : row
        }),
      })
    })
  }

  const send = function (names, enabled) {
    patch(names, enabled)
    setActionError(null)
    host.call('hub:flip', { workspace: data.active, names: names, enabled: enabled }).then(function (res) {
      if (res && res.ok === false) setActionError(String(res.error))
    }).catch(function (error) {
      setActionError(String(error && error.message ? error.message : error))
      reload()
    })
  }

  const sendAll = function (enabled) {
    const names = data.rows.map(function (row) { return row.name })
    patch(names, enabled)
    setActionError(null)
    host.call('hub:flip-all', { workspace: data.active, names: names, enabled: enabled }).then(function (res) {
      if (res && res.ok === false) setActionError(String(res.error))
    }).catch(function (error) {
      setActionError(String(error && error.message ? error.message : error))
      reload()
    })
  }

  const scopeOptions = [{ key: '', title: '全局（没有工作区的会话）' }].concat(data.scopes)

  const children = [
    React.createElement('div', { className: 'hub-bar', key: 'scope' },
      React.createElement('span', { className: 'hub-note', style: { marginTop: 0 } }, '开关作用域'),
      React.createElement('select', {
        className: 'hub-select',
        value: props.scope,
        onChange: function (event) { props.setScope(event.target.value) },
      }, scopeOptions.map(function (option) {
        return React.createElement('option', { key: option.key, value: option.key }, option.title)
      })),
      React.createElement('span', { className: 'hub-tag' + (data.active === props.scope ? ' hub-tag-on' : '') },
        data.active === props.scope ? '当前会话' : '其他作用域'),
      React.createElement('span', { className: 'hub-grow' }),
      React.createElement('span', { className: 'hub-count' },
        '共 ' + data.total + ' 个，已关闭 ' + data.offCount + ' 个'),
    ),
    React.createElement('div', { className: 'hub-bar', key: 'actions' },
      React.createElement('input', {
        className: 'hub-search',
        type: 'text',
        placeholder: '搜索技能名、描述或系列名…',
        value: query,
        onChange: function (event) { setQuery(event.target.value) },
      }),
      React.createElement(Btn, { text: '全部开启', onClick: function () { sendAll(true) } }),
      React.createElement(Btn, { text: '全部关闭', onClick: function () { sendAll(false) } }),
      React.createElement(Btn, { text: '刷新', onClick: reload }),
    ),
  ]

  if (props.scope !== data.active) {
    children.push(React.createElement('div', { className: 'hub-note hub-warn', key: 'warn' },
      '正在编辑「' + (props.scope === '' ? '全局' : props.scope) + '」的开关；本会话属于「'
      + data.activeTitle + '」，不受这里影响。'))
  } else if (data.inherited) {
    children.push(React.createElement('div', { className: 'hub-note', key: 'inherit' },
      '这个工作区还没有独立设置，现在沿用全局；改动任意一项即会为它单独存一份。'))
  }

  if (actionError !== null) {
    children.push(React.createElement('div', { className: 'hub-note hub-err', key: 'err' }, '写入失败：' + actionError))
  }

  children.push(React.createElement('div', { className: 'hub-list', key: 'list' },
    grouped.length === 0
      ? React.createElement('div', { className: 'hub-note' }, '没有匹配的技能')
      : grouped.map(function (group) {
        const single = group.skills.length === 1
        const expanded = single ? true : open[group.key] === true
        const onCount = group.skills.filter(function (skill) { return skill.enabled }).length

        const head = React.createElement('div', {
          className: 'hub-head' + (expanded && !single ? ' hub-head-open' : ''),
          key: 'head',
        },
          single
            ? null
            : React.createElement('button', {
              type: 'button',
              className: 'hub-caret',
              'aria-expanded': expanded,
              onClick: function () {
                setOpen(function (prev) {
                  const next = Object.assign({}, prev)
                  next[group.key] = !(prev[group.key] === true)
                  return next
                })
              },
            }, expanded ? '▾' : '▸'),
          React.createElement('span', { className: 'hub-series' }, group.series),
          single ? null : React.createElement('span', { className: 'hub-tag' }, group.skills.length + ' 个'),
          React.createElement('span', {
            className: 'hub-tag' + (onCount === group.skills.length ? ' hub-tag-on' : ''),
          }, '开启 ' + onCount + '/' + group.skills.length),
          React.createElement('span', { className: 'hub-grow' }),
          group.url !== ''
            ? React.createElement('button', {
              type: 'button',
              className: 'hub-link',
              title: group.url,
              onClick: function () { window.open(group.url, '_blank', 'noopener') },
            }, group.upstream)
            : null,
          single
            ? React.createElement(Sw, {
              on: group.skills[0].enabled,
              label: group.skills[0].name,
              flip: function (next) { send([group.skills[0].name], next) },
            })
            : React.createElement(Sw, {
              on: onCount === group.skills.length,
              label: group.series,
              flip: function (next) {
                send(group.skills.map(function (skill) { return skill.name }), next)
              },
            }),
        )

        const body = []
        if (single && group.note !== '') {
          body.push(React.createElement('div', { className: 'hub-note', key: 'note' }, group.note))
        }
        if (single) {
          body.push(React.createElement('div', { className: 'hub-desc', key: 'desc' }, group.skills[0].description))
          if (group.skills[0].whenToUse !== '') {
            body.push(React.createElement('div', { className: 'hub-note', key: 'when' },
              '适用场景：' + group.skills[0].whenToUse))
          }
        } else if (expanded) {
          body.push(React.createElement('div', { className: 'hub-items', key: 'items' },
            group.skills.map(function (skill) {
              const box = [
                React.createElement('div', { className: 'hub-row', key: 'head' },
                  React.createElement('span', { className: 'hub-name' }, skill.name),
                  React.createElement('span', {
                    className: 'hub-tag' + (skill.enabled ? ' hub-tag-on' : ''),
                  }, skill.enabled ? '已开启' : '已关闭'),
                  skill.origin === 'preset' ? React.createElement('span', { className: 'hub-tag' }, '预设') : null,
                  React.createElement('span', { className: 'hub-grow' }),
                  React.createElement(Sw, {
                    on: skill.enabled,
                    label: skill.name,
                    flip: function (next) { send([skill.name], next) },
                  }),
                ),
                React.createElement('div', { className: 'hub-desc', key: 'desc' }, skill.description),
              ]
              if (skill.whenToUse !== '') {
                box.push(React.createElement('div', { className: 'hub-note', key: 'when' },
                  '适用场景：' + skill.whenToUse))
              }
              if (skill.note !== '') {
                box.push(React.createElement('div', { className: 'hub-note', key: 'note' }, skill.note))
              }
              return React.createElement('div', {
                className: 'hub-item' + (skill.enabled ? '' : ' hub-down'),
                key: skill.name,
              }, box)
            }),
          ))
        }

        return React.createElement('div', { className: 'hub-group', key: group.key }, [head].concat(body))
      }),
  ))

  return React.createElement('div', { className: 'hub-body' }, children)
}

function PageSettings(props) {
  const data = props.data
  const draftState = React.useState(data.repo)
  const draft = draftState[0]
  const setDraft = draftState[1]
  const savingState = React.useState(false)
  const saving = savingState[0]
  const setSaving = savingState[1]
  const errState = React.useState(null)
  const error = errState[0]
  const setError = errState[1]

  React.useEffect(function () { setDraft(data.repo) }, [data.repo])

  const save = function (value) {
    setSaving(true)
    setError(null)
    host.call('hub:repo', { repo: value }).then(function (result) {
      setSaving(false)
      if (result.ok === true) props.reload()
      else setError(String(result.error))
    }).catch(function (failure) {
      setSaving(false)
      setError(String(failure && failure.message ? failure.message : failure))
    })
  }

  return React.createElement('div', { className: 'hub-body' },
    React.createElement('div', { className: 'hub-card' },
      React.createElement('div', { className: 'hub-card-title' }, '技能仓库地址'),
      React.createElement('div', { className: 'hub-row' },
        React.createElement('span', { className: 'hub-tag' + (data.repoStored ? ' hub-tag-on' : '') },
          data.repoStored ? '已自定义' : '默认'),
        data.repoWritable ? null : React.createElement('span', { className: 'hub-tag' }, '设置服务不可用'),
        React.createElement('span', { className: 'hub-grow' }),
        React.createElement('span', { className: 'hub-note', style: { marginTop: 0 } },
          '已收录 ' + data.repoLoaded + ' 个技能'),
      ),
      React.createElement('div', { className: 'hub-bar', style: { marginTop: '8px' } },
        React.createElement('input', {
          className: 'hub-search',
          type: 'text',
          placeholder: data.repoDefault,
          value: draft,
          onChange: function (event) { setDraft(event.target.value) },
        }),
        React.createElement(Btn, {
          text: saving ? '保存中…' : '保存并重新扫描',
          disabled: saving,
          onClick: function () { save(draft) },
        }),
        React.createElement(Btn, { text: '恢复默认', disabled: saving, onClick: function () { save('') } }),
      ),
      error !== null
        ? React.createElement('div', { className: 'hub-note hub-err' }, error)
        : React.createElement('div', { className: 'hub-note' },
          '留空并保存即恢复默认（' + data.repoDefault + '）；支持 ~ 开头的路径。'),
      data.repoLoaded === 0
        ? React.createElement('div', { className: 'hub-note hub-warn' },
          '注意：这个地址下没解析到任何技能。确认目录里有 SKILL.md，或者换成正确路径。')
        : null,
    ),
    React.createElement('div', { className: 'hub-card' },
      React.createElement('div', { className: 'hub-card-title' }, '上游来源与分组'),
      React.createElement('div', { className: 'hub-note', style: { marginTop: 0 } },
        '技能列表按上游仓库分组，系列名与 GitHub 地址读自仓库根目录的 ' + data.lockFile + '。'),
      React.createElement('div', { className: 'hub-note' },
        '没有上游记录的技能会就地说明来源：远端 well-known 索引、本地自制，或由当前 agent 预设提供。'),
    ),
  )
}

function Hub(props) {
  const state = React.useState(null)
  const data = state[0]
  const setData = state[1]
  const pageState = React.useState('skills')
  const page = pageState[0]
  const setPage = pageState[1]
  const scopeState = React.useState('')
  const scope = scopeState[0]
  const setScope = scopeState[1]
  const errState = React.useState(null)
  const trouble = errState[0]
  const setTrouble = errState[1]

  const load = React.useCallback(function (requested) {
    const args = requested === undefined ? {} : { workspace: requested }
    let sessionId = ''
    if (props && typeof props.useSessions === 'function') {
      try {
        const current = props.useSessions(function (state) { return state ? state.current : undefined })
        if (typeof current === 'string') sessionId = current
      } catch (error) {
        sessionId = ''
      }
    }
    if (sessionId !== '') args.sessionId = sessionId
    host.call('hub:state', args).then(function (result) {
      setTrouble(null)
      setData(result)
      if (requested === undefined) setScope(result.active)
    }).catch(function (error) {
      setTrouble(String(error && error.message ? error.message : error))
    })
  }, [])

  React.useEffect(function () { load() }, [load])

  const pickScope = function (key) {
    setScope(key)
    load(key)
  }

  if (data === null) {
    const waiting = [
      React.createElement('div', { className: 'hub-body', key: 'wait' },
        React.createElement('div', { className: 'hub-note' }, '正在读取技能…')),
    ]
    if (trouble !== null) {
      waiting.push(React.createElement('div', { className: 'hub-body', key: 'err' },
        React.createElement('div', { className: 'hub-note hub-err' }, '读取失败：' + trouble),
        React.createElement(Btn, { text: '重试', onClick: function () { load() } })))
    }
    return React.createElement('div', { className: 'hub' }, waiting)
  }

  return React.createElement('div', { className: 'hub' },
    React.createElement('div', { className: 'hub-tabs' },
      React.createElement('button', {
        type: 'button',
        className: 'hub-tab' + (page === 'skills' ? ' hub-tab-on' : ''),
        onClick: function () { setPage('skills') },
      }, '技能列表'),
      React.createElement('button', {
        type: 'button',
        className: 'hub-tab' + (page === 'settings' ? ' hub-tab-on' : ''),
        onClick: function () { setPage('settings') },
      }, '技能设置'),
    ),
    page === 'skills'
      ? React.createElement(PageSkills, {
        data: data,
        setData: setData,
        scope: scope,
        setScope: pickScope,
        reload: function () { load(scope) },
      })
      : React.createElement(PageSettings, {
        data: data,
        reload: function () { load(scope) },
      }),
  )
}

/**
 * Register the panel in the settings navigation and in this Package's run card.
 * @param {object} ctx - the guarded Cordis context a client half receives.
 */
export function apply(ctx) {
  const slots = ctx.get('slots')
  if (slots === undefined) return
  styles.insert(css)
  slots.inject('settings.section', function () {
    return slots.register({ name: 'settings.section', id: 'skills', order: 25, label: 'Skills 技能' }, function (props) {
      return React.createElement(Hub, props)
    })
  })
  slots.inject('tool.view.cordis', function () {
    return slots.register({ name: 'tool.view.cordis', key: 'self' }, function (props) {
      return React.createElement(Hub, props)
    })
  })
}
