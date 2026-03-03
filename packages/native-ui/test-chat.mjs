#!/usr/bin/env node
/**
 * Native macOS chat UI with koffi + AppKit
 * Dark theme, clean look
 */

import koffi from 'koffi';

// ============================================================================
// Setup
// ============================================================================

const libobjc = koffi.load('/usr/lib/libobjc.A.dylib');
koffi.load('/System/Library/Frameworks/AppKit.framework/AppKit');

const CGFloat = 'double';
const CGPoint = koffi.struct('CGPoint', { x: CGFloat, y: CGFloat });
const CGSize = koffi.struct('CGSize', { width: CGFloat, height: CGFloat });
const CGRect = koffi.struct('CGRect', { origin: CGPoint, size: CGSize });

const objc_getClass = libobjc.func('objc_getClass', 'void*', ['string']);
const sel_registerName = libobjc.func('sel_registerName', 'void*', ['string']);

// Message send variants
const msg = libobjc.func('objc_msgSend', 'void*', ['void*', 'void*']);
const msg_rect = libobjc.func('objc_msgSend', CGRect, ['void*', 'void*']);
const msg_int = libobjc.func('objc_msgSend', 'void*', ['void*', 'void*', 'int64']);
const msg_uint = libobjc.func('objc_msgSend', 'void*', ['void*', 'void*', 'uint64']);
const msg_double = libobjc.func('objc_msgSend', 'void*', ['void*', 'void*', 'double']);
const msg_bool = libobjc.func('objc_msgSend', 'void', ['void*', 'void*', 'int8']);
const msg_id = libobjc.func('objc_msgSend', 'void', ['void*', 'void*', 'void*']);
const msg_id_ret = libobjc.func('objc_msgSend', 'void*', ['void*', 'void*', 'void*']);
const msg_str = libobjc.func('objc_msgSend', 'void*', ['void*', 'void*', 'string']);
const msg_rect_int_int_bool = libobjc.func('objc_msgSend', 'void*', ['void*', 'void*', CGRect, 'uint64', 'uint64', 'int8']);
const msg_4doubles = libobjc.func('objc_msgSend', 'void*', ['void*', 'void*', 'double', 'double', 'double', 'double']);

const sel = (s) => sel_registerName(s);
const cls = (s) => objc_getClass(s);
const nsstr = (s) => msg_str(cls('NSString'), sel('stringWithUTF8String:'), s);

// ============================================================================
// Colors
// ============================================================================

const color = (r, g, b, a = 1) => msg_4doubles(cls('NSColor'), sel('colorWithRed:green:blue:alpha:'), r, g, b, a);

const colors = {
  bg: color(0.11, 0.11, 0.12),           // Dark background
  bgSecondary: color(0.15, 0.15, 0.16),  // Slightly lighter
  bgInput: color(0.18, 0.18, 0.19),      // Input area
  text: color(0.93, 0.93, 0.94),         // Primary text
  textSecondary: color(0.6, 0.6, 0.62),  // Secondary text
  accent: color(0.4, 0.6, 1.0),          // Blue accent
  userBubble: color(0.25, 0.25, 0.27),   // User message bg
  assistantBubble: color(0.18, 0.18, 0.20), // Assistant message bg
  border: color(0.25, 0.25, 0.27),       // Borders
};

// ============================================================================
// Font
// ============================================================================

const font = (size, mono = false) => {
  const NSFont = cls('NSFont');
  if (mono) {
    return msg_double(NSFont, sel('monospacedSystemFontOfSize:weight:'), size, 0.4);
  }
  return msg_double(NSFont, sel('systemFontOfSize:'), size);
};

// ============================================================================
// Create App & Window
// ============================================================================

const NSApp = cls('NSApplication');
const app = msg(NSApp, sel('sharedApplication'));
msg_int(app, sel('setActivationPolicy:'), 0);

const rect = { origin: { x: 200, y: 100 }, size: { width: 900, height: 700 } };
const styleMask = 1 | 2 | 4 | 8 | (1 << 15); // titled + closable + miniaturizable + resizable + fullSizeContentView
const win = msg_rect_int_int_bool(msg(cls('NSWindow'), sel('alloc')), sel('initWithContentRect:styleMask:backing:defer:'), rect, styleMask, 2, 0);

msg_id(win, sel('setTitle:'), nsstr('Punkin Pi'));
msg_bool(win, sel('setTitlebarAppearsTransparent:'), 1);
msg_id(win, sel('setBackgroundColor:'), colors.bg);

// ============================================================================
// Content View - Main container
// ============================================================================

const contentView = msg(msg(cls('NSView'), sel('alloc')), sel('init'));
msg_bool(contentView, sel('setWantsLayer:'), 1);
msg_id(msg(contentView, sel('layer')), sel('setBackgroundColor:'), msg(colors.bg, sel('CGColor')));

// ============================================================================
// Create scroll view for messages
// ============================================================================

const scrollView = msg(msg(cls('NSScrollView'), sel('alloc')), sel('init'));
msg_bool(scrollView, sel('setHasVerticalScroller:'), 1);
msg_bool(scrollView, sel('setHasHorizontalScroller:'), 0);
msg_bool(scrollView, sel('setBorderType:'), 0);
msg_id(scrollView, sel('setBackgroundColor:'), colors.bg);
msg_bool(scrollView, sel('setDrawsBackground:'), 1);

// Document view (holds all messages)
const messagesContainer = msg(msg(cls('NSStackView'), sel('alloc')), sel('init'));
msg_int(messagesContainer, sel('setOrientation:'), 1); // Vertical
msg_double(messagesContainer, sel('setSpacing:'), 16);
msg_uint(messagesContainer, sel('setAlignment:'), 1); // Leading
msg_id(scrollView, sel('setDocumentView:'), messagesContainer);

