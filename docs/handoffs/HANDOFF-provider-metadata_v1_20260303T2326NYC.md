# Provider Metadata Generation — Handoff

**Session:** 2026-03-03  
**Author:** Carter + Claude  
**Status:** Discovery complete, implementation pending

---

## Problem Statement

`generate-models.ts` produces inaccurate model metadata because:

1. **models.dev is unreliable** — wrong capabilities, stale pricing, missing models
2. **OpenRouter reasoning format is broken** — we send `reasoning_effort: "high"` but OpenRouter expects `reasoning: { effort: "high" }`
3. **First-party providers don't expose `supported_parameters`** — have to infer from docs
4. **Beta headers gate critical features** — 1M context, interleaved thinking, computer use, etc.

## Data Sources Evaluated

| Source | Reliability | What It Has | What It Lacks |
|--------|-------------|-------------|---------------|
| **models.dev** | 🗑️ Poor | Basic model list | Accurate capabilities, correct pricing |
| **OpenRouter API** | ✅ Good | `supported_parameters`, pricing, defaults | First-party-only models |
| **Anthropic /v1/models** | ❌ Minimal | id, name, created_at | Everything else |
| **Anthropic llms.txt** | 📄 Prose | Human-readable docs | Machine-parseable data |
| **Anthropic Go SDK** | ✅ Gold | All beta header constants | Model-to-header mapping |
| **Anthropic docs (scraped)** | ✅ Good | Model capabilities, beta requirements | Requires parsing |

## Solution: Hybrid Approach

### For OpenRouter Models
Use OpenRouter's API directly — they've done the hard work:
- `supported_parameters` array
- `default_parameters` object  
- `reasoning` format (nested, not flat)
- Per-modality pricing

### For First-Party Anthropic
Use curated TOML derived from official docs:
- Beta headers from Go SDK (authoritative)
- Model capabilities from scraped docs
- Manual curation for accuracy

### For Other Providers
Similar pattern: scrape official docs, curate TOML, version control.

---

## Artifacts Created

All in `~/Downloads/anthropic-docs/`:

```
anthropic-docs/
├── anthropic-models.toml         # Authoritative model capabilities
├── pull-anthropic-metadata.sh    # Reproducible scraper
├── MODEL-BETA-TREE.md            # Human-readable reference
├── go-sdk-betas.md               # Raw: Go SDK beta constants
├── models.md                     # Raw: Models overview
├── thinking.md                   # Raw: Extended thinking docs
├── context.md                    # Raw: Context windows docs
├── computer-use.md               # Raw: Computer use docs
├── pricing.md                    # Raw: Pricing docs
├── adaptive-thinking.md          # Raw: Adaptive thinking
├── files-api.md                  # Raw: Files API
├── mcp.md                        # Raw: MCP docs
├── pdf-support.md                # Raw: PDF support
└── messages-create-api.md        # Raw: Messages API reference
```

---

## Key Findings

### Anthropic Beta Headers (Complete List)

Extracted from Go SDK (`platform.claude.com/docs/en/api/go/beta/files/list`):

```toml
[beta_headers]
"prompt-caching-2024-07-31" = "Prompt caching"
"pdfs-2024-09-25" = "PDF input support"
"message-batches-2024-09-24" = "Batch message processing"
"computer-use-2024-10-22" = "Computer use v1 (legacy)"
"token-counting-2024-11-01" = "Token counting endpoint"
"computer-use-2025-01-24" = "Computer use v2"
"fast-mode-2026-02-01" = "Fast mode (6x pricing)"
"token-efficient-tools-2025-02-19" = "Optimized tool tokens"
"output-128k-2025-02-19" = "128K output tokens"
"mcp-client-2025-04-04" = "MCP client v1"
"extended-cache-ttl-2025-04-11" = "1-hour cache TTL"
"files-api-2025-04-14" = "Files API"
"dev-full-thinking-2025-05-14" = "Full thinking (dev)"
"interleaved-thinking-2025-05-14" = "Interleaved thinking"
"code-execution-2025-05-22" = "Code execution sandbox"
"context-management-2025-06-27" = "Context management API"
"context-1m-2025-08-07" = "1M token context (tier 4+)"
"model-context-window-exceeded-2025-08-26" = "Graceful context overflow"
"skills-2025-10-02" = "Skills API"
"mcp-client-2025-11-20" = "MCP client v2"
"computer-use-2025-11-24" = "Computer use v3 (latest)"
```

