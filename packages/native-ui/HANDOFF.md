# Native UI Handoff Document

**Date:** 2026-03-02  
**Author:** Carter Schonwald  
**Session:** native-ui architecture + layout debugging

---

## What Was Built

A native macOS GUI for punkin-pi using koffi FFI to call AppKit directly. No Electron, no Tauri, no web wrappers.

### Architecture

```
demo.ts          Pure app code - builds View tree
    ↓
view.ts          Declarative View DSL (sum type + smart constructors)
    ↓
render.ts        Interpreter: View → AppKit widgets
    ↓
ffi.ts           Low-level ObjC runtime bindings via koffi
    ↓
AppKit           Native macOS framework
```

**Key insight:** View is pure data, render is effectful interpreter. Elm-style separation.

### Files

```
packages/native-ui/
├── DESIGN.md       # Architecture doc (detailed)
├── HANDOFF.md      # This file
├── demo.ts         # Working demo app
├── src/
│   ├── ffi.ts      # ObjC FFI bindings
│   ├── view.ts     # Pure View DSL
│   └── render.ts   # View → AppKit renderer
├── package.json
└── tsconfig.json
```

---

## What Works

| Feature | Status | Notes |
|---------|--------|-------|
| Window creation | ✅ | Native NSWindow with traffic lights |
| Light mode | ✅ | Forced via NSAppearance |
| Sidebar | ✅ | Session list with selection highlight |
| Messages | ✅ | User/Assistant cards with proper layout |
| Squiggle blocks | ✅ | Thinking content in styled boxes |
| Tool calls | ✅ | Status icons + output |
| Handles | ✅ | Compact reference display |
| Input field | ✅ | Single-line text input |
| Scroll | ✅ | Vertical scrolling in messages area |
| Legacy scrollbars | ✅ | Always-visible style |
| Type checking | ✅ | `tsc --noEmit` passes |
| bun runtime | ✅ | Native TS execution |

---

## What Doesn't Work

| Feature | Status | Issue |
|---------|--------|-------|
| splitV (resizable input) | ❌ | `setPosition:ofDividerAt:` crashes - timing issue? |
| textArea (multi-line input) | ❌ | NSTextView renders but text not visible |
| Click handlers | ❌ | Need target-action pattern via ObjC blocks |
| npm install | ✅ Fixed | Changed workspace deps from `"0.8.0.0"` to `"*"` |

---

## Key Learnings

### NSSplitView Semantics

The API is confusingly named:

| `isVertical` | Divider runs | Panes arranged | Position from |
|--------------|--------------|----------------|---------------|
| `false` | horizontally (—) | top-to-bottom | top |
| `true` | vertically (\|) | left-to-right | left |

"Vertical" refers to the **divider**, not the **pane arrangement**. A GADT would prevent this confusion.

Correct selector: `setPosition:ofDividerAt:` (not `setPosition:ofDividerAtIndex:`)

### NSStackView Distribution

```
Distribution.gravity  = 0   # Natural sizes, cluster by gravity (default)
Distribution.fill     = 1   # Stretch to fill available space
```

Use `fill` for outer layout containers, `gravity` for content that should maintain intrinsic size.

### Scroll View Constraints

For vertical-only scrolling, the document view needs:
- Width constrained to match clip view width
- Height determined by content (intrinsic)

Pinning document to clip view edges can break split view layout.

### npm Workspaces

npm uses `"*"` for workspace package versions, NOT `"workspace:*"` (that's pnpm/yarn).

---

## Running the Demo

```bash
cd /Users/carter/local_dev/dynamic_science/punkin-pi

# Type check
node_modules/typescript/bin/tsc packages/native-ui/demo.ts --noEmit \
  --esModuleInterop --moduleResolution node --target ES2022 --module ESNext --skipLibCheck

# Run
bun packages/native-ui/demo.ts
```

---

## Debugging Setup

lldb is now enabled for bun:

```bash
# Already done:
sudo DevToolsSecurity -enable
codesign -s - -f --entitlements /tmp/debug.entitlements /opt/homebrew/bin/bun

# Debug a crash:
lldb -- bun packages/native-ui/demo.ts
(lldb) run
(lldb) bt
```

Firecrawl API key is set for web searches (`$FIRECRAWL_API_KEY`).

---

## Next Steps

### Immediate

1. **Debug splitV crash** - The `setPosition:ofDividerAt:` call crashes. May need to be called after layout pass or via delegate. Search Apple docs for proper timing.

2. **Fix textArea** - NSTextView text not rendering. Check font/color settings, or try NSTextField with multiline enabled.

### Short Term

3. **Click handlers** - Need ObjC target-action. koffi supports blocks:
   ```js
   const block = koffi.block('void', ['void*'], (sender) => {
     console.log('clicked!');
   });
   ffi.send(button, 'setTarget:', block);
   ffi.send(button, 'setAction:', sel('invoke'));
   ```

4. **State management** - Elm-style update loop: State → Msg → update → new State → re-render

### Medium Term

5. **Agent IPC** - JSON protocol over stdin/stdout or Unix socket to connect GUI to punkin agent

6. **Reconciliation** - Diff old/new View trees, update only changed widgets (avoid full re-render)

---

## View DSL Reference

```typescript
// Layout
vstack(children, { spacing?, insets?, distribution? })
hstack(children, { spacing?, insets?, distribution? })
scroll(child)
layer(child, backgroundColor)
sized(child, { width?, height? })
splitV(top, bottom, dividerPos?)  // BROKEN

// Content
text(content, { size?, color?, weight?, mono?, maxWidth? })
label(content, size?, color?)
bold(content, size?, color?)
code(content, size?, color?)
input(placeholder)
textArea(placeholder, minHeight)  // BROKEN
button(label)
spacer

// Components
message(role, content, extras?)
thinking(content)
toolCall(name, status, output?)
handle(id, type, tokens, lines)
sessionItem(name, count, selected?)
card(children, { fill?, insets? })
box(child, { fill?, radius? })
```

---

## Color Palette (Light Mode)

```typescript
colors = {
  bg:         rgb(0.98, 0.98, 0.98),
  sidebar:    rgb(0.95, 0.95, 0.96),
  card:       rgb(1, 1, 1),
  cardUser:   rgb(0.93, 0.95, 1),
  input:      rgb(0.96, 0.96, 0.97),
  text:       rgb(0.1, 0.1, 0.1),
  textDim:    rgb(0.45, 0.45, 0.5),
  accent:     rgb(0.2, 0.4, 0.9),
  green:      rgb(0.15, 0.6, 0.35),
  orange:     rgb(0.9, 0.5, 0.1),
  cyan:       rgb(0.1, 0.6, 0.7),
}
```

---

## Screenshots

Working state (8:32 PM):
- Sidebar with sessions
- User/Assistant messages
- Squiggle blocks
- Input field at bottom

See: `/Users/carter/Documents/Local_Screenshots/Screenshot 2026-03-02 at 8.32.12 PM.png`
