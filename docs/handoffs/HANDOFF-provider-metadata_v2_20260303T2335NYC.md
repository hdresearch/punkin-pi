# Provider Metadata Generation — Session Handoff

**Session:** 2026-03-03 ~22:40–23:35 NYC  
**Participants:** Carter + Claude  
**Status:** Discovery complete, artifacts created, implementation ready

---

## What Happened

Carter asked about fixing "provider metadata gen issues." We discovered:

1. **OpenRouter reasoning is broken** — sends wrong format
2. **models.dev is garbage** — wrong data, manual overrides everywhere
3. **First-party APIs don't expose capabilities** — have to scrape docs
4. **Anthropic hides features behind beta headers** — 20+ of them

We scraped Anthropic's docs with Firecrawl, extracted the beta headers from their Go SDK, and built a machine-parseable TOML registry.

---

## The Bug (Immediate)

OpenRouter models send reasoning in wrong format:

```typescript
// Current (broken) — openai-completions.ts:437
params.reasoning_effort = options.reasoningEffort;

// OpenRouter expects:
{ reasoning: { effort: "high" } }

// Not:
{ reasoning_effort: "high" }
```

**Fix location:** `packages/ai/src/providers/openai-completions.ts` line ~428

**Fix:**
```typescript
} else if (compat.thinkingFormat === "openrouter" && model.reasoning && options?.reasoningEffort) {
  (params as any).reasoning = { effort: options.reasoningEffort };
}
```

Also need to set `thinkingFormat: "openrouter"` in `generate-models.ts` for OpenRouter models.

---

## Artifacts Created

### In Repo

```
packages/ai/scripts/provider-metadata/
├── anthropic-models.toml         # Model → beta header mapping
└── pull-anthropic-metadata.sh    # Firecrawl scraper (re-runnable)

docs/handoffs/
└── HANDOFF-provider-metadata_v2_20260303T2335NYC.md  # This file
```

### External Cache

```
~/Downloads/anthropic-docs/
├── go-sdk-betas.md               # Source: Go SDK beta constants
├── models.md                     # Source: Models overview
├── thinking.md                   # Source: Extended thinking
├── context.md                    # Source: Context windows
├── computer-use.md               # Source: Computer use
├── pricing.md                    # Source: Pricing
├── adaptive-thinking.md
├── files-api.md
├── mcp.md
├── pdf-support.md
├── messages-create-api.md
└── MODEL-BETA-TREE.md            # Human-readable summary
```

---

## Anthropic Beta Headers (All 20)

Extracted from Go SDK — this is the authoritative list:

| Header | Feature |
|--------|---------|
| `prompt-caching-2024-07-31` | Prompt caching |
| `pdfs-2024-09-25` | PDF input |
| `message-batches-2024-09-24` | Batch processing |
| `computer-use-2024-10-22` | Computer use v1 (legacy) |
| `token-counting-2024-11-01` | Token counting |
| `computer-use-2025-01-24` | Computer use v2 |
| `token-efficient-tools-2025-02-19` | Optimized tool tokens |
| `output-128k-2025-02-19` | 128K output |
| `mcp-client-2025-04-04` | MCP v1 |
| `extended-cache-ttl-2025-04-11` | 1-hour cache |
| `files-api-2025-04-14` | Files API |
| `dev-full-thinking-2025-05-14` | Full thinking (dev) |
| `interleaved-thinking-2025-05-14` | Interleaved thinking |
| `code-execution-2025-05-22` | Code sandbox |
| `context-management-2025-06-27` | Context management |
| `context-1m-2025-08-07` | 1M context (tier 4+) |
| `model-context-window-exceeded-2025-08-26` | Graceful overflow |
| `skills-2025-10-02` | Skills API |
| `mcp-client-2025-11-20` | MCP v2 |
| `computer-use-2025-11-24` | Computer use v3 |
| `fast-mode-2026-02-01` | Fast mode (6x pricing) |

---

## Model Capabilities Summary

| Model | 1M Ctx | Thinking | Interleaved | Computer Use |
|-------|--------|----------|-------------|--------------|
| **Opus 4.6** | ✅ beta | adaptive only | auto | v3 |
| **Sonnet 4.6** | ✅ beta | both | beta header | v3 |
| **Opus 4.5** | ❌ | manual | beta header | v3 |
| **Sonnet 4.5** | ✅ beta | manual | beta header | v2 |
| **Haiku 4.5** | ❌ | manual | ❌ | v2 |
| **Sonnet 4** | ✅ beta | manual | beta header | v2 |
| **Opus 4** | ❌ | manual | beta header | v2 |
| **Sonnet 3.7** | ❌ | manual (full) | ❌ | v2 |

Carter has tier 4 key — 1M context unlocked.

---

## Data Source Quality

| Source | Quality | Use For |
|--------|---------|---------|
| **OpenRouter API** | ✅ Good | `supported_parameters`, defaults, pricing |
| **Anthropic Go SDK** | ✅ Gold | Beta header list (authoritative) |
| **Anthropic docs (scraped)** | ✅ Good | Model capabilities, beta requirements |
| **models.dev** | 🗑️ Bad | Nothing — full of errors |

---

## Implementation Phases

### Phase 1: OpenRouter Reasoning Fix (5 min)

1. Edit `openai-completions.ts` — add `thinkingFormat === "openrouter"` case
2. Edit `generate-models.ts` — add `compat: { thinkingFormat: "openrouter" }` to OpenRouter models
3. Regenerate: `npm run generate-models`
4. Test with reasoning model

### Phase 2: Extended Sampling Params

Add to `StreamOptions`: `topP`, `topK`, `minP`, `frequencyPenalty`, `presencePenalty`, `seed`

Wire through `buildParams()`.

### Phase 3: Anthropic Beta Metadata

Option A: Parse `anthropic-models.toml` at build time  
Option B: Inline the data in generate-models.ts

Either way, generate models with `supportedBetas` array.

### Phase 4: Full OpenRouter Metadata

Expand `fetchOpenRouterModels()`:
- `supported_parameters` array
- `default_parameters` object
- Store as `openRouter?: OpenRouterModelMetadata`

---

## To Re-Scrape Anthropic Docs

```bash
cd ~/Downloads/anthropic-docs
./pull-anthropic-metadata.sh > new.toml
diff anthropic-models.toml new.toml
```

Requires `FIRECRAWL_API_KEY` in env.

---

## Files to Change

| File | What |
|------|------|
| `packages/ai/src/providers/openai-completions.ts` | OpenRouter reasoning format |
| `packages/ai/scripts/generate-models.ts` | Add `thinkingFormat`, expand OpenRouter fetch |
| `packages/ai/src/types.ts` | Extended `StreamOptions`, new interfaces |
| `packages/ai/src/models.generated.ts` | Regenerated |

---

## Related Docs

- RFC: `specs/openrouter-model-enhancement-rfc.md` (pre-existing, detailed)
- TOML: `packages/ai/scripts/provider-metadata/anthropic-models.toml`
- Script: `packages/ai/scripts/provider-metadata/pull-anthropic-metadata.sh`
