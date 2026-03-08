# Handoff: Settings Integration + Stream Stall Bug Investigation
**Author:** Carter Schonwald  
**Session:** 2026-03-07 (evening)  
**Commit:** `cf2c0b99`

---

## Done ✅

### 1. Empty Turn Boundary Suppression (`e6a935af`)
- Fixed phantom empty frames in TUI from Anthropic aborted turns
- Changed guard in `_injectTurnBoundaries` from anchored-only to any empty turn
- Regression test added: `turn-boundary-empty-turn-stress.test.ts`

### 2. Settings Integration for Sampling + Anthropic Features (`327a6b7f`)
- **New interfaces:** `SamplingSettings`, `AnthropicFeatureSettings` in settings-manager.ts
- **Sampling params:** temperature, topP, topK, minP, frequencyPenalty, presencePenalty, seed
- **Anthropic toggles:** interleavedThinking, context1M, computerUse, codeExecution, filesApi, fastMode, skills, mcpClient, tokenEfficientTools
- **Model affinity:** favoriteModels, recentModels arrays auto-populated on model switch
- **Wiring:** Settings → Agent constructor → AgentLoopConfig → StreamOptions → providers
- **New file:** `packages/ai/scripts/provider-metadata/sampling.toml` with vendor defaults/ranges

### 3. Model Selector Favorites/Recents (`28b98377`)
- Sort order: current → favorites → recents → provider
- ★ star indicator for favorites
- Ctrl+F toggles favorite on selected model  
- Fixed selection preservation after toggle (was jumping)

### 4. Settings UI (`c430dfce`, `cf2c0b99`)
- Temperature dropdown: 0, 0.3, 0.5, 0.7, 1.0, 1.2, 1.5, 2.0
- Top-P dropdown: 0.5, 0.7, 0.8, 0.9, 0.95, 1.0
- Context 1M toggle (Anthropic tier 4+)
- Removed interleaved thinking toggle (should always be on)
- Changes apply to Agent at runtime, persist to settings.json

---

## Open Bug: Stream Stall / Premature Turn End 🐛

### Symptoms
- Model (Opus or Claude via OpenRouter) ends turn mid-CoT
- User sees thinking cut off mid-stream
- Turn recorded with correct `stopReason: "toolUse"` but content incomplete
- Happens on both native Anthropic and Claude via OpenRouter

### Observations
- First observed after model switching (Opus → Qwen 3.5 → back to Claude)
- Not isolated to one provider route
- Session log shows:
  - `ttftMs` sometimes very high (25+ seconds) 
  - `endTimestamp` same as `timestamp` (entire response delivered in burst)
  - Content visibly truncated in transcript

### Possible Causes (not yet confirmed)
1. **Model switch doesn't reset state properly** — abortController, pending streams, etc.
2. **Buffering/flushing issue** — events accumulate but don't emit incrementally
3. **Race condition** — new request starts before previous stream fully terminates
4. **Anthropic SDK issue** — not sending stop_reason event in some cases
5. **Something in retry logic** — `sawContentEvent` gate might have edge case

### Files to Investigate
| File | What to check |
|------|--------------|
| `packages/ai/src/providers/anthropic.ts` | Stream event handling, retry logic, abort handling |
| `packages/agent/src/agent.ts` | `setModel()`, abort controller lifecycle |
| `packages/agent/src/agent-loop.ts` | `streamAssistantResponse`, event consumption |
| `packages/coding-agent/src/core/agent-session.ts` | Model switching, event emission |

### Reproduction
1. Start session with Opus
2. Switch to different model (e.g., Qwen via OpenRouter)
3. Switch back to Claude
4. Send a prompt that triggers tool use with visible thinking
5. Observe thinking cut off mid-stream

---

## Anthropic Beta Headers Reference

From `packages/ai/scripts/provider-metadata/anthropic-models.toml`:

| Header | Purpose | Added to UI? |
|--------|---------|-------------|
| `context-1m-2025-08-07` | 1M context window | ✅ Yes |
| `extended-cache-ttl-2025-04-11` | 1hr cache TTL | ❌ No |
| `output-128k-2025-02-19` | 128K output tokens | ❌ No |
| `interleaved-thinking-2025-05-14` | Interleaved thinking | N/A (always on) |
| `computer-use-2025-11-24` | Computer use v3 | ❌ No |
| `code-execution-2025-05-22` | Code sandbox | ❌ No |
| `files-api-2025-04-14` | Files API | ❌ No |
| `fast-mode-2026-02-01` | 6x pricing mode | ❌ No |
| `token-efficient-tools-2025-02-19` | Optimized tool tokens | ❌ No |

Consider adding UI toggles for `extended-cache-ttl` (cost savings on long sessions).

---

## Commits This Session

| Hash | Message |
|------|---------|
| `e6a935af` | fix: suppress anchored empty aborted turn boundaries |
| `327a6b7f` | feat: settings integration for sampling params and Anthropic features |
| `28b98377` | feat(model-selector): favorites/recents sorting and toggle |
| `c430dfce` | feat: settings UI for sampling params and Anthropic features |
| `cf2c0b99` | fix: remove interleaved thinking toggle from settings UI |

---

## Build & Test

```bash
npm run build -w packages/ai -w packages/agent -w packages/coding-agent
npm run test -w packages/coding-agent -- turn-boundary
```

All passing at handoff.
