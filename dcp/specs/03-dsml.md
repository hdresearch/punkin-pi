# 03: DSML — Tool Call Markup

## What DeepSeek Did Right

Single special tokens for tool call structure. Each delimiter
is one token, not multi-token XML/JSON. This is just good
engineering — less framing overhead, cleaner parsing.

```
<｜tool▁calls▁begin｜>
<｜tool▁call▁begin｜>
<｜tool▁sep｜>
<｜tool▁call▁end｜>
<｜tool▁calls▁end｜>
<｜tool▁outputs▁begin｜>
<｜tool▁output▁begin｜>
<｜tool▁output▁end｜>
<｜tool▁outputs▁end｜>
```

Token savings: ~5-8 structural tokens per tool call vs. ~15-30
for JSON/XML framing. Over a session, thousands of tokens saved.

## DCP's Relationship to DSML

Adopt the DeepSeek `<｜ ｜>` delimiter convention for tool call
structure. That's it for the model's output. Don't burden the
model with more structured output requirements.

### What the Model Does

The model does what models do:
- Reasons in CoT (free, messy, valuable)
- Emits tool calls (already trained behavior)
- Writes prose responses when talking to the user

That's it. Don't ask the model to:
- ~~Annotate every tool call with intent metadata~~
- ~~Assign handle names at call time~~
- ~~Declare dependency edges explicitly~~
- ~~Emit typed output blocks~~
- ~~Avoid prose~~

These were all asking the parrot to be an architect. The parrot
is good at reasoning and tool use. Let it do that. The harness
does the rest.

### What the Harness Does

The harness is deterministic. It's code. It can be precise where
the model can't:

**Handle assignment**: the harness assigns handles to tool calls
automatically. The model calls `read("foo.rs")`, the harness
assigns `§h7`. No model participation needed.

**Dependency inference**: the harness watches which tool results
the model references in subsequent reasoning. If the model reads
`§h7`'s content and then makes a decision, the harness infers
the edge. No explicit `<｜feeds｜>` declaration needed.

**Intent extraction**: the harness reads the CoT (which is
persisted and readable). The model's thinking before a tool call
IS the intent. The harness or a cheap classifier extracts:
"the model was thinking about lifetime issues when it called read."
Post-hoc, not in-band.

**Projection inference**: if the model's CoT says "I need to check
line 47" and then calls `read("foo.rs")`, the harness can infer
the projection. Or the harness just returns the full result and
lets the model ignore what it doesn't need. The materialization
budget handles the rest.

**Block typing**: the knowledge graph nodes get typed by the
harness analyzing what the model DID, not what the model
DECLARED. The model made a decision → harness detects it from
CoT + action pattern → creates a decision node in the graph.
Post-hoc classification, not in-band annotation.

### What the Operator Does

The operator is the intelligence. The oracle panel gives them:

- **Readable CoT**: see what the model was thinking. This IS
  the intent metadata — it's just not structured, it's the
  model's actual reasoning. More honest than any structured
  annotation the model could produce.

- **Handle browser**: see all tool calls, results, handle
  assignments. Assigned by the harness, browseable by the
  operator.

- **Graph editor**: the harness builds a draft knowledge graph
  from CoT analysis + tool call patterns. The operator corrects
  it. Merges nodes, splits entities, fixes edges. The graph
  converges on truth through human correction, not through
  model discipline.

- **Pin/edit/inject**: the operator shapes what matters.
  They don't need the model to declare `<｜feeds｜>` — they
  can see the dependency themselves and pin accordingly.

## The Actual Output Format

```
Model output:
  [CoT: free reasoning, persisted to store]
  [Tool calls: DeepSeek DSML framing, standard]
  [Prose: when talking to user, natural language]

Harness adds:
  - Handle IDs on tool calls (automatic)
  - Handle status tracking (lifecycle)
  - CoT extraction for intent (post-hoc)
  - Dependency edges (inferred from usage patterns)
  - Block/node typing (classified from behavior)

Oracle panel shows:
  - Context map with handles + pressure
  - CoT browser (the real intent, unstructured but readable)
  - Knowledge graph (harness-built, operator-corrected)
  - Tool timeline (Gantt chart, utilization)

Compaction engine uses:
  - Handle lifecycle (consumed → evictable)
  - Inferred dependencies (don't evict what's depended on)
  - Operator signals (pins, edits, attention)
  - CoT analysis (what was this about → tag for the graph)
```

## Why This Is Better

**Low pain for the model.** The model doesn't learn anything new.
It does CoT + tool calls, which it already knows. The harness
and operator do the structuring.

**Tolerant of messiness.** The model will be inconsistent, verbose,
imprecise. That's fine. The harness does post-hoc analysis. The
operator corrects. The graph converges. No fragile structured
output contract to violate.

**Human-centric.** The operator reads CoT (real reasoning, not
sanitized annotations). The operator sees the graph (inferred,
correctable). The operator has the power tools (pin, edit, inject).
The system serves the human, not the other way around.

**Degradation is graceful.** If CoT extraction misclassifies
intent → operator corrects in the panel. If dependency inference
misses an edge → operator adds it. If handle lifecycle gets
confused → operator pins what matters. Every failure mode has
a human recovery path.

## The One Model-Side Ask

One thing IS worth asking the model to do, because it's low-cost
and high-value:

**Don't be chatty.** System prompt:
```
Be concise. No filler. No "Sure!", "I'd be happy to", "Let me".
State what you're doing and do it.
```

That's it. Not structured output. Not typed blocks. Not intent
annotations. Just: shut up and work. The model can do this with
a one-line system prompt instruction. Saves 20-40 tokens/turn
in filler. No new format to learn.

## Open Questions

1. **CoT intent extraction quality.** How good is a cheap
   classifier at extracting intent from free-form CoT? Is it
   good enough for compaction decisions? Or does the operator
   need to manually tag intent most of the time?

2. **Dependency inference accuracy.** Watching which tool results
   the model references is heuristic. How many false edges? How
   many missed edges? Is the operator correction load acceptable?

3. **When does model-side structure pay off?** There may be a
   point where a fine-tuned model that DOES emit intent metadata
   is worth the training cost. But that's an optimization on a
   working system, not a prerequisite. Build the harness-centric
   version first. Measure. Then decide if model-side structure
   helps.
