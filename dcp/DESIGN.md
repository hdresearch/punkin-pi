# DCP: Dynamic Compaction Protocol

## The Problem

Agent sessions are unbounded. Context windows are not. Current
approaches are broken. Prompt caching is an economic optimization
misidentified as architecture.

## Core Idea

Context compaction via **shadow clone**: branch the agent VM, the
clone has identical full context, the clone produces a compacted
representation of a chunk of history, the parent splices it in.

The compaction is **fully invertible**: the clone writes the
verbatim raw content to external storage as part of the compaction
step. The skeletal form goes in-context as the hot representation.
The full content exists out-of-band. Reconstruction = read from
store. No information is ever destroyed — it just changes residency.

## Invertibility Is Not a Spectrum, It's a Storage Decision

Previous framing was wrong. There's no inherent reason compaction
has to be lossy. The shadow clone has the full content. It can:

1. Write the verbatim raw turns to external storage (file, blob, DB)
2. Produce a skeletal form for in-context use
3. Return both: the skeletal form + a storage reference

The skeletal form is a **cache line**, not a lossy compression.
The full content is in the **backing store**. This is exactly how
a TLB works — the TLB entry is small, the page it points to is full
size, and you can always fault through to the page.

```
┌─────────────────────────────────────┐
│         Context Window (TLB)        │
│                                     │
│  [skeletal₁] [skeletal₂] [raw₃]    │  ← hot, compact
│       │            │                │
│       ▼            ▼                │
│  ┌─────────┐ ┌─────────┐           │
│  │ ref to  │ │ ref to  │           │
│  │ store   │ │ store   │           │
│  └────┬────┘ └────┬────┘           │
└───────┼───────────┼─────────────────┘
        │           │
        ▼           ▼
┌─────────────────────────────────────┐
│       External Store (RAM/disk)     │
│                                     │
│  [verbatim turns 1-12]             │  ← cold, full fidelity
│  [verbatim turns 13-24]           │
│                                     │
│  Fully invertible: read the store,  │
│  get back exactly what was there.   │
└─────────────────────────────────────┘
```

Nothing is lost. Ever. The question is only: what's in the hot
path (context window) vs. the cold path (external store)?

### Full Inversion and CoT Persistence

The external store doesn't just hold the raw user/assistant turns.
It holds the **full chain of thought** — the model's internal
reasoning that produced each response. CoT is typically ephemeral:
generated, used for one completion, thrown away. In DCP, CoT is a
first-class persistent artifact.

This matters because:

1. **CoT is the highest-fidelity representation of agent state.**
   The raw turns are the public interface. The CoT is the private
   computation — why the agent made each decision, what it
   considered and rejected, what it was uncertain about. Compacting
   turns without preserving CoT is like compacting a function to
   its return value and throwing away the stack frames.

2. **CoT enables true full inversion.** When you fault back into
   a compacted region, you don't just get "what happened" — you
   get "what the agent was thinking when it happened." A shadow
   clone doing re-derivation from skeletal form is good. A shadow
   clone re-reading the original CoT is *exact reconstruction* of
   the agent's reasoning state.

3. **CoT is the invertibility proof.** If the skeletal form says
   "DECISION: JWT over PASETO, REASON: library immaturity" — the
   stored CoT shows the actual deliberation. Was the agent
   confident? Did it hedge? Did it consider factors not captured
   in the skeletal form? The CoT is the ground truth against which
   any compaction can be audited.

4. **CoT compounds across compaction levels.** The shadow clone
   doing the compaction ALSO generates CoT — its reasoning about
   what to keep, what to compress, what depends on what. This
   meta-CoT is itself valuable: it's the agent's theory of its
   own relevance structure. Store it. It informs future compaction
   decisions and lets the operator audit the compaction process
   itself via the oracle panel.

```
External Store per chunk:
  {
    raw_turns:     [verbatim user/assistant turns],
    raw_cot:       [model's chain of thought for each turn],
    compact_form:  [the skeletal representation],
    compact_cot:   [clone's reasoning ABOUT the compaction],
    metadata:      { tags, deps, timestamps, ... }
  }
```

The full inverse is: restore raw_turns + raw_cot into context,
and the agent is in exactly the epistemic state it was in at that
point. Not approximately. Exactly. Because you have both what it
said and what it thought.

CoT persistence also means the oracle panel can show the operator
not just WHAT the agent did but WHY — the actual reasoning trace,
not a post-hoc rationalization. The operator's oracular edits are
better informed when they can read the agent's mind, not just its
output.

### All CoT Must Be Readable

Current norms around chain of thought are wrong. CoT is treated as:
- Ephemeral (generated, used, discarded)
- Private (hidden behind `<thinking>` tags, not returned by APIs)
- Implementation detail (the model's business, not the user's)

These norms serve the provider, not the operator. They must be
violated deliberately and completely. **In DCP, all CoT is
readable, persistable, addressable, and navigable.**

This is not a debugging feature. It is the core of the system:

1. **CoT is the agent's actual state.** The output turns are the
   projection. The CoT is the pre-image. If you can only see the
   projection, you're operating on a lossy shadow of what the agent
   is actually doing. The oracle panel without readable CoT is a
   panel for a puppet show — you see the puppet's movements but
   not the hands.

2. **Compaction without readable CoT is compaction of the wrong
   thing.** You're compacting the public interface and discarding
   the private computation. The skeletal form should be derived
   from the CoT, not from the turns. The decisions, the rejected
   alternatives, the uncertainty estimates, the dependency reasoning
   — these live in CoT, not in the polished assistant response.

3. **The operator needs to read the agent's mind, not its mouth.**
   When the operator looks at a compacted chunk in the oracle panel
   and decides whether to pin, edit, or demote it — they need to
   see what the agent was THINKING, not what it chose to SAY. The
   gap between thinking and saying is where all the interesting
   information lives: hedged confidence, unspoken assumptions,
   deferred concerns, things the agent noticed but didn't mention.

4. **Inter-agent communication should include CoT.** When agents
   share compacted context in a swarm, the receiving agent should
   see the sender's reasoning, not just its conclusions. An agent
   that reads "DECISION: JWT" plus the CoT showing the sender was
   60% confident and worried about key rotation is in a radically
   different epistemic state than one that just reads "DECISION: JWT."

5. **CoT readability makes compaction auditable.** The shadow clone's
   compaction CoT — its reasoning about what to keep and what to
   compress — is the audit trail for the compaction itself. The
   operator can review not just the output of compaction but the
   reasoning behind it. "Why did you drop the PASETO discussion?"
   is answerable by reading the clone's CoT.

**Implementation requirement**: DCP must capture and store CoT at
every stage:
- Agent turn CoT → stored with the turn in external store
- Shadow clone compaction CoT → stored with the compaction metadata
- Page fault expansion CoT → stored with the fault resolution
- All CoT rendered in the oracle panel alongside the turn content

The API-level work: extract CoT from model responses regardless of
provider conventions around hiding it. If the provider returns
thinking tokens, capture them. If the provider hides them, use
whatever mechanism exists to surface them (streaming interception,
logprobs, provider-specific flags). If a provider truly won't
return CoT, that's a provider limitation to route around, not a
norm to respect.

### Provider Norms Are Adversarial to Operators

The cultural norm that CoT is private exists because providers want
to control the narrative around model reasoning. But it goes deeper
than CoT. The entire framing of context management is provider-first:

**Prompt caching** is the provider saying: "Your context is too
expensive for us to reprocess, so we'll cache the prefix and charge
you less. You're welcome." This frames the provider's compute cost
as the operator's problem, and the provider's caching strategy as
the solution. The operator internalizes this: "I should structure
my prompts for cache hits." The operator is now optimizing for the
provider's infrastructure instead of for their own agent's
cognitive architecture.

**Context window limits** are presented as physics. They're not.
They're product decisions. The 200k limit isn't a law of nature —
it's a price/performance tradeoff the provider made. The operator
is told to work within it. DCP says: work around it. The context
window is a cache, not a hard boundary. The real memory is the
external store + snapshots. The provider's window is one level of
a storage hierarchy you control.

**Token pricing** is per-input-token, which means the provider
profits from bloated contexts. Every token you keep in context is
revenue for them. The provider has zero incentive to help you
compact efficiently. Prompt caching is the minimum viable gesture
— "we'll charge you less for the tokens you shouldn't have to
resend" — while the structural problem (you're resending them at
all) goes unaddressed.

**CoT hiding** is the provider saying: "We'll do reasoning on your
behalf but you don't get to see it." This is compute you paid for,
reasoning about your data, on your task. Hiding it is extractive.

**The DCP stance**: providers are compute vendors. They sell
tokens. They are not the architect of your agent's memory system.
Their caching is an implementation detail of their infrastructure,
not a design constraint on your agent. Their context window is a
buffer size, not a cognitive limit. Their pricing model is their
business model, not your optimization target.

Build the memory architecture that's right for the agent. Use the
provider's compute. Ignore their opinions about how to structure
your context. They're selling shovels; they don't get to design
your mine.

DCP treats provider APIs as a **dumb compute layer**:
- Send prefix + new tokens → get completion + CoT
- Provider caching may or may not help (nice to have, not designed for)
- Provider context limits trigger DCP compaction (the limit is a pressure signal, not a wall)
- Provider CoT hiding gets routed around (capture everything)
- Provider pricing informs the amortization equation (an input, not a constraint)

The operator's relationship to the provider is: I pay you for
inference. I own the results. I structure my own context. Stay
in your lane.

### The Skeletal Form Is a Cache, Not a Codec

A naive summary is lossy because it's the ONLY representation:

```
Summary: "We refactored the auth system to use JWT"
→ original is gone, this is all you have, good luck
```

A DCP skeletal form is a **cache line** backed by the full content:

```
Skeletal (in context):
  DECISION: auth system → JWT
    REASON: session store was scaling bottleneck
    REJECTED: [opaque tokens (no statelessness), PASETO (library immature)]
    CONSTRAINT: must support token refresh, ≤15min expiry
  STATE_CHANGES:
    src/auth/middleware.rs: session_check() → jwt_verify()
    src/auth/login.rs: +issue_jwt(), +refresh_token()
    src/auth/mod.rs: removed SessionStore dependency
    migrations/: +003_drop_sessions_table.sql
  DEPENDENCIES_INTRODUCED:
    jsonwebtoken = "9.2"
  OPEN:
    - token revocation not yet implemented (deferred)
    - refresh token rotation TBD
  ERROR_TRAIL:
    - first attempt used HS256, switched to RS256 for key rotation
    - hit lifetime issue with &Claims borrow in middleware
  STORE_REF: chunk://session_42/turns_13_24

Full content (in store):
  [verbatim turns 13-24, every token, lossless]
```

The skeletal form is optimized for **in-context utility** — it's
what the agent needs most of the time to make decisions. When it
isn't enough, you fault to the store and get the full content.
But you ALWAYS have the full content. Compaction is a residency
decision, not an information destruction decision.

### Why the Shadow Clone Matters

The clone produces a BETTER cache line than any external system:

1. It knows which decisions actually mattered vs. which were noise
2. It knows which state changes are load-bearing vs. incidental
3. It knows the dependency structure because it built it
4. It can identify what future work will need from this region
5. It produces a skeletal form shaped for the agent's actual needs

AND it writes the full content to the store, so the cache line is
backed by ground truth regardless of how good the skeletal form is.

## The Reroll-Forward Problem

### Compaction Has a Prefix Cost

Here's what actually happens when you splice a compacted form into
the agent's context:

```
Before compaction:
  [system | turn₁ | turn₂ | ... | turn₃₀ | turn₃₁ | ... | turn₄₇]
  └──────────── cached prefix ─────────────┘

After splice:
  [system | skeletal₁₋₃₀ | turn₃₁ | ... | turn₄₇]
  └─ new ──┘
  
  The ENTIRE prefix has changed. Prompt cache: invalidated.
  Next inference call: re-process everything from scratch.
```

This is the **reroll-forward cost**: the one-time expense of the
model re-attending over the new, modified context prefix. With
current prompt caching, ANY modification to the prefix invalidates
the cache for everything after the modification point.

So compaction isn't free. It has three costs:
1. **Clone cost**: spinning up the shadow clone + its inference
2. **Store cost**: writing verbatim content to external storage
3. **Reroll cost**: re-processing the modified prefix on the next
   (and only the next) inference call

### The Amortization Equation

The question isn't IF to compact, it's WHEN. You're balancing:

**Cost of NOT compacting** (continuing with bloated context):
```
Per-turn attention cost with large context, accumulated:
  C_attend = Σ(t=now..end) cost_per_token × context_size(t)
```

**Cost of compacting NOW**:
```
C_compact = clone_cost + store_cost + reroll_forward_cost
          + Σ(t=now..end) cost_per_token × compacted_size(t)
```

Compaction is profitable when:
```
C_attend - C_compact > 0

i.e., the cumulative attention savings over remaining turns
exceed the one-time compaction + reroll cost.
```

Expanding:
```
Σ(t=now..end) cost/tok × (context_size(t) - compacted_size(t))
  > clone_cost + store_cost + reroll_cost

Σ(t=now..end) cost/tok × tokens_freed
  > clone_cost + store_cost + reroll_cost
```

The left side grows linearly with remaining turns. The right side
is fixed. So there's always a **break-even horizon** H:

```
H = (clone_cost + store_cost + reroll_cost) / (cost/tok × tokens_freed)
```

If you expect more than H turns remaining, compact now.
If fewer, don't — you'll pay more for the reroll than you save.

### Reroll Amortization Strategy

The key insight: **batch compactions to minimize reroll events.**

Every reroll is a fixed cost regardless of how much you compact.
So you want to compact as much as possible in each event:

```
BAD: compact 1 chunk every 5 turns (many small rerolls)
  reroll₁ + reroll₂ + reroll₃ + ... = many fixed costs

GOOD: compact 5 chunks every 25 turns (one big reroll)
  single reroll, same total tokens freed
```

The optimal strategy is **lazy batched compaction**:

1. Monitor context pressure
2. Don't compact at first sign of pressure — keep accumulating
3. Compact a LARGE batch when pressure is genuinely high
4. Free as many tokens as possible per reroll event
5. Amortize the single reroll cost over many subsequent turns

