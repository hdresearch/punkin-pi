/**
 * Declarative View DSL.
 * 
 * Views are pure data — no effects, no ObjC, no koffi.
 * This is the nice part that Ed Kmett wouldn't be embarrassed by.
 */

// ============================================================================
// Types
// ============================================================================

export interface Color {
  readonly r: number;
  readonly g: number;
  readonly b: number;
  readonly a: number;
}

export interface Insets {
  readonly top: number;
  readonly left: number;
  readonly bottom: number;
  readonly right: number;
}

export interface TextStyle {
  readonly size: number;
  readonly color: Color;
  readonly weight: number;  // 0.0 - 1.0
  readonly mono: boolean;
}

// ============================================================================
// View — A sum type
// ============================================================================

export type Distribution = 'fill' | 'gravity' | 'equalSpacing';

export type View =
  | { tag: 'vstack'; children: View[]; spacing: number; insets: Insets; distribution: Distribution }
  | { tag: 'hstack'; children: View[]; spacing: number; insets: Insets; distribution: Distribution }
  | { tag: 'scroll'; child: View }
  | { tag: 'text'; content: string; style: TextStyle; maxWidth?: number }
  | { tag: 'input'; placeholder: string }
  | { tag: 'textArea'; placeholder: string; minHeight: number }  // multi-line resizable
  | { tag: 'button'; label: string }
  | { tag: 'box'; child: View; fill: Color; radius: number }
  | { tag: 'spacer' }
  | { tag: 'layer'; child: View; background: Color }
  | { tag: 'sized'; child: View; width?: number; height?: number }
  | { tag: 'splitV'; top: View; bottom: View; dividerPos?: number } // vertical split with draggable divider
  | { tag: 'vibrancy'; child: View; material?: number }; // NSVisualEffectView frosted glass

// ============================================================================
// Colors
// ============================================================================

export const rgb = (r: number, g: number, b: number, a = 1): Color => ({ r, g, b, a });

// Light mode colors
export const colors = {
  bg:         rgb(0.98, 0.98, 0.98),
  sidebar:    rgb(0.95, 0.95, 0.96),
  card:       rgb(1, 1, 1),
  cardUser:   rgb(0.93, 0.95, 1),
  input:      rgb(0.96, 0.96, 0.97),
  inputBg:    rgb(1, 1, 1),
  text:       rgb(0.1, 0.1, 0.1),
  textDim:    rgb(0.45, 0.45, 0.5),
  accent:     rgb(0.2, 0.4, 0.9),
  green:      rgb(0.15, 0.6, 0.35),
  orange:     rgb(0.9, 0.5, 0.1),
  cyan:       rgb(0.1, 0.6, 0.7),
  transparent: rgb(0, 0, 0, 0),
};

// ============================================================================
// Default styles
// ============================================================================

const defaultInsets: Insets = { top: 0, left: 0, bottom: 0, right: 0 };

const defaultText: TextStyle = {
  size: 13,
  color: colors.text,
  weight: 0.4,
  mono: false,
};

// ============================================================================
// Smart constructors — build views declaratively
// ============================================================================

export const vstack = (
  children: View[],
  opts: { spacing?: number; insets?: Partial<Insets>; distribution?: Distribution } = {}
): View => ({
  tag: 'vstack',
  children,
  spacing: opts.spacing ?? 8,
  insets: { ...defaultInsets, ...opts.insets },
  distribution: opts.distribution ?? 'gravity',  // default: natural sizes
});

export const hstack = (
  children: View[],
  opts: { spacing?: number; insets?: Partial<Insets>; distribution?: Distribution } = {}
): View => ({
  tag: 'hstack',
  children,
  spacing: opts.spacing ?? 8,
  insets: { ...defaultInsets, ...opts.insets },
  distribution: opts.distribution ?? 'gravity',  // default: natural sizes
});

export const scroll = (child: View): View => ({
  tag: 'scroll',
  child,
});

export const text = (
  content: string,
  opts: Partial<TextStyle> & { maxWidth?: number } = {}
): View => ({
  tag: 'text',
  content,
  style: { ...defaultText, ...opts },
  maxWidth: opts.maxWidth,
});

