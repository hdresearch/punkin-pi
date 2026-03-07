# Handoff: Provider Metadata Phases 1-3 + Turn Boundary Rendering
**Author:** Carter Schonwald  
**Session:** 2026-03-07 (afternoon, ~16:11-17:01 NYC)  
**Status:** Multiple phases complete, turn boundary rendering needs work, dead turns issue unresolved

---

## Context

Continuing from prior handoffs (HANDOFF-harness-thinking-abort-fixes, HANDOFF-provider-metadata_v2). Focus was on:
1. Implementing provider metadata phases from Mar 3 handoff
2. Fixing turn boundary visual rendering
3. Investigating dead turns issue

---

## Work Completed

### 1. Empty Abort Suppression, Squiggle-Wins, Abort Debounce ✅

**Commit:** `681496f0`

All fixes from HANDOFF-harness-thinking-abort-fixes:
- Empty aborted assistant messages no longer persisted to transcript
- Squiggle-wins policy: if text contains `<squiggle>`, skip rendering thinking blocks
- Abort debounce: 150ms time-gate in interactive mode
- Debug console.error removed from turn boundary injection
- Anthropic provider retry logic with CSPRNG equal-jitter backoff

### 2. Phase 1: OpenRouter Reasoning Format ✅

**Commit:** `41db080b`

**Problem:** OpenRouter expects `{ reasoning: { effort: "high" } }` not `{ reasoning_effort: "high" }`

**Changes:**
- `packages/ai/src/providers/openai-completions.ts`: Added `thinkingFormat === "openrouter"` case
- `packages/ai/scripts/generate-models.ts`: Mark OpenRouter models with `compat.thinkingFormat: "openrouter"` when `reasoning: true`
- Regenerated `models.generated.ts` with compat fields

**Impact:** Unblocks ~20 OpenRouter reasoning models (DeepSeek-R1, Qwen, etc.)

### 3. Phase 2: Extended Sampling Parameters ✅

**Commit:** `8c401e74`

**Added to StreamOptions:**
- `topP` (nucleus sampling)
- `topK` (top-K sampling)
- `minP` (minimum probability threshold)
- `frequencyPenalty`
- `presencePenalty`
- `seed` (deterministic output)

**Provider-specific support (from API docs):**

| Provider | topP | topK | freq_penalty | pres_penalty | seed |
|----------|------|------|--------------|--------------|------|
| OpenAI | ✅ | ❌ | ✅ | ✅ | ✅ |
| Anthropic | ✅ | ✅ | ❌ | ❌ | ❌ |
| Mistral | ✅ | ✅ | ✅ | ✅ | ✅ |
| Groq | ✅ | ✅ | ❌ | ❌ | ✅ |
| Z.ai | ✅ | ❌ | ❌ | ❌ | ❌ |

**Impact:** Developers can now tune output behavior per model. Unsupported params silently skipped.

### 4. Phase 3: Anthropic Beta Headers Metadata ✅

**Commit:** `64ab2850`

**Changes:**
- Added `AnthropicCompat` interface with `anthropicBetas?: string[]`
- Parse `anthropic-models.toml` at model generation time
- Map beta headers to each Anthropic model

**Beta headers per model (examples):**
- **Opus 4.6:** 12 betas (1M context, computer-use-v3, fast-mode, files-api, code-execution, etc.)
- **Sonnet 4.6:** Extended thinking, computer-use-v3, 1M context
- **Opus 4.5:** Computer-use-v3
- **Sonnet 4.5/Haiku:** Computer-use-v2

**Impact:** Enables feature detection. Harness can route requests to correct model + beta headers.

### 5. Turn Boundary Rendering Changes (PARTIAL)

**Changes made:**
- Strengthened separators with `═` box drawing characters
- Bar on outer faces: START above, END below
- Removed directional arrows (bars alone sufficient)

**Current code in `packages/coding-agent/src/modes/interactive/components/turn-boundary.ts`:**
```typescript
if (isStart) {
    content = `${separator}\n│ ${text} │`;
} else {
    content = `│ ${text} │\n${separator}`;
}
```

**PROBLEM:** Nonces don't match between turn start and end in actual output:
```
│ 〰 obsidian-wave-hazel │ turn:145 │ ...
[content]
│ H=... │ peak-frost-silver « │  ← WRONG: different nonce!
```

This is NOT a rendering bug — the data being rendered has mismatched nonces. Investigation needed.

---

## Issues Still Open

### 1. Dead Turns / Empty Turn Stuttering 🔴

**Symptom:** Turns appear with minimal/no content. Still happening despite empty abort suppression.

**Suspicion:** Anthropic-specific. Worse with Anthropic API than others.

**Possible causes:**
- Retry logic emitting multiple start events
- Abort/error handling creating phantom turns
- Something in the Anthropic streaming path

