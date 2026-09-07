# GAKKI

一个用于前端实现的 Codex 插件：理解设计输入、处理视觉素材，并通过真实页面渲染反馈修正实现。

Codex 负责设计判断与代码实现；本地工具负责可重复的图像处理、页面测量与验证。插件复用目标项目的技术栈、组件和设计系统，不携带应用业务代码或私有设计素材。

## 能力

- **设计检查**：原图尺寸、精确局部预览、透明边界与颜色测量。
- **素材处理**：Flutter/Web 多倍率导出、来源记录、Alpha 保留，拒绝伪造高倍率和比例失真。
- **Web 反馈**：多视口截图、控件操作、DOM/样式测量、内容与几何检查、资源加载错误。
- **iOS 反馈**：批量截取指定模拟器的当前画面，配合现有编译、启动与操作工具。
- **视觉比较**：生成原图、实图、叠加与差异检查页，检查选定源码是否发生变化。

提供 `gakki` 和 `gakki-assets` 两个技能，以及七个 MCP 工具。差异指标用于定位问题，不能代替设计判断或用户验收。

## 开发与安装

需要 Node.js 22+ 和 npm。Web 检查需要 Chrome/Chromium；iOS 检查需要 macOS、Xcode 与已启动的模拟器。

```sh
npm run setup
npm run check
npm run dev:update
```

`dev:update` 在 macOS 上使用 Codex 官方插件助手和 CLI 完成本地安装或更新。更新后新开 Codex 任务，在目标项目中要求“用 GAKKI 实现这张设计”或“用 GAKKI 检查并修复这个页面”。

[完整安装与工具说明](plugins/gakki/README.md)包括环境要求、手动安装和能力边界。

## 调试与分发

```sh
npm run debug -- doctor                 # 直接运行源码
npm run debug -- capture_web /absolute/input.json
npm run build
npm run debug:mcp -- doctor             # 检查构建后的真实 MCP 入口
npm run check:repo                      # 检查准备提交的源码边界
npm run pack                           # 构建本地分发包，不执行发布
```

`doctor` 显示运行路径、模式、依赖版本和构建指纹，便于定位旧版本或安装问题。调试日志与分发包放在 Git 忽略的 `achieve/`；页面截图和素材输出保留在目标项目自己的运行目录。

## 源码结构

```text
plugins/gakki/
  .codex-plugin/  插件清单
  src/            CLI 与 MCP 共用的操作内核
  skills/         按需加载的页面与素材技能
  scripts/        构建、安装、调试与打包
  tests/          合成图像、真实浏览器和发行入口测试
scripts/          公开源码边界检查
```

源仓库只保留通用插件、测试和维护文档。依赖、编译产物、本地档案与运行记录不进入 Git；测试使用生成的图像和通用页面夹具。`npm run check:repo` 检查候选提交文件，`npm run check` 同时执行插件测试。

## 许可

采用 [MIT License](LICENSE)。第三方依赖保留各自许可；构建时生成打包依赖的完整许可清单，随发行包一起提供。详见 [依赖许可说明](plugins/gakki/NOTICE.md)。