export const label = (content: string, size = 13, color = colors.text): View =>
  text(content, { size, color });

export const bold = (content: string, size = 13, color = colors.text): View =>
  text(content, { size, color, weight: 0.6 });

export const code = (content: string, size = 11, color = colors.textDim): View =>
  text(content, { size, color, mono: true });

export const input = (placeholder: string): View => ({
  tag: 'input',
  placeholder,
});

export const textArea = (placeholder: string, minHeight = 60): View => ({
  tag: 'textArea',
  placeholder,
  minHeight,
});

export const splitV = (top: View, bottom: View, dividerPos?: number): View => ({
  tag: 'splitV',
  top,
  bottom,
  dividerPos,
});

export const button = (label: string): View => ({
  tag: 'button',
  label,
});

export const box = (
  child: View,
  opts: { fill?: Color; radius?: number } = {}
): View => ({
  tag: 'box',
  child,
  fill: opts.fill ?? colors.card,
  radius: opts.radius ?? 8,
});

export const spacer: View = { tag: 'spacer' };

export const layer = (child: View, background: Color): View => ({
  tag: 'layer',
  child,
  background,
});

export const sized = (child: View, opts: { width?: number; height?: number }): View => ({
  tag: 'sized',
  child,
  width: opts.width,
  height: opts.height,
});

/** NSVisualEffectView — frosted glass sidebar/panel material */
export const vibrancy = (child: View, material = 7 /* sidebar */): View => ({
  tag: 'vibrancy',
  child,
  material,
});

// ============================================================================
// Higher-level components — built from primitives
// ============================================================================

export const card = (children: View[], opts: { fill?: Color; insets?: Partial<Insets> } = {}): View =>
  box(
    vstack(children, { insets: { top: 12, left: 14, bottom: 12, right: 14, ...opts.insets } }),
    { fill: opts.fill ?? colors.card, radius: 10 }
  );

export const message = (
  role: 'user' | 'assistant',
  content: string,
  extras: View[] = []
): View =>
  card(
    [
      bold(role === 'user' ? 'You' : 'Assistant', 11, role === 'user' ? colors.accent : colors.green),
      text(content, { size: 13.5, maxWidth: 600 }),
      ...extras,
    ],
    { fill: role === 'user' ? colors.cardUser : colors.card }
  );

export const thinking = (content: string): View =>
  box(
    vstack([
      code('⟨squiggle⟩', 10),
      code(content, 11, rgb(0.4, 0.4, 0.45)),
    ], { insets: { top: 8, left: 10, bottom: 8, right: 10 } }),
    { fill: rgb(0.92, 0.92, 0.94), radius: 6 }
  );

export const toolCall = (name: string, status: 'pending' | 'running' | 'complete', output?: string): View => {
  const icon = status === 'complete' ? '✓' : status === 'running' ? '⟳' : '○';
  const iconColor = status === 'complete' ? colors.green : colors.orange;
  
  return box(
    vstack([
      hstack([label(icon, 11, iconColor), code(name, 12)], { spacing: 6 }),
      ...(output ? [code(output, 10)] : []),
    ], { insets: { top: 8, left: 10, bottom: 8, right: 10 } }),
    { fill: rgb(0.94, 0.95, 0.96), radius: 6 }
  );
};

export const handle = (id: string, type: string, tokens: number, lines: number): View =>
  box(
    hstack([
      bold(id, 11, colors.cyan),
      label(type, 11, colors.textDim),
      code(`${tokens} tok`),
      code(`${lines} ln`),
      label('▶', 10, colors.textDim),
    ], { spacing: 10, insets: { top: 6, left: 10, bottom: 6, right: 10 } }),
    { fill: rgb(0.9, 0.94, 0.97), radius: 6 }
  );

export const sessionItem = (name: string, count: number, selected = false): View =>
  box(
    hstack([
      label(name, 12, selected ? colors.bg : colors.text),
      spacer,
      label(`${count}`, 10, selected ? rgb(0, 0, 0, 0.5) : colors.textDim),
    ], { insets: { top: 8, left: 12, bottom: 8, right: 12 } }),
    { fill: selected ? colors.accent : colors.transparent, radius: 6 }
  );
