/**
 * AppKit Backend — Native macOS UI implementation using koffi.
 */

import type { Backend, WindowConfig, EventCallback, BackendCapabilities } from '../interface.js';
import type { View, UIEvent } from '../../core/types.js';
import type { Patch, Path } from '../../core/reconcile.js';
import {
	getAppKitClasses,
	ObjCObject,
	nsString,
	fromNSString,
	makeRect,
	NSWindowStyleMask,
	NSBackingStoreType,
	NSApplicationActivationPolicy,
} from './bindings.js';
import { createWidget, updateWidgetText, updateWidgetAttrs, type WidgetHandle } from './widgets.js';

export function createAppKitBackend(): Backend {
	return new AppKitBackend();
}

class AppKitBackend implements Backend {
	readonly name = 'appkit';
	readonly capabilities: BackendCapabilities = {
		supportsTransparency: true,
		supportsImages: true,
		supportsRichText: true,
		supportsTabs: true,
		supportsMenuBar: true,
		nativeScrolling: true,
	};
	
	private app: ObjCObject | null = null;
	private window: ObjCObject | null = null;
	private rootHandle: WidgetHandle | null = null;
	private onEvent: EventCallback | null = null;
	private running = false;
	
	// Widget handle lookup by path
	private handleMap = new Map<string, WidgetHandle>();
	
	async init(config: WindowConfig, onEvent: EventCallback): Promise<void> {
		this.onEvent = onEvent;
		
		const classes = getAppKitClasses();
		
		// Get the shared application
		this.app = classes.NSApplication.call('sharedApplication');
		this.app.send('setActivationPolicy:', NSApplicationActivationPolicy.Regular);
		
		// Get screen size for centering
		const screen = classes.NSScreen.call('mainScreen');
		const screenFrame = screen.frame();
		const x = config.x ?? (screenFrame.width - config.width) / 2;
		const y = config.y ?? (screenFrame.height - config.height) / 2;
		
		// Create window style mask
		let styleMask = NSWindowStyleMask.Titled | NSWindowStyleMask.Closable | NSWindowStyleMask.Miniaturizable;
		if (config.resizable !== false) {
			styleMask |= NSWindowStyleMask.Resizable;
		}
		if (config.titlebarAppearsTransparent) {
			styleMask |= NSWindowStyleMask.FullSizeContentView;
		}
		
		// Create the window
		const rect = makeRect(x, y, config.width, config.height);
		this.window = classes.NSWindow
			.alloc()
			.send('initWithContentRect:styleMask:backing:defer:',
				rect,
				styleMask,
				NSBackingStoreType.Buffered,
				false
			);
		
		this.window.send('setTitle:', nsString(config.title).ptr);
		
		if (config.minWidth || config.minHeight) {
			this.window.send('setMinSize:', { width: config.minWidth ?? 0, height: config.minHeight ?? 0 });
		}
		
		if (config.titlebarAppearsTransparent) {
			this.window.send('setTitlebarAppearsTransparent:', true);
		}
		
		// Make the app active
		this.app.send('activateIgnoringOtherApps:', true);
	}
	
	render(view: View): void {
		if (!this.window) {
			throw new Error('Backend not initialized');
		}
		
		// Create root widget
		this.rootHandle = createWidget(view, 'root');
		this.indexHandle(this.rootHandle, []);
		
		// Set as window content
		this.window.send('setContentView:', this.rootHandle.view.ptr);
		this.window.send('makeKeyAndOrderFront:', null);
	}
	
	private indexHandle(handle: WidgetHandle, path: Path): void {
		const pathStr = path.join('.');
		this.handleMap.set(pathStr, handle);
		
		for (let i = 0; i < handle.children.length; i++) {
			this.indexHandle(handle.children[i], [...path, i]);
		}
	}
	
