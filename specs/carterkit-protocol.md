# CarterKit Protocol Spec (v0)

**Author:** Carter Schonwald  
**Date:** 2026-02-27  
**Status:** Proposed, implementation-guided  
**Primary audience:** core runtime, compiled-core migration, Swift UI clients

## Purpose

Define the CarterKit protocol surface as a single spec:

1. In-process hook contract used today in TypeScript
2. Model-facing protocol constraints (boot, handles, brackets, structured output)
3. Handle/store protocol semantics
4. Future wire protocol (CBOR + CDDL over UDS) for compiled core

This doc is CarterKit-specific. It extracts and sharpens protocol content from:

- `packages/coding-agent/src/core/carter_kit/*`
- `packages/coding-agent/src/core/carter_kit/prompts/*`
- `docs/specs/tool-execution-model_v1_20260224T141515NYC_ebdd1b608931.md`
- `specs/design.md` (DSML and wire-format sections)

## Non-Goals

- Full DCP architecture restatement
- UI interaction design details
- Provider-specific API payload schemas
- Store backend implementation details (DuckDB/file layout)

## Layered Model

### L0: CarterKit Hook API (current)

The current contract boundary is `createCarterKitHook(...)` and `CarterKitHook`.

Required operations:

1. `beforeToolCall(toolName, args)`:
   - may return cached result text (`skipResult`)
   - may return `handleId` for post-exec capture
2. `afterToolResult(handleId, resultText, contextTokens, contextWindow)`:
   - stores full result
   - returns inline result or handle summary
3. `turnEnd(message)`:
   - captures CoT for assistant messages
   - increments CarterKit turn index
4. `systemPromptAddition(contextTokens, contextWindow)`:
   - always includes handle-tools guidance
   - may append pressure warning
5. `enrichCompaction(messages)`:
   - includes stored CoT for summarized turns
6. `getTools()`:
   - registers push-down handle tools
7. `turnStart(turnIndex)`:
   - creates bracket state for current turn

Core invariant:

- CarterKit must be able to run as middleware without requiring changes to model provider codepaths.

### L1: Model-Facing Protocol

CarterKit currently uses prompt-level protocol contracts:

1. **Boot sequence protocol** (`boot-sequence.md`)
2. **Handle tool protocol** (`handle-tools.md`)
3. **Pressure protocol** (`pressure-*.md`)
4. **Turn bracket protocol** (system-generated wrapper, not model-authored)

Normative rules:

1. Brackets are system/tool-generated. Model should not synthesize bracket wrappers.
2. Large tool results may be represented as handles.
3. Model should prefer surgical access (`handle_lines`, `handle_grep`, etc.) over full rematerialization.
4. Pressure warnings are treated as hard steering signals for concision/materialization discipline.

### L1.1 Structured Output Protocol (target direction)

Design target is DSML-style block output with single-token delimiters (see `specs/design.md`):

- block-typed output (`act`, `find`, `decide`, `tool`, `note`, `ref`, `margin`)
- no filler prose in output channel
- free-form CoT remains unconstrained

This is a protocol goal and can be introduced incrementally with enforcement checks.

### L2: Tool Interception + Handle Protocol

#### Decision Protocol

Pre-exec:

- `UseCached(handleId, resultText)` for deduped pure calls
- `Execute(handleId, idempotency)` for fresh execution

#### Capture Protocol

Post-exec:

- always persist full result
- choose one:
  - `Materialized(text)` if under budget
  - `Summarized(handleId, summary)` if over budget

#### Push-Down Operations

Current operation set:

- `handle_lines`
- `handle_grep`
- `handle_head`
- `handle_tail`
- `handle_count`
- `handle_count_matches`
- `handle_slice`
- `cot_replay`

Semantics:

1. Execute against stored blob
2. Do not inject full underlying blob unless explicitly requested
3. Return bounded, operation-scoped output

#### Idempotency Protocol

Classification drives caching/replay policy:

- `Pure`: dedup and replay-safe
- `Session`: snapshot-safe within session, conservative replay
- `NonIdempotent`: never replay for semantic equivalence

Conservative default for unknown calls is `NonIdempotent`.

### L3: Store Protocol

Store contract elements:

1. Content-addressed `Blob` operations (`putBlob`, `getBlob`)
2. Page table updates (chunks, handles, deps, pressure)
3. Dedup cache (`cacheKey -> handleId`)
4. Oracle log append
5. Compaction log append

Store backend is replaceable; protocol semantics are not.

### L4: Wire Protocol (compiled core target)

This layer is for decoupled architecture:

- compiled CarterKit core process
- Swift primary UI and other clients
- optional TS plugin sidecar

Transport:

1. Unix domain socket (stream)
2. Frame: `u32be length` + CBOR payload
3. Encoding: deterministic CBOR

Schema language: CDDL

## CarterKit Wire Protocol (CDDL v0)

