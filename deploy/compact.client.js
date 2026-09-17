/**
 * dsh-skill-hub — compact browser half (deployment copy).
 *
 * Behaviourally the same package as `src/client/client.js`, with the prose
 * comments dropped so the built payload stays small enough to paste into a
 * `cordis_define` call by hand.
 *
 * `payload/compact.client.txt` is this file's built payload; the deployment
 * section of the README explains which copy to prefer.
 */

const css = [
  '.sh-root{display:flex;flex-direction:column;height:100%;min-height:0;font-size:13px;color:var(--dsw-alias-label-primary,#fff)}',
  '.sh-bar{display:flex;align-items:center;gap:8px;flex-wrap:wrap;padding:12px 16px;border-bottom:1px solid var(--dsw-alias-border-l1,#333)}',
  '.sh-count{flex:1;min-width:110px;color:var(--dsw-alias-label-secondary,#aaa)}',
  '.sh-btn{padding:4px 10px;border-radius:6px;border:1px solid var(--dsw-alias-border-l1,#444);background:var(--dsw-alias-bg-layer-1,#2b2b2b);color:var(--dsw-alias-label-primary,#fff);font-size:12px;cursor:pointer}',
  '.sh-search{margin:10px 16px 0;padding:5px 10px;border-radius:6px;border:1px solid var(--dsw-alias-border-l1,#444);background:var(--dsw-alias-bg-layer-2,#222);color:var(--dsw-alias-label-primary,#fff);font-size:12px;outline:none}',
  '.sh-list{flex:1;min-height:0;overflow-y:auto;padding:10px 16px;display:flex;flex-direction:column;gap:8px}',
  '.sh-item{border:1px solid var(--dsw-alias-border-l1,#333);border-radius:8px;padding:8px 12px;background:var(--dsw-alias-bg-layer-1,#1e1e1e)}',
  '.sh-off{opacity:0.55}',
  '.sh-row{display:flex;align-items:center;gap:8px}',
  '.sh-name{font-family:monospace;font-weight:600}',
  '.sh-tag{font-size:10px;padding:1px 6px;border-radius:4px;border:1px solid var(--dsw-alias-border-l1,#444);color:var(--dsw-alias-label-secondary,#aaa)}',
  '.sh-on{color:var(--dsw-alias-state-success-primary,#22c55e);border-color:var(--dsw-alias-state-success-primary,#22c55e)}',
  '.sh-grow{flex:1}',
  '.sh-desc{margin-top:5px;line-height:1.45;color:var(--dsw-alias-label-secondary,#ccc)}',
  '.sh-when{margin-top:4px;line-height:1.45;color:var(--dsw-alias-label-tertiary,#999)}',
  '.sh-sw{position:relative;width:38px;height:20px;flex:none;border-radius:10px;border:1px solid var(--dsw-alias-border-l2,#52525b);background:var(--dsw-alias-bg-layer-2,#3f3f46);cursor:pointer;padding:0}',
  '.sh-sw-on{background:var(--dsw-alias-state-success-primary,#10b981);border-color:var(--dsw-alias-state-success-primary,#10b981)}',
  '.sh-knob{position:absolute;top:2px;left:2px;width:14px;height:14px;border-radius:7px;background:#fff;transition:transform 0.16s}',
  '.sh-sw-on .sh-knob{transform:translateX(18px)}',
  '.sh-foot{border-top:1px solid var(--dsw-alias-border-l1,#333);padding:10px 16px 14px;color:var(--dsw-alias-label-secondary,#ccc)}',
  '.sh-path{font-family:monospace;font-size:11px;color:var(--dsw-alias-label-tertiary,#8b93a1);word-break:break-all;margin-top:4px}',
  '.sh-muted{color:var(--dsw-alias-label-tertiary,#8b93a1)}',
  '.sh-modal{position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,0.62);display:flex;align-items:center;justify-content:center}',
  '.sh-card{width:740px;max-width:92vw;height:600px;max-height:88vh;display:flex;flex-direction:column;overflow:hidden;border-radius:12px;border:1px solid var(--dsw-alias-border-l2,#555);background:var(--dsw-alias-bg-base,#1c1c1e)}',
  '.sh-head{display:flex;align-items:center;gap:8px;padding:12px 16px;border-bottom:1px solid var(--dsw-alias-border-l1,#333);background:var(--dsw-alias-bg-layer-1,#242426)}',
  '.sh-title{font-weight:600;font-size:14px}',
  '.sh-close{border:0;background:none;color:var(--dsw-alias-label-secondary,#aaa);font-size:18px;line-height:1;padding:2px 8px;cursor:pointer}',
  '.sh-row-link{display:flex;align-items:center;gap:12px;padding:12px 16px;border-radius:8px;border:1px solid var(--dsw-alias-border-l1,#333);background:var(--dsw-alias-bg-layer-1,#222);margin-bottom:8px}',
].join('\n')

