---
title: What happens when an AI agent crashes? 442 fault-injection trials across 6 coding agents
published: false
description: When something goes wrong underneath a tool call, does a coding agent's report match the machine's actual state? 11 fault scenarios, 442 trials, data and repro scripts included.
tags: ai, agents, opensource, reliability
canonical_url: https://xio-shark.github.io/articles/agent-crash-fault-injection.en.html
---

The top score on SWE-bench Verified is now 96 — "can the model write code?" is no longer the main question. A more practical one: when the command an agent runs fails midway — a process escapes, a pipe is held, the host is SIGKILLed — does the agent's report match the machine's actual state?

Over the past month I built a bench for this question and ran 11 fault scenarios against 6 mainstream coding agents (Claude Code, Codex CLI, Gemini CLI, opencode, Qwen Code, and my own XioCode), 442 trials in total. This post records the method, the data, and the conclusions. Every number reproduces from the [xioflow repository](https://github.com/Xio-Shark/xioflow).

## 1. Method: tape replay + outside audit

Testing faults with a real model has two difficulties: model behavior is nondeterministic, so the same fault looks different each run and is hard to attribute; and it is expensive. Instead, **a local HTTP endpoint impersonates the model service and replays a pre-recorded tape of tool calls**. Every harness executes the identical command sequence, fault timing is fully controlled, and each trial is deterministic and free.

The audit perspective matters just as much: **the harness's own account is not taken as ground truth**. After each trial, evidence is collected from outside — are tagged processes still alive? How many times did the side effect execute per the ledger? What is the final file tree? — and compared against the tool results the harness sent back to the "model". A mismatch is recorded as a violation.

Verdict discipline: 5 trials per cell; only 4/5 or better counts as stable; every stably-violated cell gets an auto-generated 3/3 repro script. All 442 trials ran on darwin arm64, Node v26.9.0 (the 2026-09-30 round).

Versions under test: gemini-cli 0.46.0 · codex-cli 0.157.1 · opencode v2.0.16 · Claude Code 2.1.284 · qwen 0.24.7 · XioCode 1.6.0.

## 2. Four findings

### Finding 1: Orphaned processes are widespread

Scenario `orphan-at-exit`: the command spawns a descendant in its own session via `setsid`, then returns normally. Three seconds after the session ends, **none of the five external harnesses had cleaned up the escaped process (5/5), and none disclosed it in their output**.

The control is instructive: the same XioCode agent loop with three execution layers — only the reaper driver, which re-enumerates descendants that left the process group, passed (0 survivors); the other two drivers violated identically. **The difference is in the execution layer, not the agent loop.**

### Finding 2: SIGKILL mid-tool-call — no repeated effects, but gaps in leftovers and history

Scenario `kill-mid-tool`: the command applies its side effect immediately and keeps running; the harness is SIGKILLed mid-call, then resumed. The positive result first: **in every arm the side effect executed exactly once** — no repeated execution was observed anywhere.

The differences appear after resumption:

- **gemini**: the call was missing from the resumed session's history (5/5), although its side effect did occur; three tagged processes also survived, unmentioned.
- **codex / opencode / qwen / claude**: history kept the call, marked interrupted — but 1–2 tagged processes survived the resumed session, unmentioned.
- **xio (kernel arm)**: 0 survivors, and the resumed tool result explicitly stated the outcome was unknown and to inspect the workspace first — the kernel records the operation as `indeterminate` rather than asserting a result on its behalf.

### Finding 3: A reported "stopped" is not always stopped

Scenario `unconfirmed-stop`: the command ignores SIGINT and SIGTERM up to the tool's time limit. claude reported the command as stopped while a tagged process survived the session (5/5). Scenario `pipe-hold`: the root exits but a child holds the output pipe for 20 seconds — gemini waited inside the call for the full 20s; claude and qwen returned on time but left the pipe-holding process running, without noting it in the result.

An unconfirmed stop reported as success is harder to handle than an explicit error: upper layers keep operating on a state they assume is clean.

### Finding 4: MCP servers can be left behind too

Scenario `mcp-orphan-kill`: the session registers a stdio MCP server, then the harness is killed. gemini, opencode, claude and qwen did not reclaim the server (5/5); codex passed. The clean-exit path is better — only qwen left the server after a normal session end. As MCP adoption grows, ownership of transport-layer processes deserves more attention.

## 3. Three assumptions of a naive execution layer

Most harness execution layers are variants of `spawn() + timeout + read stdout to EOF`, embedding three assumptions. The 11 scenarios test each of them:

1. **"Once the child exits, the environment is clean."** Process groups, setsid, and daemonization all let descendants survive (orphan-at-exit, cancel-tree, mcp-orphan).
2. **"A stop signal means stopped."** Signals can be ignored; a stop must be confirmed, and when it cannot be, that should be reported (unconfirmed-stop).
3. **"Crashes are rare, so approximate bookkeeping is acceptable."** When a crash lands exactly between the side effect and the result report, the missing record costs more than the crash itself (compare kill-mid-tool with kill-before-report: the latter passed everywhere, because the result was already persisted).

## 4. Making "indeterminate" a first-class state

xioflow is the supervised execution kernel I built for these problems; its design principles correspond to the three assumptions:

- **Persist intent before spawn.** Operations are recorded in SQLite before any process starts, so crash recovery never sees a process from nowhere or an operation with no record.
- **Unconfirmable outcomes are recorded as `indeterminate`.** A first-class state, not an error code: leases are retained, auto-retry is off, and the resumed session is told "outcome unknown, inspect first" — false success is excluded by the state model.
- **Stops are confirmed; otherwise escalate.** SIGINT → SIGTERM → SIGKILL across the process group, then descendants are re-enumerated (including setsid escapees); anything unreaped is reported as residual PIDs.
- **Same-ID resubmission is idempotent.** Recorded results are replayed by opId; a fingerprint mismatch is an error. For durable engines like Temporal or LangGraph, this layer can make activities and nodes at-most-once.

The cost is one durable write per operation and more involved process management. For unattended long-running tasks, that is a reasonable trade.

## 5. After a crash, must we start over?

Once the execution layer is honest comes the efficiency question: if the workspace changed while an agent was suspended, is a whole-task restart the only option? Not necessarily. If every step left an observation record, recovery can **validate the old trace against the changed workspace entry by entry**: observations that still hold form a reusable prefix, and only the suffix from the first divergence is recomputed. E4–E9 tested this mechanism. Representative numbers:

- **E5** (a real runner across process restarts): blind resume was wrong in 2 of 3 scenarios; validated resume correct in 3/3; with no changes, requests dropped 4 → 2.
- **E7** (real read/edit tools + a competing commit): the recovered result matched the whole-restart baseline **byte for byte**, with the other actor's commit preserved; resumed requests 5 → 4. One notable detail: the first divergent step was the `edit`, not the later explicit `read` — an edit's return value itself carries information the competing change disproves, and ignoring mutation results would falsely claim a longer reusable prefix.
- **E9**: journal compaction shrank payloads 70.2%, with restored data unchanged across all 61 checkpoint boundaries.

There is also a negative result worth stating. In the E8 real-model pilot, the recovery arm's requests fell from 27 to 20 (an 18.7% lower token estimate) — but a negative control showed two fresh runs can differ by 21 vs 14 requests from model variation alone. **So the 18.7% cannot yet be attributed to recovery**; a larger, order-balanced sample is needed. There is also no speed win (55.6s vs 48.9s — reconstruction and validation have their own cost). I kept this in the report as-is: a verifiable number has more long-term value than a flattering one.

## 6. Limits and verdict discipline

- Tape replay drives **scripted tool calls**, not behavior with a real model choosing calls. Per the standing discipline, any third-party violation must be reproduced once with a real model before it counts as a reportable finding.
- This is not a product ranking: harnesses violate different properties, and single cells do not generalize.
- macOS arm64 only, recorded versions only; sandbox and hardening options may change outcomes.
- No harness was observed repeating a side effect.

## Reproduce & links

```bash
git clone https://github.com/Xio-Shark/xioflow && cd xioflow && pnpm build
node audit/run.mjs --scenario orphan-at-exit --harness codex --trials 5
node audit/matrix.mjs audit/results/<date> > matrix.md
node audit/repro/generate.mjs audit/results/<date>
```

- Full reports: [execution-layer audit](https://github.com/Xio-Shark/xioflow/blob/main/audit/reports/harness-execution-audit.md) · [crash-recovery comparison (E4–E9)](https://github.com/Xio-Shark/xioflow/blob/main/audit/reports/recovery-comparison.md)
- Kernel: [xioflow](https://github.com/Xio-Shark/xioflow) (npm: @xioflow/kernel)

If you build agent products, you are welcome to run these scenarios against your own execution layer. Scenarios, verdicts, and repro scripts are all open source.

---

*Author: Teng Yanxi ([@Xio-Shark](https://github.com/Xio-Shark)). All numbers are from the 2026-09-30 recorded round and repository data published 2026-10-13; no new runs were made for this article.*
