/**
 * dsh-skill-hub — demo browser half.
 *
 * Small enough that the built payload can be read back and re-submitted
 * verbatim. Full styling and the repository diagnostics live in
 * `src/client/client.js`.
 *
 * This is the copy the running `skhub-1/pkg-2` Package was built from. Its one
 * difference from the earlier revision is visible failure handling: a rejected
 * `hub:rows` used to leave the panel stuck on the loading line forever, so it
 * now shows the message and offers a retry.
 */

const css = [
  '.hub{display:flex;flex-direction:column;gap:8px;padding:12px;font-size:13px;color:var(--dsw-alias-label-primary,#fff)}',
  '.hub-bar{display:flex;align-items:center;gap:8px;flex-wrap:wrap}',
  '.hub-count{flex:1;min-width:100px;color:var(--dsw-alias-label-secondary,#aaa)}',
  '.hub-btn{padding:4px 10px;border-radius:6px;border:1px solid var(--dsw-alias-border-l1,#444);background:var(--dsw-alias-bg-layer-1,#2b2b2b);color:var(--dsw-alias-label-primary,#fff);font-size:12px;cursor:pointer}',
  '.hub-search{padding:5px 10px;border-radius:6px;border:1px solid var(--dsw-alias-border-l1,#444);background:var(--dsw-alias-bg-layer-2,#222);color:var(--dsw-alias-label-primary,#fff);font-size:12px;outline:none}',
  '.hub-list{display:flex;flex-direction:column;gap:6px;max-height:340px;overflow-y:auto}',
  '.hub-item{border:1px solid var(--dsw-alias-border-l1,#333);border-radius:8px;padding:7px 10px;background:var(--dsw-alias-bg-layer-1,#1e1e1e)}',
  '.hub-down{opacity:0.55}',
  '.hub-row{display:flex;align-items:center;gap:8px}',
  '.hub-name{font-family:monospace;font-weight:600}',
  '.hub-tag{font-size:10px;padding:1px 5px;border-radius:4px;border:1px solid var(--dsw-alias-border-l1,#444);color:var(--dsw-alias-label-secondary,#aaa)}',
  '.hub-on{color:var(--dsw-alias-state-success-primary,#22c55e);border-color:var(--dsw-alias-state-success-primary,#22c55e)}',
  '.hub-grow{flex:1}',
  '.hub-desc{margin-top:4px;color:var(--dsw-alias-label-secondary,#ccc)}',
  '.hub-note{margin-top:4px;color:var(--dsw-alias-label-tertiary,#999)}',
  '.hub-sw{position:relative;width:36px;height:20px;flex:none;border-radius:10px;border:1px solid var(--dsw-alias-border-l2,#52525b);background:var(--dsw-alias-bg-layer-2,#3f3f46);cursor:pointer;padding:0}',
  '.hub-sw-on{background:var(--dsw-alias-state-success-primary,#10b981);border-color:var(--dsw-alias-state-success-primary,#10b981)}',
  '.hub-knob{position:absolute;top:2px;left:2px;width:14px;height:14px;border-radius:7px;background:#fff;transition:transform 0.16s}',
  '.hub-repo{display:flex;flex-direction:column;gap:6px;margin-top:4px;padding-top:8px;border-top:1px solid var(--dsw-alias-border-l1,#333)}',
  '.hub-sw-on .hub-knob{transform:translateX(16px)}',
].join('\n')

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

