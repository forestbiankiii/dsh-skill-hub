# dsh-skill-hub

一个 DSH 动态 Cordis 插件：在设置面板里列出当前环境解析出的全部技能，用开关
控制每个技能的开启与关闭，并让 `~/.agents/skills` 这个共享技能仓库在**不重启**
的情况下对当前会话生效。

A dynamic [Cordis](https://www.npmjs.com/package/@deepseek-ai/cordis) plugin for
the DeepSeek Harness (DSH): it lists every resolved skill in the Settings panel,
toggles each one on or off, and makes the shared `~/.agents/skills` repository
live for the running session without a restart.

---

## 功能 / What it does

| 能力 | 说明 |
| --- | --- |
| **技能总览** | 列出会话能解析到的全部技能：预设内嵌、项目根、用户根、以及运行时注册的条目，显示名称、来源、说明与适用场景。 |
| **开关控制** | 每个技能一个开关。关闭后该技能对模型完全隐藏：`skill` 工具无法加载它，可用技能目录不再列出它，斜杠菜单同步移除；重新打开立即恢复。 |
| **共享仓库实时读取** | 把 `~/.agents/skills` 作为技能提供方注册进 `ctx.skills`，每 8 秒按 `name:version` 签名做一次廉价增量扫描，仓库里新增或修改的技能自动进入目录。 |
| **格式校验与诊断** | 按 DSH 的硬性规则校验 frontmatter，被拒绝的条目连同原因显示在面板里，不会静默消失。 |
| **三个入口** | 设置左侧导航的「Skills 技能」页；「常规」设置里的一行快捷入口（弹窗）；以及本次运行的对话卡片内嵌面板。 |

### 关闭一个技能时发生了什么

DSH 的技能注册表本身没有「禁用」概念，`dsh-tool-skill` 通过 `ctx.skills` 的
`snapshot` / `list` / `get` 三个方法读取目录。本插件在**服务实例上原地包装**这
三个方法：

- `snapshot` —— 过滤掉已关闭的技能，模型收到的可用技能目录随之变化；
- `list` —— 供斜杠菜单与会话技能 Remote 使用；
- `get` —— 已关闭的技能返回 `undefined`，`skill` 工具与用户显式调用同时失效。

每次开关变更都会触发注册表缓存失效，于是本会话的技能目录在**下一步**重新发布。
插件停止或更新时，三个方法会被还原。

---

## 目录结构 / Layout

```
dsh-skill-hub/
├── src/                        # 参考实现（完整注释、可读优先）
│   ├── host/host.js            # 宿主半边：技能包装 + 仓库提供方 + 面板 RPC
│   └── client/client.js        # 浏览器半边：设置页 / 快捷入口 / 运行卡片 UI
├── deploy/                     # 部署副本（行为相同，去掉散文注释，载荷可手粘）
│   ├── compact.host.js
│   └── compact.client.js
├── tools/
│   ├── payload.mjs             # 源码 → 沙箱函数体的转换，只此一处
│   ├── build-payload.mjs       # 生成 / 刷新 / 校验 payload/
│   └── verify-payload.mjs      # 编译 + 桩环境断言两者
├── payload/                    # 构建产物，与源码逐字对应
│   ├── host.txt                # 参考版宿主载荷
│   ├── client.txt              # 参考版客户端载荷
│   ├── code.json               # {"host": "...", "client": "..."}
│   ├── compact.host.txt        # 紧凑版宿主载荷 ← 实际部署用的就是它
│   ├── compact.client.txt
│   └── compact.json
├── LICENSE
└── README.md
```

### 两份源码的关系

`src/` 是参考实现，写给读代码的人；`deploy/` 是它的紧凑副本，写给
`cordis_define` 的输入框。两者行为一致，差别只在载荷里带多少注释——沙箱没有
文件系统访问，宿主半边无法从磁盘读源码，所以**要跑起来的那份文字必须完整地出现在
调用参数里**，短就是硬指标。

`payload/` 是两者各自的构建产物。`--check` 会重新构建并与提交的文件逐字节比对，
所以「仓库里的代码」和「真正跑起来的代码」不会各自漂移：改了 `deploy/` 却忘记重新
构建，校验会直接失败。


---

## 安装到 DSH / Install

这个插件以 **dynamic Cordis Package** 的形式运行：代码由 `cordis_define` 定义、
`cordis_run` 激活，只存在于当前 DSH 进程里，重启即消失。它不写入任何仓库配置。

1. 取载荷。手动部署请用**紧凑版**，它更短、更好粘：

   ```
   payload/compact.host.txt    → cordis_define 的 code.host
   payload/compact.client.txt  → cordis_define 的 code.client
   ```

   也可以直接用 `payload/compact.json`（`code.host` / `code.client` 的现成配对），
   或先重新生成：

   ```bash
   node tools/build-payload.mjs --compact --json   # 紧凑版，供粘贴
   node tools/build-payload.mjs --json             # 参考版，带完整注释
   ```

2. 在 DSH 会话里让模型调用 `cordis_define`，把两个载荷分别放进 `code.host` 与
   `code.client`。

3. `cordis_run` 激活返回的 `pluginId` / `packageId`。带浏览器半边的包首次运行需要
   在界面上授权。

### 想改代码

改 `deploy/`（部署副本）或 `src/`（参考实现），然后：

```bash
node tools/build-payload.mjs --write   # 刷新 payload/
node tools/build-payload.mjs --check   # 应输出 payloads are current
node tools/verify-payload.mjs          # 编译两版并断言注册项
```

宿主半边的 `REPO` 常量是技能仓库根目录。运行时**不要**用 `--write` 之外的编辑器直接
改 `payload/` 里的文件，否则 `--check` 会失败——这是故意的。

### 第三个变体：`deploy/demo.*`

`deploy/demo.host.js` + `deploy/demo.client.js` 是同一插件的**最小演示版**：技能列表、
开关、仓库扫描、搜索都在，去掉的是样式细节、仓库诊断与被忽略条目的展示。

它存在的理由是**回读**。载荷是一整行超长字符串，而读文件的工具会按自己的宽度折行，
折出来的换行混进代码就把语法打散了。demo 版小到能一次读完不错行，于是
「构建 → 读出 → 原样再提交」这条往返是通的：

```bash
node tools/slice-payload.mjs demo           # 按 900 字符切行，写入 payload/slices/
node tools/slice-payload.mjs demo --check   # 拼回去必须与载荷逐字节相等
```

`payload/slices/` 里就是切好行的副本，拼接后与 `payload/demo.*` 完全一致——由
`--check` 保证。


### 自定义技能仓库路径

宿主半边顶部的 `SKILL_REPO` 常量就是仓库根目录，默认指向
`C:\Users\17196\.agents\skills`。改成你自己的路径后重新构建即可；如果该目录同时
被 DSH 自带的 `skill-filesystem` 作为 `user-agents` 根扫描，本提供方的 rank 450
低于它的 500，文件系统提供方会胜出，不会产生重名冲突。

---

## 为什么需要「实时读取」这一层

DSH 默认就把 `~/.agents/skills` 当作 `user-agents` 技能根，`skill-filesystem`
也会为它挂文件监视器。但监视器是在宿主启动时装配的：如果那个目录在启动时还不
存在，监视器就没有挂上，之后新建再多的技能也读不到，必须重启。

本插件的提供方每次读取都走 `ctx.fs` 现场列目录，因此**目录先建、技能后放**也能
工作。DSH 下一次重启后，`skill-filesystem` 自己就能接管这个目录，届时这个包的
仓库部分就是冗余的，可以只保留开关面板。

---

## 开发 / Develop

```bash
npm run check      # 语法检查两侧源码与全部工具脚本
npm test           # 编译两版载荷、校验提交字节、断言注册项
npm run payload    # 重新生成 payload/
```

两边都是**纯 JavaScript 函数体**，没有 TypeScript、JSX、`import` 或打包步骤。
客户端只能用沙箱提供的 `React`、`host.call`、`styles.insert` 与 `ctx.get`；
宿主半边只能用 `ctx`（`inject` 声明过的服务）、`harness`、`console` 与编码内建。

字符串审计会拒绝载荷里出现 `<` 与反引号：载荷最终会以字符串形式进入会话日志，
一个字面量的闭合脚本标签足以破坏它，而且这种错误只在回放时才暴露。中文文案里的全角
括号是为此保留的写法，不是笔误。

### 已知边界

- 关闭状态只存在于当前进程内，DSH 重启后全部恢复为开启。
- 面板只会影响**尚未发布**的技能目录；正在进行的步骤不会被打断。
- 沙箱宿主半边读不到本机文件，因此插件无法从磁盘加载自身源码——想缩短载荷，改
  `deploy/`，不要指望运行时读取。


---

## License

MIT —— 见 [LICENSE](LICENSE)。代码为原创实现；技能仓库 `~/.agents/skills` 中的
第三方技能各自适用其上游许可证，不在本项目范围内。
