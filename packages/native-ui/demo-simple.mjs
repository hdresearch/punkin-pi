#!/usr/bin/env node
/**
 * Simple demo - just get a window with content working
 * Then we can add complexity
 */

import koffi from 'koffi';

console.log('Starting...');

try {
  const libobjc = koffi.load('/usr/lib/libobjc.A.dylib');
  koffi.load('/System/Library/Frameworks/AppKit.framework/AppKit');
  console.log('Loaded frameworks');

  const CGFloat = 'double';
  const CGPoint = koffi.struct('CGPoint', { x: CGFloat, y: CGFloat });
  const CGSize = koffi.struct('CGSize', { width: CGFloat, height: CGFloat });
  const CGRect = koffi.struct('CGRect', { origin: CGPoint, size: CGSize });

  const objc_getClass = libobjc.func('objc_getClass', 'void*', ['string']);
  const sel_registerName = libobjc.func('sel_registerName', 'void*', ['string']);

  const msg = libobjc.func('objc_msgSend', 'void*', ['void*', 'void*']);
  const msg_bool = libobjc.func('objc_msgSend', 'void', ['void*', 'void*', 'int8']);
  const msg_int = libobjc.func('objc_msgSend', 'void*', ['void*', 'void*', 'int64']);
  const msg_double = libobjc.func('objc_msgSend', 'void*', ['void*', 'void*', 'double']);
  const msg_id = libobjc.func('objc_msgSend', 'void*', ['void*', 'void*', 'void*']);
  const msg_str = libobjc.func('objc_msgSend', 'void*', ['void*', 'void*', 'string']);
  const msg_rect_3int = libobjc.func('objc_msgSend', 'void*', ['void*', 'void*', CGRect, 'uint64', 'uint64', 'int8']);
  const msg_4f = libobjc.func('objc_msgSend', 'void*', ['void*', 'void*', 'double', 'double', 'double', 'double']);
  const msg_rect_in = libobjc.func('objc_msgSend', 'void', ['void*', 'void*', CGRect]); // setFrame: etc

  const sel = s => sel_registerName(s);
  const cls = s => objc_getClass(s);
  const nsstr = s => msg_str(cls('NSString'), sel('stringWithUTF8String:'), s);
  const alloc = c => msg(cls(c), sel('alloc'));
  const init = o => msg(o, sel('init'));

  console.log('Defined helpers');

  // Colors
  const rgb = (r, g, b) => msg_4f(cls('NSColor'), sel('colorWithRed:green:blue:alpha:'), r, g, b, 1);
  const C = {
    bg: rgb(0.08, 0.08, 0.09),
    text: rgb(0.92, 0.92, 0.93),
    accent: rgb(0.35, 0.55, 0.95),
    green: rgb(0.30, 0.75, 0.45),
  };
  console.log('Created colors');

  // App
  const app = msg(cls('NSApplication'), sel('sharedApplication'));
  msg_int(app, sel('setActivationPolicy:'), 0);
  console.log('Got NSApplication');

  // Window
  const rect = { origin: { x: 200, y: 150 }, size: { width: 900, height: 600 } };
  const win = msg_rect_3int(
    alloc('NSWindow'),
    sel('initWithContentRect:styleMask:backing:defer:'),
    rect, 15, 2, 0
  );
  msg_id(win, sel('setTitle:'), nsstr('Punkin Pi 🎃'));
  msg_id(win, sel('setBackgroundColor:'), C.bg);
  console.log('Created window');

  // Content: Simple vertical stack
  const stack = init(alloc('NSStackView'));
  msg_int(stack, sel('setOrientation:'), 1); // vertical
  msg_double(stack, sel('setSpacing:'), 16);
  msg_bool(stack, sel('setTranslatesAutoresizingMaskIntoConstraints:'), 0);
  console.log('Created stack');

  // Helper to make labels
  function label(text, size = 14, color = C.text) {
    const l = init(alloc('NSTextField'));
    msg_id(l, sel('setStringValue:'), nsstr(text));
    msg_bool(l, sel('setBezeled:'), 0);
    msg_bool(l, sel('setDrawsBackground:'), 0);
    msg_bool(l, sel('setEditable:'), 0);
    msg_bool(l, sel('setSelectable:'), 1);
    msg_id(l, sel('setFont:'), msg_double(cls('NSFont'), sel('systemFontOfSize:'), size));
    msg_id(l, sel('setTextColor:'), color);
    return l;
  }

  // Add some content
  msg_id(stack, sel('addArrangedSubview:'), label('Punkin Pi', 24, C.accent));
  msg_id(stack, sel('addArrangedSubview:'), label('Native macOS UI via koffi + AppKit', 14, C.text));
  msg_id(stack, sel('addArrangedSubview:'), label(''));
  msg_id(stack, sel('addArrangedSubview:'), label('Architecture:', 16, C.green));
  msg_id(stack, sel('addArrangedSubview:'), label('  • Agent — LLM, tools, context (the brain)'));
  msg_id(stack, sel('addArrangedSubview:'), label('  • GUI App — pure State/Msg/update/view'));
  msg_id(stack, sel('addArrangedSubview:'), label('  • GUI Driver — AppKit rendering'));
  msg_id(stack, sel('addArrangedSubview:'), label(''));
  msg_id(stack, sel('addArrangedSubview:'), label('Key insight: pure core, effectful shell', 14, C.accent));
  console.log('Added labels');

  // Wrap in a container with padding
  const container = init(alloc('NSView'));
  msg_id(container, sel('addSubview:'), stack);
  
  // Center the stack manually with a frame
  // (avoiding auto layout complexity for now)
  const stackFrame = { origin: { x: 40, y: 200 }, size: { width: 800, height: 350 } };
  msg_rect_in(stack, sel('setFrame:'), stackFrame);

  msg_id(win, sel('setContentView:'), container);
  console.log('Set content view');

  // Show
  msg_bool(win, sel('makeKeyAndOrderFront:'), 1);
  msg_bool(app, sel('activateIgnoringOtherApps:'), 1);
  console.log('');
  console.log('🎃 Window open! Press Ctrl+C to exit');
  console.log('');

  // Run event loop
  msg(app, sel('run'));

} catch (err) {
  console.error('💥 Error:', err.stack || err);
  process.exit(1);
}
