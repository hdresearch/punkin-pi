# @punkin-pi/native-ui

Declarative native UI framework with swappable backends.

## Architecture

This framework implements the [Elm Architecture](https://guide.elm-lang.org/architecture/) in TypeScript, with a clean separation between:

1. **Core** — Backend-agnostic types and runtime
2. **Backends** — Native renderers (AppKit, Qt, Web, ...)
3. **App** — Domain-specific state, messages, and views

```
┌─────────────────────────────────────────────────────┐
│  App (punkin-specific)                              │
│                                                     │
│  State    — Immutable data model                    │
│  Msg      — Sum type of all events                  │
│  update   — (State, Msg) → [State, Cmd]             │
│  view     — State → View                            │
└────────────────────┬────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────┐
│  Core (framework)                                   │
│                                                     │
│  View     — Algebraic data type (VStack, Text, ...) │
│  Cmd      — Effect descriptions                     │
│  Runtime  — Event loop, reconciliation              │
└────────────────────┬────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────┐
│  Backend (swappable)                                │
│                                                     │
│  AppKit   — Native macOS via objc bridge            │
│  Qt       — Cross-platform (planned)                │
│  Web      — Browser rendering (planned)             │
└─────────────────────────────────────────────────────┘
```

## Design Principles

### View = f(State)

Views are pure functions of state. Given the same state, you always get the same view tree. No hidden state, no side effects.

```typescript
function view(state: AppState): View {
  return vstack([
    text(`Count: ${state.count}`),
    button('Increment', 'increment'),
  ]);
}
```

### Commands are Data

Side effects are described as data, not executed immediately. The runtime interprets commands after state updates.

```typescript
function update(state: State, msg: Msg): [State, Cmd<Msg>] {
  switch (msg.tag) {
    case 'fetch-data':
      return [
        { ...state, loading: true },
        io(
          () => fetch('/api/data').then(r => r.json()),
          'data-loaded',
          'fetch-error'
        ),
      ];
    // ...
  }
}
```

### Reconciliation

The runtime diffs old and new view trees to compute minimal patches:

```
Old View Tree          New View Tree          Patches
┌─────────┐            ┌─────────┐            ┌──────────────────┐
│ VStack  │            │ VStack  │            │ UPDATE_TEXT [0]  │
│ ├ Text  │  ──diff──▶ │ ├ Text  │  ──emit──▶ │ "Count: 2"       │
│ └ Button│            │ └ Button│            └──────────────────┘
└─────────┘            └─────────┘
```

### Backend Abstraction

Backends implement a simple interface:

```typescript
interface Backend {
  init(config: WindowConfig, onEvent: EventCallback): Promise<void>;
  render(view: View): void;
  applyPatch(patch: Patch): void;
  run(): void | Promise<void>;
  stop(): void;
  shutdown(): void;
}
```

This makes the framework backend-agnostic. The AppKit backend uses the `objc` npm package to call Cocoa APIs directly.

## Usage

```typescript
import { createRuntime, punkinApp } from '@punkin-pi/native-ui';
import { createAppKitBackend } from '@punkin-pi/native-ui/appkit';

const runtime = createRuntime({
  app: punkinApp,
  backend: createAppKitBackend(),
  window: {
    title: 'Punkin',
    width: 1200,
    height: 800,
  },
});

await runtime.start();
```

## CLI

```bash
# Build
npm run build

# Run
npm start

# Run with debug logging
npm start -- --debug
```

## View DSL

```typescript
// Containers
vstack([...children], { spacing: 8 })
hstack([...children], { spacing: 8 })
splitView(left, right, { direction: 'horizontal' })
scrollView(child)

// Content
text('Hello', { style: { fontSize: 14 } })
textEditor(content, { onInput: 'input/changed' })
button('Click me', 'button/clicked')

// Utilities
when(condition, view)        // Conditional rendering
each(items, item => view)    // List rendering
spacer()                     // Flexible space
empty()                      // Nothing
```

## Project Structure

```
src/
├── core/
│   ├── types.ts       # View, Cmd, App types
│   ├── view.ts        # View DSL smart constructors
│   ├── reconcile.ts   # Diff algorithm
│   └── runtime.ts     # Event loop
├── backends/
│   ├── interface.ts   # Backend protocol
│   └── appkit/
│       ├── bindings.ts  # objc FFI
│       ├── widgets.ts   # View → NSView
│       └── index.ts     # Backend implementation
├── app/
│   ├── state.ts       # Punkin state type
│   ├── messages.ts    # Msg sum type
│   ├── update.ts      # State transitions
│   ├── view.ts        # UI rendering
│   └── index.ts       # App definition
├── index.ts           # Public API
└── main.ts            # CLI entry point
```

## Future Work

- [ ] Qt backend for Linux/Windows
- [ ] Web backend (reuse existing web-ui components)
- [ ] Keyboard navigation and focus management
- [ ] Accessibility (NSAccessibility integration)
- [ ] Native menus
- [ ] Drag and drop
- [ ] Agent IPC protocol integration

## License

MIT
