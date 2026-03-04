#!/usr/bin/env bun
/**
 * Punkin Pi — Dear ImGui POC Demo
 * 
 * Minimal demo showing the ImGui backend architecture.
 * This is a proof-of-concept, not a full implementation.
 */

import { vstack, hstack, text, button, input, scroll, layer, sized } from './src/view.js';
import { createImGuiBackend } from './src/backends/imgui/index.js';

// ============================================================================
// Build the UI — pure data
// ============================================================================

const demoUI = vstack([
    text('🎃 Punkin Pi — Dear ImGui POC', { style: { fontSize: 18, weight: 'bold' } }),
    text('This is a proof-of-concept ImGui backend.'),
    text(''),
    text('Features:'),
    text('  • Immediate mode rendering'),
    text('  • Backend interface compliance'),
    text('  • Mock ImGui bindings (POC only)'),
    text(''),
    text('To use real ImGui:'),
    text('  1. Install imgui-node or similar'),
    text('  2. Implement OpenGL/Metal context'),
    text('  3. Replace mock bindings with real FFI'),
    text(''),
    hstack([
        button('Button 1', 'btn1'),
        button('Button 2', 'btn2'),
        button('Button 3', 'btn3'),
    ], { spacing: 10 }),
    text(''),
    input('Type here...', 'input-change'),
], { spacing: 8, insets: { top: 20, left: 20, bottom: 20, right: 20 } });

// ============================================================================
// Run with ImGui backend
// ============================================================================

async function main() {
    console.log('🚀 Starting Dear ImGui POC Demo...\n');
    
    const backend = createImGuiBackend();
    
    await backend.init(
        {
            title: 'Punkin Pi - ImGui POC',
            width: 800,
            height: 600,
        },
        (event) => {
            console.log('📩 Event received:', event);
        }
    );
    
    console.log('\n📦 Rendering initial view...\n');
    backend.render(demoUI);
    
    console.log('\n🔄 Starting event loop (10 frames mock)...\n');
    backend.run();
    
    // Clean up after demo
    setTimeout(() => {
        console.log('\n✅ Demo complete');
        backend.shutdown();
    }, 200);
}

main().catch(console.error);
