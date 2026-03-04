/**
 * Dear ImGui FFI Bindings
 * 
 * Placeholder for imgui-node or similar binding.
 * For POC, we'll use a mock implementation that logs calls.
 */

// Mock ImGui bindings for POC
// In production, this would wrap imgui-node or similar

export interface ImGuiIO {
    displaySize: { width: number; height: number };
    deltaTime: number;
    mousePos: { x: number; y: number };
    mouseDown: boolean[];
}

export interface DrawList {
    addText(x: number, y: number, color: number, text: string): void;
    addRect(x1: number, y1: number, x2: number, y2: number, color: number, rounding?: number): void;
    addRectFilled(x1: number, y1: number, x2: number, y2: number, color: number, rounding?: number): void;
}

export const ImGui = {
    // Initialization
    CreateContext: () => {
        console.log('[ImGui] CreateContext');
    },
    
    DestroyContext: () => {
        console.log('[ImGui] DestroyContext');
    },
    
    // Frame management
    NewFrame: () => {
        console.log('[ImGui] NewFrame');
    },
    
    Render: () => {
        console.log('[ImGui] Render');
    },
    
    // Windows
    Begin: (name: string): boolean => {
        console.log(`[ImGui] Begin("${name}")`);
        return true;
    },
    
    End: () => {
        console.log('[ImGui] End');
    },
    
    // Widgets
    Text: (text: string) => {
        console.log(`[ImGui] Text("${text}")`);
    },
    
    Button: (label: string): boolean => {
        console.log(`[ImGui] Button("${label}")`);
        return false;
    },
    
    InputText: (label: string, buffer: string): boolean => {
        console.log(`[ImGui] InputText("${label}")`);
        return false;
    },
    
    // Layout
    Separator: () => {
        console.log('[ImGui] Separator');
    },
    
    SameLine: () => {
        console.log('[ImGui] SameLine');
    },
    
    // Styling
    PushStyleColor: (idx: number, color: number) => {
        console.log(`[ImGui] PushStyleColor(${idx}, ${color})`);
    },
    
    PopStyleColor: (count?: number) => {
        console.log(`[ImGui] PopStyleColor(${count ?? 1})`);
    },
    
    // Get draw list for custom rendering
    GetBackgroundDrawList: (): DrawList => {
        console.log('[ImGui] GetBackgroundDrawList');
        return {
            addText: (x, y, color, text) => console.log(`  addText(${x}, ${y}, ${color}, "${text}")`),
            addRect: (x1, y1, x2, y2, color, r) => console.log(`  addRect(${x1}, ${y1}, ${x2}, ${y2}, ${color}, ${r})`),
            addRectFilled: (x1, y1, x2, y2, color, r) => console.log(`  addRectFilled(${x1}, ${y1}, ${x2}, ${y2}, ${color}, ${r})`),
        };
    },
};

// Color helpers
export function rgba(r: number, g: number, b: number, a: number): number {
    // Pack as 32-bit integer (ABGR format for ImGui)
    return ((a << 24) | (b << 16) | (g << 8) | r) >>> 0;
}

export const colors = {
    white: rgba(255, 255, 255, 255),
    black: rgba(0, 0, 0, 255),
    red: rgba(255, 0, 0, 255),
    green: rgba(0, 255, 0, 255),
    blue: rgba(0, 0, 255, 255),
    transparent: rgba(0, 0, 0, 0),
};
