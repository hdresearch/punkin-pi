# Empty Turns & Empty Content Issues — API Flow Analysis

## Critical Findings

### 1. **ABORT with Empty Content → Empty Turn** 🔴 
**File:** `packages/ai/test/abort.test.ts:90`  
**Location:** API response generation  
```typescript
expect(abortedResponse.content.length).toBe(0);
```

**Issue:** When a turn is aborted (e.g., user cancels, signal fires), the `AssistantMessage` can have:
- `stopReason: "aborted"`
- `content: []` (empty content array)

Then in `packages/agent/src/agent-loop.ts:146`:
```typescript
if (message.stopReason === "error" || message.stopReason === "aborted") {
    stream.push({ type: "turn_end", message, toolResults: [] });
    stream.push({ type: "agent_end", messages: newMessages });
```

This creates a **valid turn event with an empty message**. The turn_end event is still emitted and persisted.

**Impact:**  
- Empty turn appears in conversation history
- Turn boundaries are created for a message with no content
- RPC clients receive turn_end with `message.content.length === 0`

---

### 2. **No Content Validation in Turn Completion** 🔴
**File:** `packages/coding-agent/src/core/agent-session.ts:460-488`

The `_injectTurnBoundaries()` function doesn't validate message content:
```typescript
private _injectTurnBoundaries(event: Extract<AgentEvent, { type: "turn_end" }>): void {
    if (!this._carterKit) return;
    
    const turnMessages = [event.message, ...event.toolResults];
    const [turnStart, turnEnd] = this._carterKit.onAssistantTurnEnd(turnMessages);
    // ^^^ No check: message.content could be []
    
    // Inject and persist regardless of content
    messages.splice(assistantIdx, 0, turnStart as unknown as AgentMessage);
    messages.push(turnEnd as unknown as AgentMessage);
    
    this.sessionManager.appendTurnBoundary(turnStart);
    this.sessionManager.appendTurnBoundary(turnEnd);
    this._emit({ type: "turn_boundary", turnStart, turnEnd });
}
```

**Issue:**
- No guard against empty `message.content`
- Turn boundaries injected even if message is empty
- Persisted to session JSONL without validation
- Event emitted for empty turn

---

### 3. **Empty Content Hash Calculation** 🟡
**File:** `packages/coding-agent/src/core/carter_kit/turn-boundary.ts:45-63`

```typescript
function sha3TruncatedTurn(messages: readonly Message[]): string {
    const content = messages
        .map((m) => {
            if (m.role === "assistant") {
                return m.content
                    .map((c) => {
                        if (c.type === "text") return c.text;
                        if (c.type === "thinking") return c.thinking;
                        if (c.type === "toolCall") return `${c.name}(${JSON.stringify(c.arguments)})`;
                        return "";
                    })
                    .join("");
            }
            // ...
        })
        .join("\n");
    
    const hash = createHash("sha3-256").update(content).digest("hex");
    return hash.slice(0, 12);
}
```

**Issue:**
- If `m.content` is `[]`, the map returns `""` (empty string)
- Hash of empty message is deterministic but meaningless
- Can't detect when turn is actually empty vs. legitimately has no text (all tool calls)

---

### 4. **RPC Mode Turn Delivery** 🟡
**File:** `packages/coding-agent/src/modes/rpc/rpc-mode.ts`

The RPC mode subscribes to all agent events including turn_end:
```typescript
session.subscribe((event) => {
    output(event);
});
```

**Issue:**
- Empty turns are output as valid JSON to RPC clients
- Clients can't distinguish between:
  - A legitimate message with only tool calls (no text)
  - An aborted message with no content
  - A streaming timeout that produced nothing

---

### 5. **History Serialization — Empty Messages Persisted** 🔴
**File:** `packages/coding-agent/src/core/agent-session.ts:485`

```typescript
this.sessionManager.appendTurnBoundary(turnStart);
this.sessionManager.appendTurnBoundary(turnEnd);
```

**Issue:**
- Empty messages are persisted to session JSONL
- When session is loaded later, empty turns reappear in history
- Could cause UI confusion (bracket with no content between)
- Takes up storage/bandwidth for no value

---

### 6. **Message Filtering Logic May Skip Empty** 🟡
**File:** `packages/coding-agent/src/core/agent-session.ts:2998`

```typescript
private _getMessages(options?: GetMessagesOptions): Message[] {
    let result = this.state.messages;
    // ...
    if (msg.stopReason === "aborted" && msg.content.length === 0) return false;
}
```

**Issue:**
- Filtering logic **assumes** empty messages only happen on abort
- Doesn't account for other ways content can be empty:
  - Network interruption mid-stream
  - Provider returns valid response with 0 content blocks (unlikely but possible)
  - Race conditions in content building

---

### 7. **Missing Validation at Turn Boundary Injection Point** 🔴
**File:** `packages/coding-agent/src/core/carter_kit/turn-boundary.ts:125-155`

```typescript
export function onTurnEnd(
    state: TurnBoundaryState,
    turnMessages: readonly Message[],
): [TurnStartMessage, TurnEndMessage] {
    // ... no validation that turnMessages contain non-empty content
    const hash = sha3TruncatedTurn(turnMessages);
    // turnMessages could be [{ role: "assistant", content: [] }, ...]
}
```

---

## API Flow Spots with Risk

