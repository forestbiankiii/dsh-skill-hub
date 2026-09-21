# 常驻插件形态 / the persistent form

同一件事的第二种做法：把两半边做成**装在 profile 里的普通插件**，而不是会话里的动态
Cordis Package。文件就是插件本体，改完重启一次生效，不需要把代码抄进 `cordis_define`。

| | 动态包（仓库根目录那版） | 常驻插件（本目录） |
| --- | --- | --- |
| 代码在哪 | `cordis_define` 的参数里 | `lib/index.js`、`lib/client.js` |
| 活多久 | 当前进程 | 进程 + 磁盘，重启后照常加载 |
| 拿什么读目录 | `ctx.fs` + `directoryPickerController`（沙箱没有 `node:fs`） | `node:fs/promises`，直接读 |
| 拿什么等定时器 | `ctx.interval`（`cordis-plugin-timer`） | `setInterval` |
| 浏览器半边怎么起 | `cordis_run` 的授权流程 | `dsh.client` 声明，启动时随启动图下发 |
| 两半边怎么说话 | `host.call(method, args)` | 认证过的 `/api` 网关（RPC 信封） |
| 改一行代码的代价 | 重新 define 一个新 Package，代码要重抄 | 改文件，重启 |

## 目录结构

```
persistent/
├── lib/index.js              # 宿主半边（唯一的运行时来源）
├── src/client.js             # 浏览器半边源码
├── lib/client.js             # 浏览器半边产物 ← 由 src/ 生成，不要手改
├── tools/build-client.mjs    # src → lib 的包装脚本；--check 校验是否同步
├── cordis.patch.yml          # 本插件唯一的 loader 行声明
├── package.json              # dsh.bundle.patch + dsh.client
├── smoke-host.mjs            # 桩 ctx 真跑 apply；含一次真实 RPC 信封往返
├── smoke-client.mjs          # 假 ModuleLoader + 假 React 渲染一次面板
├── verify-install.mjs        # 不重启即可检查 profile 集成是否自洽
└── rollback.ps1              # 卸载
```

## 安装

三处改动，都在 profile 里：

```jsonc
// ~/.dsh/profiles/desktop/package.json
{
  "dependencies": {
    "dsh-skill-hub": "file:../../local-plugins/dsh-skill-hub"
  },
  "dsh": { "profile": { "bundles": ["…", "dsh-skill-hub"] } }
}
```

```powershell
# ~/.dsh/profiles/desktop 下
pnpm install --frozen-lockfile
```

**就这两处。** loader 行本身由本目录自带的 `cordis.patch.yml` 通过 `dsh.bundle.patch`
声明；浏览器半边由 `dsh.client` + `exports["./client"]` 声明，`dsh-client-modules` 扫到
后把它并进启动图。

### 不要在 profile 的 cordis.patch.yml 里再写一行

这条是踩坑踩出来的。在用户补丁层里再插一行同样的 `insert`，DSH 会**启动失败**：

```
PackageOverlayNotFoundError: cannot resolve package "dsh-skill-hub"
from the Desktop installation or active Profile
  failed to import loader entry skill-hub (dsh-skill-hub)
```

`module-resolution` 的 `resolveFromAnchor` 按行的**来源**选解析基准：

```
parentURL: source === "profile" ? registration.profileBaseUrl : DESKTOP_ENTRY_URL
```

bundle 补丁里的行以 profile 为锚点，能找到 `profiles/desktop/node_modules/dsh-skill-hub`；
用户补丁层里的行没被归到 `profile`，于是以 **Desktop 安装**为锚点解析，那里根本没有这个包。
同样的行、同样的包名，**只因为写在哪一层就无法解析**。

用户补丁层是用来覆盖 config、禁用行的，不是给 bundle 插件插入口的。
`dsh-provider-extension` 就是这个正确形态的现成范例。

`verify-install.mjs` 会在重启**之前**把这条检查出来。

## 两半边怎么说话

常驻插件没有 `host.call()`，走 DSH 已经做过 Host/Origin 校验与浏览器认证的 `/api` 网关：

```
client   connection.rpc.call('/api', 'skill-hub/state', payload)
host     connection.fetch.register({ path: '/api/skill-hub/state', methods: ['POST'], … })
```

