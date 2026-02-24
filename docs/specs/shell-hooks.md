# Shell Hooks and Turn Injection

**Author:** Carter Schonwald  
**Date:** 2026-02-22  
**Status:** Design spec  
**Depends on:** Extension system (`extensions/types.ts`)

## Overview

Two related features:

1. **Shell hooks** — config-driven scripts that run on lifecycle events (no code required)
2. **Turn injection** — hooks that can inject content into context mid-turn

Both use TOML config. Shell hooks are the simple case (fire-and-forget scripts). Turn injection is the richer case (bidirectional communication).

---

## Part 1: Shell Hooks

### Config Location

```
~/.punkin/hooks.toml           # global hooks
.punkin/hooks.toml             # project hooks (override/extend global)
```

### Format

```toml
# ~/.punkin/hooks.toml

[hooks]
# Simple form: event = script path
session_start = "~/.punkin/hooks/on_session_start.sh"
session_shutdown = "~/.punkin/hooks/on_session_end.sh"

# Extended form: event = { ... }
[hooks.turn_end]
command = "~/.punkin/hooks/on_turn_end.sh"
timeout = 5000          # ms, default 30000
async = true            # don't block agent loop, default false
env = { HOOK_DEBUG = "1" }

[hooks.before_commit]
command = "~/.punkin/hooks/pre_commit.sh"
timeout = 10000
# async = false (default) — blocks until complete
```

### Available Events

| Event | When | Can Block | Env Vars Passed |
|-------|------|-----------|-----------------|
| `session_start` | Session begins | No | `SESSION_ID`, `CWD` |
| `session_shutdown` | Session ends | No | `SESSION_ID`, `CWD` |
| `turn_start` | Before LLM call | Yes | `TURN_INDEX`, `SESSION_ID` |
| `turn_end` | After LLM response | Yes | `TURN_INDEX`, `SESSION_ID`, `TOOL_COUNT` |
| `before_tool` | Before tool executes | Yes | `TOOL_NAME`, `TOOL_CALL_ID` |
| `after_tool` | After tool completes | Yes | `TOOL_NAME`, `TOOL_CALL_ID`, `IS_ERROR` |
| `before_commit` | Before git commit | Yes | `COMMIT_MSG`, `FILES` |
| `before_compact` | Before context compaction | Yes | `TOKEN_COUNT`, `ENTRY_COUNT` |
| `context_pressure` | Context > threshold | No | `USAGE_PERCENT`, `TOKEN_COUNT` |

### Blocking Behavior

- **Blocking hooks** (`async = false`): Agent waits for script to complete. Non-zero exit = abort operation.
- **Async hooks** (`async = true`): Fire and forget. Exit code ignored.

### Script Environment

Scripts receive context via environment variables:

```bash
#!/bin/bash
# ~/.punkin/hooks/on_turn_end.sh

echo "Turn $TURN_INDEX completed" >> ~/.punkin/hook.log
echo "Tools called: $TOOL_COUNT" >> ~/.punkin/hook.log

# Access more context via stdin (JSON)
# Only if hook config has `stdin = true`
```

### stdin Protocol

For hooks that need richer context:

```toml
[hooks.turn_end]
command = "~/.punkin/hooks/analyze_turn.py"
stdin = true   # pass event data as JSON to stdin
```

Script receives:
```json
{
  "event": "turn_end",
  "turnIndex": 5,
  "sessionId": "abc123",
  "message": { ... },
  "toolResults": [ ... ]
}
```

### Project Hooks

Project hooks in `.punkin/hooks.toml` extend global hooks:

```toml
# .punkin/hooks.toml (project)

[hooks]
# Add project-specific hook
before_commit = "./scripts/lint-staged.sh"

# Override global hook for this project
turn_end = "./scripts/project_turn_end.sh"
```

Merge behavior:
- Same event in project overrides global
- Different events combine

---

## Part 2: Turn Injection

Shell hooks are one-way (agent → script). Turn injection is two-way (script → agent context).

### Use Cases

1. **Pressure warnings** — inject "context at 80%, be concise" into system prompt
2. **Handle summaries** — inject handle previews at turn start
3. **External triggers** — file watcher injects "tests failed" mid-session
4. **Subagent results** — inject completed subagent output into context

