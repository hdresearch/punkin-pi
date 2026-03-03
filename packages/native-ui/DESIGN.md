# Native UI Design Document

**Package:** `packages/native-ui/`  
**Author:** Carter Schonwald  
**Status:** Draft — architecture exploration phase

---

## 1. Goal

Build a native macOS GUI for punkin-pi that:
- Uses AppKit directly (no Electron, Tauri, web wrappers)
- Runs on Node/Bun via koffi FFI
- Separates pure logic from effectful rendering (Elm architecture)
- Eventually connects to the punkin Agent via IPC

---

## 2. Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                        demo.ts                               │
│  Pure application code: builds View tree from data           │
└─────────────────────────────────────────────────────────────┘
                              │
                              │ View (pure data)
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                        view.ts                               │
│  View DSL: type View = VStack | HStack | Text | Box | ...   │
│  Smart constructors: vstack(), label(), message(), etc.      │
│  NO effects, NO imports from ffi                             │
└─────────────────────────────────────────────────────────────┘
                              │
                              │ View
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                       render.ts                              │
│  Interpreter: View → AppKit widgets                          │
│  Creates NSView, NSTextField, NSStackView, etc.              │
│  Sets up constraints for layout                              │
└─────────────────────────────────────────────────────────────┘
                              │
                              │ FFI calls
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                         ffi.ts                               │
│  Low-level ObjC runtime bindings via koffi                   │
│  objc_msgSend variants, selectors, classes                   │
│  Typed wrappers: send(), constrain(), nsColor(), etc.        │
└─────────────────────────────────────────────────────────────┘
                              │
                              │ koffi
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                    /usr/lib/libobjc.A.dylib                  │
│                    AppKit.framework                          │
└─────────────────────────────────────────────────────────────┘
```

### 2.1 Layer Responsibilities

| Layer | Pure? | Responsibility |
|-------|-------|----------------|
| `view.ts` | ✓ Yes | Define what the UI looks like as data |
| `render.ts` | ✗ No | Interpret View data into native widgets |
| `ffi.ts` | ✗ No | Provide typed ObjC message passing |

### 2.2 Why This Split?

**Testability:** View construction is pure functions over data. Can unit test without AppKit.

**Portability:** If we wanted Linux/GTK, only `render.ts` and `ffi.ts` change. `view.ts` and app code stay the same.

**Reasoning:** Easier to think about "what should the UI be" separately from "how do we make AppKit do that".

---

## 3. View DSL

### 3.1 The View Type

```typescript
type View =
  | { tag: 'vstack'; children: View[]; spacing: number; insets: Insets }
  | { tag: 'hstack'; children: View[]; spacing: number; insets: Insets }
  | { tag: 'scroll'; child: View }
  | { tag: 'text'; content: string; style: TextStyle; maxWidth?: number }
  | { tag: 'input'; placeholder: string }
  | { tag: 'button'; label: string }
  | { tag: 'box'; child: View; fill: Color; radius: number }
  | { tag: 'spacer' }
  | { tag: 'layer'; child: View; background: Color }
  | { tag: 'sized'; child: View; width?: number; height?: number }
```

This is a **sum type** — each variant is a different kind of view. Pattern matching in `render.ts` handles each case.

### 3.2 Smart Constructors

Instead of building objects directly:
```typescript
// Verbose, error-prone
const v: View = { tag: 'vstack', children: [...], spacing: 8, insets: { top: 0, left: 0, bottom: 0, right: 0 } };
```

Use smart constructors with defaults:
```typescript
// Clean, defaults applied
const v = vstack([...], { spacing: 8 });
```

### 3.3 Higher-Level Components

Built from primitives:
```typescript
const message = (role: 'user' | 'assistant', content: string, extras: View[] = []): View =>
  card([
    bold(role === 'user' ? 'You' : 'Assistant', 11, ...),
    text(content, { size: 13.5, maxWidth: 600 }),
    ...extras,
  ], { fill: role === 'user' ? colors.cardUser : colors.card });
