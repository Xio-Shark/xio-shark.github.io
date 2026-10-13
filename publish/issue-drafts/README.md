# 社区 issue 草稿总览

**状态说明**：以下草稿均未发布。发布前请逐条核对「前置条件」。

| 草稿 | 目标 | 类型 | 前置条件 |
|---|---|---|---|
| `langgraphjs-side-effect-outcome.md` | langchain-ai/langgraphjs | 文档/设计讨论（非 bug 指控） | 无硬性前置；语气保持建议式 |
| `gemini-cli-orphan-processes.md` | google-gemini/gemini-cli | bug report（执行层） | **先跑真实模型复现**（见 xioflow `audit/reports/harness-execution-audit.md` 的 Real-model reproduction 纪律）；并在最新版 gemini-cli 上重跑一次磁带场景 |
| `opencode-mcp-orphan.md` | sst/opencode | bug report（执行层） | 同上：真实模型复现 + 最新版重测 |

纪律来源：xioflow 审计报告规定「磁带回放发现的违规必须经真实模型复现一次才构成可报告 finding」。LangGraph 草稿不引用任何违规数据，只引用其官方文档语义，因此不受此前置限制。
