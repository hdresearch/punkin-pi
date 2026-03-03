#!/usr/bin/env node
/**
 * Fancy dead UI demo - Punkin Pi native macOS
 * Pure eye candy, no agent connection
 */

import koffi from 'koffi';

// ============================================================================
// Error handling
// ============================================================================

process.on('uncaughtException', (err) => {
  console.error('\n💥 Uncaught Exception:');
  console.error(err.stack || err);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('\n💥 Unhandled Rejection:', reason);
  process.exit(1);
});

// ============================================================================
// FFI Setup
// ============================================================================

const libobjc = koffi.load('/usr/lib/libobjc.A.dylib');
koffi.load('/System/Library/Frameworks/AppKit.framework/AppKit');

const CGFloat = 'double';
const CGPoint = koffi.struct('CGPoint', { x: CGFloat, y: CGFloat });
const CGSize = koffi.struct('CGSize', { width: CGFloat, height: CGFloat });
const CGRect = koffi.struct('CGRect', { origin: CGPoint, size: CGSize });
const NSEdgeInsets = koffi.struct('NSEdgeInsets', { top: CGFloat, left: CGFloat, bottom: CGFloat, right: CGFloat });

const objc_getClass = libobjc.func('objc_getClass', 'void*', ['string']);
const sel_registerName = libobjc.func('sel_registerName', 'void*', ['string']);

// Message variants
const msg = libobjc.func('objc_msgSend', 'void*', ['void*', 'void*']);
const msg_bool = libobjc.func('objc_msgSend', 'void', ['void*', 'void*', 'int8']);
const msg_int = libobjc.func('objc_msgSend', 'void*', ['void*', 'void*', 'int64']);
const msg_uint = libobjc.func('objc_msgSend', 'void*', ['void*', 'void*', 'uint64']);
const msg_double = libobjc.func('objc_msgSend', 'void*', ['void*', 'void*', 'double']);
const msg_id = libobjc.func('objc_msgSend', 'void*', ['void*', 'void*', 'void*']);
const msg_str = libobjc.func('objc_msgSend', 'void*', ['void*', 'void*', 'string']);
const msg_2id = libobjc.func('objc_msgSend', 'void*', ['void*', 'void*', 'void*', 'void*']);
const msg_rect = libobjc.func('objc_msgSend', 'void*', ['void*', 'void*', CGRect]);
const msg_insets = libobjc.func('objc_msgSend', 'void', ['void*', 'void*', NSEdgeInsets]);
const msg_size = libobjc.func('objc_msgSend', 'void', ['void*', 'void*', CGSize]);
const msg_rect_3int = libobjc.func('objc_msgSend', 'void*', ['void*', 'void*', CGRect, 'uint64', 'uint64', 'int8']);
const msg_4f = libobjc.func('objc_msgSend', 'void*', ['void*', 'void*', 'double', 'double', 'double', 'double']);
const msg_2d = libobjc.func('objc_msgSend', 'void*', ['void*', 'void*', 'double', 'double']);

const sel = s => sel_registerName(s);
const cls = s => objc_getClass(s);
const nsstr = s => msg_str(cls('NSString'), sel('stringWithUTF8String:'), s);
const alloc = c => msg(cls(c), sel('alloc'));
const init = o => msg(o, sel('init'));

// ============================================================================
// Colors - Dark theme
// ============================================================================

const rgb = (r, g, b) => msg_4f(cls('NSColor'), sel('colorWithRed:green:blue:alpha:'), r, g, b, 1);
const rgba = (r, g, b, a) => msg_4f(cls('NSColor'), sel('colorWithRed:green:blue:alpha:'), r, g, b, a);

