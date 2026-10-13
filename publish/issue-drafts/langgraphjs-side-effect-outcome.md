# [Draft] Docs/design: no first-class outcome state for side effects of a node interrupted mid-execution

**Target repo:** langchain-ai/langgraphjs
**Type:** issue（建议发在 Discussions 或作为 docs issue；语气：建设性提案，非 bug 指控）
**前置条件:** 无。全文仅引用官方文档语义。

---

## Title

Docs/design: side effects of a node interrupted mid-execution have no first-class outcome state — worth documenting the idempotency contract (or providing a helper)

## Body

Hi — first, thanks for the checkpointer design; the pending-writes mechanism is genuinely well thought out. I've been building a supervised execution layer for agent runtimes and auditing crash semantics across agent frameworks, and I ran into a semantic gap in LangGraph that I think deserves either a prominent docs callout or a first-class primitive.

**What the docs guarantee today (as I read them):**

- Checkpoints are written at super-step boundaries; per-task writes mean that when one node in a super-step fails, the *completed* nodes' writes are durable and don't re-run on resume ([Checkpoints docs](https://docs.langchain.com/oss/javascript/langgraph/checkpointers)).
- On resume, execution continues from the last successful checkpoint.

**The gap:** a node that was *interrupted mid-execution* — e.g., the process was SIGKILLed after the node's external side effect happened but before its write became durable — will be re-executed wholesale on resume. For pure state transitions that's fine. But for nodes with external side effects (a shell command, a file write outside graph state, an API call), the outcome is genuinely *indeterminate*: the effect may or may not have happened, and the framework (reasonably) has no record either way. Today there is:

- no way to mark a node "may have partially executed — verify before retrying";
- no built-in idempotency-key hook for task writes;
- no prominent docs warning that "fault-tolerance via pending writes" applies to *completed* nodes only, and that side-effecting nodes need an idempotency story.

**Why it matters:** agents increasingly run shell commands and edit files. The scary crash is the one that lands exactly between "side effect applied" and "result recorded". A missing ledger page costs more than the crash itself — the resumed graph silently re-executes, or silently believes nothing happened.

**What I'd propose (either/both):**

1. A short, prominent section in the persistence/durable-execution docs: "Side effects and idempotency" — stating the contract (mid-execution interruption ⇒ node re-runs ⇒ make side effects idempotent or externally verifiable), with one concrete pattern (idempotency keys / effect journaling).
2. Longer-term, a first-class `indeterminate` outcome concept: when a task's completion cannot be confirmed, resume surfaces that state to the graph instead of silently re-running — similar in spirit to Temporal's activity heartbeat/idempotency story.

For context on how sharp this gets in practice: in a fault-injection bench I maintain (442 trials across 6 coding agents, tape-replayed tool calls, verdicts judged from outside the process), the crash landing between side effect and result report was exactly where bookkeeping diverged across every harness tested. Happy to share the method if useful.

If this is already covered somewhere I missed, apologies — a pointer would be great.

---

**发布备注（不随 issue 发出）:** 若维护者回复积极，可顺势介绍 xioflow 的 opId 幂等适配层（examples/langgraph-node）作为参考实现，但不要在一帖里推销。