### Injection Points

| Point | When | What Can Be Injected |
|-------|------|---------------------|
| `before_turn` | Before LLM call | System prompt additions, user message prefix |
| `after_tool_batch` | After parallel tools complete | Assistant message suffix, user message |
| `context` | Any time (via extension) | Modify full message array |

### Config

```toml
# Turn injection via shell script

[inject.before_turn]
command = "~/.punkin/hooks/inject_pressure.sh"
timeout = 1000
# Script stdout becomes injection content

[inject.after_tool_batch]
command = "~/.punkin/hooks/inject_handles.sh"
timeout = 1000
```

### Script Protocol

Injection scripts output JSON to stdout:

```bash
#!/bin/bash
# ~/.punkin/hooks/inject_pressure.sh

# Receives context on stdin (if stdin = true)
USAGE=$(echo "$CONTEXT_USAGE_PERCENT" | bc)

if [ "$USAGE" -gt 80 ]; then
  cat << 'EOF'
{
  "inject": "system_suffix",
  "content": "\n\n<context_pressure>Usage at 85%. Be concise. Use handles.</context_pressure>"
}
EOF
fi
```

### Injection Types

```typescript
type Injection =
  | { inject: "system_suffix"; content: string }      // append to system prompt
  | { inject: "system_prefix"; content: string }      // prepend to system prompt
  | { inject: "user_prefix"; content: string }        // prepend to next user message
  | { inject: "user_suffix"; content: string }        // append to next user message
  | { inject: "assistant_continue"; content: string } // continue assistant message
  | { inject: "message"; role: "user" | "assistant"; content: string } // insert message
```

### Extension API (Programmatic)

For TypeScript extensions, injection is via return value:

```typescript
pi.on("before_turn", async (event, ctx) => {
  if (ctx.contextUsage > 0.8) {
    return {
      inject: [{
        type: "system_suffix",
        content: "<context_pressure>...</context_pressure>"
      }]
    };
  }
});

pi.on("after_tool_batch", async (event, ctx) => {
  const handles = ctx.pendingHandles;
  if (handles.length > 0) {
    return {
      inject: [{
        type: "user_suffix", 
        content: formatHandleSummaries(handles)
      }]
    };
  }
});
```

---

## Part 3: New Events Needed

### `before_turn`

Fires before each LLM call. Can inject content.

```typescript
interface BeforeTurnEvent {
  type: "before_turn";
  turnIndex: number;
  messages: AgentMessage[];       // read-only snapshot
  contextUsage: number;           // 0.0 - 1.0
  pendingHandles: HandleSummary[]; // unresolved handles
}

interface BeforeTurnResult {
  inject?: Injection[];
  abort?: { reason: string };     // cancel turn
}
```

### `after_tool_batch`

Fires after all parallel tool calls complete, before next LLM call.

```typescript
interface AfterToolBatchEvent {
  type: "after_tool_batch";
  turnIndex: number;
  toolResults: ToolResultMessage[];
  batchIndex: number;             // which batch (turn can have multiple)
}

interface AfterToolBatchResult {
  inject?: Injection[];
}
```

### `before_commit`

Fires before git commit (if agent is committing).

```typescript
interface BeforeCommitEvent {
  type: "before_commit";
  message: string;
  files: string[];
  diff: string;
}

interface BeforeCommitResult {
  abort?: { reason: string };
  modifyMessage?: string;         // rewrite commit message
}
```

### `context_pressure`

Fires when context usage crosses threshold.

```typescript
interface ContextPressureEvent {
  type: "context_pressure";
  usage: number;                  // 0.0 - 1.0
  tokenCount: number;
  threshold: number;              // which threshold was crossed
}

// Thresholds: 0.6, 0.8, 0.9 (configurable)
```

---

## Part 4: Implementation

### HooksManager

New component that:
1. Loads `hooks.toml` (global + project)
2. Registers shell scripts as event handlers
3. Manages subprocess lifecycle
4. Parses injection responses

