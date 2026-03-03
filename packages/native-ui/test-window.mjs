#!/usr/bin/env node
/**
 * Quick test - just open a window with koffi + AppKit
 */

import koffi from 'koffi';

const libobjc = koffi.load('/usr/lib/libobjc.A.dylib');
koffi.load('/System/Library/Frameworks/AppKit.framework/AppKit');

const id = 'void*';
const SEL = 'void*';
const CGFloat = 'double';
const CGPoint = koffi.struct('CGPoint', { x: CGFloat, y: CGFloat });
const CGSize = koffi.struct('CGSize', { width: CGFloat, height: CGFloat });
const CGRect = koffi.struct('CGRect', { origin: CGPoint, size: CGSize });

const objc_getClass = libobjc.func('objc_getClass', 'void*', ['string']);
const sel_registerName = libobjc.func('sel_registerName', 'void*', ['string']);

const msg = libobjc.func('objc_msgSend', id, [id, SEL]);
const msg_int = libobjc.func('objc_msgSend', id, [id, SEL, 'int64']);
const msg_bool = libobjc.func('objc_msgSend', 'void', [id, SEL, 'int8']);
const msg_id = libobjc.func('objc_msgSend', 'void', [id, SEL, id]);
const msg_rect_int_int_bool = libobjc.func('objc_msgSend', id, [id, SEL, CGRect, 'uint64', 'uint64', 'int8']);
const msg_str = libobjc.func('objc_msgSend', id, [id, SEL, 'string']);

const sel = (s) => sel_registerName(s);
const cls = (s) => objc_getClass(s);

// Create app
const NSApp = cls('NSApplication');
const app = msg(NSApp, sel('sharedApplication'));
msg_int(app, sel('setActivationPolicy:'), 0);

// Create window
const NSWindow = cls('NSWindow');
const rect = { origin: { x: 200, y: 200 }, size: { width: 800, height: 600 } };
const win = msg_rect_int_int_bool(
  msg(NSWindow, sel('alloc')),
  sel('initWithContentRect:styleMask:backing:defer:'),
  rect, 15, 2, 0
);

// Set title
const title = msg_str(cls('NSString'), sel('stringWithUTF8String:'), 'Punkin Pi 🎃');
msg_id(win, sel('setTitle:'), title);

// Create a label
const NSTextField = cls('NSTextField');
const label = msg(msg(NSTextField, sel('alloc')), sel('init'));
const labelText = msg_str(cls('NSString'), sel('stringWithUTF8String:'), 'Hello from native macOS! 🚀');
msg_id(label, sel('setStringValue:'), labelText);
msg_bool(label, sel('setBezeled:'), 0);
msg_bool(label, sel('setDrawsBackground:'), 0);
msg_bool(label, sel('setEditable:'), 0);

// Set label as content
msg_id(win, sel('setContentView:'), label);

// Show window
msg_bool(win, sel('makeKeyAndOrderFront:'), 1);
msg_bool(app, sel('activateIgnoringOtherApps:'), 1);

console.log('Window created! Running event loop...');
console.log('Press Ctrl+C to exit');

// Run
msg(app, sel('run'));
