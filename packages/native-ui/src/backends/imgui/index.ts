/**
 * Dear ImGui Backend for Punkin Pi Native UI
 * 
 * POC implementation - renders the View tree using immediate mode ImGui.
 * This is a mock/stub implementation to establish the architecture.
 */

import type { Backend, WindowConfig, EventCallback, BackendCapabilities } from '../interface.js';
import type { View } from '../../view.js';
import type { Patch } from '../../core/reconcile.js';
import { ImGui, colors, rgba } from './bindings.js';

/**
 * Dear ImGui Backend
 */
export class ImGuiBackend implements Backend {
    readonly name = 'Dear ImGui (POC)';
    
    readonly capabilities: BackendCapabilities = {
        supportsTransparency: true,
        supportsImages: false,
        supportsRichText: false,
        supportsTabs: false,
        supportsMenuBar: true,
        nativeScrolling: true,
        maxTextureSize: 4096,
    };
    
    private onEvent?: EventCallback;
    private currentView?: View;
    private running = false;
    private windowTitle = '';
    private windowSize = { width: 1200, height: 800 };
    
    async init(config: WindowConfig, onEvent: EventCallback): Promise<void> {
        console.log(`🎃 ImGuiBackend.init("${config.title}", ${config.width}x${config.height})`);
        
        this.windowTitle = config.title;
        this.windowSize = { width: config.width, height: config.height };
        this.onEvent = onEvent;
        
        // Initialize ImGui context
        ImGui.CreateContext();
        
        // In a real implementation, this would:
        // 1. Create an OpenGL/Metal/Vulkan context
        // 2. Initialize the ImGui renderer
        // 3. Set up the platform backend (GLFW, SDL, etc.)
        
        console.log(`[ImGuiBackend] Window: "${config.title}" ${config.width}x${config.height}`);
    }
    
    render(view: View): void {
        console.log('[ImGuiBackend] render()');
        this.currentView = view;
        this.renderFrame(view);
    }
    
    applyPatch(patch: Patch): void {
        console.log('[ImGuiBackend] applyPatch()', patch.type);
        // In immediate mode, we just re-render the whole view
        if (this.currentView) {
            this.renderFrame(this.currentView);
        }
    }
    
    applyPatches(patches: readonly Patch[]): void {
        console.log(`[ImGuiBackend] applyPatches(${patches.length})`);
        for (const patch of patches) {
            this.applyPatch(patch);
        }
    }
    
    run(): void {
        console.log('[ImGuiBackend] run() - entering mock event loop');
        this.running = true;
        
        // Mock event loop for POC
        // In reality, this would be the platform's main loop
        let frameCount = 0;
        const maxFrames = 10; // Just log 10 frames for POC
        
        const mockFrame = () => {
            if (!this.running || frameCount >= maxFrames) {
                console.log('[ImGuiBackend] Ending mock event loop');
                return;
            }
            
            frameCount++;
            console.log(`\n--- Frame ${frameCount} ---`);
            
            if (this.currentView) {
                this.renderFrame(this.currentView);
            }
            
            ImGui.End();
            
            // Schedule next frame (in real impl, this is vsync-driven)
            setTimeout(mockFrame, 16); // ~60fps
        };
        
        mockFrame();
    }
    
    stop(): void {
        console.log('[ImGuiBackend] stop()');
        this.running = false;
    }
    
    shutdown(): void {
        console.log('[ImGuiBackend] shutdown()');
        this.running = false;
        ImGui.DestroyContext();
    }
    
    getWindowSize(): { width: number; height: number } {
        return this.windowSize;
    }
    
    setWindowTitle(title: string): void {
        console.log(`[ImGuiBackend] setWindowTitle("${title}")`);
        this.windowTitle = title;
    }
    
    /**
     * Render a frame using ImGui immediate mode
     */
    private renderFrame(view: View): void {
        ImGui.NewFrame();
        ImGui.Begin(this.windowTitle);
        
        this.renderView(view);
    }
    
    /**
     * Recursively render a View tree
     */
    private renderView(view: View): void {
        switch (view.tag) {
            case 'vstack': {
                // ImGui layouts are implicit, just render children
                for (const child of view.children) {
                    this.renderView(child);
                    ImGui.Separator();
                }
                break;
            }
            
            case 'hstack': {
                const first = true;
                for (const child of view.children) {
                    if (!first) ImGui.SameLine();
                    this.renderView(child);
                }
                break;
            }
            
            case 'text': {
                ImGui.Text(view.content);
                break;
            }
            
            case 'button': {
                if (ImGui.Button(view.label)) {
                    // Emit button click event
                    this.onEvent?.({
                        type: 'button-click',
                        target: view.label,
                    });
                }
                break;
            }
            
            case 'input': {
                // Would need mutable buffer in real impl
                ImGui.InputText(view.placeholder, '');
                break;
            }
            
            case 'scroll': {
                // ImGui has BeginChild for scrollable regions
                ImGui.Begin('scroll-content');
                this.renderView(view.child);
                ImGui.End();
                break;
            }
            
            case 'box': {
                // Custom rendering with background color
                const drawList = ImGui.GetBackgroundDrawList();
                // Would need actual coordinates in real impl
                drawList.addRectFilled(0, 0, 100, 100, view.fill);
                this.renderView(view.child);
                break;
            }
            
            case 'layer': {
                this.renderView(view.child);
                break;
            }
            
            case 'spacer': {
                ImGui.Text(''); // Placeholder
                break;
            }
            
            case 'sized': {
                // Size constraints would be handled by ImGui in real impl
                this.renderView(view.child);
                break;
            }
            
            default: {
                // Exhaustiveness check (TypeScript will complain if View type changes)
                const _exhaustive: never = view;
                console.warn('[ImGuiBackend] Unknown view tag:', _exhaustive);
            }
        }
    }
}

/**
 * Factory function for creating the ImGui backend
 */
export function createImGuiBackend(): Backend {
    return new ImGuiBackend();
}