```

These are still pure functions returning View data.

---

## 4. The Layout Problem

### 4.1 Current State: Implicit Layout

Right now, we create NSStackView instances and hope AppKit's auto-layout figures out sizing. This doesn't work well because:

1. **No explicit constraints** — Views don't know their bounds
2. **Scroll views need sizing** — NSScrollView needs its document view constrained
3. **Flexible vs fixed** — No way to say "sidebar is 220px, content fills rest"

**Result:** Everything piles at the bottom, overlapping.

### 4.2 Desired State: Explicit Layout

Two options:

**Option A: Compute layout ourselves**
```
View → layout(View, Size) → LayoutTree → render(LayoutTree) → positioned NSViews
```

Where `LayoutTree` has concrete `{ x, y, width, height }` for every node. We implement a layout algorithm (flexbox-like). `render` just calls `setFrame:` with computed positions.

**Pros:** Full control, pure layout function, works the same everywhere.  
**Cons:** Reimplementing flexbox is non-trivial.

**Option B: Use AppKit constraints properly**
```
View → render(View) → NSViews with NSLayoutConstraints
```

We emit proper constraints during render:
- Pin edges to parent
- Set explicit widths/heights where specified
- Let NSStackView handle distribution

**Pros:** AppKit does the math, less code.  
**Cons:** Layout logic spread across render, debugging constraints is hard.

### 4.3 Current Approach

We're doing Option B (constraints) but incompletely. Need to:

1. **Pin root view to window content view** — ✓ Added `pinToParent()`
2. **Sized views emit width/height constraints** — ✓ Added `sized()` and `renderSized()`
3. **Stack views need proper distribution** — Partially working
4. **Scroll views need document constraints** — Not yet implemented

---

## 5. FFI Layer

### 5.1 The objc_msgSend Problem

Objective-C's `objc_msgSend` is variadic — different methods need different signatures. koffi requires declaring the exact signature upfront.

**Solution:** Define typed variants:
```typescript
const msg0 = libobjc.func('objc_msgSend', 'void*', ['void*', 'void*']);           // no args
const msgP = libobjc.func('objc_msgSend', 'void*', ['void*', 'void*', 'void*']);  // one pointer
const msgI = libobjc.func('objc_msgSend', 'void*', ['void*', 'void*', 'int64']);  // one int
// etc.
```

Then wrap in typed functions:
```typescript
export function send(obj: Id, selector: string, arg: Id): Id {
  return msgP(obj, sel(selector), arg);
}
```

### 5.2 Structs

AppKit uses structs like CGRect, NSEdgeInsets. koffi needs them declared:
```typescript
const CGPoint = koffi.struct('CGPoint', { x: 'double', y: 'double' });
const CGSize = koffi.struct('CGSize', { width: 'double', height: 'double' });
const CGRect = koffi.struct('CGRect', { origin: CGPoint, size: CGSize });
```

### 5.3 Constraints

NSLayoutConstraint creation requires a 7-argument method. We have a special `msg7` variant and a `constrain()` helper:
```typescript
export function constrain(
  view: Id, attr: number,
  toView: Id | null, toAttr: number,
  mult = 1, constant = 0
): Id
```

---

## 6. Current State

### 6.1 What Works

| Item | Status | Notes |
|------|--------|-------|
| `test-window.mjs` | ✓ Works | Opens native window with label, proves koffi+AppKit viable |
| `demo.ts` type-checks | ✓ Works | TypeScript catches FFI signature mismatches |
| `bun demo.ts` runs | ✓ Works | Window opens, but layout broken |
| View DSL | ✓ Works | Pure data, clean constructors |
| Render basics | ✓ Partial | Creates widgets, constraints incomplete |

### 6.2 What Doesn't Work

| Item | Status | Notes |
|------|--------|-------|
| Layout | ✗ Broken | Elements pile at bottom, overlap |
| Dark mode | ✗ Broken | Controls render in light mode |
| Scroll views | ✗ Broken | Don't scroll, content not constrained |
| npm install | ✗ Blocked | Tries to fetch workspace packages from registry |

### 6.3 Tooling Context

- **koffi:** Manually installed via `npm pack` (npm install broken)
- **TypeScript:** Available at `node_modules/typescript/bin/tsc`
- **bun:** Primary runtime for TypeScript execution (has native TS support)
- **tsx:** Installed but missing esbuild dependency

### 6.4 Key Files Modified This Session

```
packages/native-ui/
├── demo.ts              # Refactored: messy FFI → clean View DSL
├── src/
│   ├── ffi.ts           # NEW: isolated ObjC bindings
│   ├── view.ts          # NEW: pure View type + constructors  
│   └── render.ts        # NEW: View → AppKit interpreter
├── DESIGN.md            # NEW: this document
```

### 6.5 Session TODOs

- [ ] Debug why `pinToParent()` constraints aren't working
- [ ] Fix scroll view document constraints
- [ ] Verify dark mode appearance setting
- [ ] Get demo.ts rendering correctly (screenshot shows broken layout)
- [ ] Consider Option A (compute layout ourselves) vs Option B (fix constraints)

---

## 7. Known Issues (Detail)

### 7.1 Layout Not Working

**Symptom:** Elements piled at bottom, overlapping.  
**Cause:** Constraints not properly set up.  
**Status:** Added `pinToParent()`, `sized()`, needs testing.

### 7.2 Dark Mode Not Applying

**Symptom:** Native controls appear in light mode.  
**Cause:** `NSAppearance` lookup may be failing.  
**Status:** Added `setAppearance:` call, needs verification.

### 7.3 Scroll Views

**Symptom:** Scroll views don't scroll.  
**Cause:** Document view not properly constrained.  
**Status:** Not yet addressed.

### 7.4 Exception Handling

**Symptom:** ObjC exceptions crash silently.  
**Cause:** JS try/catch doesn't catch NSException.  
**Status:** Not addressed. Need ObjC exception handler wrapper.

---

## 8. File Inventory

```
packages/native-ui/
├── DESIGN.md          # This document
├── demo.ts            # Demo app using the DSL
├── src/
│   ├── ffi.ts         # Low-level ObjC bindings
│   ├── view.ts        # Pure View DSL
│   └── render.ts      # View → AppKit interpreter
├── test-window.mjs    # Minimal working test (legacy)
└── package.json
```

---

## 9. Next Steps

### 8.1 Immediate (fix the demo)

1. **Debug constraints** — Why isn't `pinToParent()` working? Add logging, inspect constraint activation.
2. **Fix scroll views** — Document view needs width constraint equal to scroll view's content width.
3. **Verify dark mode** — Check if appearance is being set correctly.

### 8.2 Short Term

4. **Add event handling** — Button clicks, text input, delegate callbacks via ObjC blocks.
5. **State management** — Elm-style State/Msg/update cycle.
6. **Reconciliation** — Diff old/new View trees, update only changed widgets.

### 8.3 Medium Term

7. **Connect to Agent** — IPC protocol (JSON over stdin/stdout or Unix socket).
8. **Real conversation UI** — Display actual agent messages, tool calls, handles.
9. **Input handling** — Send user messages to agent.

---

## 10. Open Questions

1. **Layout approach:** Should we implement layout ourselves (Option A) or continue with constraints (Option B)?

2. **State location:** Where does conversation state live? Agent owns it, GUI is thin client? Or GUI has local cache?

3. **Event model:** ObjC delegates need block callbacks. koffi supports this but it's tricky. Alternative: poll-based model?

4. **Error handling:** How do we surface ObjC exceptions to JS? Wrap every call in objc_try/objc_catch?

---

## 11. References

- [koffi documentation](https://koffi.dev/)
- [Apple NSStackView](https://developer.apple.com/documentation/appkit/nsstackview)
- [Apple Auto Layout Guide](https://developer.apple.com/library/archive/documentation/UserExperience/Conceptual/AutolayoutPG/)
- [Elm Architecture](https://guide.elm-lang.org/architecture/)
