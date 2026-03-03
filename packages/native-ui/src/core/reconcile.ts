/**
 * Reconciliation — Diff two view trees and produce patches.
 * 
 * This is the core of efficient UI updates. Instead of rebuilding
 * the entire native UI on every state change, we compute the minimal
 * set of mutations needed.
 * 
 * The algorithm:
 * 1. Compare old and new view trees node-by-node
 * 2. If nodes have same tag and id, recurse into children
 * 3. If nodes differ, emit Replace patch
 * 4. Track attribute changes for in-place updates
 */

import type { View, ViewId, BaseAttrs, TreeNode } from './types.js';

// ============================================================================
// Patch Types
// ============================================================================

export type Path = readonly number[];

export type Patch =
	| PatchCreate
	| PatchRemove
	| PatchReplace
	| PatchUpdateAttrs
	| PatchUpdateText
	| PatchUpdateChildren
	| PatchReorder;

export interface PatchCreate {
	readonly type: 'create';
	readonly path: Path;
	readonly view: View;
}

export interface PatchRemove {
	readonly type: 'remove';
	readonly path: Path;
}

export interface PatchReplace {
	readonly type: 'replace';
	readonly path: Path;
	readonly view: View;
}

export interface PatchUpdateAttrs {
	readonly type: 'update-attrs';
	readonly path: Path;
	readonly attrs: Partial<BaseAttrs>;
}

export interface PatchUpdateText {
	readonly type: 'update-text';
	readonly path: Path;
	readonly content: string;
}

export interface PatchUpdateChildren {
	readonly type: 'update-children';
	readonly path: Path;
	readonly patches: readonly Patch[];
}

export interface PatchReorder {
	readonly type: 'reorder';
	readonly path: Path;
	readonly moves: readonly { from: number; to: number }[];
}

// ============================================================================
// Reconciliation
// ============================================================================

/**
 * Diff two view trees and return patches to transform old into new.
 */
export function reconcile(oldView: View | null, newView: View | null): Patch[] {
	return reconcileAt([], oldView, newView);
}

function reconcileAt(path: Path, oldView: View | null, newView: View | null): Patch[] {
	// Create
	if (oldView === null && newView !== null) {
		return [{ type: 'create', path, view: newView }];
	}

	// Remove
	if (oldView !== null && newView === null) {
		return [{ type: 'remove', path }];
	}

	// Both null
	if (oldView === null || newView === null) {
		return [];
	}

	// Different tags → replace entire subtree
	if (oldView.tag !== newView.tag) {
		return [{ type: 'replace', path, view: newView }];
	}

	// Same tag — diff based on type
	const patches: Patch[] = [];

	// Diff attributes
	const attrPatches = diffAttrs(oldView.attrs, newView.attrs);
	if (attrPatches !== null) {
		patches.push({ type: 'update-attrs', path, attrs: attrPatches });
	}

	// Type-specific diffing
	switch (oldView.tag) {
		case 'text':
			if (newView.tag === 'text' && oldView.content !== newView.content) {
				patches.push({ type: 'update-text', path, content: newView.content });
			}
			break;

		case 'texteditor':
			if (newView.tag === 'texteditor' && oldView.content !== newView.content) {
				patches.push({ type: 'update-text', path, content: newView.content });
			}
			break;

		case 'vstack':
		case 'hstack':
			if (newView.tag === 'vstack' || newView.tag === 'hstack') {
				const childPatches = reconcileChildren(path, oldView.children, newView.children);
				if (childPatches.length > 0) {
					patches.push({ type: 'update-children', path, patches: childPatches });
				}
			}
			break;

		case 'zstack':
			if (newView.tag === 'zstack') {
				const childPatches = reconcileChildren(path, oldView.children, newView.children);
				if (childPatches.length > 0) {
					patches.push({ type: 'update-children', path, patches: childPatches });
				}
			}
			break;

		case 'splitview':
			if (newView.tag === 'splitview') {
				patches.push(...reconcileAt([...path, 0], oldView.left, newView.left));
				patches.push(...reconcileAt([...path, 1], oldView.right, newView.right));
			}
			break;

		case 'scrollview':
			if (newView.tag === 'scrollview') {
				patches.push(...reconcileAt([...path, 0], oldView.child, newView.child));
			}
			break;

		case 'treeview':
			if (newView.tag === 'treeview') {
				// Trees are complex — for now, replace if root changes
				if (!treeEquals(oldView.root, newView.root)) {
					patches.push({ type: 'replace', path, view: newView });
				}
			}
			break;

		case 'button':
			if (newView.tag === 'button' && oldView.label !== newView.label) {
				patches.push({ type: 'update-text', path, content: newView.label });
			}
			break;

		case 'spacer':
		case 'empty':
			// Nothing to diff
			break;
	}

	return patches;
}

/**
 * Reconcile children arrays.
 * Uses keys (from attrs.id) for efficient reordering when available.
 */
