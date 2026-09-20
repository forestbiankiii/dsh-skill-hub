/**
 * dsh-skill-hub — demo browser half.
 *
 * Small enough that the built payload can be read back and re-submitted
 * verbatim. Full styling and the repository diagnostics live in
 * `src/client/client.js`.
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
  '.hub-sw{position:relative;width:36px;height:20px;flex:none;border-radius:10px;border:1px solid var(--dsw-alias-border-l2,#52525b);background:var(--dsw-alias-bg-layer-2,#3f3f46);cursor:pointer;padding:0}',
  '.hub-sw-on{background:var(--dsw-alias-state-success-primary,#10b981);border-color:var(--dsw-alias-state-success-primary,#10b981)}',
  '.hub-knob{position:absolute;top:2px;left:2px;width:14px;height:14px;border-radius:7px;background:#fff;transition:transform 0.16s}',
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

  const load = React.useCallback(function () {
    host.call('hub:rows', {}).then(setData).catch(function (error) {
      console.error('hub:rows failed', error)
    })
  }, [])

  React.useEffect(function () { load() }, [load])

  if (data === null) return React.createElement('div', { className: 'hub' }, '正在读取技能…')

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

  return React.createElement('div', { className: 'hub' },
    React.createElement('div', { className: 'hub-bar' },
      React.createElement('span', { className: 'hub-count' }, '共 ' + data.total + ' 个技能，已关闭 ' + data.off.length + ' 个'),
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
          return React.createElement('div', {
            className: 'hub-item' + (row.enabled ? '' : ' hub-down'),
            key: row.name,
          },
            React.createElement('div', { className: 'hub-row' },
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
            React.createElement('div', { className: 'hub-desc' }, row.description),
          )
        }),
    ),
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
