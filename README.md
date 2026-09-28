# uni-debug-toolbox

适用于 uni-app Vue 3 + Vite 的应用内调试面板。包含日志、请求、系统信息和存储四个模块。核心代码不使用 DOM、`navigator`、`window` 或 Android 原生桥接，适用于 App 服务层；浏览器网络采集位于独立的 `./browser` 入口。

## 安装

```bash
pnpm add uni-debug-toolbox
```

点击悬浮的 `DEBUG` 按钮可打开贴底、占满屏幕宽度的浅色面板。面板上方的业务页面保持可见，也没有全屏遮罩。

## 接入

在 `createApp()` 中启动。App 构建输出不支持代码分割，因此使用静态导入。`start` 无顶层副作用，重复调用安全。

```js
import { toolbox } from 'uni-debug-toolbox'

if (import.meta.env.MODE !== 'production') {
  toolbox.start({ app, redact: false, maxLogs: 200, maxRequests: 100 })
}
```

在需要面板入口的 Vue 页面或共用布局中加载组件。

```vue
<script setup>
import { toolbox } from 'uni-debug-toolbox'
import DebugToolbox from 'uni-debug-toolbox/panel.vue'
</script>
<template><DebugToolbox :controller="toolbox" /></template>
```

要让正式包完全排除调试代码，在 `vite.config.ts` 的 `production` 模式把包主入口和 `panel.vue` 分别 alias 到本地的空 JS 模块和空 Vue 组件。目标项目 `jy-uni-app` 提供了完整示例；正式构建后检查 `app-service.js` 和视图资源中没有 `udt-launcher`、`UNI / DEBUG` 等包标识。

```ts
import { defineConfig } from 'vite'
import uni from '@dcloudio/vite-plugin-uni'
import { fileURLToPath, URL } from 'node:url'

export default defineConfig(({ mode }) => ({
  plugins: [uni()],
  resolve: { alias: mode === 'production' ? [
    { find: 'uni-debug-toolbox/panel.vue', replacement: fileURLToPath(new URL('./src/debug/Noop.vue', import.meta.url)) },
    { find: 'uni-debug-toolbox', replacement: fileURLToPath(new URL('./src/debug/noop.js', import.meta.url)) }
  ] : [] }
}))
```

`src/debug/noop.js` 内容为 `export const toolbox = { start() {} }`；`src/debug/Noop.vue` 内容为 `<template><slot v-if="false" /></template>`。

默认 `redact: false`，请求头、令牌与响应保持原值。设置 `redact: true` 可遮盖常见凭据字段；设置 `redact: { keys: ['session'] }` 可只遮盖指定字段。记录仅保存在内存，不会自动上传。存储面板可查看、编辑和删除数据；请只在测试包中启用。

App 端捕获 `uni.request`、`uni.uploadFile`。如 H5 还需捕获页面直接使用的 `fetch` 和 `XMLHttpRequest`，可在仅 H5 的分支中引入 `uni-debug-toolbox/browser` 并调用 `installBrowserNetwork(toolbox, window)`；页面同时使用 `uni.request` 时可能出现同一请求的两条记录。

## Android 原生集成

四个模块只使用 uni-app API，不需要修改 `manifest.json` 权限、Gradle 或 Java/Kotlin。按项目现有的 App 资源编译及 APK 打包流程即可。若崩溃发生在 JS 服务层创建前，面板无法运行，应使用 Android logcat 排查。

## 打包与发布到 npm

在本包仓库根目录执行以下命令。包直接发布 `src/` 中的 ESM 源码、Vue 单文件组件和 `types/` 声明，无需额外转译；接入项目负责通过 uni-app/Vite 编译组件。

```bash
npm test
npm pack --dry-run
npm pack
npm login --registry=https://registry.npmjs.org/
npm whoami --registry=https://registry.npmjs.org/
npm profile enable-2fa auth-and-writes  # 账号尚未启用双重验证时执行一次
npm publish --access public --registry=https://registry.npmjs.org/
npm view uni-debug-toolbox@0.1.1 version --registry=https://registry.npmjs.org/
```

`npm pack` 会生成 `uni-debug-toolbox-0.1.1.tgz`，可在发布前用 `tar -tzf uni-debug-toolbox-0.1.1.tgz` 核对内容。npm 现在要求发布时完成双重验证；若账号尚未启用，先运行上述 `npm profile enable-2fa` 命令并按提示绑定验证器。发布命令应在交互式终端运行，按提示输入动态码。不要把动态码或访问令牌写进仓库或聊天。npm 版本发布后不能覆盖，同一版本需要修正时先更新 `package.json` 的版本并重新打包。不要把业务数据或密钥放入包中。参见 [npm 官方发布验证说明](https://docs.npmjs.com/requiring-2fa-for-package-publishing-and-settings-modification/)。

## 已知范围

- 面板需要放在每个需要入口的页面或其共用布局中；`App.vue` 不支持页面模板。
- 暂不支持 DOM 元素树、JS 命令执行、原生 logcat 和小程序端。
- `web-view` 或原生组件可能覆盖普通 Vue 面板。
