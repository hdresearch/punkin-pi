# Assistant Wrapping Fix — Session Handoff

**Session:** 2026-03-05 ~22:20–23:08 NYC  
**Participants:** Carter + Claude (Sonnet)  
**Status:** Core fix committed, empty turn bug still present

---

## What Happened

Continued from `HANDOFF-provider-metadata_v2`. While investigating, discovered a deeper bug causing model to echo `<assistant>` tags and produce empty turns.

---

## Bugs Discovered

### 1. Assistant Message Wrapping (FIXED)

`convertToLlm` in `messages.ts` was wrapping prior assistant turns with `<assistant>` tags:

```ts
// OLD (buggy)
wrapped = `<assistant>\n${content}\n</assistant>`
newContent = [{ type: "text", text: wrapped }, ...toolCalls]
```

**Symptoms:**
- Model sees `<assistant>` tags in prior turns
- Model echoes the pattern → tags appear literally in output
- Thinking signatures destroyed when converted to text

**Fix (committed):**
```ts
// NEW — merge thinking into squiggle, no wrapper
const parts: string[] = [];
if (thinking.length > 0) {
    parts.push(`<squiggle>\n${thinking.join("\n")}\n</squiggle>`);
}
parts.push(...text);
const combined = parts.join("\n");
```

**Commits:**
- `2d723615` — initial fix (pass through unchanged)
- `bd11fa71` — revised fix (squiggle-wrap thinking, merge into text)

### 2. Prefill on CoT (FIXED)

`agent-loop.ts` was calling `getPrefill()` which is incompatible with extended thinking.

**Fix:** Carter disabled prefill call:
```ts
// const prefill = config.getPrefill?.();
const prefill = {};
```

### 3. Empty Turn Stuttering (STILL PRESENT)

Model produces turns with tokens:2 (near-empty). Turn terminates cleanly but with no content.

**Root cause:** Unknown. Not fixed by wrapper removal. May need:
- Empty turn guard/retry in agent-loop
- Or deeper investigation

### 4. Turn Boundary Display (NEEDS INVESTIGATION)

Old messages in TUI not showing nonced separators. Data exists but not rendering.

---

## Anthropic Extended Thinking API

**Key finding from docs:**

| Model | Thinking in Context |
|-------|---------------------|
| Sonnet 4.5, Sonnet 4, Haiku 4.5, etc. | **Stripped by API** |
| **Opus 4.5** | **Preserved by default** |

> "previous thinking blocks are automatically stripped from the context window calculation by the Claude API"

**Punkin-pi design decision:** Deliberately merge thinking into text (via squiggle tags) so model ALWAYS sees prior reasoning, regardless of which model.

---

## Files Changed

| File | What |
|------|------|
| `packages/agent/src/agent-loop.ts` | Disabled prefill |
| `packages/coding-agent/src/core/messages.ts` | Squiggle-wrap thinking, no `<assistant>` wrapper |

---

## Still TODO

1. **Empty turn guard** — detect tokens:2 stops, retry or nudge
2. **OpenRouter reasoning format** — `reasoning_effort` → `{ reasoning: { effort } }`
3. **Turn boundary TUI display** — old messages not showing separators
4. **Provider metadata phases 2-4** — from original handoff

---

## Related Docs

- `docs/handoffs/HANDOFF-provider-metadata_v2_20260303T2335NYC.md`
- `packages/ai/scripts/provider-metadata/anthropic-models.toml`