### Spot A: Abort Path
```
user cancel
    ↓
abort() called
    ↓
signal aborted
    ↓
streamAssistantResponse() catches AbortSignal
    ↓
returns AssistantMessage { stopReason: "aborted", content: [], ... }
    ↓
agent-loop emits turn_end with empty message ← **EMPTY TURN GENERATED**
    ↓
agent-session._injectTurnBoundaries() 
    ↓
sessionManager.appendTurnBoundary() ← **PERSISTED**
    ↓
RPC output as event ← **SENT TO CLIENT**
```

### Spot B: Provider Error Recovery
```
provider error (rate limit, overload)
    ↓
stopReason: "error" with errorMessage
    ↓
agent-loop line 146: turn_end emitted
    ↓
_injectTurnBoundaries() (no error-message check)
    ↓
Turn boundaries injected even though message may have partial/no content ← **RISKY**
```

### Spot C: Timeout/Streaming Halt
```
stream timeout or connection drop mid-response
    ↓
AssistantMessage built with partial content so far
    ↓
stopReason: "error" or handler catches and returns partial
    ↓
Could have minimal content (e.g., only whitespace, only thinking block)
    ↓
Turn completed and persisted ← **MAY NOT BE USEFUL**
```

### Spot D: Tool-Call-Only Turns
```
LLM responds with only toolCall blocks, no text
    ↓
content: [{ type: "toolCall", ... }]
    ↓
sha3TruncatedTurn() maps toolCall → name + args string
    ↓
hash meaningful, BUT user may see empty turn (no visible text)
    ↓
RPC clients see turn with no TextContent blocks ← **CONFUSING**
```

---

## Recommendations

### Priority 1: Add Content Validation Gate
**Location:** `packages/agent/src/agent-loop.ts` around line 145

```typescript
if (message.stopReason === "error" || message.stopReason === "aborted") {
    // ← ADD: Skip turn_end if content is empty AND no tool calls
    const hasContent = 
        message.content.length > 0 && 
        message.content.some(c => c.type !== "toolCall");
    
    if (!hasContent && message.stopReason === "aborted") {
        // Log, but don't emit turn_end — this was incomplete
        console.warn("[EMPTY-TURN] Aborted turn with no content, skipping turn_end event");
        stream.push({ type: "agent_end", messages: newMessages });
        stream.end(newMessages);
        return;
    }
    
    stream.push({ type: "turn_end", message, toolResults: [] });
    // ...
}
```

### Priority 2: Flag Empty Turns in Turn Boundary
**Location:** `packages/coding-agent/src/core/carter_kit/turn-boundary.ts`

Add metadata:
```typescript
export interface TurnEndMessage {
    // ... existing fields
    /** True if message has no text/thinking content (only toolCalls or nothing) */
    isEmpty?: boolean;
}

function onTurnEnd(...) {
    const isEmpty = !turnMessages.some(m => 
        m.role === "assistant" && 
        m.content.some(c => c.type === "text" || c.type === "thinking")
    );
    
    const turnEnd: TurnEndMessage = {
        // ...
        ...(isEmpty ? { isEmpty: true } : {}),
    };
}
```

### Priority 3: Validate Before Persistence
**Location:** `packages/coding-agent/src/core/agent-session.ts:460`

```typescript
private _injectTurnBoundaries(event: Extract<AgentEvent, { type: "turn_end" }>): void {
    if (!this._carterKit) return;
    
    const message = event.message as AssistantMessage;
    
    // GUARD: Don't inject turn boundaries for empty aborted turns
    if (message.stopReason === "aborted" && message.content.length === 0) {
        console.warn("[EMPTY-TURN] Skipping boundary injection for empty aborted turn");
        return;
    }
    
    // ... rest of function
}
```

### Priority 4: RPC Client Signal
**Location:** `packages/coding-agent/src/modes/rpc/rpc-mode.ts` (event output)

Include flag so clients know:
```typescript
// When outputting turn_end events with turnEnd message
if (turnEnd.isEmpty) {
    // Send to client: "this turn had no user-visible content"
    // Clients can choose to suppress rendering
}
```

---

## Testing Gaps

1. **No test for abort → empty turn path**  
   - `abort.test.ts` checks `content.length === 0`, but doesn't verify turn_end emission

2. **No test for empty message + turn boundary injection**  
   - Need: abort, verify `_injectTurnBoundaries()` not called or skipped

3. **No test for persistence of empty turns**  
   - Load session after abort, verify empty turn not in history

4. **No test for RPC output of empty turns**  
   - Send abort via RPC, verify `turn_end` event structure

---

## Summary Table

| Spot | File | Issue | Risk | Mitigation |
|------|------|-------|------|-----------|
| **Abort w/ Empty** | agent-loop.ts:146 | turn_end emitted w/ empty content | Empty turn in history | Add content guard before turn_end |
| **No Validation** | agent-session.ts:460 | `_injectTurnBoundaries()` unchecked | Persists empty turns | Add isEmpty flag + skip logic |
| **Hash Collision** | turn-boundary.ts:45 | Empty message hashes to same value | Can't detect empty vs. minimal | Document or add isEmpty marker |
| **RPC Output** | rpc-mode.ts | All events output unfiltered | Clients see empty turns | Add metadata flag |
| **Persistence** | agent-session.ts:485 | appendTurnBoundary() on empty | Wasted storage, UI confusion | Filter before append |
| **Tool-Only Turns** | agent-loop.ts:153 | No text but has toolCalls treated as normal | User sees invisible turn | Distinguish in RPC, UI |
| **Filter Assumption** | agent-session.ts:2998 | Only aborts assumed empty | Misses edge cases | Expand condition |

