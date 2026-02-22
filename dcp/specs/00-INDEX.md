# DCP Subsystem Specs

Factored from DESIGN.md into ⊗-independent chunks.
Each spec is self-contained, buildable, testable.

## Subsystems

| # | Spec | Depends On | Status |
|---|------|-----------|--------|
| 01 | [Store](01-store.md) | — | TODO |
| 02 | [Page Table](02-page-table.md) | 01 | TODO |
| 03 | [DSML Analysis + DCP Extensions](03-dsml.md) | — | TODO |
| 04 | [Rolling Hash Chunker](04-chunker.md) | — | TODO |
| 05 | [Handle Lifecycle](05-handles.md) | 01, 02 | TODO |
| 06 | [Push-Down DSL](06-pushdown.md) | 05 | TODO |
| 07 | [Idempotency Layer](07-idempotency.md) | 05 | TODO |
| 08 | [Shadow Clone Protocol](08-clone.md) | 01, 02, 04 | TODO |
| 09 | [Context Splicer](09-splicer.md) | 02, 03, 04 | TODO |
| 10 | [Reroll Amortization Scheduler](10-scheduler.md) | 02, 09 | TODO |
| 11 | [Knowledge Graph](11-knowledge-graph.md) | 01, 02, 04 | TODO |
| 12 | [Oracle Panel Protocol](12-oracle-protocol.md) | 02, 05, 11 | TODO |
| 13 | [Oracle Panel (Swift, PRIMARY UI)](13-oracle-panel.md) | 12 | TODO |
| 14 | [Minimaps](14-minimaps.md) | 12, 13 | TODO |
| 15 | [Multi-Session Boot](15-boot.md) | 01, 02, 11 | TODO |
| 16 | [Page Fault Detection + Resolution](16-faults.md) | 02, 05, 08 | TODO |
| 17 | [Eval + Metrics](17-eval.md) | * | TODO |

## Dependency Graph

```
                 03-dsml    04-chunker
                   │            │
01-store ──────────┼────────────┤
   │               │            │
02-page-table ─────┼────────────┤
   │    │          │            │
   │    ├── 05-handles          │
   │    │     │    │            │
   │    │     ├── 06-pushdown   │
   │    │     └── 07-idempotency│
   │    │                       │
   │    ├── 08-clone ───────────┘
   │    │
   │    ├── 09-splicer ── 10-scheduler
   │    │
   │    ├── 11-knowledge-graph
   │    │          │
   │    └── 12-oracle-protocol
   │               │
   │         13-oracle-panel
   │               │
   │         14-minimaps
   │
   ├── 15-boot
   │
   └── 16-faults
            │
      17-eval (all)
```

## Independence (⊗)

These can be built in parallel with no coordination:
- 01-store ⊗ 03-dsml ⊗ 04-chunker
- 06-pushdown ⊗ 07-idempotency (both need 05, independent of each other)
- 13-oracle-panel ⊗ 08-clone (both need 02, independent of each other)

## Build Waves

```
Wave 1 (no deps, parallel):     01, 03, 04
Wave 2 (need store + table):    02, 05
Wave 3 (need handles):          06, 07, 08, 09
Wave 4 (need splicer + clone):  10, 11, 16
Wave 5 (need graph + protocol): 12, 15
Wave 6 (need protocol):         13, 14
Wave 7 (need everything):       17
```
