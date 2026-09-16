/**
 * dsh-skill-hub — browser half.
 *
 * Registers three surfaces, all rendering the same body:
 *
 *   - `settings.section`      → the "Skills" entry in the settings nav;
 *   - `settings.general.item` → a shortcut row with an 进入 button that opens
 *                               the manager as a modal;
 *   - `tool.view.cordis`      → the panel inside this Package's run card, so
 *                               the switches are reachable without leaving the
 *                               conversation.
 *
 * Client code is not transformed: no JSX, no TypeScript, no imports. React
 * arrives as the `React` builtin and Package-private RPC as `host.call`.
 */

styles.insert([
  '.sh-root{display:flex;flex-direction:column;height:100%;min-height:0;font-size:13px;color:var(--dsw-alias-label-primary,#fff)}',
  '.sh-note{padding:16px;color:var(--dsw-alias-label-tertiary,#8b93a1)}',
  '.sh-bar{display:flex;align-items:center;gap:8px;flex-wrap:wrap;padding:12px 16px;border-bottom:1px solid var(--dsw-alias-border-l1,#333)}',
  '.sh-count{color:var(--dsw-alias-label-secondary,#aaa);flex:1;min-width:120px}',
  '.sh-seg{display:flex;border:1px solid var(--dsw-alias-border-l1,#444);border-radius:6px;overflow:hidden}',
  '.sh-seg-btn{padding:4px 10px;border:0;background:var(--dsw-alias-bg-layer-1,#2b2b2b);color:var(--dsw-alias-label-secondary,#aaa);font-size:12px;cursor:pointer}',
  '.sh-seg-btn-on{background:var(--dsw-alias-brand-primary,#0a84ff);color:#fff}',
  '.sh-btn{padding:4px 10px;border-radius:6px;border:1px solid var(--dsw-alias-border-l1,#444);background:var(--dsw-alias-bg-layer-1,#2b2b2b);color:var(--dsw-alias-label-primary,#fff);font-size:12px;cursor:pointer}',
  '.sh-search{margin:10px 16px 0;padding:5px 10px;border-radius:6px;border:1px solid var(--dsw-alias-border-l1,#444);background:var(--dsw-alias-bg-layer-2,#222);color:var(--dsw-alias-label-primary,#fff);font-size:12px;outline:none}',
  '.sh-list{flex:1;min-height:0;overflow-y:auto;padding:10px 16px;display:flex;flex-direction:column;gap:8px}',
  '.sh-item{border:1px solid var(--dsw-alias-border-l1,#333);border-radius:8px;padding:8px 12px;background:var(--dsw-alias-bg-layer-1,#1e1e1e)}',
  '.sh-item-off{opacity:0.6}',
  '.sh-row{display:flex;align-items:center;gap:8px}',
  '.sh-name{font-family:monospace;font-weight:600;flex:none}',
  '.sh-badge{font-size:10px;padding:1px 6px;border-radius:4px;border:1px solid var(--dsw-alias-border-l1,#444);color:var(--dsw-alias-label-secondary,#aaa);background:var(--dsw-alias-bg-layer-2,#2a2a2a)}',
  '.sh-badge-on{color:var(--dsw-alias-state-success-primary,#22c55e);border-color:var(--dsw-alias-state-success-primary,#22c55e)}',
  '.sh-spacer{flex:1}',
  '.sh-desc{margin-top:5px;color:var(--dsw-alias-label-secondary,#ccc);line-height:1.45}',
  '.sh-when{margin-top:5px;color:var(--dsw-alias-label-tertiary,#999);line-height:1.45}',
  '.sh-switch{position:relative;width:38px;height:20px;flex:none;border-radius:10px;border:1px solid var(--dsw-alias-border-l2,#52525b);background:var(--dsw-alias-bg-layer-2,#3f3f46);cursor:pointer;padding:0}',
  '.sh-switch-on{background:var(--dsw-alias-state-success-primary,#10b981);border-color:var(--dsw-alias-state-success-primary,#10b981)}',
  '.sh-knob{position:absolute;top:2px;left:2px;width:14px;height:14px;border-radius:7px;background:#fff;transition:transform 0.16s}',
  '.sh-switch-on .sh-knob{transform:translateX(18px)}',
  '.sh-sec{border-top:1px solid var(--dsw-alias-border-l1,#333);padding:10px 16px 16px;color:var(--dsw-alias-label-secondary,#ccc)}',
  '.sh-path{font-family:monospace;font-size:11px;color:var(--dsw-alias-label-tertiary,#8b93a1);word-break:break-all;margin-top:4px}',
  '.sh-err{color:var(--dsw-alias-state-error-primary,#ef4444);margin-top:6px}',
  '.sh-muted{color:var(--dsw-alias-label-tertiary,#8b93a1)}',
  '.sh-modal{position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,0.62);display:flex;align-items:center;justify-content:center}',
  '.sh-card{width:760px;max-width:92vw;height:600px;max-height:88vh;display:flex;flex-direction:column;overflow:hidden;border-radius:12px;border:1px solid var(--dsw-alias-border-l2,#555);background:var(--dsw-alias-bg-base,#1c1c1e);box-shadow:0 18px 44px rgba(0,0,0,0.45)}',
  '.sh-card-head{display:flex;align-items:center;gap:8px;padding:12px 16px;border-bottom:1px solid var(--dsw-alias-border-l1,#333);background:var(--dsw-alias-bg-layer-1,#242426)}',
  '.sh-card-title{font-weight:600;font-size:14px}',
  '.sh-close{border:0;background:none;color:var(--dsw-alias-label-secondary,#aaa);font-size:18px;line-height:1;padding:2px 8px;cursor:pointer;border-radius:4px}',
  '.sh-shortcut{display:flex;align-items:center;gap:12px;padding:12px 16px;border-radius:8px;border:1px solid var(--dsw-alias-border-l1,#333);background:var(--dsw-alias-bg-layer-1,#222);margin-bottom:8px}',
  '.sh-shortcut-title{font-weight:500}',
  '.sh-shortcut-sub{font-size:12px;color:var(--dsw-alias-label-secondary,#aaa)}',
].join('\n'))

