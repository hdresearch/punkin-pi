/**
 * @punkin-pi/native-ui
 * 
 * Declarative native UI framework with swappable backends.
 * 
 * Architecture:
 * - View = f(State)  — Pure rendering
 * - Update = (State, Msg) => [State, Cmd]  — Pure state transitions
 * - Cmd = Effect descriptions, not executions
 * - Backend = Pluggable native renderer (AppKit, Qt, Web, ...)
 * 
 * @example
 * ```typescript
 * import { createRuntime, punkinApp } from '@punkin-pi/native-ui';
 * import { createAppKitBackend } from '@punkin-pi/native-ui/appkit';
 * 
 * const runtime = createRuntime({
 *   app: punkinApp,
 *   backend: createAppKitBackend(),
 *   window: { title: 'Punkin', width: 1200, height: 800 },
 * });
 * 
 * await runtime.start();
 * ```
 */

// Core types
export type {
	View,
	ViewId,
	VStack,
	HStack,
	ZStack,
	Text,
	TextEditor,
	SplitView,
	ScrollView,
	TreeView,
	TreeNode,
	Button,
	Spacer,
	Empty,
	BaseAttrs,
	TextStyle,
	Color,
	Insets,
	MsgTag,
	UIEvent,
	Cmd,
	CmdNone,
	CmdBatch,
	CmdSend,
	CmdIO,
	App,
	Sub,
} from './core/types.js';

// Core functions
export { none, batch, send, io } from './core/types.js';

// View DSL
export {
	vstack,
	hstack,
	zstack,
	text,
	label,
	code,
	textEditor,
	splitView,
	scrollView,
	treeView,
	button,
	spacer,
	empty,
	when,
	unless,
	maybe,
	each,
	treeNode,
	leaf,
	attrs,
	insets,
	insetsAll,
	rgb,
	rgba,
	colors,
} from './core/view.js';

// Reconciliation
export { reconcile, patchToString } from './core/reconcile.js';
export type { Patch, Path } from './core/reconcile.js';

// Runtime
export { createRuntime, runApp } from './core/runtime.js';
export type { Runtime, RuntimeConfig } from './core/runtime.js';

// Backend interface
export type {
	Backend,
	BackendFactory,
	BackendCapabilities,
	WindowConfig,
	EventCallback,
} from './backends/interface.js';
export { registerBackend, getBackend, backends } from './backends/interface.js';

// Punkin app (re-export for convenience)
export { punkinApp } from './app/index.js';
export type { AppState, Message, Handle, Session, ToolCall, ConnectionState } from './app/state.js';
export type { Msg } from './app/messages.js';
