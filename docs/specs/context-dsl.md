# Context Manipulation DSL

**Author:** Carter Schonwald  
**Date:** 2026-02-24  
**Status:** Speculative / foundational framing  
**Vibes:** Information-theoretic adequacy, versioned operations, invertible contractions

## Core Insight

The history of context manipulations is a DSL program. The current context state is the result of evaluating that program. History isn't a log - it's source code.

```
ctx = empty
  |> inject(system_prompt)
  |> inject(user_0)
  |> inject(assistant_0)  
  |> inject(user_1)
  |> inject(assistant_1)
  |> contract(0..3, skeletal_0, store_ref_0)
  |> inject(user_2)
  |> branch("hypothetical_0")
  |> ...
```

## Operations (The DSL)

```typescript
type CtxOp =
  | { tag: "Inject"; content: Content }
  | { tag: "Contract"; range: Range; skeletal: Content; storeRef: StoreRef }
  | { tag: "Expand"; storeRef: StoreRef; at: Position }
  | { tag: "Branch"; name: string }
  | { tag: "Merge"; from: BranchId; strategy: MergeStrategy }
  | { tag: "Splice"; content: Content; at: Position }
  | { tag: "Evict"; handle: HandleId }
  | { tag: "Materialize"; handle: HandleId; budget?: number }
```

### Inject
Add content to context. The bread and butter.

### Contract
Replace a range with skeletal form. Full content goes to store. **Invertible** - the storeRef lets you expand back.

```
contract : Range → Skeletal → StoreRef → CtxOp

-- Invariant: expand(storeRef) ≃ original range (by adequacy)
```

### Expand
Inverse of contract. Pull content from store back into context. For when skeletal form isn't adequate for current task.

```
expand : StoreRef → Position → CtxOp

-- expand ∘ contract ≃ id (up to adequacy)
-- contract ∘ expand = id (strict, just residency change)
```

### Branch
Fork the program. Creates new version line. Clone gets copy of context at branch point.

### Merge  
Join a branch back. Strategies:
- `TakeTheirs` - clone's final state replaces range
- `TakeOurs` - discard clone's changes
- `Splice` - insert clone's output at position
- `Conflict` - manual resolution

### Splice
Insert content at position. Used for merging clone output, injecting oracle edits, etc.

### Evict
Remove handle from active context, keep in store. Content accessible via handle operations but not in hot context.

### Materialize
Opposite of evict. Pull handle content into context, subject to budget.

---

## Version Graph

States are nodes. Operations are edges.

```
        s₀
        │
        │ inject(system)
        ▼
        s₁
        │
        │ inject(user_0)
        ▼
        s₂
        │
        │ inject(assistant_0)
        ▼
        s₃
       ╱│╲
      ╱ │ ╲
     ╱  │  ╲ branch("hyp")
    │   │   ╲
    │   │    s₃'
    │   │     │
    │   │     │ inject(speculative_edit)
    │   │     ▼
    │   │    s₃''
    │   │   ╱
    │   │  ╱ merge(splice)
    │   ▼ ╱
    │   s₄
    │   │
    │   │ contract(0..2, skel, ref)
    │   ▼
    │   s₅  ←── smaller, but s₅ ≃ s₄ (adequate)
    │
    └── expand(ref) → back to s₄ equivalent
```

Properties:
- **Append-only** at the log level (operations are recorded)
- **Branching** via Branch operation
- **Convergent** via Merge
- **Invertible contractions** via Expand

---

## Adequacy (The Equivalence)

Two programs are equivalent if they're **adequate for the same tasks**.

```
p₁ ≃ p₂  iff  ∀ task ∈ TaskSpace: adequate(eval(p₁), task) ↔ adequate(eval(p₂), task)
```

Adequacy is information-theoretic:
- Mutual information with task preserved
- Not all information - *relevant* information
- Like sufficient statistics for inference

### Contraction Adequacy

A contraction is adequate if:
```
I(skeletal; future_tasks) ≈ I(original; future_tasks)
```

The skeletal form preserves what matters for reasoning. The full content is in store if we're wrong.

### Task-Relative