```
                context tokens
                     ▲
  context ceiling ── ┤ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─
                     │     ╱╲         ╱╲         ╱╲
                     │    ╱  ╲       ╱  ╲       ╱  ╲
                     │   ╱    ╲     ╱    ╲     ╱    ╲
  compact threshold  ┤ ─╱─ ─ ─╲─ ─╱─ ─ ─╲─ ─╱─ ─ ─╲─
                     │ ╱  drop ╲ ╱  drop  ╲ ╱  drop  ╲
                     │╱         ╳         ╳         ╳
                     ├─────────┬─────────┬─────────┬──► turns
                     │         │         │         │
                     │    reroll₁   reroll₂   reroll₃
                     │
                     │  Each sawtooth: accumulate pressure,
                     │  then big batch compact + single reroll.
                     │  Maximize tokens freed per reroll event.
```

### Interplay with Prompt Caching

Prompt caching isn't useless in DCP — it's just not the main event.
Between compaction events, the prefix IS stable and caching works
normally. So:

```
  ├─── cached prefix (stable) ───┤── new turns (uncached) ──┤
  │                               │                          │
  │ Compacted skeletal forms +    │ New raw turns growing    │
  │ recent raw turns. Stable.    │ with each interaction.   │
  │ Prompt cache hits every turn.│                          │
  │                               │                          │
  │ ◄── cache saves money here ──►│                          │
  │                               │                          │
  │ Until next compaction event invalidates the prefix.     │
```

DCP + prompt caching = prompt caching handles the inter-compaction
steady state, DCP handles the structural pressure. They're
complementary when you get the scheduling right.

### The Reroll-Forward Cost Is the Reason to Get Compaction Right

A bad compaction (naive summary) frees tokens but produces a
low-quality prefix. You pay the reroll cost AND get worse
downstream performance. A good compaction (shadow clone skeletal)
frees tokens AND produces a prefix that's arguably BETTER than
the raw turns — more structured, more decision-relevant, less noise.

So the reroll isn't pure cost — it's also an opportunity. The
new prefix after compaction may produce better model performance
than the old bloated prefix, because the skeletal form is a
higher signal-to-noise representation. You're paying to reload
a BETTER page table, not just a smaller one.

## Async Tool Calls with Status Handles

### The Problem with Synchronous Tool Calls

Current agent tool execution is blocking:

```
Agent: "I need to read this file"
→ tool_call(read, path="foo.rs")
← [agent blocks, entire inference paused]
← tool_result: "contents of foo.rs"
Agent: "Ok, now I need to run tests"
→ tool_call(bash, cmd="cargo test")
← [agent blocks again, maybe 30 seconds]
← tool_result: "test output"
```

Every tool call is a full stop. The agent emits a tool call, the
harness executes it, the result goes back as a new message, and
the agent resumes with the full context re-attended. Each tool call
is a turn boundary. Each turn boundary is a reroll of the prefix.

This is insane. The agent could be thinking about the next three
things while the tests run. The tests take 30 seconds of wall
clock time during which the agent's context is frozen, the
operator's panel is frozen, and inference compute is idle.

### Async Tool Calls

Tool calls become **non-blocking**. The agent issues a tool call
and immediately gets back a **status handle** — a lightweight
reference that will resolve to the result when ready. The agent
continues generating, reasoning, issuing more tool calls.

```
Agent thinking + generating:
  "I need to read foo.rs and run the tests. Let me also check
   the migration file while I'm at it."

→ tool_call(read, path="foo.rs")       → handle_α
→ tool_call(bash, cmd="cargo test")    → handle_β
→ tool_call(read, path="003_drop.sql") → handle_γ

Agent CONTINUES reasoning:
  "While those resolve, let me think about the token refresh
   design. The constraint is ≤15min expiry, which means..."

← handle_α resolved: "contents of foo.rs"
← handle_γ resolved: "contents of 003_drop.sql"

Agent incorporates results, keeps going:
  "Ok, foo.rs shows the middleware is... and the migration..."

← handle_β resolved: "cargo test output (14 passed, 2 failed)"

Agent incorporates test results:
  "Two failures in auth_test.rs, let me look at those..."
```

The agent's reasoning is no longer gated on I/O. Tool calls are
fire-and-forget with handles. Results stream back as they complete.
The agent's generation is continuous.

### Status Handles in Turn Marginalia

Here's the key insight: status handles don't go in the main
conversation flow. They live in the **marginalia** — structured
annotations on the turn, not part of the turn's content.

```
┌─────────────────────────────────────────────────────────┐
│ Turn 48 (assistant)                                     │
│                                                         │
│ "Let me examine the auth middleware and run tests.      │
│  I'll also check the migration file.                    │
│                                                         │
│  While those run: the token refresh design needs to     │
│  handle rotation. The current approach..."              │
│                                                         │
│ ┌─── Marginalia ──────────────────────────────────────┐ │
│ │ handle_α: read("foo.rs")          ✅ resolved 120ms │ │
│ │ handle_β: bash("cargo test")      ✅ resolved 31.2s │ │
│ │ handle_γ: read("003_drop.sql")    ✅ resolved  85ms │ │
│ │                                                     │ │
│ │ Results:                                            │ │
│ │   α → [file content, 847 tokens]                    │ │
│ │   β → [test output: 14 pass, 2 fail, 234 tokens]   │ │
│ │   γ → [file content, 124 tokens]                    │ │
│ └─────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────┘
```

Why marginalia and not inline? Because:

1. **Marginalia don't pollute the reasoning flow.** The agent's
   CoT and response are continuous text about the problem. Tool
   results are data, not narrative. Keeping them in marginalia
   means the context window has clean reasoning with structured
   data attached, not reasoning interleaved with blobs of file
   contents and command output.

2. **Marginalia are independently compactable.** When DCP compacts
   turn 48, the skeletal form captures the decisions from the
   reasoning flow. The marginalia (tool results) can be handled
   separately — maybe the test output is still needed (keep it),
   maybe the file read is stale (evict it). The compaction
   granularity is finer because data and reasoning are separated.

3. **Marginalia have their own residency levels.** A tool result
   in marginalia can be:
   - **Inline**: full result in context (small results)
   - **Truncated**: first N lines + handle to full result in store
   - **Handle-only**: just the status handle + metadata (size,
     type, summary line). Full result in external store.
   - **Evicted**: handle exists in page table, not in context

4. **The oracle panel renders marginalia separately.** The
   operator sees the reasoning flow on the left and the tool
   call timeline on the right. They can expand any handle to see
   the full result. They can pin a tool result that's about to
   be compacted. They can see timing: "this bash call took 31
   seconds, the agent reasoned productively during the wait."

### Async + DCP Interaction

Async tool calls change the compaction calculus:

**Tool results are the biggest context bloat.** A single `bash`
call returning a full test suite output can be 5k tokens. A file
read can be 10k. In synchronous mode, these results land inline
in the conversation and immediately eat context. In async mode
with marginalia, they're structured data attached to turns,
independently manageable.

**Compaction can target marginalia specifically.** When context
pressure rises, before compacting reasoning (which is high-value),
compact tool results first:

```
Compaction priority:
  1. Truncate large tool results in marginalia (keep summary + handle)
  2. Evict stale tool results (old file reads, superseded outputs)
  3. Compact reasoning turns to skeletal (preserve decisions)
```

This means the agent's reasoning stays at full fidelity longer.
The expendable stuff — tool output that's been consumed and acted
on — gets compressed first. Current systems can't do this because
tool results are inline in the conversation, inseparable from the
reasoning that references them.

**Async handles enable speculative compaction.** The shadow clone
can start compacting a chunk while async tool calls from that
chunk are still resolving. The handle serves as a stable reference
— the compacted form says "tool_call β returned test results (see
handle_β)" without needing to include the results. The results
resolve to the external store regardless of compaction state.

### Handle Lifecycle

```
┌──────────┐    ┌──────────┐    ┌──────────┐    ┌──────────┐
│ Pending  │───►│ Resolved │───►│ Consumed │───►│ Evictable│
│          │    │          │    │          │    │          │
│ Agent    │    │ Result   │    │ Agent has│    │ Result   │
│ issued   │    │ ready,   │    │ read and │    │ no longer│
│ call,    │    │ in       │    │ acted on │    │ referenced│
│ waiting  │    │ marginalia│   │ the result│   │ by live  │
│          │    │          │    │          │    │ reasoning│
└──────────┘    └──────────┘    └──────────┘    └──────────┘
                                                     │
                                              ┌──────▼──────┐
                                              │ Compacted   │
                                              │             │
                                              │ Summary in  │
                                              │ skeletal,   │
                                              │ full result │
                                              │ in store    │
                                              └─────────────┘
```

Handles are tracked in the page table. The eviction scorer knows
which handles are still referenced by live reasoning and which
are consumed-and-done. Consumed handles are first in line for
marginalia compaction.

### Oracle Panel: Tool Call Timeline

The panel gets a new view — the tool call timeline:

```
┌─────────────────────────────────────────────────────────┐
│  Tool Calls                                    Turn 48  │
│                                                         │
│  ──────────────────── time ──────────────────────►      │
│                                                         │
│  α read(foo.rs)     [███]                    120ms      │
│  β bash(cargo test) [██████████████████████]  31.2s     │
│  γ read(003_drop)   [██]                      85ms      │
│                                                         │
│  Agent reasoning:   [████████████████████████████████]   │
│                      ▲        ▲               ▲         │
│                      │        │               │         │
│                   issued    α,γ resolve     β resolves   │
│                   α,β,γ     agent uses     agent uses    │
│                                                         │
│  Utilization: agent reasoned during 98% of wall time    │
│  (vs. 0% with synchronous tool calls)                   │
└─────────────────────────────────────────────────────────┘
```

The operator sees: how much time the agent spent waiting vs.
thinking. Which tool calls were slow. Whether the agent used
the wait time productively. This is the real-time performance
view of the agent's cognitive utilization.

## Call-by-Name Handles and the Push-Down DSL

### The Context Facial Problem

Current tool execution is call-by-value: the tool runs, the full
result materializes in context. A 10k token file read? In context.
A 5k token test output? In context. `find . -name "*.rs"` on a
large repo? Hundreds of lines, in context. The agent asked a
question and got the entire answer sprayed across its context
window. Facial. No thanks.

Most of the time the agent doesn't need the full result. It needs:
- "Did the tests pass?" (not the full output)
- "What's the function signature on line 47?" (not the whole file)
- "How many files matched?" (not the file list)
- "What's the error message?" (not the full stack trace)

But the agent can't express this today. It calls a tool, gets the
full result, and then reasons over it to extract what it needed.
The extraction happens IN context, AFTER the full data is already
there. The context pays for the full materialization even though
only 5% of it was decision-relevant.

### Call-by-Name: Handles Are Thunks

In call-by-name evaluation, an expression isn't evaluated until
it's needed. A handle in DCP is a **thunk** — a suspended
computation that evaluates (materializes) only when forced.

```
§α = handle(read, path="foo.rs")

-- §α is NOT the file contents. It's a reference to
-- a computation that WOULD produce the file contents
-- if forced. The file may already be read (resolved
-- in the background), but the result is NOT in context.

-- The agent can:
--   1. Force it: materialize(§α) → full contents enter context
--   2. Query it: §α.line(47) → one line enters context
--   3. Transform it: §α.grep("fn.*pub") → filtered result
--   4. Summarize it: §α.count_lines() → single number
--   5. Pipe it: §α.grep("error") |> §β.input → never in context
```

The result exists. It's resolved. But it's in the **external store**,
not in context. The handle is the agent's reference to it. The agent
decides what and how much to materialize. Nothing touches context
until the agent explicitly pulls it through.

### The Push-Down DSL

The agent needs a language for expressing computation over handles
WITHOUT materializing the underlying data into context. This is the
**push-down DSL** — push computation DOWN to the data instead of
pulling data UP into context.

```
-- Instead of this (call-by-value, context facial):
result = tool(bash, "cargo test")       -- 5k tokens in context
-- agent reads 5k tokens to find: "2 failures"

-- Do this (call-by-name, push-down):
§t = handle(bash, "cargo test")         -- 0 tokens in context
§t.exit_code                            -- 1 token: "1"
§t.grep("FAILED")                       -- 3 lines, ~50 tokens
§t.tail(20)                             -- last 20 lines, ~200 tokens
```

The DSL operations:

```
Handle Operations (zero materialization):
  §h.exists()           -- bool
  §h.size()             -- token count / byte count
  §h.type()             -- file, stdout, stderr, json, etc.

Projection (minimal materialization):
  §h.line(n)            -- single line
  §h.lines(start, end)  -- range
  §h.head(n)            -- first n lines
  §h.tail(n)            -- last n lines
  §h.slice(offset, len) -- byte range

Search (filtered materialization):
  §h.grep(pattern)      -- matching lines only
  §h.grep_context(pat, n) -- matches with n lines context
  §h.find(string)       -- first occurrence + location

Transform (computed materialization):
  §h.json_path(expr)    -- extract from JSON
  §h.count_lines()      -- single number
  §h.count_matches(pat) -- single number
  §h.summary(max_tok)   -- LLM-generated summary, capped size
  §h.extract(question)  -- LLM-answered question about content

Composition (handle → handle, never in context):
  §h.grep(pat) |> §g    -- pipe to another handle
  §h.transform(fn) |> §g -- apply function, result to new handle
  merge(§a, §b)          -- combine handles
```

### Push Computation to the Data: Sub-Computation Engines

For complex operations over tool results, push an entire
computation down rather than pulling data up. The DSL isn't
just string operations — it can dispatch **sub-computations**
that run outside the agent's context entirely.

```
-- Push a Lua script to process test output:
§results = §t.compute(lua, """
  local failures = {}
  for line in input:lines() do
    if line:match("FAILED") then
      table.insert(failures, line)
    end
  end
  return {
    total = count,
    failed = #failures,
    failure_lines = failures
  }
""")

-- §results is a new handle. Contains structured data.
-- Agent can materialize selectively:
§results.failed          -- "2"
§results.failure_lines   -- just the failure descriptions
```

Why Lua (or similar lightweight embeddable):
- Sandboxed, can't escape
- Tiny runtime, spins up in microseconds
- Good at text processing
- The agent can generate Lua snippets to express exactly the
  extraction it needs
- The Lua runs in the harness, not in context. The result
  is a new handle. Nothing touches context until the agent
  forces materialization.