const C = {
  bg:           rgb(0.08, 0.08, 0.09),
  bgSidebar:    rgb(0.10, 0.10, 0.11),
  bgMessage:    rgb(0.12, 0.12, 0.13),
  bgUser:       rgb(0.15, 0.15, 0.17),
  bgInput:      rgb(0.14, 0.14, 0.15),
  bgThinking:   rgb(0.10, 0.10, 0.12),
  bgTool:       rgb(0.09, 0.11, 0.13),
  bgHandle:     rgb(0.08, 0.12, 0.15),
  
  text:         rgb(0.92, 0.92, 0.93),
  textDim:      rgb(0.55, 0.55, 0.58),
  textCode:     rgb(0.78, 0.82, 0.85),
  
  accent:       rgb(0.35, 0.55, 0.95),
  green:        rgb(0.30, 0.75, 0.45),
  orange:       rgb(0.95, 0.60, 0.20),
  purple:       rgb(0.65, 0.45, 0.90),
  red:          rgb(0.95, 0.35, 0.35),
  cyan:         rgb(0.30, 0.80, 0.85),
  
  border:       rgba(1, 1, 1, 0.08),
};

// ============================================================================
// Fonts
// ============================================================================

const font = (size) => msg_double(cls('NSFont'), sel('systemFontOfSize:'), size);
const fontBold = (size) => msg_2d(cls('NSFont'), sel('systemFontOfSize:weight:'), size, 0.7);
const fontMono = (size) => msg_2d(cls('NSFont'), sel('monospacedSystemFontOfSize:weight:'), size, 0.4);

// ============================================================================
// Helpers
// ============================================================================

function makeLabel(text, f = font(13), color = C.text) {
  const label = init(alloc('NSTextField'));
  msg_id(label, sel('setStringValue:'), nsstr(text));
  msg_bool(label, sel('setBezeled:'), 0);
  msg_bool(label, sel('setDrawsBackground:'), 0);
  msg_bool(label, sel('setEditable:'), 0);
  msg_bool(label, sel('setSelectable:'), 1);
  msg_id(label, sel('setFont:'), f);
  msg_id(label, sel('setTextColor:'), color);
  msg_bool(label, sel('setTranslatesAutoresizingMaskIntoConstraints:'), 0);
  return label;
}

function makeStack(vertical = true, spacing = 8) {
  const stack = init(alloc('NSStackView'));
  msg_int(stack, sel('setOrientation:'), vertical ? 1 : 0);
  msg_double(stack, sel('setSpacing:'), spacing);
  msg_uint(stack, sel('setAlignment:'), vertical ? 1 : 512); // leading / centerY
  msg_bool(stack, sel('setTranslatesAutoresizingMaskIntoConstraints:'), 0);
  return stack;
}

function makeBox(bg, cornerRadius = 8) {
  const box = init(alloc('NSBox'));
  msg_int(box, sel('setBoxType:'), 4); // custom
  msg_int(box, sel('setBorderType:'), 0); // none
  msg_id(box, sel('setFillColor:'), bg);
  msg_double(box, sel('setCornerRadius:'), cornerRadius);
  msg_bool(box, sel('setTranslatesAutoresizingMaskIntoConstraints:'), 0);
  return box;
}

function makeScroll() {
  const scroll = init(alloc('NSScrollView'));
  msg_bool(scroll, sel('setHasVerticalScroller:'), 1);
  msg_bool(scroll, sel('setHasHorizontalScroller:'), 0);
  msg_int(scroll, sel('setBorderType:'), 0);
  msg_bool(scroll, sel('setDrawsBackground:'), 0);
  msg_bool(scroll, sel('setTranslatesAutoresizingMaskIntoConstraints:'), 0);
  return scroll;
}

function addSub(parent, child) {
  msg_id(parent, sel('addArrangedSubview:'), child);
}

function setInsets(stack, t, l, b, r) {
  msg_insets(stack, sel('setEdgeInsets:'), { top: t, left: l, bottom: b, right: r });
}

// ============================================================================
// UI Components
// ============================================================================

