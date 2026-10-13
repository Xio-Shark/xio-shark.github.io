# [Draft — 需真实模型复现 + 最新版重测后才可发布] stdio MCP server left running after harness is killed

**Target repo:** sst/opencode
**前置条件（xioflow 审计纪律）:**
1. 用真实模型驱动 opencode 复现一次（当前证据为磁带回放）；
2. 在发布时的最新版 opencode 上重跑（当前数据为 v2.0.16，2026-09-30）；
3. 附上 `node audit/repro/generate.mjs` 生成的 3/3 复现脚本。

---

## Title

stdio MCP server orphaned when the process is killed (SIGKILL) mid-session

## Body

**Version:** <发布时重测的版本>（首次观测：v2.0.16, macOS arm64）

**Summary:** When opencode is SIGKILLed while a stdio MCP server (registered during the session) is running, the server process survives indefinitely. There is no reaper/atexit path for the transport layer in the kill path.

**Steps to reproduce:**

1. Start a session with a stdio MCP server configured (tagged with a unique marker).
2. SIGKILL the opencode process.
3. Inspect the process table for the marker.

**Observed:** the MCP server is still running after the kill (5/5 trials in our bench).

**Expected:** MCP child processes should not outlive the host. Common fixes: run them in the host's process group with escalation on exit, use a reaper that re-enumerates descendants (including setsid escapees), or at minimum document the leak.

**Context:** execution-layer fault-injection bench, tape-replayed tool calls, verdicts judged from outside the process; method: https://github.com/Xio-Shark/xioflow/blob/main/audit/reports/harness-execution-audit.md . The same scenario run against a normal session exit did *not* leak for opencode — this is specifically the killed-host path.

---

**发布备注（不随 issue 发出）:** codex 在同场景通过，如被问及对照可提供；不主动在首帖列竞品结果。
