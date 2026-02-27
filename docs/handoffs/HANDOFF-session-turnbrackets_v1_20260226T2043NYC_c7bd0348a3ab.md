# Handoff: Turn Brackets Bug + Git Triage

**Author:** Carter Schonwald  
**Date:** 2026-02-26T20:43 NYC  
**Session:** Turn bracket debugging + git staging cleanup

---

## Summary

Session covered:
1. Explored punkin-pi docs/specs architecture
2. Discovered and diagnosed turn bracket double-wrapping bug
3. Triaged git staged/unstaged changes
4. Identified fix approach (bracketId for reproducible renders)
5. Discussed missing CLI features (--dump-settings, --dump-prompt)
6. Discovered temperature not user-exposed
7. Reviewed Anthropic's extended thinking docs (adaptive thinking is new)

---

## Bug: Double-Wrapping Turn Brackets

### Symptom
Assistant messages get nested `[assistant]{` brackets that accumulate each turn.

### Root Cause
Two wrapping points:
1. `applyBracketWrap` in `packages/agent/src/agent-loop.ts` (lines 279-282) wraps new assistant response and stores wrapped content
2. `convertToLlm` in `packages/coding-agent/src/core/messages.ts` wraps ALL assistant messages when converting for LLM context

Result: Previously-wrapped messages get wrapped again → nested brackets.

### Fix Direction (Agreed)
**Store bracketId metadata on messages, use for consistent rendering.**

```typescript
interface BracketId {
  sigil: string;       // "🔋"
  nonce: string;       // "chisel-lathe-awl"
  timestamp: string;   // ISO timestamp
  endTimestamp: string;
  turn: number;
  hash: string;        // truncated sha3
}

interface AssistantMessage {
  // ... existing fields ...
  bracketId?: BracketId;
}
```

Key requirements:
- **Reproducible renders** — reloading dialog = same brackets, no shifting
- **Random at creation** — sigil/nonce generated once, stored forever
- **Storage is cheap** — store all fields, don't try to derive

### Edge Case: Empty Content
Tool-only turns (no text between tool calls) — TBD whether to bracket empty content or skip.

---

## Git State After Triage

### Staged (9 files) — Ready to Commit
| File | Purpose |
|------|---------|
| README.md | Testing docs for --print mode |
| ai/models.generated.ts | Auto-generated model updates |
| package.json | Copy hashes.toml in build scripts |
| config.ts | settings.json → settings.toml path |
| boot-sequence.md | New prompt template |
| hashes.toml | Hash registry for templates |
| loader.ts | Content-addressed template loader |
| runtime.ts | Uses loader, exports BOOT_SEQUENCE_PROMPT |
| system-prompt.ts | Uses loader import + pi→punkin rename |

**Commit message suggestion:** `feat(carter-kit): content-addressed template loader + hashes.toml`

### Unstaged (7 files) — Deferred/Needs Fix
| File | Issue |
|------|-------|
| agent-session.ts | Buggy bracket wiring — needs bracketId fix |
| session-hook.ts | Buggy wrapSimple — needs bracketId fix |
| turn-bracket.ts | Buggy wrapSimple — needs bracketId fix |
| settings-manager.ts | TOML + enableTurnBrackets (mixed concerns) |
| main.ts | Help text json→toml (minor) |
| settings-selector.ts | UI toggle for enableTurnBrackets |
| interactive-mode.ts | UI wiring for enableTurnBrackets |

---

## Missing CLI Features (Identified)

### --dump-settings
Print current resolved settings as TOML and exit.

### --dump-prompt  
Print generated system prompt as TOML-wrapped text and exit.

**Not implemented.** Carter wants both, output as TOML.

---

## Temperature/Options Gap

- `temperature` exists in `StreamOptions` (ai/types.ts)
- All providers pass it through when set
- **NOT exposed** to CLI or settings — always undefined → vendor defaults
- Same for other StreamOptions fields (except thinking level which IS wired)

---

## Anthropic Thinking Levels Update

From https://platform.claude.com/docs/en/build-with-claude/extended-thinking.md:

### Extended Thinking (Manual Mode)
```json
"thinking": {
  "type": "enabled",
  "budget_tokens": 10000
}
```

### Adaptive Thinking (NEW for Opus 4.6)
```json
"thinking": {
  "type": "adaptive"
}
```
With separate `effort` parameter.

**Manual mode is deprecated on Opus 4.6** — will be removed in future release.

punkin's ThinkingLevel abstraction (minimal/low/medium/high/xhigh) maps to budget_tokens. May need updating for adaptive thinking API.

---

## Next Steps

1. **Commit staged changes** — template loader is clean
2. **Implement bracketId** — fix the double-wrap bug properly
3. **Re-stage turn bracket files** — after bracketId fix
4. **Add --dump-settings/--dump-prompt** — TOML output
5. **Consider temperature exposure** — CLI flag + settings
6. **Review adaptive thinking** — may need API changes for Opus 4.6

---

## Files Referenced

- `packages/agent/src/agent-loop.ts` — applyBracketWrap (lines 279-282, 436-485)
- `packages/coding-agent/src/core/messages.ts` — convertToLlm, wrapAssistant
- `packages/ai/src/role-boundary.ts` — wrapAssistant function
- `packages/ai/src/types.ts` — StreamOptions, ThinkingLevel
- `packages/coding-agent/src/core/carter_kit/turn-bracket.ts` — wrapSimple
- `packages/coding-agent/src/core/carter_kit/session-hook.ts` — hook wiring
- `packages/coding-agent/src/core/agent-session.ts` — bracket toggle logic
