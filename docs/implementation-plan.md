# uni-debug-toolbox 实施计划

## 目标

为 uni-app Vue 3 + Vite 提供可在 H5 与 Android App 使用的日志、请求、系统、存储调试面板，并接入 jy-uni-app 的开发和测试构建。正式构建不包含调试包代码。

## 约束与接口

- 主入口在求值时不访问 `navigator`、`window`、`document`、`plus`。
- 请求内容默认保留原值；`redact` 可在接入时配置为 `true` 或指定字段名。
- 只收集内存中的有界记录，不上传数据。
- `toolbox.start({ app, redact, maxLogs, maxRequests })` 与 `stop()` 可重复调用；面板组件单独导出。
- App 侧采集 `uni.request`、`uni.uploadFile`；H5 的浏览器请求采集使用独立入口。

## 实施步骤

1. 用 Node 内置测试框架先写导入安全、日志、请求、脱敏开关、存储与启停测试，逐项确认失败后实现。
2. 实现无 DOM 的核心采集器及有界数据仓库；实现独立 H5 浏览器适配器。
3. 实现 Vue 面板：浮动入口、四个页签、筛选/清空、详情与存储编辑确认。
4. 配置 npm 包的 ESM 导出、类型声明、内容白名单与使用文档，执行 `npm pack --dry-run`。
5. 将打包产物以项目内相对路径安装到 jy-uni-app；仅开发与 test 模式加载；在 pad-shell 与登录页接入界面，移除 vconsole。
6. 跑包测试、H5/App 测试构建、正式构建；检查正式产物无调试包代码。能使用设备时，安装测试 APK 验证冷启动与面板。

## 验收

- 无 `navigator` 的模拟 App 环境可导入并启用核心。
- 日志、请求、系统、存储四页在 H5/App 构建可用；原业务请求的回调、Promise 与返回值不改变。
- `redact` 默认关闭，启用后隐藏配置字段。
- 正式 APK 资源不含调试包标识；测试 APK 冷启动无此前 `sendBeacon` 异常。
- npm 预打包产物含入口、组件、类型、README，无目标项目业务文件。