function createMessageBubble(role, content, extras = []) {
  const isUser = role === 'user';
  const box = makeBox(isUser ? C.bgUser : C.bgMessage, 10);
  
  const stack = makeStack(true, 6);
  setInsets(stack, 12, 14, 12, 14);
  
  // Role label
  const roleLabel = makeLabel(
    isUser ? 'You' : 'Assistant', 
    fontBold(11),
    isUser ? C.accent : C.green
  );
  addSub(stack, roleLabel);
  
  // Content
  const contentLabel = makeLabel(content, font(13.5), C.text);
  msg_int(contentLabel, sel('setLineBreakMode:'), 0); // word wrap
  msg_bool(contentLabel, sel('setUsesSingleLineMode:'), 0);
  msg_double(contentLabel, sel('setPreferredMaxLayoutWidth:'), 600);
  addSub(stack, contentLabel);
  
  // Extras (tool calls, handles, etc)
  for (const extra of extras) {
    addSub(stack, extra);
  }
  
  msg_id(box, sel('setContentView:'), stack);
  return box;
}

function createThinkingBlock(content) {
  const box = makeBox(C.bgThinking, 6);
  const stack = makeStack(true, 4);
  setInsets(stack, 8, 10, 8, 10);
  
  const header = makeLabel('⟨squiggle⟩', fontMono(10), C.textDim);
  addSub(stack, header);
  
  const body = makeLabel(content, fontMono(11), rgba(0.7, 0.7, 0.72, 1));
  msg_double(body, sel('setPreferredMaxLayoutWidth:'), 550);
  addSub(stack, body);
  
  msg_id(box, sel('setContentView:'), stack);
  return box;
}

function createToolCall(name, status, input, output) {
  const box = makeBox(C.bgTool, 6);
  const stack = makeStack(true, 4);
  setInsets(stack, 8, 10, 8, 10);
  
  // Header
  const hstack = makeStack(false, 6);
  const icon = status === 'complete' ? '✓' : status === 'running' ? '⟳' : '○';
  const iconColor = status === 'complete' ? C.green : status === 'error' ? C.red : C.orange;
  addSub(hstack, makeLabel(icon, font(12), iconColor));
  addSub(hstack, makeLabel(name, fontMono(12), C.orange));
  addSub(stack, hstack);
  
  // Input
  if (input) {
    addSub(stack, makeLabel(input, fontMono(10), C.textDim));
  }
  
  // Output
  if (output) {
    const outLabel = makeLabel(output, fontMono(10), C.textCode);
    msg_double(outLabel, sel('setPreferredMaxLayoutWidth:'), 500);
    addSub(stack, outLabel);
  }
  
  msg_id(box, sel('setContentView:'), stack);
  return box;
}

function createHandle(id, type, tokens, lines) {
  const box = makeBox(C.bgHandle, 6);
  const stack = makeStack(false, 8);
  setInsets(stack, 6, 10, 6, 10);
  
  addSub(stack, makeLabel(id, fontMono(11), C.cyan));
  addSub(stack, makeLabel(type, font(11), C.textDim));
  addSub(stack, makeLabel(`${tokens} tok`, fontMono(10), C.textDim));
  addSub(stack, makeLabel(`${lines} lines`, fontMono(10), C.textDim));
  addSub(stack, makeLabel('▶', font(10), C.textDim));
  
  msg_id(box, sel('setContentView:'), stack);
  return box;
}

function createSessionItem(name, count, selected) {
  const box = makeBox(selected ? C.accent : rgba(0,0,0,0), 6);
  const stack = makeStack(false, 8);
  setInsets(stack, 8, 12, 8, 12);
  
  addSub(stack, makeLabel(name, font(12), selected ? C.bg : C.text));
  
  // Spacer effect - add empty view with hugging priority
  const spacer = init(alloc('NSView'));
  msg_bool(spacer, sel('setTranslatesAutoresizingMaskIntoConstraints:'), 0);
  msg_2d(spacer, sel('setContentHuggingPriority:forOrientation:'), 250, 0);
  addSub(stack, spacer);
  
  addSub(stack, makeLabel(`${count}`, fontMono(10), selected ? rgba(0,0,0,0.5) : C.textDim));
  
  msg_id(box, sel('setContentView:'), stack);
  return box;
}