/* --------------------------------------------------------------- primitives */

function Switch(props) {
  return React.createElement('button', {
    type: 'button',
    role: 'switch',
    'aria-checked': props.checked,
    'aria-label': props.label,
    className: 'sh-switch' + (props.checked ? ' sh-switch-on' : ''),
    onClick: function (event) {
      event.stopPropagation()
      props.onChange(!props.checked)
    },
  }, React.createElement('span', { className: 'sh-knob' }))
}

function Badge(props) {
  return React.createElement('span', {
    className: 'sh-badge' + (props.on ? ' sh-badge-on' : ''),
  }, props.text)
}

function SkillRow(props) {
  const skill = props.skill
  const children = [
    React.createElement('div', { className: 'sh-row', key: 'head' },
      React.createElement('span', { className: 'sh-name' }, skill.name),
      React.createElement(Badge, { on: skill.enabled, text: skill.enabled ? '已开启' : '已关闭' }),
      skill.provider !== '' ? React.createElement(Badge, { text: skill.provider }) : null,
      React.createElement('span', { className: 'sh-spacer' }),
      React.createElement(Switch, {
        checked: skill.enabled,
        label: skill.name,
        onChange: function (next) { props.onToggle(skill.name, next) },
      }),
    ),
    React.createElement('div', { className: 'sh-desc', key: 'desc' }, skill.description),
  ]
  if (skill.whenToUse !== '') {
    children.push(React.createElement('div', { className: 'sh-when', key: 'when' }, '适用场景：' + skill.whenToUse))
  }
  return React.createElement('div', {
    className: 'sh-item' + (skill.enabled ? '' : ' sh-item-off'),
  }, children)
}

/* --------------------------------------------------------------- the panel */