信封只有两种形状，`registerTransport()` 负责这一层：

```
in   { type: 'client-request',  rpcId, method: 'skill-hub/<endpoint>', payload }
out  { type: 'server-response', rpcId, result }   result = { ok: true, value }
                                                          | { ok: false, error }
```

四个端点：`state`（面板要的全部数据）、`flip`（一个/一组开关）、`flip-all`（整页开关）、
`repo`（换仓库地址）。非 JSON、坏 JSON、`method` 与路由不符分别回 415 / 400。

`connection` 不是硬依赖：宿主侧用 `ctx.inject(['connection'], …)` 等它出现，面板侧在
`ctx.get('connection')` 拿不到时只记一条 warn——技能开关本身照常工作。

## 改代码

```
src/client.js  --(node tools/build-client.mjs)-->  lib/client.js
```

浏览器拿到的就是 `lib/client.js`：`src/client.js` 外面裹一层
`window.__ModuleLoader__.load({ id, factory })`。页面不跑打包器，所以 `React` 由 factory
的 `require('react')` 提供（平台 seed 表里有），源码里不要写 `import`。
**改 `src/` 之后必须重新生成，不要手改 `lib/client.js`。**

装到 profile 的那份多数时候会自己跟上：pnpm 把 `file:` 依赖装成**硬链接**，源码文件和
`node_modules` 里那份是同一个 inode。

- **原地重写**（`writeFile` 即截断同一 inode）直接生效；
- **新增文件**不会凭空出现在 profile 里，要重装；
- **先写临时文件再 rename 的编辑器**会静默断开硬链接，源码新、profile 旧——删掉
  `node_modules/dsh-skill-hub` 再 `pnpm install` 即可。

`verify-install.mjs` 逐字节比对 `package.json`、`cordis.patch.yml`、`lib/index.js`、
`lib/client.js`，就是为了戳穿最后那种状态。

## 验证

```bash
npm run preflight     # check + smoke + verify
```

拆开是 `node --check`（语法）、`build-client.mjs --check`（产物是否与源码同步）、
`smoke-host.mjs`（真跑 `apply`：注册提供方、包装 `ctx.skills`、挂四个路由并回放一次
信封）、`smoke-client.mjs`（假 ModuleLoader + 假 React：注册 slot、装样式、渲染、
发一次 RPC）、`verify-install.mjs`（profile 集成，不需要重启）。

后两个默认指向本机的 `~/.dsh/profiles/desktop` 与 `~/.dsh/local-plugins/dsh-skill-hub`；
换机器时用 `DSH_SKILL_HUB_PROFILE` / `DSH_SKILL_HUB_PLUGIN` 覆盖。把 `DSH_SKILL_HUB_PROFILE`
指向一个故意做坏的 profile，它会失败并说明原因——这个守卫本身也被反证过。

## 卸载

```powershell
pwsh -NoLogo -NoProfile -File rollback.ps1
```

从 `package.json` 删掉依赖行与 bundles 条目、删掉 `node_modules` 里的目录。它**不碰**
`settings.yaml`、技能仓库、以及源码。跑完重启 DSH。

## 已知边界

- 关闭状态按**工作区路径**存，落在 `$DSH_HOME/settings.yaml` 的 `skill-hub` 段
  （`repo` / `disabled` / `workspaces.<path>.disabled`）。面板不直接改服务对象，而是重写
  文档再让提供方自己重读，这样插件重载不会把两半边拆开。
- 工作区在 `workspaceRegistry` 里没有独立开关集时沿用全局列表；面板会显示「现在沿用
  全局」。
- 强制动作发生在 `ctx.skills.snapshot()`，即**每次目录读取**时：一次开关改动在下一步
  生效，不会打断正在进行的步骤。
- `cordis.patch.yml` 里的行需要**重启**才应用。profile 虽然开着 `patchReload: live`，
  但那条路径走 HMR 的 `registerConfig`，而 HMR 在这个部署里 root 是空列表，插入型补丁
  不会热应用。
- 浏览器半边的改动需要**刷新页面**，宿主半边的改动需要**重启进程**。