```typescript
// packages/coding-agent/src/core/hooks-manager.ts

interface HookConfig {
  command: string;
  timeout?: number;      // default 30000
  async?: boolean;       // default false
  stdin?: boolean;       // default false
  env?: Record<string, string>;
}

interface InjectHookConfig extends HookConfig {
  // injection hooks always have stdin = true
}

interface HooksConfig {
  hooks?: Record<string, string | HookConfig>;
  inject?: Record<string, InjectHookConfig>;
}

class HooksManager {
  constructor(globalPath: string, projectPath: string);
  
  // Register with extension system
  register(extensionRunner: ExtensionRunner): void;
  
  // Execute a hook (called by event handler)
  private executeHook(name: string, event: unknown): Promise<void>;
  
  // Execute injection hook, parse response
  private executeInjection(name: string, event: unknown): Promise<Injection[]>;
}
```

### TOML Parser

Use `@iarna/toml` (already common in Node ecosystem) or `smol-toml`.

```typescript
import { parse } from "smol-toml";

function loadHooksConfig(path: string): HooksConfig {
  const content = readFileSync(path, "utf-8");
  return parse(content) as HooksConfig;
}
```

### Wiring

In `AgentSession`:

```typescript
// In constructor or init
this._hooksManager = new HooksManager(
  join(getAgentDir(), "hooks.toml"),
  join(this.cwd, CONFIG_DIR_NAME, "hooks.toml")
);
this._hooksManager.register(this._extensionRunner);
```

---

## Part 5: Interaction with DCP

### Handle Injection

DCP interceptor stores tool results as handles. At turn start, inject summaries:

```typescript
pi.on("before_turn", async (event, ctx) => {
  const dcpHook = ctx.dcp;  // DCP session hook
  const handles = dcpHook.getActiveHandles();
  
  if (handles.length > 0) {
    return {
      inject: [{
        type: "system_suffix",
        content: formatHandleTable(handles)
      }]
    };
  }
});
```

### Pressure Injection

DCP tracks context usage. Inject warnings:

```typescript
pi.on("before_turn", async (event, ctx) => {
  const usage = ctx.contextUsage;
  
  if (usage > 0.8) {
    return {
      inject: [{
        type: "system_suffix",
        content: `<dcp_pressure level="${Math.floor(usage * 100)}%">` +
                 `Context pressure high. Prefer handle_* tools over full reads. ` +
                 `Be concise.</dcp_pressure>`
      }]
    };
  }
});
```

---

## Part 6: Claude Code Comparison

Claude Code hooks (for reference):

| Claude Code | Our Equivalent |
|-------------|----------------|
| `PreToolExecution` | `before_tool` / `tool_call` |
| `PostToolExecution` | `after_tool` / `tool_result` |
| `Notification` | `context_pressure`, custom events |
| `Stop` | `agent_end` |

We add:
- `before_turn` / `after_tool_batch` (injection points)
- `before_commit` (git-specific)
- `session_*` events (lifecycle)

---

## Open Questions

1. **Hook ordering** — if multiple hooks for same event, run in parallel or sequence?

2. **Error handling** — if injection script fails, skip injection or abort turn?

3. **Hook discovery** — auto-discover `~/.punkin/hooks/*.sh` or require explicit config?

4. **Injection validation** — validate injection JSON schema before applying?

5. **Hook debugging** — how to debug hooks? Log output? Dry-run mode?

---

## MVP Scope

Phase 1:
- [ ] TOML config loading (`hooks.toml`)
- [ ] `HooksManager` with subprocess execution
- [ ] Wire to existing events: `session_start`, `session_shutdown`, `turn_end`
- [ ] Basic env var passing

Phase 2:
- [ ] `before_turn` event with injection support
- [ ] `after_tool_batch` event
- [ ] Injection parsing and application

Phase 3:
- [ ] `before_commit` event
- [ ] `context_pressure` event
- [ ] stdin protocol for rich context

Phase 4:
- [ ] Project hooks merging
- [ ] Hook timeout/async handling
- [ ] Error reporting UI

---

*This spec covers both fire-and-forget shell hooks and bidirectional injection hooks. Implementation requires TOML parsing, subprocess management, and new extension events.*