function Switcher(props) {
  return React.createElement('button', {
    type: 'button',
    role: 'switch',
    'aria-checked': props.checked,
    'aria-label': props.label,
    className: 'sh-sw' + (props.checked ? ' sh-sw-on' : ''),
    onClick: function (event) { event.stopPropagation(); props.onChange(!props.checked) },
  }, React.createElement('span', { className: 'sh-knob' }))
}

function Panel() {
  const state = React.useState(null)
  const data = state[0]
  const setData = state[1]
  const searchState = React.useState('')
  const search = searchState[0]
  const setSearch = searchState[1]

  const load = React.useCallback(function (rescan) {
    host.call('skillhub:state', rescan === true ? { rescan: true } : {}).then(setData).catch(function (error) {
      console.error('skillhub:state failed', error)
    })
  }, [])

  React.useEffect(function () { load(false) }, [load])

  if (data === null) return React.createElement('div', { className: 'sh-list' }, '正在读取技能目录…')

  const query = search.trim().toLowerCase()
  const rows = data.skills.filter(function (row) {
    if (query === '') return true
    if (row.name.toLowerCase().indexOf(query) >= 0) return true
    return row.description.toLowerCase().indexOf(query) >= 0
  })
  const off = data.skills.filter(function (row) { return !row.enabled })
  const names = data.skills.map(function (row) { return row.name })

  const flipOne = function (name, next) {
    setData(function (previous) {
      return Object.assign({}, previous, {
        skills: previous.skills.map(function (row) {
          return row.name === name ? Object.assign({}, row, { enabled: next }) : row
        }),
      })
    })
    host.call('skillhub:toggle', { names: [name], enabled: next }).catch(function () { load(false) })
  }

  const flipAll = function (next) {
    setData(function (previous) {
      return Object.assign({}, previous, {
        skills: previous.skills.map(function (row) { return Object.assign({}, row, { enabled: next }) }),
      })
    })
    host.call('skillhub:toggle-all', { names: names, enabled: next }).catch(function () { load(false) })
  }

  const children = [
    React.createElement('div', { className: 'sh-bar', key: 'bar' },
      React.createElement('span', { className: 'sh-count' }, '共 ' + data.skills.length + ' 个技能，已关闭 ' + off.length + ' 个'),
      React.createElement('button', { type: 'button', className: 'sh-btn', key: 'on', onClick: function () { flipAll(true) } }, '全部开启'),
      React.createElement('button', { type: 'button', className: 'sh-btn', key: 'off', onClick: function () { flipAll(false) } }, '全部关闭'),
      React.createElement('button', { type: 'button', className: 'sh-btn', key: 'rf', onClick: function () { load(true) } }, '刷新'),
    ),
    React.createElement('input', {
      className: 'sh-search',
      key: 'search',
      type: 'text',
      placeholder: '搜索技能名称或描述…',
      value: search,
      onChange: function (event) { setSearch(event.target.value) },
    }),
  ]

  if (off.length > 0) {
    children.push(React.createElement('div', { className: 'sh-foot', key: 'note' },
      React.createElement('div', null, '已关闭的技能对模型隐藏：skill 工具无法加载，可用技能目录里也不会出现。'),
      React.createElement('div', { className: 'sh-muted' }, '关闭中：' + off.map(function (row) { return row.name }).join(', ')),
    ))
  }

  children.push(React.createElement('div', { className: 'sh-list', key: 'list' },
    rows.length === 0
      ? React.createElement('div', { className: 'sh-muted' }, '没有匹配的技能')
      : rows.map(function (row) {
        const item = [
          React.createElement('div', { className: 'sh-row', key: 'head' },
            React.createElement('span', { className: 'sh-name' }, row.name),
            React.createElement('span', { className: 'sh-tag' + (row.enabled ? ' sh-on' : '') }, row.enabled ? '已开启' : '已关闭'),
            row.provider !== '' ? React.createElement('span', { className: 'sh-tag' }, row.provider) : null,
            React.createElement('span', { className: 'sh-grow' }),
            React.createElement(Switcher, {
              checked: row.enabled,
              label: row.name,
              onChange: function (next) { flipOne(row.name, next) },
            }),
          ),
          React.createElement('div', { className: 'sh-desc', key: 'd' }, row.description),
        ]
        if (row.whenToUse !== '') {
          item.push(React.createElement('div', { className: 'sh-when', key: 'w' }, '适用场景：' + row.whenToUse))
        }
        return React.createElement('div', {
          className: 'sh-item' + (row.enabled ? '' : ' sh-off'),
          key: row.name,
        }, item)
      }),
  ))

  children.push(React.createElement('div', { className: 'sh-foot', key: 'repo' },
    React.createElement('div', { className: 'sh-row' },
      React.createElement('span', { className: 'sh-name' }, '共享技能仓库'),
      React.createElement('span', { className: 'sh-tag' }, data.repo.loaded + ' 个'),
      React.createElement('span', { className: 'sh-grow' }),
      React.createElement('button', { type: 'button', className: 'sh-btn', onClick: function () { load(true) } }, '重新扫描'),
    ),
    React.createElement('div', { className: 'sh-path' }, data.repo.path),
    data.repo.available ? null : React.createElement('div', { className: 'sh-muted' }, '文件系统服务不可用，仓库读取已跳过。'),
    data.repo.skipped.length > 0
      ? React.createElement('div', { className: 'sh-muted' }, '被忽略：' + data.repo.skipped.map(function (row) {
        return row.name + '（' + row.reason + '）'
      }).join('，'))
      : null,
  ))

  return React.createElement('div', { className: 'sh-root' }, children)
}

