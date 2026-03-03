/**
 * Punkin App — Complete app definition.
 * 
 * This ties together state, update, and view into an App
 * that can be run by the runtime with any backend.
 */

import type { App, UIEvent } from '../core/types.js';
import type { AppState } from './state.js';
import type { Msg } from './messages.js';
import { init, update } from './update.js';
import { view } from './view.js';

// Re-export types (avoiding conflicts)
export type {
	AppState,
	Message,
	Handle,
	Session,
	ToolCall,
	ConnectionState,
} from './state.js';
export {
	initialState,
	isConnected,
	canSubmit,
} from './state.js';

export type { Msg } from './messages.js';
export * from './messages.js';

export { update, init } from './update.js';
export { view } from './view.js';

/**
 * The Punkin App.
 * 
 * This is a complete App definition that can be passed to createRuntime().
 */
export const punkinApp: App<AppState, Msg> = {
	init,
	update,
	view,
	eventToMsg,
};

/**
 * Convert raw UI events to typed messages.
 * 
 * This handles the mapping from backend-specific events
 * to our strongly-typed message union.
 */
function eventToMsg(event: UIEvent): Msg | null {
	const { tag, payload } = event;
	
	// Input events
	if (tag === 'input/changed') {
		return { tag: 'input/changed', text: payload as string };
	}
	if (tag === 'input/submit') {
		return { tag: 'input/submit' };
	}
	
	// Button clicks (tag contains the action)
	if (tag.startsWith('session/')) {
		const parts = tag.split('/');
		if (parts[1] === 'new') return { tag: 'session/new' };
		if (parts[1] === 'select') return { tag: 'session/select', id: parts[2] };
	}
	
	if (tag.startsWith('ui/')) {
		if (tag === 'ui/toggle-sidebar') return { tag: 'ui/toggle-sidebar' };
		if (tag.startsWith('ui/set-panel/')) {
			const panel = tag.split('/')[2] as 'chat' | 'files' | 'search';
			return { tag: 'ui/set-panel', panel };
		}
	}
	
	if (tag.startsWith('message/')) {
		const parts = tag.split('/');
		if (parts[1] === 'select') return { tag: 'message/select', id: parts[2] ?? null };
		if (parts[1] === 'toggle-collapse') return { tag: 'message/toggle-collapse', id: parts[2] };
		if (parts[1] === 'copy') return { tag: 'message/copy', id: parts[2] };
	}
	
	if (tag.startsWith('handle/')) {
		const parts = tag.split('/');
		if (parts[1] === 'expand') return { tag: 'handle/expand', id: parts[2] };
		if (parts[1] === 'collapse') return { tag: 'handle/collapse', id: parts[2] };
	}
	
	if (tag.startsWith('tool/')) {
		const parts = tag.split('/');
		if (parts[1] === 'toggle-collapse') return { tag: 'tool/toggle-collapse', callId: parts[2] };
	}
	
	// Keyboard events (from backend)
	if (tag === 'key/escape') return { tag: 'key/escape' };
	if (tag === 'key/enter') return { tag: 'key/enter' };
	if (tag === 'key/cmd-k') return { tag: 'key/cmd-k' };
	if (tag === 'key/cmd-b') return { tag: 'key/cmd-b' };
	if (tag === 'key/cmd-n') return { tag: 'key/cmd-n' };
	
	// Unknown event
	console.warn('Unknown UI event:', tag, payload);
	return null;
}

export default punkinApp;
