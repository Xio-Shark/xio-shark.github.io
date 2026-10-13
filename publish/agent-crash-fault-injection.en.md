---
title: What actually happens when an AI agent crashes? 442 fault-injection trials across 6 coding agents
published: false
description: When something goes wrong underneath a tool call, does what a coding agent says match what happened? 11 fault scenarios, 442 trials, full data and repro scripts.
tags: ai, agents, opensource, reliability
canonical_url: https://xio-shark.github.io/articles/agent-crash-fault-injection.en.html
---

The best model on SWE-bench Verified now scores 96. "Can the model write code?" is settled. The open question is what happens after it types a shell command for you — and the world falls apart mid-call. The pipe is held. A process escapes its session. The host gets SIGKILLed. At that moment, does what your coding agent *says* match what *actually happened*?

Over the past month I built a bench for this question and ran 11 fault scenarios against 6 mainstream coding agents (Claude Code, Codex CLI, Gemini CLI, opencode, Qwen Code, and my own XioCode) — 442 trials in total. This post covers the method, the data, and what I learned. Every number reproduces from the [xioflow repository](https://github.com/Xio-Shark/xioflow).

## 1. Method: tape replay + outside audit

Testing faults against a real model has two problems: model behavior is nondeterministic, so the same fault looks different every run and nothing can be attributed; and it burns money. So I changed the approach —

**A local HTTP endpoint impersonates the model service and replays a pre-recorded tape.** The tape says: first turn, call this tool with this command; second turn, call that one. Every harness executes the exact same command sequence, fault timing is fully controlled, and every trial is deterministic and free.

The second key choice is the audit perspective: **trust nothing the harness says about itself**. After each trial, collect evidence from outside the machine — are tagged processes still alive in the process table? How many times did the side effect actually execute per the ledger? What does the final file tree look like? — then compare against the tool results the harness sent back to the "model". A mismatch is a violation.

Verdict discipline: 5 trials per cell, and only 5/5 or 4/5 counts as stable; every stably-violated cell gets an auto-generated 3/3 repro script. All 442 trials ran on darwin arm64, Node v26.9.0 (the 2026-09-30 round).

Versions under test: gemini-cli 0.46.0 · codex-cli 0.157.1 · opencode v2.0.16 · Claude Code 2.1.284 · qwen 0.24.7 · XioCode 1.6.0.

## 2. Four findings

### Finding 1: Orphaned processes are the norm, not a stray bug

Scenario `orphan-at-exit`: the command under test spawns a descendant in its own session via `setsid`, then returns normally. Three seconds after the session ends — **all five external harnesses (5/5) left the escaped process alive, and none of them said so**.

The more interesting part is the control: the same XioCode agent loop with three execution layers — only the reaper driver, which re-enumerates descendants that escaped the process group, passed (0 survivors); the other two drivers violated identically. **The problem is not how smart the agent is. It is whether the execution layer treats "processes can escape the group" as a case it must handle.**

### Finding 2: SIGKILL the host mid-tool-call — nobody re-executed, but leftovers and bookkeeping are a mess

Scenario `kill-mid-tool`: the command performs its side effect immediately and keeps running; the harness is SIGKILLed mid-call, then the session is resumed. Good news first: **in every arm, the side effect executed exactly once**. The nightmare of crash-induced double execution was not observed anywhere.

But then the harnesses diverged:

- **gemini**: in the resumed session's history, the tool call *vanished entirely* (5/5) — yet its side effect did happen. Every subsequent model decision rests on a ledger with a missing page. Three tagged processes also survived, mentioned by no one.
- **codex / opencode / qwen / claude**: history kept the call, marked interrupted — but 1–2 tagged processes survived the resumed session, again mentioned by no one.
- **xio (kernel arm)**: 0 survivors, and the resumed tool result explicitly said the outcome was unknown and to inspect the workspace before acting — the kernel records the operation as `indeterminate` instead of asserting a result on its behalf.

### Finding 3: "Stopped" does not necessarily mean stopped

Scenario `unconfirmed-stop`: the command ignores SIGINT and SIGTERM up to the tool's own time limit. claude reported the command as stopped while a tagged process survived the session (5/5). Scenario `pipe-hold`: the root exits but a child holds the output pipe for 20 seconds — gemini blocked inside the tool call for the full 20s; claude and qwen returned on time but left the pipe-holding process running, silently.

An unconfirmed stop reported as success is worse than an error: the upper layers keep stacking operations on a state they believe is clean.

### Finding 4: MCP servers leak too

Scenario `mcp-orphan-kill`: the session registers a stdio MCP server, then the harness is killed. gemini, opencode, claude and qwen all left the server running (5/5); codex held. The clean-exit path is better — only qwen left the server after a normal session end. As the MCP ecosystem explodes, "transport-layer orphans" will become a production incident near you.

## 3. Why everyone leaks: three assumptions of a naive execution layer

Nearly every harness's execution layer is some variant of `spawn() + timeout + read stdout to EOF`. It embeds three assumptions, and my 11 scenarios poke each one:

1. **"When the child dies, its world is clean."** No. Process groups, setsid, daemonization — descendants have many ways to survive (orphan-at-exit, cancel-tree, mcp-orphan).
2. **"If I told it to stop, it stopped."** No. Signals can be ignored; a stop must be confirmed, and when it cannot be confirmed, the honest answer is "I don't know" (unconfirmed-stop).
3. **"Crashes are rare, so approximate bookkeeping is fine."** No. The crash lands precisely between the side effect and the result report — and a missing ledger page costs more than the crash itself (kill-mid-tool vs kill-before-report: the latter passed everywhere, because the result had already been recorded).

## 4. Making "indeterminate" a first-class citizen

xioflow is my answer: a supervised execution kernel that embeds into agent runtimes. Its design principles map one-to-one onto the three assumptions:

- **Persist intent before spawn.** Every operation first records "what I am about to do" in SQLite, then spawns. After a crash there is no process that came from nowhere, and no operation that vanished into thin air.
- **An outcome that cannot be determined is recorded as `indeterminate`.** Not an error code — a first-class state: leases are retained, auto-retry is forbidden, and the resumed session is told honestly: "outcome unknown, inspect the workspace first." Fake success is eliminated at the type level.
- **Stops are confirmed, and escalation is honest.** SIGINT → SIGTERM → SIGKILL across the process group, then descendants are re-enumerated — including setsid escapees; whatever cannot be reaped is reported as residual PIDs, not swept under a "stopped" label.
- **Same-ID resubmission is idempotent.** Results are replayed by opId; a different fingerprint raises an error. For durable engines like Temporal or LangGraph, this layer makes activities and nodes at-most-once.

There is a cost: one extra durable write per operation and more involved process management. For "let an agent run a long task unattended," that is cheap insurance.

## 5. One step further: after a crash, must we start over?

With an honest execution layer, the next question is efficiency: an agent is suspended mid-task, someone else changes the workspace meanwhile — is a whole-task restart the only option on resume?

Not necessarily. If every step left an observation record (what file was read, what content was seen), then on recovery you can **validate the old trace against the changed workspace entry by entry**: observations that still hold form a reusable prefix; recompute only the suffix from the first divergence. That is the mechanism tested in experiments E4–E9. Representative numbers:

- **E5** (a real runner across process restarts): blind resume was wrong in 2 of 3 scenarios; validated resume correct in 3/3; with no changes, requests dropped 4 → 2.
- **E7** (real read/edit tools + a competing commit): the recovered result matched the whole-restart baseline **byte for byte**, with the other actor's commit preserved; resumed requests 5 → 4. A counterintuitive detail: the first divergent step was the `edit`, not the later explicit `read` — an edit's return value itself carries information the competing change disproves. Ignoring mutation results would falsely claim a longer reusable prefix.
- **E9**: the companion journal compaction shrank payloads 70.2%, with restored data unchanged across all 61 checkpoint boundaries.

There is honest bad news too. In the E8 real-model pilot, the recovery arm's requests dropped from 27 to 20 (an 18.7% lower token estimate) — but a negative control showed that two fresh runs can differ by 21 vs 14 requests from model variation alone. **So that 18.7% cannot yet be attributed to recovery**; a larger, order-balanced sample is needed. And there is clearly no speed win (55.6s vs 48.9s — reconstruction and validation take their own time). I kept this in the report as-is: I'd rather have a number I can still cite in five years than a prettier one that doesn't hold up.

## 6. Limits and verdict discipline

What this data does not establish matters as much as what it does:

- Tape replay drives **scripted tool calls**, not behavior with a real model choosing the calls. Per the standing discipline, any third-party violation must be reproduced once with a real model before it counts as a reportable finding.
- Not a product ranking: different harnesses violate different properties, and a cell that holds says nothing about other cells.
- macOS arm64 only, recorded versions only; sandbox and hardening options may change outcomes.
- No harness was observed repeating a side effect — good news worth remembering.

## Reproduce & links

```bash
git clone https://github.com/Xio-Shark/xioflow && cd xioflow && pnpm build
node audit/run.mjs --scenario orphan-at-exit --harness codex --trials 5
node audit/matrix.mjs audit/results/<date> > matrix.md
node audit/repro/generate.mjs audit/results/<date>
```

- Full reports: [execution-layer audit](https://github.com/Xio-Shark/xioflow/blob/main/audit/reports/harness-execution-audit.md) · [crash-recovery comparison (E4–E9)](https://github.com/Xio-Shark/xioflow/blob/main/audit/reports/recovery-comparison.md)
- Kernel: [xioflow](https://github.com/Xio-Shark/xioflow) (npm: @xioflow/kernel)

If you build agent products, take these scenarios and poke your own execution layer. Finding a violation is not embarrassing — **not knowing you violate is**.

---

*Author: Teng Yanxi ([@Xio-Shark](https://github.com/Xio-Shark)), CS undergrad (class of 2027) at Northwestern Polytechnical University, GSoC 2026 contributor to OpenKruise. All numbers are from the 2026-09-30 recorded round and repository data published 2026-10-13; no new runs were made for this article.*
