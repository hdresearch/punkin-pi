# Dear ImGui Backend (POC)

**Status:** Proof-of-Concept / Architecture Stub

This backend renders the Punkin Pi View tree using Dear ImGui's immediate mode paradigm.

## Architecture

```
┌─────────────────────────────────────────┐
│  App (punkin-specific)                  │
│  State → Msg → update → view → View     │
└────────────────────┬────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────┐
│  Core (framework)                       │
│  View type, reconciliation, runtime     │
└────────────────────┬────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────┐
│  ImGui Backend (this package)           │
│                                         │
│  ┌─────────────────────────────────┐   │
│  │  View → ImGui widget calls      │   │
│  │  (retained → immediate mode)    │   │
│  └─────────────────────────────────┘   │
│                                         │
│  ┌─────────────────────────────────┐   │
│  │  Mock ImGui bindings (POC)      │   │
│  │  → Replace with imgui-node      │   │
│  └─────────────────────────────────┘   │
└────────────────────┬────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────┐
│  Dear ImGui + Platform Backend          │
│  (GLFW/SDL + OpenGL/Metal/Vulkan)       │
└─────────────────────────────────────────┘
```

## Current State

**What works:**
- ✓ Backend interface implementation
- ✓ View tree traversal
- ✓ Mock ImGui bindings for POC
- ✓ Event callback structure

**What's missing:**
- ✗ Real ImGui integration (needs `imgui-node` or similar)
- ✗ Platform backend (GLFW, SDL, etc.)
- ✗ Graphics context (OpenGL, Metal, Vulkan)
- ✗ Actual rendering to screen
- ✗ Real input handling

## To Make This Real

### 1. Install ImGui Binding

Options:
- [`imgui-node`](https://github.com/fhanssen/imgui-node) - Node.js binding
- [`@mori2003/jsimgui`](https://npm.im/@mori2003/jsimgui) - WASM-based (v0.13.0)
- [`@zhobo63/imgui-ts`](https://npm.im/@zhobo63/imgui-ts) - TypeScript wrapper

```bash
npm install imgui-node
# or
npm install @mori2003/jsimgui
```

### 2. Set Up Platform Backend

Choose one:
- **GLFW** - Cross-platform, widely used with ImGui
- **SDL2** - Good alternative, simpler API
- **Native** - Direct Cocoa (macOS), Win32 (Windows), X11/Wayland (Linux)

### 3. Graphics Context

ImGui needs a graphics API:
- **OpenGL 3.3+** - Most common, cross-platform
- **Metal** - macOS/iOS native
- **Vulkan** - Modern, cross-platform (more complex)
- **DirectX 11/12** - Windows

### 4. Replace Mock Bindings

Update `bindings.ts` to wrap the real ImGui library:

```typescript
import imgui from 'imgui-node';

export const ImGui = {
    CreateContext: () => imgui.createContext(),
    DestroyContext: () => imgui.destroyContext(),
    NewFrame: () => imgui.newFrame(),
    // ... etc
};
```

### 5. Implement Event Loop

The mock `run()` just logs frames. Real implementation:

```typescript
run(): void {
    while (!this.shouldClose) {
        // Poll platform events
        platform.pollEvents();
        
        // Start ImGui frame
        ImGui.NewFrame();
        
        // Render view tree
        if (this.currentView) {
            this.renderView(this.currentView);
        }
        
        // Render ImGui
        ImGui.Render();
        platform.render();
    }
}
```

## Usage (POC)

```typescript
import { createImGuiBackend } from '@punkin-pi/native-ui/imgui';

const backend = createImGuiBackend();

await backend.init(
    { title: 'My App', width: 1200, height: 800 },
    (event) => console.log('Event:', event)
);

backend.render(myViewTree);
backend.run();
```

## Comparison: AppKit vs ImGui

| Aspect | AppKit Backend | ImGui Backend |
|--------|----------------|---------------|
| Mode | Retained | Immediate |
| Reconciliation | Diff + patch | Re-render all |
| Performance | Efficient updates | GPU-accelerated |
| Look & Feel | Native macOS | ImGui style |
| Customization | Limited | Full control |
| Platform | macOS only | Cross-platform |

## Files

```
src/backends/imgui/
├── README.md       # This file
├── index.ts        # Backend implementation
├── bindings.ts     # ImGui FFI (mock for POC)
└── widgets.ts      # View → ImGui mapping (future)
```

## Next Steps

1. **Pick an ImGui binding** - Test `imgui-node` vs `jsimgui`
2. **Set up graphics context** - Start with OpenGL + GLFW
3. **Replace mock bindings** - Wire up real ImGui calls
4. **Test rendering** - Verify View tree renders correctly
5. **Add event handling** - Mouse, keyboard, focus
6. **Style theming** - Match punkin-pi aesthetic

## References

- [Dear ImGui](https://github.com/ocornut/imgui)
- [imgui-node](https://github.com/fhanssen/imgui-node)
- [GLFW](https://www.glfw.org/)
- [ImGui + OpenGL3 example](https://github.com/ocornut/imgui/tree/master/examples/example_gl3_opengl3)
