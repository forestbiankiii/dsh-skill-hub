window.__ModuleLoader__.load({
id:"dsh-skill-hub",
factory:(require)=>{var module={exports:{}};var exports=module.exports;
'use strict';
const React = require('react');
const { useState, useEffect, useCallback, useMemo, createElement } = React;
exports.inject = undefined;
exports.apply = undefined;
/**
 * dsh-skill-hub — browser half.
 *
 * Two pages behind one tab strip, the same shape the dynamic build had:
 *
 *   skills    skills grouped by their upstream repository, with a scope
 *             selector deciding whose switch set is being edited
 *   settings  the skill repository path
 *
 * How it reaches the Host is the one real difference. A dynamic Package could
 * call `host.call(method, args)`; a static plugin cannot — it goes through DSH's
 * authenticated `/api` bridge instead:
 *
 *     connection.rpc.call('/api', 'skill-hub/<endpoint>', payload)
 *
 * which lands on the route `lib/index.js` registers and answers with
 * `{ ok: true, value }` or `{ ok: false, error }`.
 *
 * The build step wraps this file: it prepends `require('react')` and hands the
 * whole body to `window.__ModuleLoader__.load(...)`. That is why `React`,
 * `useState`, `useEffect` and `createElement` appear as free variables here —
 * they are bound by the wrapper, not imported, because the browser bundle is not
 * transformed by a bundler.
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
  '.hub .hub-link{display:inline-flex;align-items:center;gap:6px;min-width:0;max-width:100%;padding:2px 0;border-radius:4px;color:#79c0ff;font-family:inherit;font-size:12px;line-height:1.5;text-decoration:none;outline:none}',
  '.hub-link-label{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;text-decoration:underline;text-decoration-thickness:1px;text-underline-offset:3px}',
  '.hub-github-icon{width:14px;height:14px;flex:none;fill:currentColor}',
  '.hub-link:hover{color:#a5d6ff;background:rgba(121,192,255,0.12)}',
  '.hub-link:focus-visible{outline:2px solid #79c0ff;outline-offset:2px}',
  '.hub-select{padding:5px 10px;border-radius:6px;border:1px solid var(--dsw-alias-border-l1,#444);background:var(--dsw-alias-bg-layer-2,#222);color:var(--dsw-alias-label-primary,#fff);font-family:inherit;font-size:12px;cursor:pointer;transition:border-color 0.15s}',
  '.hub-select:hover{border-color:var(--dsw-alias-border-l2,#666)}',
  '.hub-search{flex:1;min-width:140px;padding:6px 10px;border-radius:6px;border:1px solid var(--dsw-alias-border-l1,#444);background:var(--dsw-alias-bg-layer-2,#222);color:var(--dsw-alias-label-primary,#fff);font-family:inherit;font-size:12px;outline:none;transition:border-color 0.15s}',
  '.hub-search:hover{border-color:var(--dsw-alias-border-l2,#666)}',
  '.hub-search:focus{border-color:var(--dsw-alias-brand-primary,#0a84ff)}',
  '.hub-list{display:flex;flex-direction:column;gap:12px;min-width:0}',
  '.hub-group{min-width:0;border:1px solid var(--dsw-alias-border-l1,#383838);border-radius:10px;background:var(--dsw-alias-bg-layer-1,#242424);overflow:hidden}',
  '.hub-group:hover{border-color:var(--dsw-alias-border-l2,#505050)}',
  '.hub-head{display:grid;grid-template-columns:minmax(0,1fr) auto;align-items:center;column-gap:16px;row-gap:8px;padding:16px 18px}',
  '.hub-head-open{border-bottom:1px solid var(--dsw-alias-border-l1,#383838)}',
  '.hub .hub-series{margin:0;min-width:0;font-family:inherit;font-size:14px;font-weight:600;line-height:1.5;overflow-wrap:anywhere;color:inherit}',
  '.hub .hub-disclosure{display:flex;align-items:center;gap:8px;text-align:left;padding:0;border:0;border-radius:4px;background:none;cursor:pointer}',
  '.hub-disclosure:hover .hub-series-label{text-decoration:underline;text-underline-offset:3px}',
  '.hub-chevron{flex:none;font-size:12px;color:var(--dsw-alias-label-tertiary,#999)}',
  '.hub-series-label{min-width:0;overflow-wrap:anywhere}',
  '.hub-meta{grid-column:1/-1;display:flex;align-items:center;flex-wrap:wrap;gap:6px 14px;min-width:0}',
  '.hub-status{display:inline-flex;align-items:center;gap:6px;font-size:11px;line-height:1.5;color:var(--dsw-alias-label-tertiary,#999);white-space:nowrap}',
  '.hub-status-dot{width:5px;height:5px;border-radius:50%;background:currentColor}',
  '.hub-status-on .hub-status-dot{background:var(--dsw-alias-state-success-primary,#58bc69)}',
  '.hub-single-body{padding:0 18px 16px}',
  '.hub .hub-description{margin:0;min-width:0;font-size:13px;line-height:1.65;overflow-wrap:anywhere;color:var(--dsw-alias-label-secondary,#c0c0c0)}',
  '.hub .hub-description summary{list-style:none;cursor:pointer;border-radius:4px}',
  '.hub-description summary::-webkit-details-marker{display:none}',
  '.hub-description:not([open]) .hub-description-text{display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden}',
  '.hub-description-hint{display:block;margin-top:6px;font-size:11px;color:var(--dsw-alias-label-tertiary,#999)}',
  '.hub-description[open] .hub-more,.hub-description:not([open]) .hub-less{display:none}',
  '.hub :is(.hub-disclosure,.hub-sw,.hub-description summary):focus-visible{outline:2px solid #79c0ff;outline-offset:3px}',
  '.hub-tag{font-size:10px;padding:1px 6px;border-radius:4px;border:1px solid var(--dsw-alias-border-l1,#444);color:var(--dsw-alias-label-secondary,#aaa);white-space:nowrap}',
  '.hub-tag-on{color:var(--dsw-alias-state-success-primary,#22c55e);border-color:var(--dsw-alias-state-success-primary,#22c55e)}',
  '.hub-grow{flex:1;min-width:0}',
  '.hub-items{display:flex;flex-direction:column}',
  '.hub-item{padding:14px 18px;border-top:1px solid var(--dsw-alias-border-l1,#333)}',
  '.hub-item:first-child{border-top:0}',
  '.hub-down .hub-name{color:var(--dsw-alias-label-tertiary,#999)}',
  '.hub-row{display:flex;align-items:center;gap:12px;margin-bottom:8px;min-width:0}',
  '.hub-name{min-width:0;overflow-wrap:anywhere;font-family:inherit;font-size:13px;font-weight:600}',
  '.hub-desc{margin-top:5px;font-size:12px;line-height:1.55;color:var(--dsw-alias-label-secondary,#ccc)}',
  '.hub-note{margin-top:4px;font-size:11px;line-height:1.5;color:var(--dsw-alias-label-tertiary,#999);word-break:break-word}',
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

/** Bound in {@link apply}; every page reads it through {@link call}. */
let rpc

/** Invoke one Host endpoint through the authenticated `/api` bridge. */
async function call(endpoint, payload) {
  const response = await rpc.call('/api', `skill-hub/${endpoint}`, payload ?? {})
  if (response?.ok !== true) {
    const message = response?.error?.message
    throw new Error(typeof message === 'string' && message.length > 0 ? message : '技能服务不可用')
  }
  return response.value
}

/* --------------------------------------------------------------- primitives */

function Sw(props) {
  return createElement('button', {
    type: 'button',
    role: 'switch',
    'aria-checked': props.on,
    'aria-label': props.label,
    className: 'hub-sw' + (props.on ? ' hub-sw-on' : ''),
    onClick: function (event) { event.stopPropagation(); props.flip(!props.on) },
  }, createElement('span', { className: 'hub-knob' }))
}

function Btn(props) {
  return createElement('button', {
    type: 'button',
    className: 'hub-btn',
    disabled: props.disabled === true,
    onClick: props.onClick,
  }, props.text)
}

/** Native disclosure keeps long descriptions readable without hiding the full text. */
function SkillDescription(props) {
  const text = String(props.text || '').trim()
  if (!text) return null
  if (text.length <= 180) return createElement('p', { className: 'hub-description' }, text)
  return createElement('details', { className: 'hub-description' },
    createElement('summary', null,
      createElement('span', { className: 'hub-description-text' }, text),
      createElement('span', { className: 'hub-description-hint hub-more' }, '展开说明 ↓'),
      createElement('span', { className: 'hub-description-hint hub-less' }, '收起说明 ↑'),
    ),
  )
}

/* -------------------------------------------------------------------- pages */

function PageSkills(props) {
  const data = props.data
  const setData = props.setData
  const reload = props.reload

  const searchState = useState('')
  const query = searchState[0]
  const setQuery = searchState[1]
  const openState = useState({})
  const open = openState[0]
  const setOpen = openState[1]
  const errState = useState(null)
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
    const key = 'series:' + row.series
    if (index[key] === undefined) {
      index[key] = { key: key, series: row.series, url: row.url, upstream: row.upstream, note: row.note, skills: [] }
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
    call('flip', { workspace: data.active, names: names, enabled: enabled }).catch(function (error) {
      setActionError(String(error && error.message ? error.message : error))
      reload()
    })
  }

  const sendAll = function (enabled) {
    const names = data.rows.map(function (row) { return row.name })
    patch(names, enabled)
    setActionError(null)
    call('flip-all', { workspace: data.active, names: names, enabled: enabled }).catch(function (error) {
      setActionError(String(error && error.message ? error.message : error))
      reload()
    })
  }

  const scopeOptions = [{ key: '', title: '全局（没有工作区的会话）' }].concat(data.scopes)

  const children = [
    createElement('div', { className: 'hub-bar', key: 'scope' },
      createElement('span', { className: 'hub-note', style: { marginTop: 0 } }, '开关作用域'),
      createElement('select', {
        className: 'hub-select',
        value: props.scope,
        onChange: function (event) { props.setScope(event.target.value) },
      }, scopeOptions.map(function (option) {
        return createElement('option', { key: option.key, value: option.key }, option.title)
      })),
      createElement('span', { className: 'hub-tag' + (data.active === props.scope ? ' hub-tag-on' : '') },
        data.active === props.scope ? '当前会话' : '其他作用域'),
      createElement('span', { className: 'hub-grow' }),
      createElement('span', { className: 'hub-count' },
        '共 ' + data.total + ' 个，已关闭 ' + data.offCount + ' 个'),
    ),
    createElement('div', { className: 'hub-bar', key: 'actions' },
      createElement('input', {
        className: 'hub-search',
        type: 'text',
        placeholder: '搜索技能名、描述或系列名…',
        value: query,
        onChange: function (event) { setQuery(event.target.value) },
      }),
      createElement(Btn, { text: '全部开启', onClick: function () { sendAll(true) } }),
      createElement(Btn, { text: '全部关闭', onClick: function () { sendAll(false) } }),
      createElement(Btn, { text: '刷新', onClick: reload }),
    ),
  ]

  if (props.scope !== data.active) {
    children.push(createElement('div', { className: 'hub-note hub-warn', key: 'warn' },
      '正在编辑「' + (props.scope === '' ? '全局' : props.scope) + '」的开关；本会话属于「'
      + data.activeTitle + '」，不受这里影响。'))
  } else if (data.inherited) {
    children.push(createElement('div', { className: 'hub-note', key: 'inherit' },
      '这个工作区还没有独立设置，现在沿用全局；改动任意一项即会为它单独存一份。'))
  }

  if (actionError !== null) {
    children.push(createElement('div', { className: 'hub-note hub-err', key: 'err' }, '写入失败：' + actionError))
  }

  children.push(createElement('div', { className: 'hub-list', key: 'list' },
    grouped.length === 0
      ? createElement('div', { className: 'hub-note' }, '没有匹配的技能')
      : grouped.map(function (group) {
        const single = group.skills.length === 1
        const expanded = single ? true : open[group.key] === true
        const onCount = group.skills.filter(function (skill) { return skill.enabled }).length

        const repositoryLink = group.url !== ''
            ? createElement('a', {
              className: 'hub-link',
              href: group.url,
              target: '_blank',
              rel: 'noreferrer noopener',
              title: group.url,
              'aria-label': '打开 GitHub 仓库：' + (group.upstream || group.series),
            },
              createElement('span', { className: 'hub-link-label' }, group.upstream || 'GitHub'),
              createElement('svg', {
                className: 'hub-github-icon',
                viewBox: '0 0 24 24',
                'aria-hidden': 'true',
              }, createElement('path', {
                d: 'M12 2C6.477 2 2 6.484 2 12.017c0 4.426 2.865 8.18 6.839 9.504.5.093.682-.217.682-.483 0-.237-.009-.866-.014-1.7-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.071 1.531 1.03 1.531 1.03.892 1.53 2.341 1.088 2.91.832.091-.647.35-1.088.636-1.338-2.221-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.987 1.03-2.687-.103-.253-.447-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.56 9.56 0 0 1 12 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.594 1.028 2.687 0 3.848-2.337 4.695-4.566 4.943.359.31.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0 0 22 12.017C22 6.484 17.522 2 12 2Z',
              })),
            )
            : null

        const head = createElement('div', {
          className: 'hub-head' + (expanded && !single ? ' hub-head-open' : ''),
          key: 'head',
        },
          single
            ? createElement('div', { className: 'hub-series' }, group.skills[0].name)
            : createElement('button', {
              type: 'button',
              className: 'hub-series hub-disclosure',
              'aria-expanded': expanded,
              onClick: function () {
                setOpen(function (prev) {
                  return Object.assign({}, prev, { [group.key]: !prev[group.key] })
                })
              },
            },
              createElement('span', { className: 'hub-chevron', 'aria-hidden': true }, expanded ? '▾' : '▸'),
              createElement('span', { className: 'hub-series-label' }, group.series),
            ),
          createElement(Sw, {
            on: onCount === group.skills.length,
            label: single ? group.skills[0].name : group.series + ' 系列全部技能',
            flip: function (next) { send(group.skills.map(function (skill) { return skill.name }), next) },
          }),
          createElement('div', { className: 'hub-meta' },
            createElement('span', {
              className: 'hub-status' + (onCount > 0 ? ' hub-status-on' : ''),
            },
              createElement('span', { className: 'hub-status-dot', 'aria-hidden': true }),
              single ? (onCount ? '已开启' : '已关闭') : group.skills.length + ' 个技能 · 已开启 ' + onCount + ' 个',
            ),
            repositoryLink || createElement('span', { className: 'hub-status' }, group.note || '本地技能'),
          ),
        )

        const body = []
        if (single) {
          body.push(createElement('div', { className: 'hub-single-body', key: 'description' },
            createElement(SkillDescription, { text: group.skills[0].description }),
            group.skills[0].whenToUse !== ''
              ? createElement('div', { className: 'hub-note' }, '适用场景：' + group.skills[0].whenToUse)
              : null,
          ))
        } else if (expanded) {
          body.push(createElement('div', { className: 'hub-items', key: 'items' },
            group.skills.map(function (skill) {
              const box = [
                createElement('div', { className: 'hub-row', key: 'head' },
                  createElement('span', { className: 'hub-name' }, skill.name),
                  createElement('span', { className: 'hub-grow' }),
                  createElement(Sw, {
                    on: skill.enabled,
                    label: skill.name,
                    flip: function (next) { send([skill.name], next) },
                  }),
                ),
                createElement(SkillDescription, { key: 'desc', text: skill.description }),
              ]
              if (skill.whenToUse !== '') {
                box.push(createElement('div', { className: 'hub-note', key: 'when' },
                  '适用场景：' + skill.whenToUse))
              }
              if (skill.note !== '') {
                box.push(createElement('div', { className: 'hub-note', key: 'note' }, skill.note))
              }
              return createElement('div', {
                className: 'hub-item' + (skill.enabled ? '' : ' hub-down'),
                key: skill.name,
              }, box)
            }),
          ))
        }

        return createElement('div', { className: 'hub-group', key: group.key }, [head].concat(body))
      }),
  ))

  return createElement('div', { className: 'hub-body' }, children)
}

function PageSettings(props) {
  const data = props.data
  const draftState = useState(data.repo)
  const draft = draftState[0]
  const setDraft = draftState[1]
  const savingState = useState(false)
  const saving = savingState[0]
  const setSaving = savingState[1]
  const errState = useState(null)
  const error = errState[0]
  const setError = errState[1]

  useEffect(function () { setDraft(data.repo) }, [data.repo])

  const save = function (value) {
    setSaving(true)
    setError(null)
    call('repo', { repo: value }).then(function () {
      setSaving(false)
      props.reload()
    }).catch(function (failure) {
      setSaving(false)
      setError(String(failure && failure.message ? failure.message : failure))
    })
  }

  return createElement('div', { className: 'hub-body' },
    createElement('div', { className: 'hub-card' },
      createElement('div', { className: 'hub-card-title' }, '技能仓库地址'),
      createElement('div', { className: 'hub-row' },
        createElement('span', { className: 'hub-tag' + (data.repoStored ? ' hub-tag-on' : '') },
          data.repoStored ? '已自定义' : '默认'),
        createElement('span', { className: 'hub-grow' }),
        createElement('span', { className: 'hub-note', style: { marginTop: 0 } },
          '已收录 ' + data.repoLoaded + ' 个技能'),
      ),
      createElement('div', { className: 'hub-bar', style: { marginTop: '8px' } },
        createElement('input', {
          className: 'hub-search',
          type: 'text',
          placeholder: data.repoDefault,
          value: draft,
          onChange: function (event) { setDraft(event.target.value) },
        }),
        createElement(Btn, {
          text: saving ? '保存中…' : '保存并重新扫描',
          disabled: saving,
          onClick: function () { save(draft) },
        }),
        createElement(Btn, { text: '恢复默认', disabled: saving, onClick: function () { save('') } }),
      ),
      error !== null
        ? createElement('div', { className: 'hub-note hub-err' }, error)
        : createElement('div', { className: 'hub-note' },
          '留空并保存即恢复默认（' + data.repoDefault + '）；支持 ~ 开头的路径。'),
      data.repoLoaded === 0
        ? createElement('div', { className: 'hub-note hub-warn' },
          '注意：这个地址下没解析到任何技能。确认目录里有 SKILL.md，或者换成正确路径。')
        : null,
    ),
    createElement('div', { className: 'hub-card' },
      createElement('div', { className: 'hub-card-title' }, '上游来源与分组'),
      createElement('div', { className: 'hub-note', style: { marginTop: 0 } },
        '技能列表按上游仓库分组，系列名与 GitHub 地址读自仓库旁的 ' + data.lockFile + '。'),
      createElement('div', { className: 'hub-note' },
        '没有上游记录的技能会就地说明来源：远端 well-known 索引、本地自制，或由当前 agent 预设提供。'),
    ),
  )
}

/** The session the settings panel is showing, as the sessions store reports it. */
function currentSession(snapshot) {
  const id = snapshot ? snapshot.current : undefined
  return typeof id === 'string' ? id : ''
}

function Hub(props) {
  /* `useSessions` is a standard prop of every `settings.section` occupant, and a
     hook — so it runs here, unconditionally, at the top of the component. Calling
     it inside `load` would work on the first render and break on the click that
     reloads the list. The host turns this id into a workspace key. */
  const viewedSession = props.useSessions(currentSession)
  const state = useState(null)
  const data = state[0]
  const setData = state[1]
  const pageState = useState('skills')
  const page = pageState[0]
  const setPage = pageState[1]
  const scopeState = useState('')
  const scope = scopeState[0]
  const setScope = scopeState[1]
  const errState = useState(null)
  const trouble = errState[0]
  const setTrouble = errState[1]

  const load = useCallback(function (requested) {
    const payload = requested === undefined ? {} : { workspace: requested }
    if (viewedSession !== '') payload.sessionId = viewedSession
    call('state', payload).then(function (result) {
      setTrouble(null)
      setData(result)
      if (requested === undefined) setScope(result.active)
    }).catch(function (error) {
      setTrouble(String(error && error.message ? error.message : error))
    })
  }, [viewedSession])

  useEffect(function () { load() }, [load])

  const pickScope = function (key) {
    setScope(key)
    load(key)
  }

  if (data === null) {
    const waiting = [
      createElement('div', { className: 'hub-body', key: 'wait' },
        createElement('div', { className: 'hub-note' }, '正在读取技能…')),
    ]
    if (trouble !== null) {
      waiting.push(createElement('div', { className: 'hub-body', key: 'err' },
        createElement('div', { className: 'hub-note hub-err' }, '读取失败：' + trouble),
        createElement(Btn, { text: '重试', onClick: function () { load() } })))
    }
    return createElement('div', { className: 'hub' }, waiting)
  }

  return createElement('div', { className: 'hub' },
    createElement('div', { className: 'hub-tabs' },
      createElement('button', {
        type: 'button',
        className: 'hub-tab' + (page === 'skills' ? ' hub-tab-on' : ''),
        onClick: function () { setPage('skills') },
      }, '技能列表'),
      createElement('button', {
        type: 'button',
        className: 'hub-tab' + (page === 'settings' ? ' hub-tab-on' : ''),
        onClick: function () { setPage('settings') },
      }, '技能设置'),
    ),
    page === 'skills'
      ? createElement(PageSkills, {
        data: data,
        setData: setData,
        scope: scope,
        setScope: pickScope,
        reload: function () { load(scope) },
      })
      : createElement(PageSettings, {
        data: data,
        reload: function () { load(scope) },
      }),
  )
}

/** Services this half needs; matched by `dsh.client.inject` in package.json. */
const inject = ['slots', 'connection']

/**
 * @param {object} ctx - the client Context this plugin is mounted in.
 */
function apply(ctx) {
  const slots = ctx.get('slots')
  const connection = ctx.get('connection')
  if (connection === undefined) {
    ctx.logger?.warn?.('skill-hub: the connection service is absent; the panel cannot reach the host')
    return
  }
  rpc = connection.rpc

  /* A static client plugin has no `styles` builtin, so the stylesheet is a real
     <style> element owned by this fiber. */
  ctx.effect(function () {
    const tag = document.createElement('style')
    tag.dataset.plugin = 'dsh-skill-hub'
    tag.textContent = css
    document.head.appendChild(tag)
    return function () {
      tag.remove()
    }
  }, 'dsh-skill-hub: styles')

  if (slots === undefined) return
  slots.inject('settings.section', function () {
    return slots.register({
      name: 'settings.section',
      id: 'skills',
      order: 25,
      label: 'Skills 技能',
    }, function (props) {
      return createElement(Hub, props)
    })
  })
}

exports.inject = inject;
exports.apply = apply;
return module.exports;}});
