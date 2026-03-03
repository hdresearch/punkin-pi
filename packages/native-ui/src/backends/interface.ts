/**
 * Backend Interface — The contract backends must implement.
 * 
 * This is the abstraction boundary. Everything above (views, reconciliation,
 * runtime) is backend-agnostic. Only this interface touches native APIs.
 * 
 * To add a new backend (Qt, GTK, Web, etc.):
 * 1. Implement this interface
 * 2. Pass the implementation to createRuntime()
 * 
 * The runtime calls:
 * - init() once at startup
 * - applyPatch() for each patch from reconciliation
 * - shutdown() on exit
 * 
 * The backend calls:
 * - onEvent() when user interactions occur
 */

import type { View, UIEvent } from '../core/types.js';
import type { Patch } from '../core/reconcile.js';

/** Window configuration */
export interface WindowConfig {
	readonly title: string;
	readonly width: number;
	readonly height: number;
	readonly minWidth?: number;
	readonly minHeight?: number;
	readonly x?: number;
	readonly y?: number;
	readonly resizable?: boolean;
	readonly titlebarAppearsTransparent?: boolean;
}

/** Backend capabilities */
export interface BackendCapabilities {
	readonly supportsTransparency: boolean;
	readonly supportsImages: boolean;
	readonly supportsRichText: boolean;
	readonly supportsTabs: boolean;
	readonly supportsMenuBar: boolean;
	readonly nativeScrolling: boolean;
	readonly maxTextureSize?: number;
}

/** Event callback type */
export type EventCallback = (event: UIEvent) => void;

/**
 * The Backend interface.
 * 
 * Implementations should be stateful (they hold native object references)
 * but present a functional interface to the runtime.
 */
export interface Backend {
	/** Human-readable name */
	readonly name: string;
	
	/** What this backend supports */
	readonly capabilities: BackendCapabilities;
	
	/**
	 * Initialize the backend and create main window.
	 * Called once at startup.
	 */
	init(config: WindowConfig, onEvent: EventCallback): Promise<void>;
	
	/**
	 * Render initial view tree.
	 * Called once after init, before the event loop starts.
	 */
	render(view: View): void;
	
	/**
	 * Apply a single patch to the native UI.
	 * Called by runtime after reconciliation.
	 */
	applyPatch(patch: Patch): void;
	
	/**
	 * Apply multiple patches atomically.
	 * Default implementation just calls applyPatch for each.
	 */
	applyPatches?(patches: readonly Patch[]): void;
	
	/**
	 * Run the native event loop.
	 * This typically blocks until the app exits.
	 * 
	 * For async-friendly backends, this might return a Promise
	 * that resolves when the app closes.
	 */
	run(): void | Promise<void>;
	
	/**
	 * Request the event loop to stop.
	 */
	stop(): void;
	
	/**
	 * Clean up native resources.
	 * Called on shutdown.
	 */
	shutdown(): void;
	
	/**
	 * Get the current window size.
	 */
	getWindowSize?(): { width: number; height: number };
	
	/**
	 * Set window title.
	 */
	setWindowTitle?(title: string): void;
	
	/**
	 * Show a native alert dialog.
	 */
	showAlert?(message: string, title?: string): Promise<void>;
	
	/**
	 * Show a native file picker.
	 */
	showFilePicker?(options?: {
		directory?: boolean;
		multiple?: boolean;
		filters?: { name: string; extensions: string[] }[];
	}): Promise<string[] | null>;
	
	/**
	 * Read from system clipboard.
	 */
	readClipboard?(): Promise<string>;
	
	/**
	 * Write to system clipboard.
	 */
	writeClipboard?(text: string): Promise<void>;
}

/**
 * Factory function type for creating backends.
 */
export type BackendFactory = () => Backend;

/**
 * Registry of available backends.
 */
export const backends = new Map<string, BackendFactory>();

/**
 * Register a backend factory.
 */
export function registerBackend(name: string, factory: BackendFactory): void {
	backends.set(name, factory);
}

/**
 * Get a backend by name.
 */
export function getBackend(name: string): Backend | null {
	const factory = backends.get(name);
	return factory ? factory() : null;
}
