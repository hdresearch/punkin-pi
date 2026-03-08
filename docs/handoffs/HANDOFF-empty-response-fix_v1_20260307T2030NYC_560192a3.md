# Handoff: Empty Response Bug Fix
**Author:** Carter Schonwald  
**Session:** 2026-03-07 (evening, continued)  
**Commit:** `b5887577`

---

## Bug Found & Fixed ✅

### Root Cause
Model (Anthropic/OpenRouter) occasionally returns **empty response** (`content: []`, `stopReason: "stop"`) after tool results. This is NOT a stream issue - the API genuinely sends no content.

**Evidence from session log:**
```json
{"role":"assistant","content":[],"stopReason":"stop","output":2}
```
2 output tokens, zero content blocks. API said "done" with nothing.

### Fix: Retry + Connection Reset

1. **Empty response retry** (`39071579`)
   - Detect `content.length === 0` with `stopReason !== "error"/"aborted"`
   - Retry with 0-1s random jitter (avoid thundering herd)
   - Configurable limits in settings:
     - `maxEmptyRetries` (default: 3)
     - `maxEmptyRetryTimeMs` (default: 15s)
   - Convert to error after exhausting retries (empty is NEVER valid)

2. **Force fresh TCP connections** (`4b1e6a3c`, `b5887577`)
   - `Connection: close` header tells server to close after response
   - `fetchOptions: { keepalive: false }` prevents client-side connection pooling
   - Applied to ALL providers:
     - `anthropic.ts` (direct Anthropic, OAuth, Copilot)
     - `openai-completions.ts` (OpenRouter, OpenAI, all OpenAI-compatible)

3. **Debug instrumentation** (`241fdc0a`)
   - `PI_DEBUG_STREAM=1` env var enables stream lifecycle logging
   - Logs: start, event counts, stop_reason, error paths

---

## Files Changed

| File | Change |
|------|--------|
| `packages/agent/src/agent-loop.ts` | Empty response retry logic |
| `packages/agent/src/types.ts` | `maxEmptyRetries`, `maxEmptyRetryTimeMs` options |
| `packages/coding-agent/src/core/settings-manager.ts` | RetrySettings interface |
| `packages/ai/src/providers/anthropic.ts` | Connection: close, fetchOptions, debug logging |
| `packages/ai/src/providers/openai-completions.ts` | Connection: close, fetchOptions (covers OpenRouter) |

---

## Commits This Session (continued from earlier)

| Hash | Message |
|------|---------|
| `a9cc6b05` | docs: handoff for settings integration + stall bug investigation |
| `241fdc0a` | feat: add PI_DEBUG_STREAM=1 instrumentation for stall debugging |
| `39071579` | fix: retry on empty assistant responses with configurable limits |
| `560192a3` | fix: add Connection: close header to avoid connection reuse bugs |
| `4b1e6a3c` | fix: force fresh TCP connections with fetchOptions + Connection header |
| `b5887577` | fix: add Connection: close + fetchOptions to OpenAI provider |

---

## Testing

To verify fix:
1. Run with `PI_DEBUG_STREAM=1 punkin`
2. Use model heavily (tool calls, model switching)
3. If empty response occurs, should see retry attempts in logs
4. After fix, retries should recover OR error clearly (not silent empty)

---

## Settings Reference

```typescript
interface RetrySettings {
  maxEmptyRetries?: number;      // default: 3
  maxEmptyRetryTimeMs?: number;  // default: 15000 (15s)
}
```

Configure via `/settings` → Retry settings (not yet in UI, edit settings.json directly).

---

## Known Issue: Anthropic Empty Responses

Web search confirmed this is a **known Anthropic API behavior**:
- GitHub issues: `agno-agi/agno#3137`, `sst/opencode#6446`, `BerriAI/litellm#3440`
- Anthropic models sometimes return empty content array after tool calls
- Not an error per se, but invalid for continuation

Our retry mechanism is the correct mitigation.

---

## Remaining Work

- [ ] Add retry settings to Settings UI
- [ ] Monitor if Connection: close + fetchOptions fully resolves persistent empty responses
- [ ] Consider adding extended-cache-ttl toggle for long sessions