**Where to investigate:**
- `packages/ai/src/providers/anthropic.ts` — retry loop, abort handling
- `packages/coding-agent/src/core/agent-session.ts` — turn boundary injection timing

### 2. Turn Boundary Nonce Mismatch 🔴

**Symptom:** Turn start shows one nonce, turn end shows different nonce.

**Root cause:** Unknown. The code in `turn-boundary.ts` correctly uses `state.currentSigil` and `state.currentNonce` for both turnStart and turnEnd in `onTurnEnd()`. 

**Possible causes:**
- Turn boundaries being rendered from different turns
- Display ordering issue in interactive-mode.ts
- Turn state not properly persisted/restored

**Where to investigate:**
- `packages/coding-agent/src/core/carter_kit/turn-boundary.ts` — state management
- `packages/coding-agent/src/modes/interactive/interactive-mode.ts` — render order (lines 2345-2346, 2483-2489)

### 3. Settings Integration Not Done 🟡

The metadata we added (sampling params, Anthropic betas) is NOT surfaced to user:
- Not in `~/.agent/settings.toml`
- Not wired through agent-session.ts to StreamOptions
- Not displayed in UI

**Needed:**
1. Add `SamplingSettings` interface to settings-manager.ts
2. Wire settings through to StreamOptions in agent execution
3. Add Anthropic beta toggles (e.g., `enableComputerUse`, `enableExtendedThinking`)

---

## Work Remaining (Priority Order)

### Phase 2.5: sampling.toml (vendor defaults/ranges)
**Status:** Researched, not implemented  
**What:** Create TOML file with vendor-recommended defaults, ranges, documentation for each sampling param  
**Why:** Users need to know valid ranges and recommended values

### Phase 4: OpenRouter Full Metadata
**Status:** Not started  
**What:** Extract `supported_parameters` and `default_parameters` from OpenRouter API  
**Why:** Enables smart fallbacks if model doesn't support a requested param

### Settings Integration
**Status:** Not started  
**What:** Wire metadata through to user-facing settings  
**Why:** Makes the metadata actually useful

### Dead Turns Investigation
**Status:** Needs investigation  
**What:** Identify why empty/dead turns still appear, especially with Anthropic  
**Why:** Degraded UX, confusing display

### Turn Boundary Nonce Pairing
**Status:** Needs investigation  
**What:** Ensure turn start and end have matching nonces  
**Why:** Breaks the visual frame semantics

---

## Key Code Locations

| Component | File | Notes |
|-----------|------|-------|
| Anthropic retry | `packages/ai/src/providers/anthropic.ts` | Lines ~200-270, retry loop |
| OpenRouter reasoning | `packages/ai/src/providers/openai-completions.ts` | Line ~435, thinkingFormat case |
| Sampling params | `packages/ai/src/types.ts` | StreamOptions interface |
| Compat detection | `packages/ai/src/providers/openai-completions.ts` | `detectCompat()` ~line 800 |
| Model generation | `packages/ai/scripts/generate-models.ts` | OpenRouter + Anthropic beta mapping |
| Anthropic beta TOML | `packages/ai/scripts/provider-metadata/anthropic-models.toml` | Beta header registry |
| Turn boundary state | `packages/coding-agent/src/core/carter_kit/turn-boundary.ts` | onTurnStart, onTurnEnd |
| Turn boundary render | `packages/coding-agent/src/modes/interactive/components/turn-boundary.ts` | Visual rendering |
| Turn injection | `packages/coding-agent/src/core/agent-session.ts` | `_injectTurnBoundaries` ~line 472 |
| Empty abort suppress | `packages/coding-agent/src/core/agent-session.ts` | `isEmptyAbort` check ~line 392 |
| Settings manager | `packages/coding-agent/src/core/settings-manager.ts` | Settings interface ~line 117 |

---

## Git Status

```
main: 4 commits ahead of origin/main
- 681496f0: fix: empty abort suppression, squiggle-wins, abort debounce, retry logic
- 41db080b: feat: OpenRouter reasoning format support (Phase 1)
- 8c401e74: feat: Extended sampling parameters (Phase 2)
- 64ab2850: feat: Anthropic beta headers metadata (Phase 3)
+ uncommitted: turn boundary rendering changes (turn-boundary.ts)
```

---

## Build Commands

```bash
npm run -w packages/ai build
npm run -w packages/coding-agent build
npm run build  # all packages
```

---

## Session Notes

- Model started as Haiku/Sonnet, upgraded reasoning capacity mid-session
- Some responses were clipped/truncated mid-output (possible harness issue)
- Dead turns observed during session itself (meta-debugging)
- Carter's preference: "don't ask to ask" — when next step is obvious, do it
