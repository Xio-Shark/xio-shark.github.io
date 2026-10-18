# xio-shark.github.io

Xio-Shark 的个人站点。纯静态 HTML/CSS，零构建、零依赖，GitHub Pages 直接托管。

## 结构

- `index.html` — 首页（hero 进程树动效、关键数字、工作条目、入口卡片）
- `projects.html` — 项目集
- `benchmark.html` — 实测数据：6 harness × 11 故障场景执行层审计（2026-09-30 轮次，442 次试验）+ 观测感知崩溃恢复实验 E4–E9
- `style.css` — 设计系统：`light-dark()` 双主题 token（随系统偏好、可手动切换）、栅格与光晕背景、动效
- `site.js` — 交互层（视图过渡主题切换、移动端导航、滚动入场、阅读进度、目录高亮、代码复制、回到顶部、卡片指针跟随），无依赖
- `favicon.svg` — 站点图标
- `articles.html` + `articles/` — 文章（中英双版）
- `publish/` — 投稿用 markdown 源（掘金 / dev.to）与社区 issue 草稿，不经本站渲染

## 数据纪律

数据页与文章中的所有数字源自 [xioflow](https://github.com/Xio-Shark/xioflow) 仓库 `audit/reports/`（发布于 2026-10-13），未为本站做新运行。故障注入审计为磁带回放（脚本化工具调用），不构成对第三方产品的真实模型 finding 或排名——页面内有显著标注，修改内容时必须保留这些限定语。