### Model → Beta Feature Matrix

| Model | 1M Context | Interleaved | Computer Use | Thinking Mode |
|-------|------------|-------------|--------------|---------------|
| Opus 4.6 | ✅ header | ✅ auto | v3 | adaptive only |
| Sonnet 4.6 | ✅ header | ✅ header | v3 | both |
| Opus 4.5 | ❌ | ✅ header | v3 | manual |
| Sonnet 4.5 | ✅ header | ✅ header | v2 | manual |
| Haiku 4.5 | ❌ | ❌ | v2 | manual |
| Sonnet 4 | ✅ header | ✅ header | v2 | manual |
| Opus 4 | ❌ | ✅ header | v2 | manual |
| Sonnet 3.7 | ❌ | ❌ | v2 | manual (full output) |

### OpenRouter Reasoning Format Fix

**Current (broken):**
```typescript
// openai-completions.ts:437
params.reasoning_effort = options.reasoningEffort;
```

**Needed:**
```typescript
if (compat.thinkingFormat === "openrouter") {
  (params as any).reasoning = { effort: options.reasoningEffort };
}
```

---

## Implementation Plan

### Phase 1: Immediate Fix (OpenRouter reasoning)

File: `packages/ai/src/providers/openai-completions.ts`

```typescript
// After line 437, add:
} else if (compat.thinkingFormat === "openrouter" && model.reasoning && options?.reasoningEffort) {
  (params as any).reasoning = { effort: options.reasoningEffort };
}
```

File: `packages/ai/scripts/generate-models.ts`

In `fetchOpenRouterModels()`, add:
```typescript
compat: { thinkingFormat: "openrouter" },
```

### Phase 2: Extended Parameters

Add to `StreamOptions`:
```typescript
topP?: number;
topK?: number;
minP?: number;
frequencyPenalty?: number;
presencePenalty?: number;
seed?: number;
```

Wire through in `buildParams()`.

### Phase 3: Anthropic Beta Headers

Option A: Read from TOML at build time
```typescript
import { parse } from '@iarna/toml';
const anthropicConfig = parse(fs.readFileSync('anthropic-models.toml'));
```

Option B: Inline in generate-models.ts (current pattern)

### Phase 4: Full OpenRouter Metadata

Expand `fetchOpenRouterModels()` per RFC:
- Extract `supported_parameters`
- Extract `default_parameters`
- Extract `hugging_face_id`, `description`, etc.
- Store on model as `openRouter?: OpenRouterModelMetadata`

---

## Scripts

### pull-anthropic-metadata.sh

```bash
#!/bin/bash
# Pulls Anthropic docs via Firecrawl, extracts beta headers
# Requires: FIRECRAWL_API_KEY, jq, curl
# Output: TOML to stdout, raw docs to $DOCS_DIR

# See ~/Downloads/anthropic-docs/pull-anthropic-metadata.sh
```

### Usage

```bash
cd ~/Downloads/anthropic-docs
./pull-anthropic-metadata.sh > new-anthropic-models.toml
diff anthropic-models.toml new-anthropic-models.toml
```

---

## Files to Change

| File | Change |
|------|--------|
| `packages/ai/src/types.ts` | Add `SamplingOptions`, `OpenRouterModelMetadata`, extend `StreamOptions` |
| `packages/ai/src/providers/openai-completions.ts` | Add `thinkingFormat: "openrouter"` case, extended params |
| `packages/ai/scripts/generate-models.ts` | Update `fetchOpenRouterModels()`, add Anthropic beta metadata |
| `packages/ai/src/models.generated.ts` | Regenerated output |

---

## Testing

```bash
# Verify OpenRouter reasoning works
node packages/coding-agent/dist/cli.js --print \
  --model openrouter/qwen/qwen3.5-35b-a3b \
  "explain quantum entanglement briefly"

# Should see final response, not just CoT
```

---

## References

- RFC: `specs/openrouter-model-enhancement-rfc.md`
- TOML: `~/Downloads/anthropic-docs/anthropic-models.toml`
- Script: `~/Downloads/anthropic-docs/pull-anthropic-metadata.sh`
- Raw docs: `~/Downloads/anthropic-docs/*.md`