// ============================================================================
// Create input area
// ============================================================================

const inputContainer = msg(msg(cls('NSView'), sel('alloc')), sel('init'));
msg_bool(inputContainer, sel('setWantsLayer:'), 1);
msg_id(msg(inputContainer, sel('layer')), sel('setBackgroundColor:'), msg(colors.bgInput, sel('CGColor')));

const inputField = msg(msg(cls('NSTextField'), sel('alloc')), sel('init'));
msg_id(inputField, sel('setPlaceholderString:'), nsstr('Type a message...'));
msg_bool(inputField, sel('setBezeled:'), 1);
msg_int(inputField, sel('setBezelStyle:'), 1); // Rounded
msg_id(inputField, sel('setFont:'), font(14));
msg_id(inputField, sel('setTextColor:'), colors.text);
msg_id(inputField, sel('setBackgroundColor:'), colors.bgSecondary);

// ============================================================================
// Helper: Create a message bubble
// ============================================================================

function createMessage(text, isUser) {
  const bubble = msg(msg(cls('NSView'), sel('alloc')), sel('init'));
  msg_bool(bubble, sel('setWantsLayer:'), 1);
  const layer = msg(bubble, sel('layer'));
  msg_id(layer, sel('setBackgroundColor:'), msg(isUser ? colors.userBubble : colors.assistantBubble, sel('CGColor')));
  msg_double(layer, sel('setCornerRadius:'), 12);
  
  const label = msg(msg(cls('NSTextField'), sel('alloc')), sel('init'));
  msg_id(label, sel('setStringValue:'), nsstr(text));
  msg_bool(label, sel('setBezeled:'), 0);
  msg_bool(label, sel('setDrawsBackground:'), 0);
  msg_bool(label, sel('setEditable:'), 0);
  msg_bool(label, sel('setSelectable:'), 1);
  msg_id(label, sel('setFont:'), font(14));
  msg_id(label, sel('setTextColor:'), colors.text);
  msg_bool(label, sel('setTranslatesAutoresizingMaskIntoConstraints:'), 0);
  
  // Role label
  const role = msg(msg(cls('NSTextField'), sel('alloc')), sel('init'));
  msg_id(role, sel('setStringValue:'), nsstr(isUser ? 'You' : 'Assistant'));
  msg_bool(role, sel('setBezeled:'), 0);
  msg_bool(role, sel('setDrawsBackground:'), 0);
  msg_bool(role, sel('setEditable:'), 0);
  msg_id(role, sel('setFont:'), msg_double(cls('NSFont'), sel('boldSystemFontOfSize:'), 12));
  msg_id(role, sel('setTextColor:'), isUser ? colors.accent : color(0.3, 0.8, 0.5));
  
  // Stack them
  const stack = msg(msg(cls('NSStackView'), sel('alloc')), sel('init'));
  msg_int(stack, sel('setOrientation:'), 1);
  msg_double(stack, sel('setSpacing:'), 4);
  msg_id(stack, sel('setEdgeInsets:'), { top: 12, left: 16, bottom: 12, right: 16 });
  msg_id(stack, sel('addArrangedSubview:'), role);
  msg_id(stack, sel('addArrangedSubview:'), label);
  
  msg_id(bubble, sel('addSubview:'), stack);
  msg_bool(stack, sel('setTranslatesAutoresizingMaskIntoConstraints:'), 0);
  
  return bubble;
}

// ============================================================================
// Add sample messages
// ============================================================================

const messages = [
  { text: "Hello! What can you help me with today?", isUser: true },
  { text: "I'm Punkin Pi, a coding agent. I can help you with:\n\n• Reading and editing files\n• Running commands\n• Searching codebases\n• Writing code\n\nWhat would you like to work on?", isUser: false },
  { text: "Can you show me the directory structure?", isUser: true },
  { text: "```\npunkin-pi/\n├── packages/\n│   ├── ai/\n│   ├── agent/\n│   ├── coding-agent/\n│   ├── native-ui/  ← you are here\n│   ├── tui/\n│   └── web-ui/\n├── specs/\n├── docs/\n└── README.md\n```", isUser: false },
];

for (const m of messages) {
  const bubble = createMessage(m.text, m.isUser);
  msg_id(messagesContainer, sel('addArrangedSubview:'), bubble);
}

// ============================================================================
// Layout with Auto Layout
// ============================================================================

msg_bool(scrollView, sel('setTranslatesAutoresizingMaskIntoConstraints:'), 0);
msg_bool(inputContainer, sel('setTranslatesAutoresizingMaskIntoConstraints:'), 0);
msg_bool(inputField, sel('setTranslatesAutoresizingMaskIntoConstraints:'), 0);

msg_id(contentView, sel('addSubview:'), scrollView);
msg_id(contentView, sel('addSubview:'), inputContainer);
msg_id(inputContainer, sel('addSubview:'), inputField);

// Activate constraints
const NSLayoutConstraint = cls('NSLayoutConstraint');
const activate = (constraint) => msg_bool(NSLayoutConstraint, sel('activateConstraints:'), constraint);

// We need to use visual format or anchor-based constraints
// For simplicity, let's use fixed frames for now
msg_id(win, sel('setContentView:'), contentView);

// ============================================================================
// Show window
// ============================================================================

msg_bool(win, sel('makeKeyAndOrderFront:'), 1);
msg_bool(app, sel('activateIgnoringOtherApps:'), 1);

console.log('🎃 Punkin Pi native UI running!');
console.log('Press Ctrl+C to exit');

msg(app, sel('run'));