	applyPatch(patch: Patch): void {
		const pathStr = patch.path.join('.');
		
		switch (patch.type) {
			case 'update-text': {
				const handle = this.handleMap.get(pathStr);
				if (handle) {
					updateWidgetText(handle, patch.content);
				}
				break;
			}
			
			case 'update-attrs': {
				const handle = this.handleMap.get(pathStr);
				if (handle) {
					updateWidgetAttrs(handle, patch.attrs);
				}
				break;
			}
			
			case 'replace': {
				const parentPath = patch.path.slice(0, -1);
				const childIndex = patch.path[patch.path.length - 1];
				const parentPathStr = parentPath.join('.');
				const parentHandle = parentPath.length === 0 
					? this.rootHandle 
					: this.handleMap.get(parentPathStr);
				
				if (parentHandle && childIndex !== undefined) {
					const newHandle = createWidget(patch.view, pathStr);
					
					const oldChild = parentHandle.children[childIndex];
					if (oldChild) {
						parentHandle.view.send('replaceSubview:with:', oldChild.view.ptr, newHandle.view.ptr);
					}
					
					parentHandle.children[childIndex] = newHandle;
					this.handleMap.set(pathStr, newHandle);
					this.indexHandle(newHandle, patch.path);
				}
				break;
			}
			
			case 'create': {
				const parentPath = patch.path.slice(0, -1);
				const parentPathStr = parentPath.join('.');
				const parentHandle = parentPath.length === 0
					? this.rootHandle
					: this.handleMap.get(parentPathStr);
				
				if (parentHandle) {
					const newHandle = createWidget(patch.view, pathStr);
					parentHandle.view.send('addSubview:', newHandle.view.ptr);
					parentHandle.children.push(newHandle);
					this.handleMap.set(pathStr, newHandle);
					this.indexHandle(newHandle, patch.path);
				}
				break;
			}
			
			case 'remove': {
				const handle = this.handleMap.get(pathStr);
				if (handle) {
					handle.view.call('removeFromSuperview');
					this.handleMap.delete(pathStr);
				}
				break;
			}
			
			case 'update-children': {
				for (const childPatch of patch.patches) {
					this.applyPatch(childPatch);
				}
				break;
			}
			
			case 'reorder': {
				console.warn('Reorder patches not yet implemented');
				break;
			}
		}
	}
	
	applyPatches(patches: readonly Patch[]): void {
		for (const patch of patches) {
			this.applyPatch(patch);
		}
	}
	
	run(): void {
		if (!this.app) {
			throw new Error('Backend not initialized');
		}
		
		this.running = true;
		
		// Run the AppKit event loop
		this.app.call('run');
	}
	
	stop(): void {
		this.running = false;
		if (this.app) {
			this.app.send('stop:', null);
		}
	}
	
	shutdown(): void {
		this.stop();
		this.window = null;
		this.app = null;
		this.rootHandle = null;
		this.handleMap.clear();
	}
	
	getWindowSize(): { width: number; height: number } {
		if (!this.window) return { width: 0, height: 0 };
		
		const frame = this.window.frame();
		return { width: frame.width, height: frame.height };
	}
	
	setWindowTitle(title: string): void {
		if (this.window) {
			this.window.send('setTitle:', nsString(title).ptr);
		}
	}
	
	async showAlert(message: string, title?: string): Promise<void> {
		const { NSAlert } = getAppKitClasses();
		
		const alert = NSAlert.alloc().init();
		alert.send('setMessageText:', nsString(title ?? 'Alert').ptr);
		alert.send('setInformativeText:', nsString(message).ptr);
		alert.send('addButtonWithTitle:', nsString('OK').ptr);
		alert.call('runModal');
	}
	
	async readClipboard(): Promise<string> {
		const { NSPasteboard } = getAppKitClasses();
		
		const pasteboard = NSPasteboard.call('generalPasteboard');
		const str = pasteboard.send('stringForType:', nsString('public.utf8-plain-text').ptr);
		return fromNSString(str);
	}
	
	async writeClipboard(text: string): Promise<void> {
		const { NSPasteboard } = getAppKitClasses();
		
		const pasteboard = NSPasteboard.call('generalPasteboard');
		pasteboard.call('clearContents');
		pasteboard.send('setString:forType:', nsString(text).ptr, nsString('public.utf8-plain-text').ptr);
	}
	
	// Internal: emit event to runtime
	private emit(event: UIEvent): void {
		if (this.onEvent) {
			this.onEvent(event);
		}
	}
}

export default createAppKitBackend;
