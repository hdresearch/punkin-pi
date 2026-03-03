/**
 * AppKit Bindings — Objective-C runtime via koffi.
 * Simplified: use specialized function signatures instead of variadic objc_msgSend.
 */

import koffi from 'koffi';

if (process.platform !== 'darwin') {
	throw new Error('AppKit backend requires macOS');
}

// ============================================================================
// Load frameworks
// ============================================================================

const libobjc = koffi.load('/usr/lib/libobjc.A.dylib');
koffi.load('/System/Library/Frameworks/AppKit.framework/AppKit');
koffi.load('/System/Library/Frameworks/Foundation.framework/Foundation');

// ============================================================================
// Basic types
// ============================================================================

const id = 'void*';
const SEL = 'void*';
const Class = 'void*';
const BOOL = 'int8';
const NSUInteger = 'uint64';
const CGFloat = 'double';

const CGPoint = koffi.struct('CGPoint', { x: CGFloat, y: CGFloat });
const CGSize = koffi.struct('CGSize', { width: CGFloat, height: CGFloat });
const CGRect = koffi.struct('CGRect', { origin: CGPoint, size: CGSize });

// ============================================================================
// Runtime functions
// ============================================================================

const objc_getClass = libobjc.func('objc_getClass', Class, ['string']);
const sel_registerName = libobjc.func('sel_registerName', SEL, ['string']);

// Pre-declare specific message send signatures we need
// This avoids variadic complexity

// No args, returns id
const msg_id = libobjc.func('objc_msgSend', id, [id, SEL]);

// Returns CGRect
const msg_rect = libobjc.func('objc_msgSend', CGRect, [id, SEL]);

// One id arg
const msg_id_id = libobjc.func('objc_msgSend', id, [id, SEL, id]);

// One int arg
const msg_id_int = libobjc.func('objc_msgSend', id, [id, SEL, NSUInteger]);

// One bool arg  
const msg_void_bool = libobjc.func('objc_msgSend', 'void', [id, SEL, BOOL]);

// CGRect + int + int + bool
const msg_id_rect_int_int_bool = libobjc.func('objc_msgSend', id, [id, SEL, CGRect, NSUInteger, NSUInteger, BOOL]);

// Two id args
const msg_void_id_id = libobjc.func('objc_msgSend', 'void', [id, SEL, id, id]);

// ============================================================================
// Helpers
// ============================================================================

const _selCache = new Map<string, unknown>();
function sel(name: string): unknown {
	let s = _selCache.get(name);
	if (!s) {
		s = sel_registerName(name);
		_selCache.set(name, s);
	}
	return s;
}

function cls(name: string): unknown {
	const c = objc_getClass(name);
	if (!c) throw new Error(`Class not found: ${name}`);
	return c;
}

// ============================================================================
// NSString helpers
// ============================================================================

export function nsString(str: string): unknown {
	const NSString = cls('NSString');
	const alloc = msg_id(NSString, sel('alloc'));
	// Use a simpler approach - stringWithUTF8String: is a class method
	const msg_id_str = libobjc.func('objc_msgSend', id, [id, SEL, 'string']);
	return msg_id_str(NSString, sel('stringWithUTF8String:'), str);
}

// ============================================================================
// Main API
// ============================================================================

export function createApp(): { app: unknown; run: () => void; stop: () => void } {
	const NSApp = cls('NSApplication');
	const app = msg_id(NSApp, sel('sharedApplication'));
	msg_id_int(app, sel('setActivationPolicy:'), 0); // Regular
	
	return {
		app,
		run: () => msg_id(app, sel('run')),
		stop: () => msg_id_id(app, sel('stop:'), null as unknown as never),
	};
}

export function createWindow(title: string, width: number, height: number): unknown {
	const NSWindow = cls('NSWindow');
	const NSScreen = cls('NSScreen');
	
	// Get screen frame for centering
	const mainScreen = msg_id(NSScreen, sel('mainScreen'));
	const screenFrame = msg_rect(mainScreen, sel('frame'));
	
	const x = (screenFrame.size.width - width) / 2;
	const y = (screenFrame.size.height - height) / 2;
	
	const rect: { origin: { x: number; y: number }; size: { width: number; height: number } } = {
		origin: { x, y },
		size: { width, height }
	};
	
	const styleMask = 1 | 2 | 4 | 8; // titled + closable + miniaturizable + resizable
	
	const alloc = msg_id(NSWindow, sel('alloc'));
	const win = msg_id_rect_int_int_bool(alloc, sel('initWithContentRect:styleMask:backing:defer:'), 
		rect, styleMask, 2, false);
	
	msg_id_id(win, sel('setTitle:'), nsString(title));
	msg_void_bool(win, sel('makeKeyAndOrderFront:'), true);
	
	return win;
}

export function setWindowContent(win: unknown, view: unknown): void {
	msg_id_id(win, sel('setContentView:'), view);
}

export function createLabel(text: string): unknown {
	const NSTextField = cls('NSTextField');
	const label = msg_id(NSTextField, sel('alloc'));
	const inited = msg_id(label, sel('init'));
	msg_id_id(inited, sel('setStringValue:'), nsString(text));
	msg_void_bool(inited, sel('setBezeled:'), false);
	msg_void_bool(inited, sel('setDrawsBackground:'), false);
	msg_void_bool(inited, sel('setEditable:'), false);
	msg_void_bool(inited, sel('setSelectable:'), true);
	return inited;
}

export function createStackView(vertical: boolean): unknown {
	const NSStackView = cls('NSStackView');
	const stack = msg_id(NSStackView, sel('alloc'));
	const inited = msg_id(stack, sel('init'));
	msg_id_int(inited, sel('setOrientation:'), vertical ? 1 : 0);
	msg_id_int(inited, sel('setDistribution:'), 0); // Fill
	const msg_void_double = libobjc.func('objc_msgSend', 'void', [id, SEL, CGFloat]);
	msg_void_double(inited, sel('setSpacing:'), 8);
	return inited;
}

export function addArrangedSubview(stack: unknown, view: unknown): void {
	msg_id_id(stack, sel('addArrangedSubview:'), view);
}

export function activateApp(app: unknown): void {
	msg_void_bool(app, sel('activateIgnoringOtherApps:'), true);
}