function createInputArea() {
  const box = makeBox(C.bgInput, 0);
  const stack = makeStack(false, 10);
  setInsets(stack, 14, 16, 14, 16);
  
  // Text field
  const field = init(alloc('NSTextField'));
  msg_id(field, sel('setPlaceholderString:'), nsstr('Type a message...'));
  msg_bool(field, sel('setBezeled:'), 1);
  msg_int(field, sel('setBezelStyle:'), 1);
  msg_id(field, sel('setFont:'), font(14));
  msg_id(field, sel('setTextColor:'), C.text);
  msg_id(field, sel('setBackgroundColor:'), C.bgMessage);
  msg_bool(field, sel('setTranslatesAutoresizingMaskIntoConstraints:'), 0);
  msg_2d(field, sel('setContentHuggingPriority:forOrientation:'), 250, 0);
  addSub(stack, field);
  
  // Send button
  const btn = init(alloc('NSButton'));
  msg_id(btn, sel('setTitle:'), nsstr('↑'));
  msg_int(btn, sel('setBezelStyle:'), 1);
  msg_bool(btn, sel('setTranslatesAutoresizingMaskIntoConstraints:'), 0);
  addSub(stack, btn);
  
  msg_id(box, sel('setContentView:'), stack);
  return box;
}

// ============================================================================
// Build the UI
// ============================================================================

// App + Window
const app = msg(cls('NSApplication'), sel('sharedApplication'));
msg_int(app, sel('setActivationPolicy:'), 0);

const rect = { origin: { x: 150, y: 80 }, size: { width: 1100, height: 750 } };
const win = msg_rect_3int(alloc('NSWindow'), sel('initWithContentRect:styleMask:backing:defer:'), rect, 1|2|4|8|(1<<15), 2, 0);

msg_id(win, sel('setTitle:'), nsstr('Punkin Pi'));
msg_bool(win, sel('setTitlebarAppearsTransparent:'), 1);
msg_id(win, sel('setBackgroundColor:'), C.bg);
msg_uint(win, sel('setTitleVisibility:'), 1); // hidden

// Main split: sidebar | content
const mainStack = makeStack(false, 0);

// ─────────────────────────────────────────────────────────────────
// Sidebar
// ─────────────────────────────────────────────────────────────────

const sidebar = makeStack(true, 0);
msg_bool(sidebar, sel('setWantsLayer:'), 1);
msg_id(msg(sidebar, sel('layer')), sel('setBackgroundColor:'), msg(C.bgSidebar, sel('CGColor')));

// Sidebar header
const sidebarHeader = makeStack(false, 8);
setInsets(sidebarHeader, 60, 16, 12, 16); // extra top for titlebar
addSub(sidebarHeader, makeLabel('Sessions', fontBold(13), C.text));
msg_2d(sidebarHeader, sel('setContentHuggingPriority:forOrientation:'), 250, 0);

const newBtn = init(alloc('NSButton'));
msg_id(newBtn, sel('setTitle:'), nsstr('+'));
msg_int(newBtn, sel('setBezelStyle:'), 1);
msg_bool(newBtn, sel('setTranslatesAutoresizingMaskIntoConstraints:'), 0);
addSub(sidebarHeader, newBtn);
addSub(sidebar, sidebarHeader);

// Session list
const sessionList = makeStack(true, 2);
setInsets(sessionList, 8, 8, 8, 8);
addSub(sessionList, createSessionItem('native-ui work', 24, true));
addSub(sessionList, createSessionItem('punkin architecture', 18, false));
addSub(sessionList, createSessionItem('handle semantics', 7, false));
addSub(sessionList, createSessionItem('koffi experiments', 12, false));