Adequacy can be task-relative:
- Adequate for "continue conversation" ≠ adequate for "debug turn 5"
- Some contractions adequate for some tasks, not others
- Expansion is the escape hatch when contraction wasn't adequate

---

## Invertibility

**Key invariant: Contractions are always invertible.**

```
contract(range, skeletal, storeRef)
  -- range content → store at storeRef
  -- skeletal form → context
  -- NOTHING LOST

expand(storeRef, position)
  -- store content → context at position
  -- full fidelity restored
```

This isn't lossy compression. It's residency management. The information exists - the question is where it lives (hot context vs cold store).

The "homotopy" is:
```
ctx ──contract──▶ ctx' ──expand──▶ ctx'' 

ctx'' ≃ ctx  (information equivalent, maybe not identical positioning)
```

---

## Relation to Existing Pieces

| Current | In DSL Model |
|---------|--------------|
| Session append | `inject` operations |
| Compaction | `contract` operation |
| Handle summary | Result of `contract` on tool output |
| Handle tools | Operations for observing evicted content |
| Branch/fork | `branch` operation |
| Clone merge | `merge` operation |
| Store (blobs) | Target of `storeRef` in contractions |

The session manager becomes:
- Version graph of states
- Operation log (the DSL program)
- Evaluator: program → current context

---

## Checkpoint / Replay

Fall out naturally:

**Checkpoint** = save program prefix
```
checkpoint(s₅) = [op₀, op₁, op₂, op₃, contract(...)]
```

**Replay** = re-evaluate program
```
replay(checkpoint) = eval(op₀ |> op₁ |> op₂ |> op₃ |> contract(...))
```

**Time travel** = evaluate prefix
```
at_state(s₃) = eval(op₀ |> op₁ |> op₂)
```

---

## Program Transformation

Programs can be rewritten while preserving adequacy:

**Fusion**
```
inject(a) |> inject(b) |> contract(0..1, skel_ab, ref)
  ≃ 
inject(skel_ab)  -- if we have ref for full content
```

**Reordering** (when independent)
```
inject(a) |> evict(h₀) ≃ evict(h₀) |> inject(a)  -- if a doesn't depend on h₀
```

**Contraction hoisting**
```
inject(a) |> inject(b) |> inject(c) |> contract(0..2, skel, ref)
  ≃
contract_at_source(a, b, c, skel, ref)  -- never materialize full, go straight to skeletal
```

---

## Implementation Sketch

```typescript
interface CtxProgram {
  ops: CtxOp[];
  branches: Map<BranchId, CtxProgram>;
}

interface VersionGraph {
  nodes: Map<StateId, CtxState>;
  edges: Map<StateId, { op: CtxOp; target: StateId }[]>;
  head: StateId;
  branches: Map<BranchId, StateId>;
}

function eval(program: CtxProgram): CtxState {
  return program.ops.reduce(
    (state, op) => apply(state, op),
    emptyCtx()
  );
}

function apply(state: CtxState, op: CtxOp): CtxState {
  switch (op.tag) {
    case "Inject": return { ...state, content: [...state.content, op.content] };
    case "Contract": return contract(state, op.range, op.skeletal, op.storeRef);
    case "Expand": return expand(state, op.storeRef, op.at);
    case "Branch": return state; // branching is graph-level, not state-level
    // ...
  }
}
```

---

## Open Questions

1. **Adequacy oracle** - How do we know if a contraction is adequate? Model self-assessment? External validator? Learn from expansion patterns?

2. **Eager vs lazy contraction** - Contract proactively (pressure-based) or reactively (when inadequacy detected)?

3. **Branch garbage collection** - When can we discard abandoned branches?

4. **Merge conflict resolution** - What's the model's role vs operator's role?

5. **Cross-session programs** - Can programs reference ops from other sessions? (Shared history, cross-agent knowledge)

6. **Streaming operations** - Can ops be partially applied? (Inject streaming content)

---

## The Punchline

The context window isn't a data structure. It's the result of evaluating a program. The program is versioned. Contractions are invertible. Equivalence is adequacy.

**DSL + versioning + invertible contractions + adequacy = potent.**