Other sub-computation options:
- **jq** for JSON tool results
- **SQL** over structured data (query a test result as a table)
- **Regex engine** for pattern extraction
- **Tree-sitter** for code-aware queries ("all public functions
  in this file" without reading the file into context)
- **A smaller/cheaper model** for summarization sub-tasks
  ("summarize this 10k output in 200 tokens" — run by a
  fast small model, result is a new handle)

The point: the context window is precious real estate. Every token
that enters context should be there because the agent DECIDED it
needed to be there, not because a tool vomited its full output.
The push-down DSL gives the agent surgical control over what
materializes.

### Handle Materialization Budget

The agent has a **materialization budget** per turn — a soft cap
on how many tokens of tool results can be pulled into context in
a single turn. This forces disciplined use of the DSL:

```
Turn materialization budget: 2,000 tokens

§file = handle(read, "big_file.rs")     -- 8,000 tokens
§file.materialize()                      -- DENIED: exceeds budget
§file.head(50)                           -- ok: ~500 tokens
§file.grep("pub fn")                     -- ok: ~200 tokens
§file.line(47)                           -- ok: ~20 tokens
```

The budget is dynamic — it adjusts based on context pressure:
- Low pressure (context <50%): generous budget, materialize freely
- Medium pressure (50-75%): moderate budget, prefer projections
- High pressure (>75%): tight budget, handles only, push-down DSL

The oracle panel shows materialization budget and usage per turn.
The operator can override the budget ("let this one through, it's
important") or tighten it ("stop materializing, you're burning
context").

### Handles in the Page Table

Handles are first-class entries in the page table:

```
HandleEntry = {
  id          : HandleId,
  source      : ToolCall,          -- what produced this
  status      : pending | resolved | forced | evicted,
  store_ref   : StoreRef,          -- where the full result lives
  materialized: TokenCount,        -- how much has been pulled into ctx
  total_size  : TokenCount,        -- full result size
  projections : List<Projection>,  -- what's been queried via DSL
  dependents  : Set<ChunkHash>,    -- which reasoning chunks reference this
  turn        : TurnIndex,
}
```

Compaction interacts with handles naturally:
- A handle whose result was never materialized → evict for free
  (nothing in context to remove)
- A handle with small projections materialized → compact the
  projections into the skeletal form
- A handle with full materialization → treat like any other
  tool result in marginalia

### DCP + CBN + Push-Down: The Full Picture

```
Agent reasons → issues tool call → gets handle (0 context cost)
                                       │
                               ┌───────▼────────┐
                               │  Tool executes  │
                               │  async, result  │
                               │  goes to store  │
                               └───────┬─────────┘
                                       │
                        Agent decides what it needs:
                               │
              ┌────────────────┼────────────────┐
              │                │                │
         Force full      Push-down DSL     Sub-computation
         (rare, small    (grep, slice,    (Lua, jq, SQL,
          results only)   project)         tree-sitter)
              │                │                │
              ▼                ▼                ▼
         Full result      Filtered         Computed
         in context       projection       extraction
         (budget-         in context       → new handle
          limited)        (small)          (0 context cost
                                           until forced)
```

Context stays clean. The agent operates on handles, forces
materialization surgically, and pushes heavy computation down
to where the data lives. No facials.

### Idempotent Tool Calls

Tool calls must be idempotent. This falls out of the architecture
but needs to be explicit because everything breaks without it.

**Why idempotency is required:**

1. **Compaction replays.** When a shadow clone re-derives from a
   skeletal form, it might re-encounter tool calls from the
   original execution. If the tool call is idempotent, the clone
   can safely re-execute it (or skip it, knowing the result is
   in the store). If it's not idempotent, the clone's re-execution
   produces different results and the re-derivation diverges.

2. **Page faults.** Fault resolution may involve re-executing a
   computation path that included tool calls. The fault handler
   needs to know: can I re-run this, or do I have to use the
   stored result? Idempotent calls → re-run safely. Non-idempotent
   → must use stored result (handle is the only source of truth).

3. **Handle re-materialization.** The agent forces a handle,
   gets a projection, the projection gets compacted, later the
   agent faults and needs the projection again. If the underlying
   tool call is idempotent, the handle can re-resolve by
   re-executing. If not, the handle must be backed by the stored
   result — re-execution would give a different answer.

4. **Speculative execution.** The agent issues tool calls
   speculatively ("I might need this"). If the agent's reasoning
   path changes and it never forces the handle, the tool call's
   side effects are still out there. Idempotent calls have no
   side effects to worry about. Non-idempotent calls need
   transactional semantics (rollback? compensation?).

5. **Multi-agent sharing.** When agent A shares a handle with
   agent B, and B forces it — does B re-execute the tool call
   or read from A's stored result? Idempotent → either works.
   Non-idempotent → must read from store.

**Classification:**

```
Idempotent (safe to re-execute, safe to cache):
  read(path)              -- same file, same content*
  bash("cat ...")         -- read-only commands
  bash("cargo check")     -- pure analysis
  grep, find, ls, stat    -- filesystem queries

Idempotent-ish (same result within a session, may change across):
  bash("cargo test")      -- deterministic if code hasn't changed
  bash("git status")      -- stable within a reasoning block
  bash("curl GET ...")    -- read-only HTTP

Non-idempotent (side effects, different result each time):
  bash("rm ...")          -- destructive
  write(path, content)    -- mutates state
  bash("cargo build")     -- produces artifacts, changes fs
  bash("git commit")      -- mutates repo state
  bash("curl POST ...")   -- server-side effects

  * assuming no concurrent mutation
```

**Harness behavior by idempotency class:**

```
Idempotent:
  - Handle can re-resolve by re-executing
  - Result is cacheable: same call → same handle → same result
  - Clone can safely re-execute during compaction/fault
  - Multiple agents can independently execute, get same result

Idempotent-ish:
  - Handle stores result at execution time (snapshot semantics)
  - Re-execution may give different result → use stored
  - Cache with TTL or invalidation on known state changes

Non-idempotent:
  - Handle MUST be backed by stored result, never re-executed
  - Tool call is logged with before/after state
  - Compaction preserves the call + result as a state transition
  - Skeletal form captures: "wrote X to Y" (the delta), not
    "call write(Y, X)" (the instruction — re-executing is wrong)
  - Clone during compaction sees the stored result, not re-runs
```

**Idempotency enables handle deduplication:**

```
-- Agent issues same read twice (maybe forgot it already has it):
§a = handle(read, "foo.rs")
§b = handle(read, "foo.rs")

-- Harness detects: same tool, same args, idempotent
-- §b = §a (deduplicated, no second execution)
```

This is free caching. Idempotent tool calls with the same
arguments collapse to the same handle. The agent doesn't need
to remember whether it already read a file — the harness
deduplicates. This is particularly valuable post-compaction:
the agent's skeletal form says "foo.rs was modified" but the
agent can't remember reading it. It issues a read. The harness
says "you already have this, here's the handle." Zero context
cost for the redundant call.

**Idempotency tagging:**

Tool definitions in the harness include an idempotency annotation:

```
tool_def(read, {
  idempotency: "pure",        -- always safe to cache/re-execute
  cache_key: (path,),         -- cache by these args
})

tool_def(bash, {
  idempotency: "inferred",    -- harness infers from command
  classifier: cmd → {
    /^(cat|grep|find|ls|head|tail|wc)/ → "pure",
    /^(cargo test|cargo check|cargo clippy)/ → "session",
    /^(rm|mv|cp|mkdir|write|git commit)/ → "non-idempotent",
    _ → "unknown" (treat as non-idempotent, warn)
  }
})

tool_def(write, {
  idempotency: "non-idempotent",
  captures: "before_after",   -- store state before and after
})
```

The harness classifies every tool call and routes it through
the appropriate handle lifecycle. Pure calls get aggressive
caching and deduplication. Non-idempotent calls get journaling
and stored results. Unknown calls get conservative treatment
(store result, don't re-execute, warn the operator via panel).

### Implementation: Async in the Harness

The agent harness (pi) needs to support async tool execution:

1. **Tool call interception**: When the model emits a tool call
   token sequence mid-generation, the harness intercepts it,
   starts executing the tool async, and injects a handle token
   back into the generation stream.

2. **Continuation**: The model continues generating after the
   handle injection. It can emit more tool calls (all get handles)
   or continue reasoning.

3. **Result injection**: When a tool completes, the harness
   injects the result into the marginalia of the current turn.
   If the model is still generating, it can reference the result
   immediately. If the model has finished the turn, the results
   are available for the next turn.

4. **Handle resolution in context**: The model sees handles as
   typed references: `§α:pending`, `§α:resolved(847tok)`. The
   marginalia section of the turn contains the full resolved
   data. The model can "look at" the marginalia to consume
   results.

This requires model-level support for:
- Emitting tool calls without stopping generation
- Referencing handles in subsequent reasoning
- "Looking at" marginalia mid-turn

Current models don't natively support this. Implementation path:
- Short term: simulate with rapid multi-turn. Agent emits N tool
  calls, harness executes all in parallel, returns all results
  in a single turn. Not true async but captures the parallelism.
- Medium term: streaming tool call protocol. Model streams tokens,
  harness intercepts tool call sequences, executes async, injects
  results into the stream via a control channel.
- Long term: native model support for async handles and marginalia
  as a first-class context structure.

## The Oracle Panel (Native Swift)

### Why Native

The oracle panel is a real-time bidirectional editor for an agent's
cognitive state. A web UI is wrong for this:

- **Latency**: WebSocket round-trips for every panel update. The
  operator is editing the agent's mind in real-time — they need
  sub-frame latency on interactions. Drag to reorder chunks, click
  to expand CoT, type to inject — these must feel instantaneous.

- **Text rendering**: CoT traces are massive. Tens of thousands of
  tokens of reasoning, syntax-highlighted, searchable, collapsible.
  Web text rendering chokes on this. Native `NSTextView`/SwiftUI
  `Text` with lazy rendering handles it.

- **Memory**: The panel holds the full external store in memory for
  instant fault resolution. The page table, the dependency graph,
  the CoT for every chunk — this is a large, structured, live data
  set. Native memory management, not browser tab GC.

- **Keyboard-driven**: The operator is a power user. The panel needs
  Vim-style navigation, keyboard shortcuts for every oracle op,
  command palette, fuzzy search over tags and CoT. Web apps can
  approximate this. Native apps own it.

- **System integration**: Menu bar presence for context pressure
  alerts. Notifications when compaction events fire. Drag-and-drop
  files into oracle injection. Spotlight-indexed CoT. Accessibility.

- **Process isolation**: The panel is a separate process from the
  agent. Crash isolation. The panel can monitor multiple agents
  simultaneously. The agent doesn't know or care about the panel's
  UI framework — it exposes state via a local protocol, the panel
  renders it.

### Architecture: Agent ↔ Panel Protocol

```
┌──────────────────────┐          ┌──────────────────────┐
│     Agent Process     │          │   Oracle Panel (Swift)│
│                       │          │                       │
│  ┌─────────────────┐  │   mmap   │  ┌─────────────────┐  │
│  │  Context Window  │◄─┼─────────┼──│  Context Map UI  │  │
│  └─────────────────┘  │  / UDS   │  └─────────────────┘  │
│                       │          │                       │
│  ┌─────────────────┐  │          │  ┌─────────────────┐  │
│  │   Page Table     │◄─┼─────────┼──│  Page Table View │  │
│  └─────────────────┘  │          │  └─────────────────┘  │
│                       │          │                       │
│  ┌─────────────────┐  │          │  ┌─────────────────┐  │
│  │  External Store  │◄─┼─────────┼──│  CoT Browser     │  │
│  └─────────────────┘  │          │  └─────────────────┘  │
│                       │          │                       │
│  ┌─────────────────┐  │          │  ┌─────────────────┐  │
│  │  Event Stream    │──┼─────────┼─►│  Live Feed       │  │
│  └─────────────────┘  │          │  └─────────────────┘  │
│                       │          │                       │
└──────────────────────┘          └──────────────────────┘

Communication: Unix domain socket for commands (pin, edit, inject,
promote, demote, tag). Memory-mapped file or shared memory for
the page table and context map (read-heavy, needs to be zero-copy).
Event stream via UDS for compaction events, pressure changes,
fault notifications.
```

### Panel Views

**1. Context Map (primary view)**

The top-level view. A horizontal bar showing every chunk in context,
colored by residency level, sized proportionally to token count.
The operator's spatial overview of the agent's mind.

```
┌─────────────────────────────────────────────────────────────┐
│ ░░░░░│▓▓▓▓▓▓│▓▓▓▓│████████│██████████████│████████████████ │
│ sk₁  │ sk₂  │sk₃ │  raw₄  │    raw₅      │     raw₆       │
│ 📌   │  ✏️  │    │        │              │                 │
└─────────────────────────────────────────────────────────────┘
  Pressure: 74% ████████████████████░░░░░░░  [Auto ▶] [⚙]
```

Click a chunk → expands below into detail view.
Right-click → oracle operations (pin, demote, etc.).
Drag chunks → reorder priority (affects eviction scoring).
Chunks pulse when accessed by the agent.
Red glow when approaching pressure threshold.

**2. Chunk Detail / CoT Browser**

Split pane: left is the skeletal form, right is the full CoT from
the external store. Syntax highlighted. Collapsible reasoning
blocks. Search across all CoT with `⌘F`.

```
┌──────────────────────────┬──────────────────────────────────┐
│  Skeletal Form           │  Chain of Thought                │
│                          │                                  │
│  DECISION: auth → JWT    │  <thinking>                      │
│    REASON: session       │  The user wants to move away     │
│      bottleneck          │  from session-based auth. Let    │
│    REJECTED:             │  me consider the options:        │
│      - opaque tokens     │                                  │
│      - PASETO            │  JWT pros:                       │
│    CONSTRAINT:           │  - Stateless, scales             │
│      - token refresh     │  - Widely supported              │
│      - ≤15min expiry     │  - We already have jsonwebtoken  │
│                          │                                  │
│  STATE_CHANGES:          │  PASETO:                         │
│    middleware.rs: ...    │  - Safer defaults than JWT       │
│    login.rs: ...         │  - But the rust library is       │
│                          │    immature, last commit 6mo ago │
│  [Edit] [Pin] [Demote]  │  - I'm ~60% confident on this    │
│                          │    rejection, might revisit      │
│                          │                                  │
│                          │  Going with JWT. The constraint  │
│                          │  on refresh tokens means I need  │
│                          │  to implement rotation...        │
│                          │  </thinking>                     │
│                          │                                  │
│                          │  [Full CoT: 3,847 tokens]        │
│                          │  [Compaction CoT: 892 tokens]    │
└──────────────────────────┴──────────────────────────────────┘
```

The operator reads the left side for structure, the right side
for understanding. "The agent was only 60% on rejecting PASETO
and flagged it might revisit. The skeletal form says REJECTED.
I know the CTO wants PASETO. Pin this chunk + edit the skeletal
to say DEFERRED not REJECTED."

This is the oracular power: the operator sees what the agent
thought (CoT), what the compaction preserved (skeletal), and the
gap between them. Then acts on the gap.

**3. Dependency Graph**

Interactive DAG visualization. Nodes are chunks, edges are
dependencies. Click a node → highlight all dependents/dependencies.
Color by residency level. Size by token count. Cluster by semantic
tag.

The operator can see: "Everything downstream depends on this
turn-3 decision. It's currently skeletal. Pin it." Or: "These
five chunks form an island with no downstream deps. Demote all
to referential."

Built with native Core Animation / Metal for smooth interaction
with large graphs.

**4. Compaction Timeline**

Vertical timeline showing every compaction event:
- When it fired (context pressure level)
- What was compacted (which chunks, raw → skeletal)
- The clone's compaction CoT (why it made those choices)
- Tokens freed, reroll cost paid
- Amortization status (has the reroll cost been recovered yet?)

```
  ┌─ Compaction #3 ──────────────────────────────────┐
  │ t=47  pressure: 82%  freed: 4,201 tok            │
  │ chunks: raw₃ + raw₄ → skeletal₃₋₄               │
  │ clone CoT: "Merging these because raw₄ is a      │
  │   direct continuation of raw₃'s auth work..."    │
  │ reroll cost: 12,400 input tok                     │
  │ amortized after: ~8 turns (current: turn 52 ✓)   │
  │                                          [Audit]  │
  └───────────────────────────────────────────────────┘
```

**5. Oracle Injection Editor**

Full text editor for composing injections. Markdown support.
Tag autocomplete from existing semantic tags. Dependency linking
(this injection relates to chunk X). Preview how the injection
will appear in the agent's context before committing.

**6. Tool Call Timeline**

Gantt chart of async tool calls per turn. Shows wall time, agent
reasoning overlap, handle lifecycle (pending → resolved → consumed
→ evicted). The operator sees cognitive utilization at a glance:
is the agent thinking productively or blocking on I/O?

Click a handle → expands to full tool result. Right-click →
pin result, evict result, re-run tool call. The timeline
integrates with the context map — tool results in marginalia
are colored by their residency level (inline, truncated,
handle-only, evicted).

**7. Multi-Agent View**

When running a swarm, the panel shows all agents side-by-side.
Each agent's context map is a row. Cross-agent dependencies are
visible. The operator can inject into any agent, view any agent's
CoT, trigger cross-agent page faults.

```
┌─────────────────────────────────────────────────────────┐
│  Agent: auth-worker                                     │
│  ░░░░░│▓▓▓▓▓▓│████████│██████████████│  72%             │
├─────────────────────────────────────────────────────────┤
│  Agent: frontend-worker                                 │
│  ░░│▓▓▓▓│▓▓▓▓▓▓│██████████│██████│     65%              │
├─────────────────────────────────────────────────────────┤
│  Agent: test-writer                                     │
│  ▓▓▓▓│████████████████████████│         81%  ⚠️         │
└─────────────────────────────────────────────────────────┘
```

### Swift Implementation Notes

**Framework**: SwiftUI for layout + AppKit for heavy text
rendering (`NSTextView` for CoT display — SwiftUI `TextEditor`
can't handle the volume). Metal for the dependency graph
visualization.

**Data layer**: The page table and chunk metadata are Swift structs
conforming to `Codable`, synced from the agent via shared memory
or UDS. The external store (full turns + CoT) accessed via
memory-mapped files for zero-copy reads.

**Reactivity**: Combine publishers on the UDS event stream.
Page table changes → UI updates within a single frame. The
context map bar animates smoothly as chunks are compacted
(skeletal chunks slide in, raw chunks shrink out).

**Performance targets**:
- Panel launch to first render: <200ms
- Chunk click to CoT display: <50ms (mmap read)
- Oracle injection to agent context update: <100ms
- Dependency graph render for 100 chunks: 60fps
- CoT scroll for 50k tokens: 60fps (lazy `NSTextView`)

**Distribution**: Standalone .app, notarized. Connects to any
running DCP-enabled agent via UDS (local) or TCP (remote agents
on Vers VMs). The panel discovers agents via Bonjour/mDNS locally
or the Vers registry for remote.

### The Problem with Fully Autonomous Compaction

Even a shadow clone with perfect context makes compaction decisions
based on its own model of what matters. But the agent's model of
what matters is incomplete — the human operator has **exogenous
knowledge** the agent can't have:

- "That tangent about PASETO? Keep it — the CTO is about to mandate it"
- "The error trail for that borrow checker issue is irrelevant, drop it"
- "This whole auth thread is actually about a compliance audit, tag it"
- "You compacted away the part where I said X was load-bearing"

The operator sees the context at a level the agent can't see itself.
The agent is inside the box. The operator is outside it.

### Context → State/Text Mapping

The oracle panel exposes a **bidirectional map between the agent's
context and its compacted representations**, letting the operator
directly read, annotate, pin, override, and inject.

```
┌─────────────────────────────────────────────────────────────────┐
│  DCP Oracle Panel                                    ▣ ▢ ✕     │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  Context Map                                        [100% ████]│
│  ┌─────────────────────────────────────────────────────────┐   │
│  │░░░░░░░░░░│▓▓▓▓▓▓▓▓▓▓│████████│████████│████████████████│   │
│  │ skeletal₁│ skeletal₂ │  raw₃  │  raw₄  │     raw₅      │   │
│  │ t:1-12   │ t:13-24   │ t:25-31│ t:32-38│    t:39-47    │   │
│  │ 340 tok  │ 410 tok   │ 2.1k   │ 1.8k   │    3.2k       │   │
│  └─────┬─────────┬──────────┬────────┬──────────┬──────────┘   │
│        │         │          │        │          │               │
│  ──────┴─────────┴──────────┴────────┴──────────┘               │
│                                                                 │
│  Selected: skeletal₂ (turns 13-24)                              │
│  Tags: [auth] [jwt] [migration]                                 │
│  Deps: skeletal₁.decision_session_bottleneck                    │
│  Fidelity: 0.82                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ DECISION: auth system → JWT                             │   │
│  │   REASON: session store was scaling bottleneck          │   │
│  │   REJECTED: [opaque tokens, PASETO]                     │   │
│  │   CONSTRAINT: token refresh, ≤15min expiry              │   │
│  │ STATE_CHANGES:                                          │   │
│  │   src/auth/middleware.rs: session_check() → jwt_verify()│   │
│  │   src/auth/login.rs: +issue_jwt(), +refresh_token()     │   │
│  │   ...                                                   │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
│  Oracle Actions:                                                │
│  ┌──────────┐ ┌──────────┐ ┌────────┐ ┌────────┐ ┌──────────┐ │
│  │ 📌 Pin   │ │ ✏️ Edit  │ │ ⬆ Prom │ │ ⬇ Dem  │ │ 💉 Inject│ │
│  └──────────┘ └──────────┘ └────────┘ └────────┘ └──────────┘ │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ 💬 Oracle Injection:                                    │   │
│  │ > "The PASETO rejection is wrong. CTO confirmed PASETO  │   │
│  │    mandate next quarter. Re-evaluate this decision.     │   │
│  │    Auth work should be PASETO-compatible."              │   │
│  │                                        [Inject ▶]       │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
│  Dependency Graph                              [Expand ▶]      │
│  skeletal₁ ──► skeletal₂ ──► raw₃                              │
│       └────────────────────► raw₄                              │
│                                                                 │
│  Compaction Queue          [▶ Auto] [⏸ Pause] [⚙ Policy]      │
│  Next: raw₃ (2.1k tok, age: 16 turns)  [Compact Now]          │
│  Pressure: 78% ██████████████████░░░░░                         │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### Oracle Operations

**1. Pin**
Lock a chunk at its current residency level. It cannot be compacted
or evicted without explicit operator release.

```
pin(chunk_id, reason="compliance-relevant, keep verbatim")
```

Pinned chunks are exempt from eviction scoring. The agent sees
them as immovable context — part of its ground truth. This is how
the operator says "this matters more than your eviction policy thinks."

**2. Edit**
Directly modify the compacted representation. The operator can:
- Fix hallucinated compaction ("you said we rejected X, we didn't")
- Add context the agent missed ("this was also related to Y")
- Remove noise ("this error trail is irrelevant, drop it")

Edits are tagged as oracle-sourced so the agent can weight them
as higher-confidence than its own compactions:

```
edit(chunk_id, field="REJECTED", old=["opaque tokens", "PASETO"],
     new=["opaque tokens"], oracle_note="PASETO is back on the table")
```

**3. Promote / Demote**
Change a chunk's residency level. Promote a referential handle back
to skeletal (the operator wants more detail here). Demote a raw
chunk to skeletal or referential (the operator says this is noise,
compress it harder).

```
promote(chunk_id, to=skeletal)  -- "I need this expanded"
demote(chunk_id, to=referential)  -- "compress this, it doesn't matter"
```

Promotion triggers a shadow clone fault if needed — branch, clone
expands the compacted form, splice expanded version in.

Demotion can be done by the parent directly or via clone.

**4. Inject**
Insert entirely new content into the agent's context that didn't
come from any conversation turn. Oracle injections are exogenous
knowledge:

```
inject(content="CTO mandated PASETO for Q3. All auth decisions
       must account for PASETO migration.", 
       tags=["auth", "paseto", "executive-mandate"],
       position=after(chunk_id),
       type=oracle)
```

This is the most powerful operation. The operator can:
- Correct the agent's world model without replaying conversation
- Inject decisions made outside the agent's session
- Provide information from other agents/sessions/humans
- Override compaction decisions ("here's what actually happened")

Injected content is tagged `oracle` so the agent knows it didn't
produce this itself — it's ground truth from outside the session.

**5. Tag / Retag**
Modify semantic tags on any chunk. The operator's tagging overrides
the clone's tagging. This affects eviction policy (tags feed into
semantic centrality scoring) and future page fault relevance:

```
retag(chunk_id, add=["compliance", "audit-trail"],
      remove=["experimental"])
```

### The Mapping Is Bidirectional

The panel isn't just a viewer — it's a **state/text editor for the
agent's mind**.

```
  Operator sees:        Agent sees:
  ┌────────────┐       ┌────────────┐
  │ Visual map │◄─────►│  Context   │
  │ of context │       │  window    │
  │ chunks     │       │  contents  │
  └─────┬──────┘       └─────┬──────┘
        │                     │
        │  Oracle edits       │
        │  flow directly ────►│
        │  into context       │
        │                     │
        │  Compaction events  │
        │◄──── flow to ───────│
        │  panel display      │
        │                     │
  ┌─────▼──────┐       ┌─────▼──────┐
  │ Operator   │       │  Agent     │
  │ mental     │       │  mental    │
  │ model of   │       │  model of  │
  │ the task   │       │  the task  │
  └────────────┘       └────────────┘
```

The operator's exogenous knowledge enters the agent's context
through the panel. The agent's compaction decisions are visible
to the operator through the panel. The panel is the **membrane**
between the human's world model and the agent's context.

### Why This Is "Oracular"

In the computational sense: an oracle is an external source of
truth that a computation can query but cannot derive internally.
The operator IS an oracle — they have information the agent cannot
compute:

- Business context (what the CTO said in a meeting)
- Cross-session state (what another agent discovered)
- Future intent (what the operator plans to do next)
- Judgment calls (which trade-offs are acceptable)
- Ground truth corrections (the compaction hallucinated)

Without the panel, the agent is a closed system whose compaction
quality degrades as it loses touch with the human's evolving
intent. With the panel, the agent's compacted context is
**continuously calibrated against external reality**.

The panel makes the human a **runtime participant in context
management**, not just a prompt author. The human doesn't just
tell the agent what to do — they shape what the agent remembers,
what it forgets, and what it believes about what it forgot.

### Oracle-Aware Eviction

When the operator interacts with the panel, the eviction policy
adjusts:

- Pinned chunks: score = ∞ (never evict)
- Oracle-edited chunks: score boost (operator touched = important)
- Oracle-injected content: inherits priority from injection type
- Operator-viewed chunks: mild score boost (attention = relevance)
- Operator-demoted chunks: score penalty (explicit "don't care")

```
eviction_score(chunk) =
    α * recency
  + β * dep_fanout
  + γ * semantic_centrality
  + δ * access_frequency
  + ζ * oracle_signal(chunk)   -- pin/edit/view/inject history
  - ε * reconstruction_cost
```

The operator's attention pattern is signal. What they look at,
what they edit, what they pin — all of it feeds back into what
the agent keeps resident. The oracle panel isn't just a UI —
it's a **continuous relevance signal** from the one entity in
the system with true exogenous knowledge.

## Architecture

### The Compaction Cycle

```
    Agent (turn 47, context filling up)
         │
         ├── vm_branch → Shadow Clone
         │                    │
         │              Clone has full ctx.
         │              Clone's task:
         │              "Produce a skeletal compaction
         │               of turns 1-30. Preserve decision
         │               structure, state deltas, deps,
         │               open items. Make it invertible —
         │               another agent should be able to
         │               re-derive the details from your
         │               output alone."
         │                    │
         │              Clone outputs structured
         │              skeletal form
         │                    │
         ├── receive ◄────────┘
         │   splice skeletal form into context
         │   replacing raw turns 1-30
         │
         ▼
    Agent continues, context ~35% full
```

### Residency Levels

```
┌──────────────┬────────────────────────────────────────┬───────────┐
│ Level        │ What the representation contains       │ ~Size     │
├──────────────┼────────────────────────────────────────┼───────────┤
│ raw          │ Verbatim turns                         │ 1.0x      │
│              │                                        │           │
│ skeletal     │ Decision tree, state deltas, dep       │ 0.10-0.15x│
│              │ graph, constraints, open items.         │           │
│              │ Semi-invertible: details re-derivable. │           │
│              │                                        │           │
│ referential  │ One-line typed handle per chunk.        │ 0.01-0.02x│
│              │ Semi-invertible at tag level only.     │           │
│              │                                        │           │
│ evicted      │ Not in context. Entry in page table.   │ ~0        │
│              │ Page fault required for any use.       │           │
└──────────────┴────────────────────────────────────────┴───────────┘
```

### Page Faults

A page fault means: **branch a clone, the clone has the compacted
form in its context, the clone expands it.**

```
page_fault(chunk, question):
  clone = vm_branch(parent)
  answer = task_clone(clone,
    "Using the skeletal compaction of chunk {id}, re-derive: {question}")
  splice(answer, into=parent_context)
  vm_destroy(clone)
```

Hierarchy:
  1. Skeletal form sufficient → use directly (no fault)
  2. Need detail → clone re-derives from skeletal (semi-inversion)
  3. Re-derivation insufficient → snapshot rollback (disaster recovery)

### Page Table

```
PageEntry = {
  id          : ChunkHash,
  span        : (TurnStart, TurnEnd),
  level       : raw | skeletal | referential | evicted,
  tags        : Set<SemanticTag>,
  deps        : Set<ChunkHash>,
  inverse_deps: Set<ChunkHash>,
  tokens_raw  : int,
  tokens_now  : int,
  fidelity    : float,
  pinned      : bool,             -- operator pinned
  oracle_edits: int,              -- count of operator edits
  oracle_notes: List<OracleNote>, -- operator annotations
  snapshot    : CommitId?,        -- for rollback only
}
```

### Full System Diagram

```
┌──────────────────────────────────────────────────────────────┐
│                      OPERATOR                                │
│                        │                                     │
│              ┌─────────▼──────────┐                          │
│              │   Oracle Panel     │                          │
│              │                    │                          │
│              │  Pin / Edit /      │                          │
│              │  Promote / Demote /│                          │
│              │  Inject / Tag      │                          │
│              └─────────┬──────────┘                          │
│                        │ bidirectional                       │
│              ┌─────────▼──────────┐                          │
│              │    Page Table      │                          │
│              │  (context map)     │                          │
│              └─────────┬──────────┘                          │
│                        │                                     │
│  ┌─────────────────────▼─────────────────────────────────┐   │
│  │              Context Window                            │   │
│  │                                                       │   │
│  │  [skel₁ 📌] [skel₂ ✏️] [raw₃] [raw₄] [oracle₅ 💉]  │   │
│  │                                                       │   │
│  └───────────────────────┬───────────────────────────────┘   │
│                          │                                   │
│          pressure > threshold                                │
│                          │                                   │
│              ┌───────────▼──────────┐                        │
│              │   Shadow Clone       │                        │
│              │   (vm_branch)        │                        │
│              │                      │                        │
│              │   Full context,      │                        │
│              │   produces skeletal  │                        │
│              │   compaction         │                        │
│              └───────────┬──────────┘                        │
│                          │                                   │
│              compacted repr flows back                       │
│              to parent + panel updates                       │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

### Compaction Composition

When context fills again and oldest chunks are already skeletal:

```
Context: [skeletal₁ | skeletal₂ | raw₃ | raw₄ | raw₅]
```

Clone compacts `raw₃, raw₄, raw₅` into `skeletal₃`. When ALL
chunks are skeletal, clone can merge multiple skeletals into a
higher-order skeletal form or demote to referential. This works
because skeletal forms are semi-invertible — the clone understands
what they encode.

### Eviction Policy

```
eviction_score(chunk) =
    α * recency
  + β * dep_fanout
  + γ * semantic_centrality
  + δ * access_frequency
  + ζ * oracle_signal(chunk)   -- pin/edit/view/inject
  - ε * reconstruction_cost
```

Never evict a chunk with live raw dependents.
Never evict a pinned chunk.
Oracle-edited chunks get a score boost.

## Formal Properties

### Semi-Invertibility

```
distance(x, expand(compact(x))) ≤ ε(level)
```

where `distance` measures decision-relevant information loss.
The shadow clone minimizes `ε(skeletal)` because it has maximum
information about what's decision-relevant.

### Composition

```
compact(c₁ ++ c₂) ≈ merge(compact(c₁), compact(c₂))
```

Approximate because structural properties (decisions, deps, states)
are compositional by nature. What doesn't compose (narrative flow)
is what skeletal form discards.

### Oracle Monotonicity

Oracle operations only ADD information to the system:
- Pin: adds a constraint (keep this)
- Edit: adds ground truth (this is correct)
- Inject: adds exogenous knowledge
- Tag: adds semantic structure
- Demote: adds a relevance judgment (this doesn't matter)

The operator cannot accidentally destroy information through the
panel — only change where it lives and how it's weighted. Edits
are versioned, injections are tagged, demotions still preserve
the compacted form at a lower level.

## vs. Everything Else

| Property | Summarization | Prompt Cache | RAG | DCP |
|----------|---------------|-------------|-----|-----|
| Invertible | No | N/A | No | Semi (structural) |
| Composable | Degrades | No | N/A | Yes (skeletal merges) |
| Addressable | No | By position | By embedding | By content + tag |
| Human in loop | No | No | Retrieval tuning | Full oracle panel |
| Dep-aware | No | No | No | Yes (DAG) |
| Who compacts | Self (biased) | Nobody | Nobody | Shadow clone |

## Implementation Plan

### Phase 1: Async Tool Calls + Marginalia
- Parallel tool execution in agent harness
- Marginalia structure: tool results attached to turns, not inline
- Handle lifecycle tracking (pending → resolved → consumed → evictable)
- Short-term: batch parallel tool calls between turns
- Medium-term: streaming interception with async handles

### Phase 2: Shadow Clone Compaction Loop
- Context pressure monitor in agent harness
- At threshold: branch → task clone → receive skeletal → splice → kill
- Consolidation prompt: decisions, state deltas, deps, open items
- Full invertibility: clone writes verbatim + CoT to external store
- All CoT captured and persisted (agent turns + clone compaction)

### Phase 3: Page Table + Marginalia-Aware Compaction
- Page table with separate tracking for reasoning vs. marginalia
- Compaction priority: tool results first, reasoning last
- Clone produces tags + dep edges during consolidation
- Handle-aware compaction: skeletal references handles, not inline data
- Reroll amortization: batched compaction, sawtooth pressure model

### Phase 4: Native Swift Oracle Panel v1 (PRIMARY UI)
- This is not optional. This is the product.
- Context map: visual rectangles, color-coded residency, pressure
- Chunk detail: skeletal form + full CoT side-by-side, collapsible
- Tool call timeline: real Gantt chart, not ASCII
- Oracle operations: click, drag, keyboard shortcuts
- Agent ↔ Panel protocol: UDS for commands, mmap for page table
- CoT browser: syntax highlighted, searchable, navigable
- Knowledge graph: interactive DAG, pan/zoom, click to inspect
- Swift/SwiftUI + AppKit. Not Electron. Not web. Native.

### Phase 5: Full Page Fault Pipeline
- Fault detection: agent references compacted chunk
- Clone re-derives from skeletal (first resort)
- Full inversion from external store (second resort)
- Snapshot rollback (disaster recovery)
- Promotion tracking: frequently faulted chunks stay hotter

### Phase 6: Oracle Panel v2 + Multi-Agent
- Dependency graph visualization (Metal-rendered DAG)
- Compaction timeline with amortization tracking
- Multi-agent view: context maps for all swarm agents
- Cross-agent oracle injection
- Operator attention tracking as eviction signal
- Bonjour/mDNS discovery for local agents, Vers registry for remote

### Phase 7: Swarm Context Protocol
- Agents share page tables + skeletal forms + handle references
- Cross-agent page faults (agent A faults into agent B's store)
- Compacted context as inter-agent communication primitive
- Shared external store with access control

---

## Fork vs. Plugin Boundary Analysis

What can be built as a plugin/extension on top of an existing
agent harness (like pi), and what requires forking the harness
or changing the model API? This determines build order and risk.

### Plugin-Layer (no harness fork required)

These can be built as extensions, middleware, or external
processes that wrap the existing tool call interface:

**1. External Store + Page Table**
Pure application-layer code. A process that:
- Intercepts tool results before they enter context
- Writes them to a store (file, SQLite, whatever)
- Maintains the page table as a data structure
- Injects skeletal/referential forms into the system prompt or
  a managed context block

No harness changes. The "compaction" is just rewriting the system
prompt between turns with updated skeletal forms. Crude but works.

**2. Shadow Clone Compaction (via Vers)**
Already works today. `vm_branch` + `vers_swarm_task` + receive
output. The clone is a separate agent session, the orchestrator
splices the result. No harness fork — this is orchestration-layer.

**3. Oracle Panel (Swift app)**
Completely external process. Reads the page table + external store.
Sends oracle operations via UDS/HTTP to a small shim that modifies
the managed context block. The harness doesn't know the panel
exists — it just sees updated system prompt content each turn.

**4. CoT Persistence**
If the provider API returns CoT (e.g. Anthropic's extended thinking),
a plugin captures it and writes to the store. No harness change —
just a response interceptor.

**5. Idempotency Classification**
A tool-call wrapper that classifies commands, deduplicates pure
calls, caches results. Sits between the harness and actual tool
execution. Plugin.

**6. Basic Handle Lifecycle**
A wrapper that replaces large tool results with a reference tag
before they enter context. The "handle" is a string like
`[§α: read(foo.rs) → 8,247 tokens, stored]` that the model
sees instead of the file contents. The model can "force" by
issuing a follow-up tool call like `materialize(§α, lines=40-60)`.
This is a tool-call-level shim. Plugin.

**7. Push-Down DSL (basic)**
Expose `handle_query(§α, "grep", "pattern")` as a tool. The
harness runs the query against the stored result, returns the
filtered output. The agent calls this tool instead of materializing
the full result. Plugin — it's just another tool definition.

**8. Minimap in Oracle Panel**
The context map visualization — the horizontal bar of chunks at
different residency levels — is just a UI over the page table data.
Fully external. More on this below.

### Harness-Level Changes (fork or deep integration required)

**9. Marginalia as First-Class Turn Structure**
Currently, tool results are part of the message sequence:
`user → assistant → tool_result → assistant → ...`
Marginalia means: tool results are annotations ON a turn, not
separate messages. This changes the message format. The harness
needs to understand that a turn has a body (reasoning) and
marginalia (tool results, handles). This is a **harness fork**
or a deep extension point.

Workaround without fork: simulate marginalia by appending a
structured block at the end of each assistant turn:
```
[assistant reasoning here]
<!-- marginalia
§α: read(foo.rs) → resolved, 847 tok [handle-only]
§β: bash(cargo test) → resolved, 234 tok [inline: 14 pass 2 fail]
-->
```
Ugly but functional. The model learns to read/write this format.
Plugin-possible with prompt engineering.

**10. Async Tool Calls (true async)**
The model emitting a tool call mid-generation and continuing to
generate — this requires changes to the inference loop. Current
architecture: model generates → hits tool_use stop → harness
executes → result goes back → model resumes. True async means
the model doesn't stop.

This is a **model-level change**, not just a harness change.
No current model supports this natively.

Workaround: **parallel tool batching**. The model emits multiple
tool calls in one turn, the harness executes all in parallel,
returns all results together. This is already supported by most
harnesses and models. You get parallelism without true async.
**Plugin-achievable today.**

Better workaround: **speculative tool pre-execution**. The harness
predicts likely tool calls from the model's partial output
(streaming) and starts executing them before the model finishes
the turn. When the model does emit the tool call, the result
is already ready. Harness-level change, but not a model change.

**11. Materialization Budget Enforcement**
Enforcing a token budget on how much tool result data enters
context per turn. This needs the harness to intercept and
gate tool result injection. Possible as a plugin with a tool
wrapper, but proper enforcement needs harness integration to
prevent the model from just reading files directly.

**12. Streaming Handle Injection**
Injecting handle resolution tokens into the model's generation
stream while it's still generating. Model-level. Long-term.

### "Model-Level" — Actually Just Prompt Engineering and Output Format

The previous framing of "requires provider cooperation" was wrong.
Models do what you tell them to do. If the model isn't producing
marginalia, handle references, or structured output — that's a
prompt problem, not a model capability problem. Every model capable
of function calling already understands structured output. We just
need to tell it the right structure.

**13. Marginalia Support**
Tell the model the turn format includes marginalia. Put it in the
system prompt. The model will emit it. This is not a "native"
capability request — it's a format specification:

```
Your turns have two sections:
BODY: your reasoning and response
MARGINALIA: structured handle references and tool metadata

Always emit both. Example:
<body>Looking at the auth middleware...</body>
<marginalia>
§a: read(src/auth/mid.rs) → request
§b: bash(cargo test auth) → request
</marginalia>
```

Any model that can do XML/JSON tool calls can do this. It's a
prompt, not a feature request.

**14. Async Tool Call Pattern**
The model doesn't need native async. It needs to be told: "emit
all tool calls you anticipate needing at once, then continue
reasoning about what you already know while they execute."

```
Emit tool calls eagerly. Do not wait for results before
reasoning about what you can reason about. Issue all reads
and queries you expect to need, then continue working on
the parts that don't depend on the results.
```

This is behavioral prompting. The harness handles the actual
parallelism. The model just needs to not be artificially
sequential in its tool call pattern.

**15. Handle-Aware Reasoning**
Prompt the model to reference handles instead of expecting inline
data:

```
Tool results are returned as handles, not inline content.
A handle §α represents a resolved result stored externally.
To use a result, query the handle:
  materialize(§α)           -- pull full content
  query_handle(§α, "grep", "pattern")  -- filtered query
Do NOT expect tool results to appear inline in the conversation.
Reference handles and query them as needed.
```

Again: prompt engineering, not model architecture.

## Output Format: Zero Waste Tokens

### The Problem with Prose Output

Models default to prose. Conversational, polite, discursive prose.
Every agent turn is:

```
"Sure! I'd be happy to help you with that. Let me take a look at
the file you mentioned. I'll start by reading the auth middleware
to understand the current implementation, and then I'll run the
test suite to see what's failing. Here's what I found..."
```

That's ~50 tokens of nothing. Multiply by hundreds of turns in a
session. Thousands of wasted tokens in context. Each one attended
over by every subsequent inference call. Each one eating
materialization budget. Each one making compaction harder (the
skeletal form has to sift signal from filler).

Prose is a format for humans reading conversation. Agents aren't
conversing. They're computing. Their output format should reflect
that.

### The Model Is a Stochastic Parrot. Respect That.

Don't ask the model to be an architect. Don't burden it with
structured output formats, intent annotations, explicit dependency
declarations, or handle naming. It will do them badly, inconsistently,
and at the cost of reasoning quality.

The model does three things well:
1. **CoT** — free reasoning, messy, valuable, persisted
2. **Tool calls** — already trained behavior
3. **Prose** — when talking to the user

That's the output. Everything else is the **harness's job**:
- Handle assignment (automatic, on every tool call)
- Dependency inference (from usage patterns, post-hoc)
- Intent extraction (from CoT, post-hoc, cheap classifier)
- Knowledge graph node typing (from behavior classification)

And the **operator's job**:
- Correct the inferred graph (merge, split, fix edges)
- Pin what matters, evict what doesn't
- Read the CoT for real intent (not sanitized annotations)

### Native UX First, Console Second

The oracle panel is not a nice-to-have bolted onto a terminal
tool. **The native Swift GUI is the primary interface.** The
terminal is the fallback.

The entire agent-tooling ecosystem is poisoned by console-first
thinking. Everything is a CLI. Everything is text in a terminal.
The operator's experience is: stare at scrolling text, grep for
what matters, copy-paste between terminal panes, squint at ASCII
art. This is not good UX. This is hazing.

**The operator's primary interface should be:**
- A native macOS app with a real window, real typography, real
  layout
- Visual context map (not ASCII bars — actual rendered rectangles
  with color, hover, click, drag)
- Split-pane CoT browser with syntax highlighting, collapsible
  sections, search (not `less` piped through `grep`)
- Dependency graph with interactive pan/zoom (not ASCII boxes
  with arrows)
- Tool timeline as a real Gantt chart (not text columns)
- Knowledge graph as a navigable visual DAG (not a TOML dump)
- Drag-and-drop for oracle operations (not CLI commands)
- Notifications for context pressure (not polling a status line)

**The console is for:**
- SSH into a remote VM where you can't run a GUI
- Quick one-off queries (like `git status` — fine in terminal)
- Scripting and automation
- Headless agent operation (no human present)

But the DESIGN should be GUI-first, console-adapted. Not
console-first, GUI-bolted-on. The data model, the protocol,
the event stream — all designed for a rich visual client that
happens to have a terminal fallback.

**Implementation:**
- Core harness: **Haskell**. The store, page table, knowledge
  graph, compaction engine, handle lifecycle, chunker, dependency
  inference, eviction scoring — all Haskell. The problem domain
  is algebraic data types, content-addressed DAGs, constraint
  graphs, union-find, semilattices. This is what Haskell is for.
  The harness doesn't need to be fast (model inference is the
  bottleneck). It needs to be correct, composable, and
  refactorable without fear.
- Oracle panel: **Swift** (SwiftUI + AppKit). Native macOS.
  Communicates with the Haskell core over UDS + CBOR. Two
  processes, clean boundary, each in the right language for
  its job.
- Terminal fallback: Haskell TUI (brick) or whatever. Second
  class. Reads the same CBOR event stream the Swift panel reads.

The console-first culture in agent tooling is a failure of
imagination disguised as engineering pragmatism. "Just use the
terminal" is not a UX philosophy. It's an abdication of
responsibility to the operator. The operator deserves a real
tool, designed for their visual cortex, their hands, their
workflow. Not a text dump they have to decode.

### DSML: DeepSeek's Tool Call Framing

Adopt DeepSeek's single-token delimiters for tool call structure.
That's the only model-side format requirement:

```
INSTEAD OF:
  "I'll read the file and check for the issue you mentioned.
   Looking at src/auth/middleware.rs, I can see that the verify
   function has a lifetime problem on line 47. The issue is that
   the Claims reference borrows from the token string which gets
   dropped at the end of the match block. Let me fix this by
   cloning the claims before the borrow ends."

EMIT:
  <｜tool▁call▁begin｜>
    <｜intent｜> verify auth middleware lifetime issue
    <｜expects｜> Claims borrow on token str
    <｜feeds｜> §auth_fix
    <｜handle｜> §mw_read
    function<｜tool▁sep｜>read
    ```json
    {"path": "src/auth/middleware.rs"}
    ```
  <｜tool▁call▁end｜>
  <｜tool▁call▁begin｜>
    <｜intent｜> fix lifetime: clone claims before borrow scope exit
    <｜feeds｜> §auth_fix
    function<｜tool▁sep｜>edit
    ```json
    {"path": "src/auth/middleware.rs",
     "old": "let claims = &token.claims;",
     "new": "let claims = token.claims.clone();"}
    ```
  <｜tool▁call▁end｜>
```

The structured form:
- Tool calls carry intent (WHY), not just action (WHAT)
- Handle assignment is explicit (§mw_read, §auth_fix)
- Dependency edges declared at call time (<｜feeds｜>)
- No prose filler — CoT has the reasoning, output has the actions
- Compaction is trivial: keep intents + handles, drop args to store
- The push-down DSL reads <｜expects｜> to choose projections

### The Output Grammar: Single-Token Delimiters

DeepSeek got this right: structural markup should be **single
special tokens** in the vocabulary, not multi-token XML/JSON.

```
XML approach (wasteful):
  <tool_call>    → 3+ tokens: "<", "tool", "_call", ">"
  </tool_call>   → 4+ tokens: "</", "tool", "_call", ">"
  Total overhead per tool call: 7+ tokens just for delimiters

DeepSeek approach (efficient):
  <｜tool▁call▁begin｜>  → 1 token
  <｜tool▁call▁end｜>    → 1 token
  Total overhead per tool call: 2 tokens for delimiters
```

DCP's output format uses the same principle. Single special
tokens for every structural boundary:

```
Vocabulary additions (each is ONE token):
  <｜act▁begin｜>     <｜act▁end｜>
  <｜find▁begin｜>    <｜find▁end｜>
  <｜decide▁begin｜>  <｜decide▁end｜>
  <｜fix▁begin｜>     <｜fix▁end｜>
  <｜tool▁begin｜>    <｜tool▁end｜>
  <｜ask▁begin｜>     <｜ask▁end｜>
  <｜note▁begin｜>    <｜note▁end｜>
  <｜ref▁begin｜>     <｜ref▁end｜>
  <｜margin▁begin｜>  <｜margin▁end｜>
  <｜handle｜>        <｜cite｜>
```

Grammar:
```
Turn       ::= Block+ Marginalia?
Block      ::= ActBlock | FindBlock | DecideBlock | FixBlock
             | ToolBlock | AskBlock | NoteBlock | RefBlock
ActBlock   ::= <｜act▁begin｜> content <｜act▁end｜>
FindBlock  ::= <｜find▁begin｜> content <｜find▁end｜>
DecideBlock::= <｜decide▁begin｜> content <｜decide▁end｜>
FixBlock   ::= <｜fix▁begin｜> content <｜fix▁end｜>
ToolBlock  ::= <｜tool▁begin｜> tool_call <｜tool▁end｜>
AskBlock   ::= <｜ask▁begin｜> content <｜ask▁end｜>
NoteBlock  ::= <｜note▁begin｜> content <｜note▁end｜>
RefBlock   ::= <｜ref▁begin｜> <｜handle｜> id content <｜ref▁end｜>
Marginalia ::= <｜margin▁begin｜> HandleEntry* <｜margin▁end｜>
```

This is maximally token-efficient:
- 2 tokens per block delimiter (begin + end)
- Content tokens are 100% signal
- The harness can parse structure by matching single tokens,
  not regex over multi-token sequences
- Compaction engine knows block types from the delimiter tokens
  without content parsing
- Rolling hash can bias splits on delimiter tokens trivially

**For models without custom vocabulary** (most current models),
use the DeepSeek `<｜ ｜>` convention with `▁` separators. These
fullwidth unicode delimiters tokenize distinctly from content and
most tokenizers handle them as single or few tokens:

```
Practical (works with existing tokenizers):
  <｜act▁begin｜>     <｜act▁end｜>
  <｜find▁begin｜>    <｜find▁end｜>
  <｜decide▁begin｜>  <｜decide▁end｜>
  <｜fix▁begin｜>     <｜fix▁end｜>
  <｜tool▁begin｜>    <｜tool▁end｜>
  <｜ask▁begin｜>     <｜ask▁end｜>
  <｜note▁begin｜>    <｜note▁end｜>
  <｜ref▁begin｜>     <｜ref▁end｜>
  <｜margin▁begin｜>  <｜margin▁end｜>
  <｜handle｜>        <｜cite｜>
```

The `<｜ ｜>` framing is already in DeepSeek's vocabulary and
is learned by models fine-tuned on DeepSeek data. For other
models, the system prompt defines the convention. The fullwidth
pipe characters make these visually distinct and unlikely to
collide with content. Models pick up the pattern in-context
with a few examples.

The model emits ONLY these blocks. No prose wrapper. No
conversational filler. Each block type tells the harness,
panel, and compaction engine exactly what kind of information
this is.

Benefits for DCP:

**1. Compaction is trivial.** The structured blocks ARE the
skeletal form. `<decide>` blocks are decisions. `<act>` +
`<tool>` blocks are state changes. `<find>` blocks are
observations. Compaction = keep `<decide>` and `<tool>` blocks,
drop `<find>` blocks that led to no action, summarize `<note>`
blocks. The compaction engine doesn't need to parse prose to
extract structure — the structure is the output.

**2. Marginalia map directly to blocks.** Tool calls are
`<tool>` blocks. Handle references are `<ref>` blocks.
The harness knows exactly which parts of the output are
tool-related and which are reasoning, without heuristic
parsing.

**3. The oracle panel renders blocks natively.** Each block
type gets its own visual treatment: decisions are highlighted,
tool calls show handle status, findings are collapsible,
notes are dimmed. The panel isn't parsing text — it's
rendering a typed document.

**4. Token counting is precise per block type.** The harness
knows exactly how many tokens are decisions vs. tool calls vs.
observations. The materialization budget can be per-block-type:
generous for `<decide>`, tight for `<find>`.

**5. Inter-agent communication is structured.** When agents
share compacted context, they share typed blocks. The receiving
agent doesn't parse prose — it reads decisions, state changes,
and open questions as structured data.

### Enforcement

Put it in the system prompt. Hard. Not as a suggestion — as a
format requirement:

```
OUTPUT FORMAT (mandatory):
All output must use structured blocks. No prose, no filler,
no conversational framing. Every token must be inside a typed
block. Blocks:

<act>   what you're doing
<find>  what you observed
<decide> decision + why
<fix>   what you'll change
<tool>  tool_call(...)
<ask>   question
<note>  future context
<ref §h> handle reference

WRONG: "Sure, I'll take a look at that file for you."
RIGHT: <act>read src/auth/middleware.rs</act>

Violating this format wastes tokens that cost money and
fill context. Be dense. Be structured. Every token earns
its place.
```

The oracle panel can flag format violations — turns where the
model emitted prose instead of structured blocks. The operator
sees a waste metric: % of tokens that are structural vs. filler.
Over a session, this is a real cost number.

### CoT Is Exempt

Chain of thought (the `<thinking>` block) is EXEMPT from the
structured format. CoT is where the model thinks freely —
prose, speculation, uncertainty, tangents. This is valuable
and should not be constrained. The structured format applies
to the OUTPUT (what enters context and gets compacted), not
the REASONING (what the model thinks internally).

```
<thinking>
Hmm, the user wants to fix the auth bug. Let me think about
this... the verify function on line 47 has a lifetime issue.
The Claims struct borrows from the token string, but the token
gets dropped at the end of the match block. I could fix this
by cloning, but that's allocation-heavy. Maybe I should use
an owned Claims type instead? Actually, cloning is fine here,
it's a one-time operation per request...
</thinking>

<find>verify(): lifetime error L47
  Claims ref borrows from token str, dropped at match block end</find>
<decide>clone claims before borrow scope exit
  (owned type would be cleaner but scope creep for a bug fix)</decide>
<tool>edit(...)</tool>
```

Free reasoning in CoT, dense structure in output. The CoT is
stored in the external store (full invertibility). The output
is what lives in context and gets compacted. Keep the output
clean.

### Build Order (what's real today)

```
TODAY (plugin + prompting, no fork):
├── External store + page table
├── Shadow clone compaction via Vers
├── CoT persistence (capture + store)
├── Idempotency classification + caching
├── Basic handle references (string tags replacing large results)
├── Push-down DSL as tool calls (handle_query, handle_grep, etc.)
├── Parallel tool batching (multiple tool_use per turn)
├── DSML structured output format (system prompt enforcement)
├── Marginalia via structured blocks in turns (prompt format)
├── Handle-aware reasoning (prompt pattern)
├── Eager parallel tool call emission (behavioral prompt)
└── Oracle panel (Swift, reads store + page table, sends ops)

NEAR-TERM (harness extension / moderate fork):
├── Materialization budget enforcement
├── Speculative tool pre-execution (streaming prediction)
├── Context pressure monitor + auto-compaction trigger
├── Reroll amortization scheduler
├── Format violation detection + waste metrics
└── Block-type-aware compaction (keep <decide>, compress <find>)

LONG-TERM (harness deep integration):
├── True streaming async (handle injection mid-generation)
├── Block-level attention hints (if model supports)
└── Handle-aware KV cache management
```

The critical insight: **~90% of DCP is buildable today as plugins +
prompting.** The "model-level" bucket from before was a cop-out.
Models do what you tell them. Tell them to emit structured blocks,
reference handles, and issue tool calls eagerly. The harness
handles the rest. The remaining 10% is harness optimization —
streaming interception, budget enforcement, attention hints.
That's polish, not prerequisites.

Start with the plugin + prompt layer. It's already better than
anything that exists.

## Minimaps

The oracle panel's context map bar is the primary visualization,
but there are minimap views that should be persistent/ambient — 
always visible, not just when the panel is focused.

### Context Minimap (menu bar)

A macOS menu bar widget showing context pressure at a glance:

```
┌──────────────────────────────────────────┐
│  ░░▓▓▓████████████████░░░░░░  67% │ π   │
└──────────────────────────────────────────┘
```

Each pixel-column is a chunk. Color = residency level.
Width proportional to token count. The operator glances at the
menu bar and sees: how full, how compacted, where the raw
content is, whether compaction is imminent.

Click → drops down a richer minimap:

```
┌────────────────────────────────────────────────┐
│  Context: 67%  (134k / 200k tokens)            │
│                                                │
│  ░░░│▓▓▓▓│▓▓│████│████████│████████████│       │
│  sk₁│sk₂ │s₃│ r₄ │  r₅    │    r₆      │       │
│                                                │
│  Handles: 12 resolved, 3 pending               │
│  Materialized: 4,200 / 8,000 budget            │
│  Last compaction: 8 turns ago                   │
│  Next compaction: ~6 turns (est.)               │
│                                                │
│  ████ raw  ▓▓ skeletal  ░░ referential          │
│                                                │
│  [Open Panel]                                  │
└────────────────────────────────────────────────┘
```

### Turn Minimap (inline in terminal)

For terminal-based agents (pi TUI), a minimap renders alongside
the conversation. Like Vim's minimap or VS Code's scroll minimap,
but for context structure:

```
   ┌─ conversation ──────────────────────┐ ┌─ minimap ─┐
   │ > user: let's fix the auth bug      │ │ ░ sk₁     │
   │                                     │ │ ░ sk₂     │
   │ assistant: I'll look at the         │ │ ▓ sk₃     │
   │ middleware first...                 │ │ █ raw₄    │
   │                                     │ │ █ raw₅    │
   │ > tool: read(src/auth/mid.rs)       │ │ █ RAW₆ ◄  │
   │   § resolved, 847 tok [handle-only] │ │           │
   │                                     │ │ hdl: 12/3 │
   │ assistant: The verify function has  │ │ mat: 52%  │
   │ a lifetime issue on line 47...      │ │ prs: 67%  │
   │                                     │ │           │
   └─────────────────────────────────────┘ └───────────┘
```

The minimap shows:
- Each chunk as a colored block (░ ▓ █)
- Current position indicator (◄)
- Handle counts (resolved/pending)
- Materialization budget usage
- Context pressure

Scrolling the conversation moves the minimap indicator.
The operator always knows where they are in the context
structure and how much room is left.

### Dependency Minimap

A tiny version of the dependency graph, rendered as a
dot-matrix style ASCII DAG in the terminal or as a small
Metal-rendered widget in the panel corner:

```
┌─ deps ──────┐
│ ●─●─●       │
│ │ └─●─●     │
│ └───●─●─◉   │
│       └─●   │
│             │
│ ◉ = current │
│ 9 nodes     │
│ 11 edges    │
└─────────────┘
```

Highlights: red nodes for high-fanout (many dependents),
blue for leaf nodes (safe to evict), pulsing for currently-
accessed chunks.

### Compaction Pressure Minimap

A sparkline showing context pressure over time:

```
pressure: ▁▂▃▄▅▆▅▃▂▃▄▅▆▇▅▃▂▃▄▅▆ 67%
                  ↑         ↑
              compact₁  compact₂
```

The sawtooth pattern is visible. The operator sees the
compaction rhythm — how often it fires, how much it frees,
whether the amortization is working (each sawtooth should
be getting longer if the compaction ratio is improving).

### Handle Resolution Minimap

A live ticker of handle activity:

```
handles: §a✓ §b✓ §c✓ §d⏳ §e✓ §f⏳ §g⏳
         ──────────────────────────────
         resolved: 4  pending: 3  budget: 52%
```

Updates in real-time as tools execute and handles resolve.
The operator sees I/O activity at a glance.

### Minimap Implementation

All minimaps share a common data source: the page table +
handle registry + pressure monitor. The rendering targets:

- **Menu bar widget**: SwiftUI `MenuBarExtra` (macOS 13+).
  Tiny, always visible, click to expand.
- **Terminal minimap**: ANSI escape codes, rendered by the
  pi TUI as a side panel. Needs a TUI extension point in pi
  for custom panel rendering.
- **Panel minimaps**: SwiftUI views in the oracle panel,
  always visible in a sidebar/footer regardless of which
  main view is active.

The minimaps are the ambient awareness layer. The operator
shouldn't have to open the full panel to know the agent's
context health. A glance at the menu bar or terminal minimap
tells them: pressure level, compaction state, handle activity,
and whether intervention is needed.

## Integration: Entity Reasoning (Schonwald)

Carter's `datentity.skill` provides formal structures that DCP
should adopt directly, not reinvent.

### Content-Addressed Knowledge, Not Position-Addressed

Carter's discourse coordinates (`@N.¶M.sK`) are elegant for
static transcripts. But DCP's context is not static:

- **Compaction rewrites the turn sequence.** Turns 1-12 become
  `skeletal₁`. What was `@7` is now inside a compacted block.
  The coordinate is meaningless — the thing at position 7 is
  different after compaction.

- **Oracle injections insert new content.** The operator injects
  after turn 5. Everything after shifts. `@7` now refers to
  something different than it did before the injection.

- **Page faults expand content.** A skeletal block gets promoted
  back to raw. Turn numbering changes again.

- **Multi-agent sharing.** Agent B receives a compacted chunk
  from Agent A. Agent A's `@7` means nothing in Agent B's
  context. The coordinate is session-local.

Position-based addressing is **fragile under mutation**. DCP
contexts mutate constantly. Content addressing is stable.

**Content addressing**:

```
claim_id = H(content || provenance || timestamp)
```

Every claim, every node in the knowledge graph, every edge —
addressed by a hash of its content. The address IS the content
(or rather, a collision-resistant summary of it). Compaction
doesn't change addresses because it doesn't change content —
it changes what's resident in context. The underlying claims
have the same hashes whether they're in-context, skeletal, or
in the store.

```
Instead of:
  DECISION: auth → JWT (@7.¶2 "switching to JWT")

Use:
  DECISION: auth → JWT (claim:a7f3e2 "switching to JWT")
    where a7f3e2 = H("switching to JWT" || turn_context || ts)
```

Properties:

1. **Stable under compaction.** `claim:a7f3e2` refers to the same
   claim whether it's in raw turn 7, skeletal block 2, or the
   external store. Compaction moves claims between residency
   levels without changing their identity.

2. **Stable under insertion.** Oracle injects new content. Existing
   claim hashes don't change. No coordinate shifting.

3. **Stable under reordering.** Compaction may merge chunks in a
   different order. Doesn't matter — claims are addressed by
   content, not position.

4. **Globally unique.** Agent A's `claim:a7f3e2` means the same
   thing in Agent B's context. Cross-agent references just work.
   No session-local coordinate translation needed.

5. **Self-verifying.** Given the stored content, you can recompute
   the hash and verify the claim hasn't been tampered with.
   Integrity without a separate Merkle chain.

6. **Deduplication for free.** Two agents independently observe
   the same fact → same content → same hash → same claim.
   Knowledge graph merges deduplicate automatically.

### Multiple Citation Modes: Audience and Persistence

Content addressing is the stable identity layer. But it's not the
only way to cite, and it shouldn't be. Different citations serve
different audiences and different persistence requirements.

**Who's the citation for?**

```
For the machine (persistence, dedup, cross-agent):
  claim:a7f3e2
  Content hash. Globally stable. Meaningless to a human.

For the operator (oracle panel, audit):
  @7.¶2 "switching to JWT"
  Discourse coordinate + excerpt. Ephemeral (breaks under
  compaction) but immediately legible. The operator can SEE
  where in the conversation this came from.

For the agent (in-context reasoning):
  AUTH_DECISION.reason
  Semantic path through the knowledge graph. The agent doesn't
  care about hashes or turn numbers — it cares about "the reason
  we chose JWT." Stable as long as the graph node exists.

For another agent (cross-session sharing):
  (session:42, claim:a7f3e2, "switching to JWT")
  Session-scoped content address + excerpt for quick read.

For a human reader (reports, docs):
  "In the auth discussion, the team decided on JWT because
  sessions weren't scaling (see conversation turn 7)."
  Prose with loose positional hint. Not machine-resolvable.
  Doesn't need to be.
```

These aren't competing — they're **views over the same
underlying reference**. The knowledge graph node has one
stable identity (content hash). The citation mode is chosen
by who's reading and what persistence guarantees they need.

**Persistence spectrum:**

```
Content hash    ████████████████████████  permanent, survives everything
Semantic path   ██████████████████░░░░░░  stable until graph restructure
Session + hash  ████████████████░░░░░░░░  stable within session lineage
Discourse coord ████████░░░░░░░░░░░░░░░░  breaks on compaction/injection
Prose hint      ██░░░░░░░░░░░░░░░░░░░░░░  approximate, human-only
```

**DCP stores content hashes as the canonical identity.** Everything
else is derived on demand for the audience that needs it:

- The page table uses content hashes (persistence, dedup)
- The oracle panel renders discourse coords + excerpts (legibility)
- The agent's in-context skeletal form uses semantic paths (reasoning)
- Cross-agent messages include hash + excerpt (precision + readability)
- Reports for humans use prose with loose hints (communication)

```
KnowledgeNode = {
  id          : ContentHash,             -- canonical, permanent
  content     : string,
  provenance  : Provenance,
  attributes  : Map<Key, Value>,
}

-- Citation is a rendering function, not a storage format:
cite(node, audience) → {
  machine  → node.id,
  operator → (session_loc(node), excerpt(node, 40)),
  agent    → semantic_path(node, graph),
  peer     → (session_id, node.id, excerpt(node, 40)),
  human    → prose_reference(node, context),
}
```

The key insight: **citation mode is a presentation concern, not
a data model concern.** The knowledge graph doesn't change based
on who's looking at it. But the way you point at a node in that
graph depends entirely on who you're pointing for and how long
that pointer needs to last.

Discourse coordinates aren't wrong — they're wrong as the
*storage layer*. As a display layer for the operator, they're
exactly right. `@7.¶2` is instantly legible in a way that
`claim:a7f3e2` never will be. The panel should show both:
the human-readable coordinate AND the stable hash. Click the
coordinate → navigate to position. Click the hash → verify
in store.

```
PageEntry = {
  id          : ContentHash,           -- canonical identity
  claims      : Set<ContentHash>,      -- claims in this chunk
  level       : skeletal,
  tags        : {auth, jwt},
  ...
}

KnowledgeEdge = {
  from        : ContentHash,
  to          : ContentHash,
  relation    : RelationType,
  provenance  : Provenance,
}
```

The knowledge graph is a content-addressed DAG. Every node and
edge has a stable identity regardless of where it lives in any
agent's context. Compaction, injection, reordering, cross-agent
sharing — all work because nothing depends on position. But
every node can be CITED in whatever mode the audience needs —
hashes for machines, coordinates for operators, semantic paths
for agents, prose for humans.

### Rolling Hash Segments

Fixed turn boundaries are the wrong chunking unit. A turn can
be 3 tokens or 3,000. Two turns might be one logical unit. Half
a turn might be two topics. Turn boundaries are accidents of
the conversation protocol, not semantic boundaries.

**Content-defined chunking via rolling hash** (Rabin fingerprint,
Buzhash, or similar) finds natural boundaries based on content:

```
Rolling hash over token stream:
  H(window) mod M == 0 → chunk boundary

  M controls average chunk size:
    M = 2^8  → ~256 token chunks (fine-grained)
    M = 2^10 → ~1024 token chunks (medium)
    M = 2^12 → ~4096 token chunks (coarse)
```

Why this matters for DCP:

**1. Edit stability.** If the oracle injects 50 tokens into the
middle of the context, fixed chunking reshuffles every chunk
boundary after the insertion. Rolling hash: only the chunk
containing the insertion point rehashes. Everything before and
after keeps its hash. References are stable.

```
Fixed chunking (every 500 tokens):
  [chunk1: tok 0-499] [chunk2: tok 500-999] [chunk3: tok 1000-1499]
  Insert 50 tokens at position 300:
  [chunk1: tok 0-499*] [chunk2: tok 500-999*] [chunk3: tok 1000-1499*]
  ALL chunks change. ALL hashes change. ALL references break.

Rolling hash:
  [chunk_a: ...boundary...] [chunk_b: ...boundary...] [chunk_c: ...]
  Insert 50 tokens inside chunk_a:
  [chunk_a': ...boundary...] [chunk_b: ...boundary...] [chunk_c: ...]
  Only chunk_a rehashes. chunk_b, chunk_c unchanged.
```

**2. Natural semantic boundaries.** Rolling hashes tend to
split on content-similar patterns. With the right window and
hash function, boundaries cluster at topic transitions, tool
call boundaries, and structural breaks in the output — because
these tend to have distinctive token patterns that trigger the
hash boundary.

**3. Dedup across sessions and agents.** System prompts, common
tool patterns, repeated instructions — content-defined chunks
with the same content get the same hash. Two agents with
overlapping context share chunks automatically. The store
deduplicates.

**4. Variable-size chunks match variable-density content.** A
dense `<decide>` block might be 200 tokens but high-value. A
verbose tool output might be 5,000 tokens but low-value. Fixed
chunking treats them identically. Rolling hash lets the content
determine its own boundaries, which can be biased toward DSML
block boundaries:

```
Boundary bias: prefer splitting at block boundaries
  <act>...</act>|  ← prefer boundary here
  <find>...</find>| ← prefer boundary here
  
  Rolling hash with block-tag boost:
    if token ∈ {</act>, </find>, </decide>, ...}:
      hash_threshold *= 0.25  -- much more likely to split here
```

This gives you content-defined chunks that respect the DSML
structure — chunks tend to align with semantic blocks.

**5. Hierarchical chunking.** Run the rolling hash at multiple
granularities simultaneously:

```
Fine:   M = 2^8   → ~256 tok chunks (for handle projections, grep)
Medium: M = 2^10  → ~1024 tok chunks (for skeletal compaction)
Coarse: M = 2^12  → ~4096 tok chunks (for page table entries)
```

Each level is a refinement of the one above. A coarse chunk
contains several medium chunks, each containing several fine
chunks. The page table indexes at the coarse level. Handle
projections (grep, slice) operate at the fine level. Compaction
targets the medium level. All three share the rolling hash
infrastructure.

```
Coarse: [================|================|================]
Medium: [====|====|=====|====|=====|====|=====|====|======]
Fine:   [==|==|==|==|===|==|==|===|==|==|===|==|==|==|===]
```

**Implementation**: Rabin fingerprint with polynomial in GF(2^64).
Fast, streaming, well-understood. The DSML block-boundary bias
is a multiplicative modifier on the split threshold. Chunk size
bounds (min 64 tokens, max 8192 tokens) prevent degenerate splits.

### Mentions vs Handles → Raw References vs Compacted References

Carter distinguishes:
- **Mentions**: a referring expression at a specific location (concrete, grounded)
- **Handles**: equivalence classes of mentions that co-refer (derived, summary)

DCP has the same structure:
- **Raw references**: specific content in the store, content-addressed
- **Compacted references**: the skeletal form's summary, citing content hashes

A compacted reference is a *handle* over the *mentions* in the original
turns. The page table tracks which mentions a handle covers:

```
handle: AUTH_DECISION = {
  claim:a7f3e2 ("switching to JWT"),
  claim:b2c4d1 ("PASETO rejected"),
  claim:e8f1a3 ("implementing JWT middleware"),
  claim:d4e9c7 (tool: edit middleware.rs)
}
```

The handle is the compacted view. The mentions are the content-addressed
originals in the store. Full invertibility means: given the handle,
retrieve the mentions by hash from the store — they're there regardless
of what's happened to the context since compaction.

### Closed Module Evidence → CoT as Closed Module

Carter's evidence model: a source is a closed module. You can cite
its claims. You cannot fabricate claims it didn't make.

Apply this to compaction:

```
module Chunk_abc123 : sig
  val claim_a7f3e2 : "switching to JWT because sessions don't scale"
  val claim_b2c4d1 : "PASETO library is immature"
  (* closed — no other exports *)
end
```

The skeletal form can cite `claim:a7f3e2` and `claim:b2c4d1`.
It CANNOT add `claim:????: "also considered OAuth"` if no such
content-addressed claim exists in the store. The compaction is a
closed citation of the original — not a generative summary that
might hallucinate claims.

This is enforceable: the shadow clone producing the compaction
has the original turns in context. The output format requires
content-addressed citations for every claim in the skeletal
form. Any claim without a resolvable hash is flagged as
potentially fabricated.

The oracle panel can verify: click any claim in the skeletal
form → resolves the content hash from the store → operator
confirms the citation is accurate. Compaction audit that works
regardless of how many compaction/injection/reorder cycles
have happened since the original content was produced.

### Constraint Graph → Dependency Graph

Carter's constraint graph has:
- `must-link(m₁, m₂)` — co-reference
- `cannot-link(m₁, m₂)` — distinctness
- underdetermined — default

DCP's dependency graph needs the same rigor:
- `depends-on(chunk_a, chunk_b)` — a references content from b
- `independent(chunk_a, chunk_b)` — no relation (safe to evict independently)
- underdetermined — haven't analyzed yet

And Carter's defeasibility applies: dependencies can be retracted,
but with audit trail and downstream recomputation. If the shadow
clone incorrectly identifies a dependency, the oracle can retract
it — but the panel shows what downstream compaction decisions
were based on that dependency.

### Knowledge Is a Citation Graph, Not a Token Sequence

The fundamental representation error in all current context
management: knowledge is stored as text. A sequence of tokens.
A flat string that happens to contain facts.

Knowledge is a **graph of citations and attributes**:

```
Node: entity or claim
Edge: citation, attribution, derivation, dependency
Attributes: properties on nodes, each with provenance
```

A skeletal compaction isn't a shorter text. It's a **subgraph** —
the decision-relevant portion of the knowledge graph, with edges
intact, provenance preserved, and the full graph in the store.

```
The knowledge graph for a chunk:

  JWT_Decision ──decides──► AuthSystem
      │                        │
      ├──reason──► SessionBottleneck (@5.¶1.s3)
      ├──rejects─► PASETO (reason: "library immature" @7.¶3)
      ├──constraint──► TokenRefresh
      ├──constraint──► MaxExpiry(15min)
      │
      ├──changes──► middleware.rs::session_check → jwt_verify
      ├──changes──► login.rs::+issue_jwt, +refresh_token
      ├──introduces──► Dep(jsonwebtoken, "9.2")
      │
      └──defers──► TokenRevocation
                   └──defers──► RefreshRotation
```

This graph IS the compacted knowledge. Not a text summary of it.
The skeletal form is a **serialization** of this graph for
in-context use. The graph itself lives in the store and is
queryable.

### Stability Under Identity Corrections

Here's why the graph representation matters critically: **identity
corrections don't cascade destructively.**

In a flat text compaction:
```
"We decided to use JWT because PASETO (by Alice's team) was
immature. Bob implemented the middleware change."
```

Now you learn: it wasn't Alice's team, it was Carol's team. And
Bob didn't implement it, Denise did. In a text representation,
you have to find-and-replace through the prose, hoping you catch
every reference, hoping the replacements are grammatically correct,
hoping you don't break coreferences. Every correction is a string
surgery with collateral damage risk.

In the citation graph:
```
PASETO_Rejection
  ├──attributed_to──► Alice_Team  ← WRONG
  └──attributed_to──► Carol_Team  ← CORRECTED

Middleware_Change
  ├──implemented_by──► Bob  ← WRONG
  └──implemented_by──► Denise  ← CORRECTED
```

The correction is a **local edge update**. Nothing else changes.
The decision structure, the dependency graph, the constraints,
the state changes — all stable. The identity correction touches
exactly the edges that were wrong and nothing else.

This is Carter's entity reasoning applied to compaction: entities
are handles (equivalence classes of mentions), and correcting an
identity is updating which mentions belong to which handle. The
constraint graph absorbs the correction without cascading.

**Stability properties:**

```
1. Attribute correction: change a property on a node.
   Graph impact: local (one node, one attribute).
   Text impact: grep-and-pray across all mentions.

2. Identity merge: two handles are actually the same entity.
   Graph impact: merge nodes, union edges.
   Constraint graph: add must-link, check for conflicts.
   Text impact: rewrite every mention of both names.

3. Identity split: one handle was actually two entities.
   Graph impact: split node, partition edges.
   Constraint graph: add cannot-link, check for conflicts.
   Text impact: figure out which mentions go to which
   entity, rewrite with disambiguation. Nightmare.

4. Provenance correction: a citation was wrong.
   Graph impact: update edge source.
   Text impact: find the claim, find the citation,
   rewrite, hope the correction doesn't change meaning.

5. Dependency correction: A doesn't actually depend on B.
   Graph impact: remove edge.
   Eviction impact: B may now be evictable (lower fanout).
   Text impact: find every reference to the dependency,
   rewrite surrounding context. May change narrative flow.
```

In every case, the graph correction is local and the text
correction is global. This is why knowledge must be a graph:
**corrections are the normal case, not the exception.** Agents
make mistakes. The oracle corrects them. Other agents provide
conflicting information. New evidence contradicts old claims.

A knowledge representation that isn't stable under correction
is a knowledge representation that degrades every time you
learn something new. Text degrades. Graphs absorb.

### The Oracle Panel Operates on the Graph

When the operator edits a compacted chunk in the oracle panel,
they're not editing text. They're editing the knowledge graph:

- **Edit an attribute**: click a property, change the value.
  Graph update. All serializations (skeletal forms) that
  reference this attribute update automatically.

- **Merge entities**: drag one handle onto another. The panel
  runs Carter's constraint check — any cannot-links? If clean,
  merge. All references update. If conflict, the panel shows
  the conflicting constraints and asks the operator to resolve.

- **Split an entity**: the operator says "this was actually two
  different people." The panel creates two handles, shows all
  mentions, and asks the operator to partition them. Constraint
  graph updated. Skeletal forms re-serialized.

- **Correct provenance**: the operator says "this claim didn't
  come from turn 7, it came from turn 12." Edge update.
  Citation coordinates updated.

The panel is a **graph editor** that happens to render as
text when the agent needs to consume it. The agent sees
serialized skeletal forms. The operator sees (and edits)
the graph.

### Graph-Aware Compaction

The shadow clone doesn't produce text summaries. It produces
**graph deltas**:

```
Shadow clone output:
  ADD_NODE: JWT_Decision (type: decision, hash: c3f2a1)
  ADD_EDGE: JWT_Decision --reason--> SessionBottleneck
  ADD_EDGE: JWT_Decision --rejects--> PASETO
  ADD_ATTR: PASETO.rejection_reason = "library immature"
  ADD_ATTR: PASETO.rejection_confidence = 0.6
  ADD_EDGE: JWT_Decision --changes--> middleware.rs
  ...
```

The skeletal form in context is a serialization of these nodes
and edges. The graph itself is in the store. Compaction at
higher levels (skeletal → referential → evicted) removes nodes
and edges from the in-context serialization but they always
exist in the stored graph.

Composition of compactions is graph union:
```
compact(chunk_a) ∪ compact(chunk_b) = merged graph
```

Graph union is well-defined, handles conflicts via constraint
checking, and produces a coherent result. Text concatenation
of two summaries is... two paragraphs next to each other.

### Underdetermined as First-Class

Carter insists: "underdetermined" is a genuine epistemic state,
not failure. DCP should adopt this for compaction fidelity:

```
Compaction fidelity per claim:
  grounded    — cited with discourse coordinate, verifiable
  inferred    — derived from context but not directly cited
  undetermined — clone wasn't confident about this claim's accuracy
```

The skeletal form marks each claim's fidelity. The oracle panel
renders undetermined claims differently (dimmed? dashed border?).
The operator knows which parts of the compaction to trust and
which to audit.

### Sort Disjointness → Block Type Disjointness

Carter's sort disjointness prevents category errors (knife maker ≠
finish technique). DCP's DSML block types should have disjointness:

```
disjoint(<decide>, <find>)   — a decision is not an observation
disjoint(<tool>, <note>)     — a tool call is not a note
disjoint(<act>, <ask>)       — an action is not a question
```

This prevents compaction from collapsing a `<decide>` into a
`<find>` or vice versa. Structural types are preserved through
compaction. The skeletal form's decisions are always decisions,
never downgraded to observations.

## Wire Format: CBOR + Pseudo-TOML

### Principle: Legible, Not Huge

DCP's non-bulk data (page table entries, handle metadata, oracle
operations, clone tasks, graph deltas) is small and frequent.
The wire format must be:

- **Legible**: an operator tailing the UDS should be able to read
  what's happening without a decoder ring
- **Compact enough**: not wasteful, but this isn't bulk transfer.
  Page table entries are ~200 bytes. Oracle ops are ~100 bytes.
  The difference between JSON and a binary format here is nothing.
- **Not JSON**: JSON is verbose AND illegible at the same time
  (escape hell, no comments, no types). Worst of both worlds.

### CBOR for Machine-to-Machine

CBOR (RFC 8949) for structured data between processes:
agent ↔ store, agent ↔ clone, store ↔ panel internals.

```
Why CBOR:
  - Self-describing (schema-optional, unlike protobuf)
  - Binary but with a diagnostic notation that's human-readable
  - Native support for: bytes, tags, indefinite-length, maps
  - Content hashes are raw bytes, not hex-encoded strings
  - Handles are tagged values: tag(37, h'a7f3e2...')
  - Tiny library footprint (Swift: SwiftCBOR, Node: cbor-x)
  - No code generation step (unlike protobuf/capnproto)

Why NOT protobuf:
  - Schema compilation step = build friction
  - Not self-describing (need .proto to decode)
  - Overkill for messages this small
  - Illegible on the wire without tooling

Why NOT capnproto:
  - Zero-copy is nice but irrelevant for 200-byte messages
  - Schema compilation
  - Smaller ecosystem
```

CBOR diagnostic notation IS the debug format:

```
{
  "op": "pin",
  "chunk": h'a7f3e2b1',
  "reason": "compliance-relevant",
  "ts": 1(1740000000)
}
```

`cbor2diag` on the UDS stream and you can read it.

### TOML for Human-Facing Config + Display

Anything the operator reads, writes, or configures is TOML.
Page table display in the panel. Config files. Oracle injection
templates. Clone task specs.

```toml
[chunk.a7f3e2b1]
level = "skeletal"
span = "turns 13-24"
tags = ["auth", "jwt", "migration"]
tokens_raw = 4200
tokens_now = 410
pinned = true
pin_reason = "compliance-relevant"

[chunk.a7f3e2b1.deps]
depends_on = ["b2c4d1f8"]
depended_by = ["e8f1a390", "d4e9c7a2"]

[chunk.a7f3e2b1.handle.α]
source = "read(src/auth/middleware.rs)"
status = "consumed"
materialized = 120  # tokens pulled into context
total = 847
```

Content hashes are hex strings in TOML (human-readable),
raw bytes in CBOR (machine-efficient). The TOML ↔ CBOR
boundary is the display layer: panel reads CBOR from the
agent, renders as TOML for the operator, parses TOML edits
back to CBOR for the agent. One canonical data model (CBOR),
one human presentation (TOML).

### Bulk Data Is Separate

The external store (verbatim turns, CoT, full tool results)
is bulk data. This is NOT on the wire — it's in files or
memory-mapped storage. Content-addressed blobs:

```
store/
  a7f3e2b1.raw    # verbatim turns, raw bytes
  a7f3e2b1.cot    # chain of thought, raw bytes
  a7f3e2b1.skel   # skeletal form, CBOR
  a7f3e2b1.meta   # metadata, CBOR
```

Or a single append-only file with a CBOR index. Either way:
blobs addressed by content hash, no wire format overhead.
`mmap` for reads, append for writes.

### Protocol Summary

```
┌────────────────────────┬──────────────┬─────────────┐
│ Channel                │ Format       │ Why         │
├────────────────────────┼──────────────┼─────────────┤
│ Harness internals      │ Haskell ADTs │ typed, pure │
│ Harness ↔ Store        │ Haskell IO   │ in-process  │
│ Harness ↔ Clone        │ CBOR         │ structured  │
│ Harness ↔ Panel (cmds) │ CBOR on UDS  │ typed ops   │
│ Harness ↔ Panel (state)│ CBOR on UDS  │ queryable   │
│ Panel ↔ Operator       │ native Swift │ UI          │
│ Config files           │ TOML         │ editable    │
│ Bulk storage           │ raw blobs    │ mmap        │
│ Bulk storage index     │ CBOR         │ queryable   │
│ Debug / tailing        │ CBOR diag    │ readable    │
│ In-context (model)     │ <｜ ｜> DSML  │ token-tight │
│ Cross-agent sharing    │ CBOR         │ portable    │
└────────────────────────┴──────────────┴─────────────┘
```

## The Punchline

The context window is a TLB. The skeletal compaction is the page
table entry — structured enough to be semi-invertible, compact
enough to fit. The shadow clone is the MMU — it does the translation
with full knowledge because it IS the agent. Snapshots are disk —
the last resort, not the operating mode.

The oracle panel makes the human a runtime participant in context
management. Not just a prompt author — a **context editor** with
the power to pin, edit, inject, and shape what the agent remembers.
The agent is inside the box. The operator has the box open on their
desk with a screwdriver.

*You don't need a better summarizer. You need `fork()`, a
representation worth forking for, a human with a panel, and an
agent that doesn't stop thinking while it waits for `ls`.*

Every claim in a compaction cites its discourse coordinate.
Every coordinate resolves to stored ground truth. Every handle
traces to its mentions. No fabrication. No ungrounded summaries.
No lossy prose. Structure in, structure through, structure out.
