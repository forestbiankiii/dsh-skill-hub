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
├── src/
│   ├── host/host.js        # 宿主半边：技能包装 + 仓库提供方 + 面板 RPC
│   └── client/client.js    # 浏览器半边：设置页 / 快捷入口 / 运行卡片 UI
├── tools/
│   └── build-payload.mjs   # 把 src/ 转成 cordis_define 需要的函数体字符串
├── payload/
│   ├── host.txt            # 构建产物（直接粘进 code.host）
│   ├── client.txt          # 构建产物（直接粘进 code.client）
│   └── code.json           # {"host": "...", "client": "..."}
├── LICENSE
└── README.md
```

---

## 安装到 DSH / Install

这个插件以 **dynamic Cordis Package** 的形式运行：代码由 `cordis_define` 定义、
`cordis_run` 激活，只存在于当前 DSH 进程里，重启即消失。它不写入任何仓库配置。

1. 构建载荷：

   ```bash
   node tools/build-payload.mjs --json > payload/code.json
   ```

2. 在 DSH 会话里让模型调用 `cordis_define`，把 `payload/host.txt` 的内容放进
   `code.host`、`payload/client.txt` 的内容放进 `code.client`。

3. `cordis_run` 激活返回的 `pluginId` / `packageId`。带浏览器半边的包首次运行需要
   在界面上授权。

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
node --check src/host/host.js      # 语法检查
node --check src/client/client.js  # 客户端代码不经打包器，需自带 React.createElement
node tools/build-payload.mjs       # 人类可读的载荷
node tools/build-payload.mjs --json  # 供 cordis_define 使用
```

两边都是**纯 JavaScript 函数体**，没有 TypeScript、JSX、`import` 或打包步骤。
客户端只能用沙箱提供的 `React`、`host.call`、`styles.insert` 与 `ctx.get`；
宿主半边只能用 `ctx`（`inject` 声明过的服务）、`harness`、`console` 与编码内建。

### 已知边界

- 关闭状态只存在于当前进程内，DSH 重启后全部恢复为开启。
- 禁用面板的存在与否，只影响已经发布的技能目录；正在进行的步骤不会被打断。

---

## License

MIT —— 见 [LICENSE](LICENSE)。代码为原创实现；技能仓库 `~/.agents/skills` 中的
第三方技能各自适用其上游许可证，不在本项目范围内。