```cddl
; carterkit-protocol-v0.cddl

frame = command / response / event

command = {
  "t": "cmd",
  "v": uint,                ; protocol major version
  "id": uint,               ; request correlation id
  "name": cmd-name,
  ? "params": any
}

response = {
  "t": "res",
  "v": uint,
  "id": uint,
  "ok": bool,
  ? "data": any,
  ? "err": err
}

event = {
  "t": "evt",
  "v": uint,
  "name": evt-name,
  ? "data": any
}

err = {
  "code": err-code,
  "msg": tstr,
  ? "details": any
}

cmd-name =
    "hello"
  / "tool.decide"
  / "tool.capture"
  / "handle.exec"
  / "cot.capture"
  / "turn.end"
  / "pressure.eval"
  / "compaction.enrich"
  / "oracle.apply"
  / "watch.subscribe"

evt-name =
    "handle.updated"
  / "pressure.changed"
  / "cot.captured"
  / "compaction.enriched"
  / "oracle.applied"

err-code =
    "bad_request"
  / "not_found"
  / "conflict"
  / "forbidden"
  / "timeout"
  / "internal"
```

### Required Command Shapes

The following command payloads are required for v0 interoperability.

```cddl
tool-decide-params = {
  "toolName": tstr,
  "args": any
}

tool-decide-data = {
  "decision": "use_cached" / "execute",
  ? "handleId": tstr,
  ? "resultText": tstr,
  ? "idempotency": "pure" / "session" / "non_idempotent"
}

tool-capture-params = {
  "handleId": tstr,
  "resultText": tstr,
  "contextTokens": uint,
  "contextWindow": uint,
  "turnIndex": uint
}

tool-capture-data = {
  "capture": "materialized" / "summarized",
  ? "text": tstr,
  ? "summary": tstr
}

handle-exec-params = {
  "handleId": tstr,
  "op": handle-op
}

handle-op = {
    "tag": "HLines", "start": uint, "end": uint
  } / {
    "tag": "HGrep", "pattern": tstr
  } / {
    "tag": "HSlice", "offset": uint, "length": uint
  } / {
    "tag": "HHead", "n": uint
  } / {
    "tag": "HTail", "n": uint
  } / {
    "tag": "HCount"
  } / {
    "tag": "HCountMatches", "pattern": tstr
  }

handle-exec-data = {
  "result": tstr
}

cot-capture-params = {
  "turnIndex": uint,
  "content": [* cot-block]
}

cot-block = {
  "type": tstr,
  ? "thinking": tstr
}

cot-capture-data = {
  ? "cotHash": tstr
}

pressure-eval-params = {
  "contextTokens": uint,
  "contextWindow": uint
}

pressure-eval-data = {
  "level": "Low" / "Medium" / "High" / "Critical",
  ? "warningText": tstr
}
```

## Ordering + Concurrency Rules

1. `tool.decide` must happen before actual tool execution.
2. `tool.capture` must happen exactly once per executed call with a `handleId`.
3. `turn.end` is monotonic by turn index.
4. Handle operations are read-only and may execute in parallel.
5. `oracle.apply` is serialized for deterministic page-table state.

## Error Contract

Every failed response must include:

1. `ok: false`
2. structured `err.code`
3. actionable `err.msg`

Error codes:

- `bad_request`: malformed payload or unsupported operation
- `not_found`: missing handle/blob/chunk
- `conflict`: version mismatch or invalid state transition
- `forbidden`: policy violation
- `timeout`: operation exceeded declared timeout
- `internal`: runtime/storage failure

## Versioning Policy

Protocol version is major-only in v0:

1. `v` in every frame
2. major bump for incompatible changes
3. additive command fields allowed within same major
4. feature negotiation via `hello` capability set

Example `hello` capability payload:

```cddl
hello-data = {
  "name": tstr,
  "protocolVersion": uint,
  "capabilities": [* tstr]
}
```

## Migration Plan

### Phase 1: Spec + TS Conformance

1. Keep in-process CarterKit hook implementation.
2. Add conformance tests that validate hook behavior against this spec.
3. Keep model/prompt protocol unchanged.

### Phase 2: Compiled Core Mirror

1. Build compiled CarterKit service implementing v0 CDDL commands.
2. Keep TS adapter as transport shim.
3. Run dual-path verification (in-process vs service) for parity.

### Phase 3: Protocol-Only Core State

1. Remove in-process CarterKit state mutation.
2. TS layer becomes protocol client + plugin host only.
3. Swift and TS clients use identical command/event surface.

## Conformance Test Matrix

Minimum required tests:

1. Pure call dedup returns `use_cached`.
2. Over-budget capture returns `summarized`.
3. Under-budget capture returns `materialized`.
4. Each handle op matches expected output on known fixtures.
5. `turn.end` captures CoT hashes for assistant turns only.
6. Pressure level thresholds map correctly.
7. Frame decode rejects malformed `v/id/name`.
8. Error code mapping is stable for not-found and bad-request paths.

## Open Questions

1. Should handle IDs remain text (`section-handle`) on wire, or move to tagged CBOR type?
2. Should `turn.end` include bracket metadata directly, or keep bracket state local to client runtime?
3. Should `cot.capture` accept provider-native reasoning payloads in addition to normalized blocks?
4. Should `oracle.apply` be split into typed commands (`oracle.pin`, `oracle.edit`, etc.) in v1?

## Decision Summary

1. CarterKit protocol is now explicit and layered.
2. Prompt-level protocol remains valid for current runtime.
3. Compiled-core path standardizes on CBOR + CDDL over UDS.
4. TS runtime remains ecosystem shell, not canonical state engine.
