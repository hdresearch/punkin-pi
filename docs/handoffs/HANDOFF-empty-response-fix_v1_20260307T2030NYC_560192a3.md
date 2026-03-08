# Handoff: Empty Response Bug Fix
**Author:** Carter Schonwald  
**Session:** 2026-03-07 (evening, continued)  
**Commit:** `560192a3`

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

2. **Connection: close header** (`560192a3`)
   - Force fresh HTTP connection on each request
   - Avoids connection reuse bugs that may cause persistent empty responses

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
| `packages/ai/src/providers/anthropic.ts` | Connection: close header, debug logging |

---

## Commits This Session (continued from earlier)

| Hash | Message |
|------|---------|
| `a9cc6b05` | docs: handoff for settings integration + stall bug investigation |
| `241fdc0a` | feat: add PI_DEBUG_STREAM=1 instrumentation for stall debugging |
| `39071579` | fix: retry on empty assistant responses with configurable limits |
| `560192a3` | fix: add Connection: close header to avoid connection reuse bugs |

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

## Remaining Work

- [ ] Add retry settings to Settings UI
- [ ] Monitor if Connection: close fully resolves persistent empty responses
- [ ] Consider adding extended-cache-ttl toggle for long sessions