function reconcileChildren(
	parentPath: Path,
	oldChildren: readonly View[],
	newChildren: readonly View[]
): Patch[] {
	const patches: Patch[] = [];

	// Build key maps
	const oldKeys = new Map<string, { view: View; index: number }>();
	const newKeys = new Map<string, { view: View; index: number }>();

	for (let i = 0; i < oldChildren.length; i++) {
		const key = oldChildren[i].attrs.id;
		if (key) oldKeys.set(key, { view: oldChildren[i], index: i });
	}

	for (let i = 0; i < newChildren.length; i++) {
		const key = newChildren[i].attrs.id;
		if (key) newKeys.set(key, { view: newChildren[i], index: i });
	}

	// If we have keys, use keyed diffing
	const hasKeys = oldKeys.size > 0 || newKeys.size > 0;

	if (hasKeys) {
		// Keyed reconciliation
		const processed = new Set<string>();

		// Process new children in order
		for (let i = 0; i < newChildren.length; i++) {
			const newChild = newChildren[i];
			const key = newChild.attrs.id;

			if (key && oldKeys.has(key)) {
				// Existing keyed element — diff it
				const old = oldKeys.get(key)!;
				patches.push(...reconcileAt([...parentPath, i], old.view, newChild));
				processed.add(key);
			} else if (key) {
				// New keyed element
				patches.push({ type: 'create', path: [...parentPath, i], view: newChild });
			} else {
				// Unkeyed — match by position if possible
				if (i < oldChildren.length && !oldChildren[i].attrs.id) {
					patches.push(...reconcileAt([...parentPath, i], oldChildren[i], newChild));
				} else {
					patches.push({ type: 'create', path: [...parentPath, i], view: newChild });
				}
			}
		}

		// Remove old elements not in new
		for (const [key, { index }] of oldKeys) {
			if (!processed.has(key) && !newKeys.has(key)) {
				patches.push({ type: 'remove', path: [...parentPath, index] });
			}
		}
	} else {
		// Positional reconciliation (no keys)
		const maxLen = Math.max(oldChildren.length, newChildren.length);

		for (let i = 0; i < maxLen; i++) {
			const oldChild = i < oldChildren.length ? oldChildren[i] : null;
			const newChild = i < newChildren.length ? newChildren[i] : null;
			patches.push(...reconcileAt([...parentPath, i], oldChild, newChild));
		}
	}

	return patches;
}

/**
 * Diff attributes and return changed values, or null if identical.
 */
function diffAttrs(oldAttrs: BaseAttrs, newAttrs: BaseAttrs): Partial<BaseAttrs> | null {
	const changes: Partial<BaseAttrs> = {};
	let hasChanges = false;

	const keys = new Set([
		...Object.keys(oldAttrs),
		...Object.keys(newAttrs),
	]) as Set<keyof BaseAttrs>;

	for (const key of keys) {
		const oldVal = oldAttrs[key];
		const newVal = newAttrs[key];

		if (!deepEqual(oldVal, newVal)) {
			(changes as Record<string, unknown>)[key] = newVal;
			hasChanges = true;
		}
	}

	return hasChanges ? changes : null;
}

/**
 * Simple deep equality check for attribute values.
 */
function deepEqual(a: unknown, b: unknown): boolean {
	if (a === b) return true;
	if (a === null || b === null) return false;
	if (typeof a !== typeof b) return false;

	if (typeof a === 'object' && typeof b === 'object') {
		const aKeys = Object.keys(a as object);
		const bKeys = Object.keys(b as object);

		if (aKeys.length !== bKeys.length) return false;

		for (const key of aKeys) {
			if (!deepEqual((a as Record<string, unknown>)[key], (b as Record<string, unknown>)[key])) {
				return false;
			}
		}

		return true;
	}

	return false;
}

/**
 * Check if two tree nodes are structurally equal.
 */
function treeEquals(a: TreeNode, b: TreeNode): boolean {
	if (a.id !== b.id) return false;
	if (a.expanded !== b.expanded) return false;
	if (a.children.length !== b.children.length) return false;

	for (let i = 0; i < a.children.length; i++) {
		if (!treeEquals(a.children[i], b.children[i])) return false;
	}

	// Note: we don't deep-compare data, just structure
	return true;
}

// ============================================================================
// Debug Utilities
// ============================================================================

export function patchToString(patch: Patch): string {
	const pathStr = `[${patch.path.join(',')}]`;
	switch (patch.type) {
		case 'create':
			return `CREATE ${pathStr} ${patch.view.tag}`;
		case 'remove':
			return `REMOVE ${pathStr}`;
		case 'replace':
			return `REPLACE ${pathStr} → ${patch.view.tag}`;
		case 'update-attrs':
			return `ATTRS ${pathStr} ${JSON.stringify(patch.attrs)}`;
		case 'update-text':
			return `TEXT ${pathStr} "${patch.content.slice(0, 20)}..."`;
		case 'update-children':
			return `CHILDREN ${pathStr} (${patch.patches.length} patches)`;
		case 'reorder':
			return `REORDER ${pathStr}`;
	}
}
