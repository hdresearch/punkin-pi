# Specs Index

Foundational specifications for punkin-pi's context management and agent architecture.

## Core Architecture

| Spec | Description |
|------|-------------|
| [design.md](design.md) | Master design doc - context compaction, handles, invertibility |
| [context-dsl.md](context-dsl.md) | Context manipulation as a versioned DSL program |
| [codata-semantics.md](codata-semantics.md) | Lazy I/O - tool results as observations, not values |

## Agent Primitives

| Spec | Description |
|------|-------------|
| [kage-no-bushin.md](kage-no-bushin.md) | Shadow clones, hypotheticals, transactions |
| [tool-interface-design.md](tool-interface-design.md) | Intent-based, async, reference-based tool APIs |

## Hooks & Extensions

| Spec | Description |
|------|-------------|
| [metacog-hooks.md](metacog-hooks.md) | Lifecycle hooks for agent metacognition |
| [shell-hooks.md](shell-hooks.md) | TOML shell hooks + turn injection |

## Store & Infrastructure

| Spec | Description |
|------|-------------|
| [01-store.md](01-store.md) | Content-addressed storage (DuckDB + blobs) |
| [03-dsml.md](03-dsml.md) | DSML analysis extensions |
| [00-INDEX.md](00-INDEX.md) | Old subsystem index (partially stale) |

---

## Key Concepts

**Context as Program**: The history of context manipulations is a DSL program. Current context = eval(program). Operations: inject, contract, expand, branch, merge, splice, evict.

**Invertible Contractions**: Compaction is reversible - skeletal form in context, full content in store. Nothing is ever lost, just changes residency.

**Codata I/O**: Tool results are handles (thunks), not values. Observe what you need, don't materialize everything.

**Adequacy**: Two context states are equivalent if they preserve reasoning capability. Information-theoretic, not strict equality.

**Kage no Bushin**: Clone primitive for branching context. Compaction, speculation, parallel exploration all compose from clones.