function Hub() {
  const state = React.useState(null)
  const data = state[0]
  const setData = state[1]
  const q = React.useState('')
  const query = q[0]
  const setQuery = q[1]
  const errState = React.useState(null)
  const trouble = errState[0]
  const setTrouble = errState[1]
  const draftState = React.useState('')
  const draft = draftState[0]
  const setDraft = draftState[1]
  const repoErrState = React.useState(null)
  const repoError = repoErrState[0]
  const setRepoError = repoErrState[1]
  const savingState = React.useState(false)
  const saving = savingState[0]
  const setSaving = savingState[1]

  const load = React.useCallback(function () {
    host.call('hub:rows', {}).then(function (result) {
      setTrouble(null)
      setData(result)
      setDraft(result.repo)
    }).catch(function (error) {
      setTrouble(String(error && error.message ? error.message : error))
    })
  }, [])

  React.useEffect(function () { load() }, [load])

  if (data === null) {
    const waiting = [React.createElement('div', { className: 'hub-count', key: 'wait' }, '正在读取技能…')]
    if (trouble !== null) {
      waiting.push(React.createElement('div', { className: 'hub-note', key: 'err' }, '读取失败：' + trouble))
      waiting.push(React.createElement('button', { type: 'button', className: 'hub-btn', key: 'retry', onClick: load }, '重试'))
    }
    return React.createElement('div', { className: 'hub' }, waiting)
  }

  const needle = query.trim().toLowerCase()
  const shown = data.rows.filter(function (row) {
    if (needle === '') return true
    if (row.name.toLowerCase().indexOf(needle) >= 0) return true
    return row.description.toLowerCase().indexOf(needle) >= 0
  })
  const names = data.rows.map(function (row) { return row.name })

  const flip = function (name, next) {
    setData(function (prev) {
      return Object.assign({}, prev, {
        rows: prev.rows.map(function (row) {
          return row.name === name ? Object.assign({}, row, { enabled: next }) : row
        }),
      })
    })
    host.call('hub:flip', { names: [name], enabled: next }).catch(function () { load() })
  }

  const flipAll = function (next) {
    setData(function (prev) {
      return Object.assign({}, prev, {
        rows: prev.rows.map(function (row) { return Object.assign({}, row, { enabled: next }) }),
      })
    })
    host.call('hub:flip', { names: names, enabled: next }).catch(function () { load() })
  }

  const saveRepo = function (value) {
    setSaving(true)
    setRepoError(null)
    host.call('hub:repo', { repo: value }).then(function (result) {
      setSaving(false)
      if (result.ok === true) load()
      else setRepoError(String(result.error))
    }).catch(function (error) {
      setSaving(false)
      setRepoError(String(error && error.message ? error.message : error))
    })
  }

  /**
   * The repository editor. Saving validates the path host-side, persists it to
   * the DSH settings document, rescans, and answers with the truth — so the
   * field is reseeded from the response rather than from what was typed.
   */
  const repoBox = React.createElement('div', { className: 'hub-repo' },
    React.createElement('div', { className: 'hub-row' },
      React.createElement('span', { className: 'hub-name' }, '技能仓库地址'),
      data.repoStored
        ? React.createElement('span', { className: 'hub-tag hub-on' }, '已自定义')
        : React.createElement('span', { className: 'hub-tag' }, '默认'),
      data.repoWritable
        ? null
        : React.createElement('span', { className: 'hub-tag' }, '设置服务不可用'),
      React.createElement('span', { className: 'hub-grow' }),
      React.createElement('span', { className: 'hub-note' }, '已收录 ' + data.repoLoaded + ' 个'),
    ),
    React.createElement('div', { className: 'hub-row' },
      React.createElement('input', {
        className: 'hub-search hub-grow',
        type: 'text',
        placeholder: data.repoDefault,
        value: draft,
        onChange: function (event) { setDraft(event.target.value) },
      }),
      React.createElement('button', {
        type: 'button',
        className: 'hub-btn',
        disabled: saving,
        onClick: function () { saveRepo(draft) },
      }, saving ? '保存中…' : '保存并重新扫描'),
      React.createElement('button', {
        type: 'button',
        className: 'hub-btn',
        disabled: saving,
        onClick: function () { saveRepo('') },
      }, '恢复默认'),
    ),
    repoError !== null && repoError !== undefined
      ? React.createElement('div', { className: 'hub-note' }, repoError)
      : React.createElement('div', { className: 'hub-note' }, '留空并保存即恢复默认（' + data.repoDefault + '）；支持 ~ 开头的路径。'),
    data.repoLoaded === 0
      ? React.createElement('div', { className: 'hub-note' }, '注意：这个地址下没解析到任何技能。确认目录里有 SKILL.md，或者在上面换成正确路径。')
      : null,
  )

  return React.createElement('div', { className: 'hub' },
    React.createElement('div', { className: 'hub-bar' },
      React.createElement('span', { className: 'hub-count' }, '共 ' + data.total + ' 个技能，已关闭 ' + data.offCount + ' 个'),
      React.createElement('button', { type: 'button', className: 'hub-btn', onClick: function () { flipAll(true) } }, '全部开启'),
      React.createElement('button', { type: 'button', className: 'hub-btn', onClick: function () { flipAll(false) } }, '全部关闭'),
      React.createElement('button', { type: 'button', className: 'hub-btn', onClick: load }, '刷新'),
    ),
    React.createElement('input', {
      className: 'hub-search',
      type: 'text',
      placeholder: '搜索技能名称或描述…',
      value: query,
      onChange: function (event) { setQuery(event.target.value) },
    }),
    React.createElement('div', { className: 'hub-list' },
      shown.length === 0
        ? React.createElement('div', { className: 'hub-count' }, '没有匹配的技能')
        : shown.map(function (row) {
          const box = [
            React.createElement('div', { className: 'hub-row', key: 'head' },
              React.createElement('span', { className: 'hub-name' }, row.name),
              React.createElement('span', { className: 'hub-tag' + (row.enabled ? ' hub-on' : '') }, row.enabled ? '已开启' : '已关闭'),
              React.createElement('span', { className: 'hub-tag' }, row.provider),
              React.createElement('span', { className: 'hub-grow' }),
              React.createElement(Sw, {
                on: row.enabled,
                label: row.name,
                flip: function (next) { flip(row.name, next) },
              }),
            ),
            React.createElement('div', { className: 'hub-desc', key: 'desc' }, row.description),
          ]
          if (row.whenToUse !== '') {
            box.push(React.createElement('div', { className: 'hub-note', key: 'when' }, '适用场景：' + row.whenToUse))
          }
          return React.createElement('div', {
            className: 'hub-item' + (row.enabled ? '' : ' hub-down'),
            key: row.name,
          }, box)
        }),
    ),
    React.createElement('div', { className: 'hub-note' }, '仓库：' + data.repo),
    repoBox,
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
    return slots.register({ name: 'settings.section', id: 'skills', order: 25, label: 'Skills 技能' }, function () {
      return React.createElement(Hub)
    })
  })
  slots.inject('tool.view.cordis', function () {
    return slots.register({ name: 'tool.view.cordis', key: 'self' }, function () {
      return React.createElement(Hub)
    })
  })
}
