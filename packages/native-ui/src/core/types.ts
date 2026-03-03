/**
 * Core types for the declarative UI framework.
 * 
 * Design principles (ICFP-style):
 * - Views are algebraic data types, not imperative objects
 * - State updates are pure functions
 * - Effects are descriptions (Cmd), not executions
 * - The runtime interprets Cmds and applies patches
 */

// ============================================================================
// View Types — Declarative UI Tree
// ============================================================================

export type ViewId = string;

/** Base attributes shared by all views */
export interface BaseAttrs {
	readonly id?: ViewId;
	readonly flex?: number;
	readonly minWidth?: number;
	readonly minHeight?: number;
	readonly maxWidth?: number;
	readonly maxHeight?: number;
	readonly padding?: Insets;
	readonly background?: Color;
}

export interface Insets {
	readonly top: number;
	readonly right: number;
	readonly bottom: number;
	readonly left: number;
}

export interface Color {
	readonly r: number;
	readonly g: number;
	readonly b: number;
	readonly a: number;
}

/** Text styling */
export interface TextStyle {
	readonly fontFamily?: string;
	readonly fontSize?: number;
	readonly fontWeight?: 'normal' | 'bold' | 'light';
	readonly color?: Color;
	readonly lineHeight?: number;
	readonly monospace?: boolean;
}

/** View is a sum type — each variant is a different widget */
export type View =
	| VStack
	| HStack
	| ZStack
	| Text
	| TextEditor
	| SplitView
	| ScrollView
	| TreeView
	| Button
	| Spacer
	| Empty;

export interface VStack {
	readonly tag: 'vstack';
	readonly children: readonly View[];
	readonly spacing?: number;
	readonly attrs: BaseAttrs;
}

export interface HStack {
	readonly tag: 'hstack';
	readonly children: readonly View[];
	readonly spacing?: number;
	readonly attrs: BaseAttrs;
}

export interface ZStack {
	readonly tag: 'zstack';
	readonly children: readonly View[];
	readonly attrs: BaseAttrs;
}

export interface Text {
	readonly tag: 'text';
	readonly content: string;
	readonly style?: TextStyle;
	readonly selectable?: boolean;
	readonly attrs: BaseAttrs;
}

export interface TextEditor {
	readonly tag: 'texteditor';
	readonly content: string;
	readonly placeholder?: string;
	readonly style?: TextStyle;
	readonly editable?: boolean;
	readonly onInput?: MsgTag;
	readonly onSubmit?: MsgTag;
	readonly attrs: BaseAttrs;
}

export interface SplitView {
	readonly tag: 'splitview';
	readonly direction: 'horizontal' | 'vertical';
	readonly left: View;
	readonly right: View;
	readonly dividerPosition?: number; // 0-1
	readonly attrs: BaseAttrs;
}

export interface ScrollView {
	readonly tag: 'scrollview';
	readonly child: View;
	readonly horizontal?: boolean;
	readonly vertical?: boolean;
	readonly attrs: BaseAttrs;
}

export interface TreeNode<T = unknown> {
	readonly id: string;
	readonly data: T;
	readonly children: readonly TreeNode<T>[];
	readonly expanded?: boolean;
}

export interface TreeView {
	readonly tag: 'treeview';
	readonly root: TreeNode;
	readonly renderNode: (node: TreeNode) => View;
	readonly onSelect?: MsgTag;
	readonly onExpand?: MsgTag;
	readonly attrs: BaseAttrs;
}

export interface Button {
	readonly tag: 'button';
	readonly label: string;
	readonly onClick: MsgTag;
	readonly disabled?: boolean;
	readonly attrs: BaseAttrs;
}

export interface Spacer {
	readonly tag: 'spacer';
	readonly attrs: BaseAttrs;
}

export interface Empty {
	readonly tag: 'empty';
	readonly attrs: BaseAttrs;
}

// ============================================================================
// Message Types — Events from UI
// ============================================================================

/** Tag for routing events back to update function */
export type MsgTag = string;

/** Raw event from UI backend */
export interface UIEvent {
	readonly tag: MsgTag;
	readonly viewId?: ViewId;
	readonly payload: unknown;
}

// ============================================================================
// Command Types — Effect Descriptions
// ============================================================================

/** Commands are descriptions of side effects, not executions */
export type Cmd<Msg> =
	| CmdNone
	| CmdBatch<Msg>
	| CmdSend<Msg>
	| CmdIO
	| CmdClipboard
	| CmdOpenFile;

export interface CmdNone {
	readonly tag: 'none';
}

export interface CmdBatch<Msg> {
	readonly tag: 'batch';
	readonly cmds: readonly Cmd<Msg>[];
}

export interface CmdSend<Msg> {
	readonly tag: 'send';
	readonly msg: Msg;
	readonly delay?: number;
}

export interface CmdIO {
	readonly tag: 'io';
	readonly action: () => Promise<unknown>;
	readonly onResult: MsgTag;
	readonly onError?: MsgTag;
}

export interface CmdClipboard {
	readonly tag: 'clipboard';
	readonly action: 'read' | 'write';
	readonly content?: string;
	readonly onResult?: MsgTag;
}

export interface CmdOpenFile {
	readonly tag: 'openfile';
	readonly path: string;
}

// ============================================================================
// App Definition — The Elm Architecture
// ============================================================================

/** An App is defined by its State, Msg, and three pure functions */
export interface App<State, Msg> {
	/** Initial state */
	readonly init: () => [State, Cmd<Msg>];
	
	/** Pure state transition: (state, msg) => [newState, effects] */
	readonly update: (state: State, msg: Msg) => [State, Cmd<Msg>];
	
	/** Pure view function: state => viewTree */
	readonly view: (state: State) => View;
	
	/** Map raw UI events to typed messages */
	readonly eventToMsg: (event: UIEvent) => Msg | null;
}

// ============================================================================
// Subscriptions — External event sources
// ============================================================================

export type Sub<Msg> =
	| SubNone
	| SubBatch<Msg>
	| SubTimer
	| SubChannel;

export interface SubNone {
	readonly tag: 'none';
}

export interface SubBatch<Msg> {
	readonly tag: 'batch';
	readonly subs: readonly Sub<Msg>[];
}

export interface SubTimer {
	readonly tag: 'timer';
	readonly intervalMs: number;
	readonly onTick: MsgTag;
}

export interface SubChannel {
	readonly tag: 'channel';
	readonly name: string;
	readonly onMessage: MsgTag;
}

// ============================================================================
// Helpers — Smart constructors
// ============================================================================

export const none: CmdNone = { tag: 'none' };

export function batch<Msg>(...cmds: Cmd<Msg>[]): CmdBatch<Msg> {
	return { tag: 'batch', cmds };
}

export function send<Msg>(msg: Msg, delay?: number): CmdSend<Msg> {
	return { tag: 'send', msg, delay };
}

export function io<Msg>(
	action: () => Promise<unknown>,
	onResult: MsgTag,
	onError?: MsgTag
): CmdIO {
	return { tag: 'io', action, onResult, onError };
}
