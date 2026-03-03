/**
 * Runtime — The Elm Architecture event loop.
 * 
 * This is the heart of the framework. It:
 * 1. Holds current state
 * 2. Receives messages from UI and subscriptions
 * 3. Calls update() to compute new state + commands
 * 4. Calls view() to compute new view tree
 * 5. Reconciles old/new views to get patches
 * 6. Sends patches to backend
 * 7. Interprets commands (effects)
 * 
 * The runtime is backend-agnostic — it only talks to the Backend interface.
 */

import type { App, View, Cmd, UIEvent } from './types.js';
import type { Backend, WindowConfig } from '../backends/interface.js';
import { reconcile, patchToString, type Patch } from './reconcile.js';

export interface RuntimeConfig<State, Msg> {
	/** The app definition */
	app: App<State, Msg>;
	/** The backend to use */
	backend: Backend;
	/** Window configuration */
	window: WindowConfig;
	/** Enable debug logging */
	debug?: boolean;
}

export interface Runtime<State, Msg> {
	/** Start the runtime (initializes app and runs event loop) */
	start(): Promise<void>;
	/** Stop the runtime */
	stop(): void;
	/** Get current state (for debugging) */
	getState(): State;
	/** Manually dispatch a message */
	dispatch(msg: Msg): void;
	/** Send messages from external sources (e.g., agent backend) */
	sendExternal(msg: Msg): void;
}

/**
 * Create a runtime for an app.
 */
export function createRuntime<State, Msg>(
	config: RuntimeConfig<State, Msg>
): Runtime<State, Msg> {
	const { app, backend, window: windowConfig, debug = false } = config;
	
	let state: State;
	let currentView: View | null = null;
	let running = false;
	
	// Message queue for batching
	const messageQueue: Msg[] = [];
	let processingQueue = false;
	
	function log(...args: unknown[]): void {
		if (debug) {
			console.log('[runtime]', ...args);
		}
	}
	
	function logPatch(patch: Patch): void {
		if (debug) {
			console.log('[patch]', patchToString(patch));
		}
	}
	
	/**
	 * Process a single message through the update cycle.
	 */
	function processMessage(msg: Msg): void {
		log('msg:', msg);
		
		// Update
		const [newState, cmd] = app.update(state, msg);
		state = newState;
		
		// View
		const newView = app.view(state);
		
		// Reconcile
		const patches = reconcile(currentView, newView);
		currentView = newView;
		
		// Apply patches
		for (const patch of patches) {
			logPatch(patch);
			backend.applyPatch(patch);
		}
		
		// Interpret commands
		interpretCmd(cmd);
	}
	
	/**
	 * Process all queued messages.
	 * Messages are processed one at a time to ensure consistent state.
	 */
	async function processQueue(): Promise<void> {
		if (processingQueue) return;
		processingQueue = true;
		
		while (messageQueue.length > 0 && running) {
			const msg = messageQueue.shift()!;
			processMessage(msg);
			
			// Yield to allow UI updates
			await new Promise(resolve => setImmediate(resolve));
		}
		
		processingQueue = false;
	}
	
	/**
	 * Dispatch a message to be processed.
	 */
	function dispatch(msg: Msg): void {
		messageQueue.push(msg);
		processQueue().catch(err => console.error('Queue error:', err));
	}
	
	/**
	 * Handle UI events from the backend.
	 */
	function handleUIEvent(event: UIEvent): void {
		const msg = app.eventToMsg(event);
		if (msg !== null) {
			dispatch(msg);
		}
	}
	
	/**
	 * Interpret a command (effect).
	 */
	function interpretCmd(cmd: Cmd<Msg>): void {
		switch (cmd.tag) {
			case 'none':
				// No effect
				break;
			
			case 'batch':
				for (const c of cmd.cmds) {
					interpretCmd(c);
				}
				break;
			
			case 'send':
				if (cmd.delay) {
					setTimeout(() => dispatch(cmd.msg), cmd.delay);
				} else {
					dispatch(cmd.msg);
				}
				break;
			
			case 'io':
				cmd.action()
					.then(result => {
						dispatch({ tag: cmd.onResult, payload: result } as unknown as Msg);
					})
					.catch(error => {
						if (cmd.onError) {
							dispatch({ tag: cmd.onError, payload: error } as unknown as Msg);
						} else {
							console.error('Unhandled IO error:', error);
						}
					});
				break;
			
			case 'clipboard':
				if (cmd.action === 'write' && cmd.content && backend.writeClipboard) {
					backend.writeClipboard(cmd.content).catch(console.error);
				} else if (cmd.action === 'read' && backend.readClipboard && cmd.onResult) {
					backend.readClipboard()
						.then(text => {
							dispatch({ tag: cmd.onResult, payload: text } as unknown as Msg);
						})
						.catch(console.error);
				}
				break;
			
			case 'openfile':
				// TODO: Implement file opening
				console.log('Open file:', cmd.path);
				break;
		}
	}
	
	return {
		async start(): Promise<void> {
			running = true;
			
			// Initialize app
			const [initialState, initialCmd] = app.init();
			state = initialState;
			log('initial state:', state);
			
			// Initialize backend
			await backend.init(windowConfig, handleUIEvent);
			
			// Initial render
			currentView = app.view(state);
			backend.render(currentView);
			
			// Process initial command
			interpretCmd(initialCmd);
			
			// Run event loop (this may block)
			const result = backend.run();
			if (result instanceof Promise) {
				await result;
			}
		},
		
		stop(): void {
			running = false;
			backend.stop();
		},
		
		getState(): State {
			return state;
		},
		
		dispatch,
		
		sendExternal(msg: Msg): void {
			// Same as dispatch, but named for clarity
			dispatch(msg);
		},
	};
}

// ============================================================================
// Convenience: Run an app with a backend
// ============================================================================

export async function runApp<State, Msg>(
	app: App<State, Msg>,
	backend: Backend,
	windowConfig: WindowConfig,
	options?: { debug?: boolean }
): Promise<void> {
	const runtime = createRuntime({
		app,
		backend,
		window: windowConfig,
		debug: options?.debug,
	});
	
	await runtime.start();
}
