#!/usr/bin/env bun
/**
 * Punkin Pi — Native macOS Demo
 * 
 * Clean version: View is pure data, render interprets it.
 */

import {
  vstack, hstack, scroll, layer, sized, vibrancy,
  label, bold, code, text,
  input, button, spacer,
  message, thinking, toolCall, handle, sessionItem,
  colors, rgb,
} from './src/view.js';

import { runApp } from './src/render.js';

// ============================================================================
// Build the UI — pure data, no effects
// ============================================================================

const sidebar = vibrancy(
  vstack([
    // Header — sits below traffic lights
    hstack([bold('Sessions', 14), spacer, button('+')], { 
      insets: { top: 54, left: 16, bottom: 12, right: 16 } 
    }),
    
    // Session list
    scroll(
      vstack([
        sessionItem('native-ui work', 24, true),
        sessionItem('architecture review', 18, false),
        sessionItem('handle semantics', 7, false),
        sessionItem('tool interface', 12, false),
        sessionItem('context DSL', 9, false),
      ], { spacing: 4, insets: { top: 8, left: 8, bottom: 8, right: 8 } })
    ),
    
    // Status — pinned to bottom
    hstack([
      label('●', 10, colors.green),
      label('claude-3-5-sonnet', 11, colors.textDim),
    ], { spacing: 6, insets: { top: 12, left: 16, bottom: 20, right: 16 } }),
  ], { spacing: 0 }),
  7  // NSVisualEffectMaterialSidebar
);

const conversation = vstack([
  message('user', 'Can you help me understand the punkin-pi architecture?'),
  
  message('assistant',
    "I'd be happy to explain! Punkin Pi has a clean separation of concerns:\n\n" +
    "• Agent — The brain: LLM calls, tool execution, context management\n" +
    "• GUI App — Pure logic: State, Msg, update, view (no effects)\n" +
    "• GUI Driver — Native rendering: AppKit via koffi\n\n" +
    "The key insight is keeping the core pure while isolating effects in the shell.",
    [thinking('Carter wants architecture overview.\nFocus on separation of pure/effectful.\nUse the three-layer model.')]
  ),
  
  message('user', 'Show me the project structure'),
  
  message('assistant', "Here's the current layout:", [
    toolCall('bash', 'complete',
      'punkin-pi/\n├── packages/\n│   ├── agent/       # Agent runtime\n│   ├── ai/          # LLM providers\n│   ├── coding-agent/ # CLI tool\n│   ├── native-ui/   # ← This GUI\n│   └── tui/         # Terminal UI lib\n├── specs/           # Design docs\n└── docs/'
    ),
    handle('§h42', 'directory listing', 847, 52),
  ]),
  
  message('user', "What's the type of the update function?"),
  
  message('assistant',
    'The update function is the heart of the Elm architecture:\n\n' +
    '  update : State → Msg → (State × Cmd Msg)\n\n' +
    "It's pure — given the same state and message, you always get the same result. " +
    'The Cmd describes effects to perform; the runtime interprets them.',
    [thinking('Type theory question.\nGive precise signature.\nExplain Cmd is description, not execution.')]
  ),
], { spacing: 16, insets: { top: 54, left: 24, bottom: 20, right: 24 } });

const inputArea = layer(
  hstack([
    input('Type a message...'),
    button('↑'),
  ], { spacing: 10, insets: { top: 14, left: 20, bottom: 14, right: 20 } }),
  colors.input
);

// Simple vstack with fill distribution - scroll expands, input stays at natural size
const content = vstack([
  scroll(conversation),
  inputArea,
], { spacing: 0, distribution: 'fill' });

const ui = hstack([sized(sidebar, { width: 220 }), content], { spacing: 0, distribution: 'fill' });

// ============================================================================
// Run — the only effectful part
// ============================================================================

console.log('🎃 Punkin Pi — Native macOS UI');
runApp('Punkin Pi', 1150, 720, ui);