const sessionScroll = makeScroll();
msg_id(sessionScroll, sel('setDocumentView:'), sessionList);
addSub(sidebar, sessionScroll);

// Connection status
const statusBar = makeStack(false, 6);
setInsets(statusBar, 12, 16, 12, 16);
addSub(statusBar, makeLabel('●', font(10), C.green));
addSub(statusBar, makeLabel('Connected', font(11), C.textDim));
addSub(sidebar, statusBar);

// Sidebar width constraint
const sidebarWidth = msg_id(cls('NSLayoutConstraint'), sel('constraintWithItem:attribute:relatedBy:toItem:attribute:multiplier:constant:'),
  sidebar, 7, 0, null, 0, 1, 240);
msg_bool(sidebarWidth, sel('setActive:'), 1);

addSub(mainStack, sidebar);

// ─────────────────────────────────────────────────────────────────
// Content area
// ─────────────────────────────────────────────────────────────────

const content = makeStack(true, 0);
msg_2d(content, sel('setContentHuggingPriority:forOrientation:'), 250, 0);

// Messages scroll area
const messagesStack = makeStack(true, 16);
setInsets(messagesStack, 70, 24, 16, 24); // top padding for titlebar

// Demo messages
addSub(messagesStack, createMessageBubble('user', 
  'Can you help me understand the punkin-pi architecture?'));

addSub(messagesStack, createMessageBubble('assistant',
  "I'd be happy to explain! Punkin Pi has three main layers:\n\n" +
  "• Agent — The core brain (LLM, tools, context management)\n" +
  "• GUI App — Pure state machine (State, Msg, update, view)\n" +
  "• GUI Driver — Native rendering (AppKit via koffi)\n\n" +
  "The key insight is separating pure from effectful code.",
  [createThinkingBlock('Carter wants architecture overview.\nShould cover: Agent, GUI App, GUI Driver.\nKeep it concise but precise.')]
));

addSub(messagesStack, createMessageBubble('user',
  'Show me the project structure'));

addSub(messagesStack, createMessageBubble('assistant',
  'Here\'s the current layout:',
  [
    createToolCall('read', 'complete', 'path: "."', null),
    createHandle('§h42', 'directory listing', 847, 52),
    createToolCall('bash', 'complete', 'tree -L 2', 
      'punkin-pi/\n├── packages/\n│   ├── agent/\n│   ├── ai/\n│   ├── coding-agent/\n│   ├── native-ui/ ← you are here\n│   └── tui/\n├── specs/\n└── docs/')
  ]
));

addSub(messagesStack, createMessageBubble('user',
  'What\'s the type signature for the update function?'));

addSub(messagesStack, createMessageBubble('assistant',
  'The update function is pure:\n\n' +
  '  update : State → Msg → (State × Cmd Msg)\n\n' +
  'It takes current state and a message, returns new state plus a command describing any side effects to perform.',
  [createThinkingBlock('Type theory answer.\nShow Agda/Lean style signature.\nExplain Cmd is effect description, not execution.')]
));

const messagesScroll = makeScroll();
msg_id(messagesScroll, sel('setDocumentView:'), messagesStack);
msg_bool(messagesScroll, sel('setDrawsBackground:'), 0);
addSub(content, messagesScroll);

// Input area
addSub(content, createInputArea());

addSub(mainStack, content);

// ─────────────────────────────────────────────────────────────────
// Finalize
// ─────────────────────────────────────────────────────────────────

msg_id(win, sel('setContentView:'), mainStack);
msg_bool(win, sel('makeKeyAndOrderFront:'), 1);
msg_bool(app, sel('activateIgnoringOtherApps:'), 1);

console.log('🎃 Punkin Pi — Native UI Demo');
console.log('Press Ctrl+C to exit');

msg(app, sel('run'));