function HubBody() {
  const stateSlot = React.useState(null)
  const data = stateSlot[0]
  const setData = stateSlot[1]
  const searchSlot = React.useState('')
  const search = searchSlot[0]
  const setSearch = searchSlot[1]
  const filterSlot = React.useState('all')
  const filter = filterSlot[0]
  const setFilter = filterSlot[1]

  const load = React.useCallback(function (rescan) {
    const call = host.call('skills:state', rescan === true ? { rescan: true } : {})
    call.then(setData).catch(function (error) {
      console.error('skills:state failed', error)
    })
  }, [])

  React.useEffect(function () {
    load(false)
  }, [load])

  if (data === null) {
    return React.createElement('div', { className: 'sh-note' }, '正在读取技能目录…')
  }

  const skills = data.skills
  const query = search.trim().toLowerCase()
  const visible = skills.filter(function (skill) {
    if (filter === 'on' && !skill.enabled) return false
    if (filter === 'off' && skill.enabled) return false
    if (query === '') return true
    if (skill.name.toLowerCase().indexOf(query) >= 0) return true
    if (skill.description.toLowerCase().indexOf(query) >= 0) return true
    return false
  })
  const off = skills.filter(function (skill) { return !skill.enabled })
  const allNames = skills.map(function (skill) { return skill.name })

  function toggle(name, next) {
    setData(function (previous) {
      const rows = previous.skills.map(function (skill) {
        return skill.name === name ? Object.assign({}, skill, { enabled: next }) : skill
      })
      return Object.assign({}, previous, { skills: rows })
    })
    host.call('skills:toggle', { names: [name], enabled: next }).catch(function () { load(false) })
  }

  function toggleAll(next) {
    setData(function (previous) {
      const rows = previous.skills.map(function (skill) {
        return Object.assign({}, skill, { enabled: next })
      })
      return Object.assign({}, previous, { skills: rows })
    })
    host.call('skills:toggle-all', { names: allNames, enabled: next }).catch(function () { load(false) })
  }

  const segments = [
    { key: 'all', label: '全部' },
    { key: 'on', label: '已开启' },
    { key: 'off', label: '已关闭' },
  ]

  const children = [
    React.createElement('div', { className: 'sh-bar', key: 'bar' },
      React.createElement('span', { className: 'sh-count' },
        '共 ' + skills.length + ' 个技能，已关闭 ' + off.length + ' 个'),
      React.createElement('div', { className: 'sh-seg', key: 'seg' },
        segments.map(function (segment) {
          return React.createElement('button', {
            type: 'button',
            key: segment.key,
            className: 'sh-seg-btn' + (filter === segment.key ? ' sh-seg-btn-on' : ''),
            onClick: function () { setFilter(segment.key) },
          }, segment.label)
        })),
      React.createElement('button', { type: 'button', className: 'sh-btn', onClick: function () { toggleAll(true) } }, '全部开启'),
      React.createElement('button', { type: 'button', className: 'sh-btn', onClick: function () { toggleAll(false) } }, '全部关闭'),
      React.createElement('button', { type: 'button', className: 'sh-btn', onClick: function () { load(true) } }, '刷新'),
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
    children.push(React.createElement('div', {
      className: 'sh-sec',
      key: 'offnote',
    },
      React.createElement('div', null, '已关闭的技能对模型隐藏：skill 工具无法加载，可用技能目录里也不会出现，斜杠菜单同步移除。'),
      React.createElement('div', { className: 'sh-muted' }, '关闭中：' + off.map(function (skill) { return skill.name }).join(', ')),
    ))
  }

  children.push(React.createElement('div', { className: 'sh-list', key: 'list' },
    visible.length === 0
      ? React.createElement('div', { className: 'sh-muted' }, '没有匹配的技能')
      : visible.map(function (skill) {
        return React.createElement(SkillRow, {
          key: skill.name,
          skill: skill,
          onToggle: toggle,
        })
      }),
  ))

  children.push(React.createElement('div', { className: 'sh-sec', key: 'repo' },
    React.createElement('div', { className: 'sh-row' },
      React.createElement('span', { className: 'sh-name' }, '共享技能仓库'),
      React.createElement(Badge, { text: data.repo.skills.length + ' 个' }),
      React.createElement('span', { className: 'sh-spacer' }),
      React.createElement('button', {
        type: 'button',
        className: 'sh-btn',
        onClick: function () { load(true) },
      }, '重新扫描'),
    ),
    React.createElement('div', { className: 'sh-path' }, data.repo.path),
    data.repo.available ? null : React.createElement('div', { className: 'sh-err' }, '文件系统服务不可用，仓库读取已跳过。'),
    data.repo.error !== null && data.repo.error !== undefined
      ? React.createElement('div', { className: 'sh-err' }, '扫描失败：' + data.repo.error)
      : null,
    data.repo.problems.length > 0
      ? React.createElement('div', { className: 'sh-muted' }, '被忽略的条目：' + data.repo.problems.map(function (problem) {
        return problem.name + '（' + problem.reason + '）'
      }).join('，'))
      : null,
  ))

  return React.createElement('div', { className: 'sh-root' }, children)
}

function HubSection() {
  return React.createElement(HubBody)
}

function HubShortcut() {
  const openSlot = React.useState(false)
  const open = openSlot[0]
  const setOpen = openSlot[1]

  const row = React.createElement('div', { className: 'sh-shortcut' },
    React.createElement('div', null,
      React.createElement('div', { className: 'sh-shortcut-title' }, 'Skills 技能管理'),
      React.createElement('div', { className: 'sh-shortcut-sub' }, '查看所有可用技能，并用开关控制开启与关闭'),
    ),
    React.createElement('span', { className: 'sh-spacer' }),
    React.createElement('button', {
      type: 'button',
      className: 'sh-btn',
      onClick: function () { setOpen(true) },
    }, '进入技能管理'),
  )

  if (!open) return row

  return React.createElement('div', null, row,
    React.createElement('div', {
      className: 'sh-modal',
      onClick: function () { setOpen(false) },
    },
      React.createElement('div', {
        className: 'sh-card',
        onClick: function (event) { event.stopPropagation() },
      },
        React.createElement('div', { className: 'sh-card-head' },
          React.createElement('span', { className: 'sh-card-title' }, 'Skills 技能管理'),
          React.createElement('span', { className: 'sh-spacer' }),
          React.createElement('button', {
            type: 'button',
            className: 'sh-close',
            onClick: function () { setOpen(false) },
          }, '×'),
        ),
        React.createElement(HubBody),
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

  slots.inject('settings.section', function () {
    return slots.register({
      name: 'settings.section',
      id: 'skills',
      order: 25,
      label: 'Skills 技能',
    }, function () { return React.createElement(HubSection) })
  })

  slots.inject('settings.general.item', function () {
    return slots.register({
      name: 'settings.general.item',
      id: 'skill-hub',
      order: 50,
    }, function () { return React.createElement(HubShortcut) })
  })

  slots.inject('tool.view.cordis', function () {
    return slots.register({
      name: 'tool.view.cordis',
      key: 'self',
    }, function () { return React.createElement(HubSection) })
  })
}
