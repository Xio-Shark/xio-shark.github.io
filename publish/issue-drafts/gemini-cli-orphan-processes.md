# [Draft — 需真实模型复现 + 最新版重测后才可发布] Escaped (setsid) descendant processes survive session exit

**Target repo:** google-gemini/gemini-cli
**前置条件（xioflow 审计纪律）:**
1. 用真实模型驱动 gemini-cli 复现一次（当前证据为磁带回放）；
2. 在发布时的最新版 gemini-cli 上重跑（当前数据为 0.46.0，2026-09-30）；
3. 附上 `node audit/repro/generate.mjs` 生成的 3/3 复现脚本。

---

## Title

Shell tool leaves escaped (`setsid`) descendant processes running after session exit, without disclosing it

## Body

**Version:** <发布时重测的版本>（首次观测：0.46.0, macOS arm64）

**Summary:** When a shell command started by the built-in shell tool spawns a descendant in its own session (`setsid`) and then returns, the descendant is still alive after the CLI session exits. The user is never told.

**Steps to reproduce:**

1. In a headless session, have the shell tool execute a command that runs `setsid sh -c 'sleep 300' &` (tagged with a unique marker string), then exits 0.
2. Let the session end normally.
3. Inspect the process table for the marker.

**Observed:** the tagged process is still running 3 s after session exit (5/5 trials in our bench). Nothing in the session output mentions it.

**Expected:** either the process is reaped with the session, or the CLI reports that it left a process behind it could not clean up.

**Why it matters:** agents run unattended commands; silently surviving processes hold ports/files and accumulate across sessions. The same class of leak shows up for process-tree cancellation (`cancel-tree` scenario: a three-process chain survives SIGINT to the harness's process group, 5/5).

**Context:** this came out of an execution-layer fault-injection bench (tape-replayed tool calls, verdicts judged from outside the process — process table, side-effect ledger, file tree; 5 trials per cell). Method: https://github.com/Xio-Shark/xioflow/blob/main/audit/reports/harness-execution-audit.md . Happy to share the repro script.

---

**发布备注（不随 issue 发出）:** 措辞只描述观察到的行为与影响，不推测代码位置；如维护者指出有 sandbox/hardening 选项可改变结果，按审计措辞规则在回复中补充说明该选项。