function Shortcut() {
  const state = React.useState(false)
  const open = state[0]
  const setOpen = state[1]
  const row = React.createElement('div', { className: 'sh-row-link' },
    React.createElement('div', null,
      React.createElement('div', null, 'Skills 技能管理'),
      React.createElement('div', { className: 'sh-muted' }, '用开关控制每个技能的开启与关闭'),
    ),
    React.createElement('span', { className: 'sh-grow' }),
    React.createElement('button', { type: 'button', className: 'sh-btn', onClick: function () { setOpen(true) } }, '进入技能管理'),
  )
  if (!open) return row
  return React.createElement('div', null, row,
    React.createElement('div', { className: 'sh-modal', onClick: function () { setOpen(false) } },
      React.createElement('div', { className: 'sh-card', onClick: function (event) { event.stopPropagation() } },
        React.createElement('div', { className: 'sh-head' },
          React.createElement('span', { className: 'sh-title' }, 'Skills 技能管理'),
          React.createElement('span', { className: 'sh-grow' }),
          React.createElement('button', { type: 'button', className: 'sh-close', onClick: function () { setOpen(false) } }, '×'),
        ),
        React.createElement(Panel),
      ),
    ),
  )
}

/**
 * Register the three surfaces this plugin contributes.
 * @param {object} ctx - the guarded Cordis context a client half receives.
 */
export function apply(ctx) {
  const slots = ctx.get('slots')
  if (slots === undefined) return
  styles.insert(css)
  slots.inject('settings.section', function () {
    return slots.register({ name: 'settings.section', id: 'skills', order: 25, label: 'Skills 技能' }, function () {
      return React.createElement(Panel)
    })
  })
  slots.inject('settings.general.item', function () {
    return slots.register({ name: 'settings.general.item', id: 'skill-hub', order: 50 }, function () {
      return React.createElement(Shortcut)
    })
  })
  slots.inject('tool.view.cordis', function () {
    return slots.register({ name: 'tool.view.cordis', key: 'self' }, function () {
      return React.createElement(Panel)
    })
  })
}
