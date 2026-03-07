import type { AssistantMessage, TurnEndMessage, TurnStartMessage } from "@punkin-pi/ai";
import { now } from "@punkin-pi/ai";
import { Container } from "@punkin-pi/tui";
import { beforeAll, describe, expect, test, vi } from "vitest";
import { AgentSession } from "../src/core/agent-session.js";
import { InteractiveMode } from "../src/modes/interactive/interactive-mode.js";
import { initTheme } from "../src/modes/interactive/theme/theme.js";

function mkAssistant(overrides: Partial<AssistantMessage> = {}): AssistantMessage {
	return {
		role: "assistant",
		content: [],
		api: "anthropic-messages",
		provider: "anthropic",
		model: "claude-haiku-4-5",
		usage: {
			input: 0,
			output: 0,
			cacheRead: 0,
			cacheWrite: 0,
			totalTokens: 0,
			cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
		},
		stopReason: "stop",
		timestamp: now(),
		endTimestamp: now(),
		...overrides,
	};
}

function mkBoundary(turn: number): [TurnStartMessage, TurnEndMessage] {
	const ts = now();
	return [
		{
			role: "turnStart",
			turn,
			sigil: "🧿",
			nonce: "test-nonce-a",
			timestamp: ts,
			delta: "0s",
		},
		{
			role: "turnEnd",
			turn,
			sigil: "🧿",
			nonce: "test-nonce-a",
			hash: "abcdef123456",
			timestamp: ts,
			durationMs: 50,
		},
	];
}

describe("empty-turn and turn-boundary stress", () => {
	beforeAll(() => {
		initTheme("dark");
	});
	test("interactive mode: repeated empty aborted turns do not leave ghost assistant components", async () => {
		const fakeThis: any = {
			isInitialized: true,
			chatContainer: new Container(),
			ui: { requestRender: vi.fn() },
			hideThinkingBlock: false,
			getMarkdownThemeWithSettings: () => undefined,
			pendingTools: new Map(),
			footer: { invalidate: vi.fn() },
			lastAssistantComponent: undefined,
			streamingComponent: undefined,
			streamingMessage: undefined,
			session: { retryAttempt: 0 },
		};

		for (let i = 0; i < 50; i++) {
			const msg = mkAssistant({ stopReason: "aborted", content: [] });
			await (InteractiveMode as any).prototype.handleEvent.call(fakeThis, {
				type: "message_start",
				message: msg,
			});
			await (InteractiveMode as any).prototype.handleEvent.call(fakeThis, {
				type: "message_end",
				message: msg,
			});
		}

		expect(fakeThis.streamingComponent).toBeUndefined();
		expect(fakeThis.streamingMessage).toBeUndefined();
		expect(fakeThis.lastAssistantComponent).toBeUndefined();
		expect(fakeThis.chatContainer.children.length).toBe(0);
	});

	test("agent-session: turn boundary injection finds assistant via timestamp fallback", () => {
		const stateMessage = mkAssistant({
			content: [{ type: "text", text: "hello" }],
			timestamp: "2026-03-07T17:00:00.000Z",
			endTimestamp: "2026-03-07T17:00:01.000Z",
		});
		const eventMessage = mkAssistant({
			content: [{ type: "text", text: "hello" }],
			timestamp: stateMessage.timestamp,
			endTimestamp: stateMessage.endTimestamp,
		});

		const [turnStart, turnEnd] = mkBoundary(1);
		const fakeThis: any = {
			_carterKit: {
				onAssistantTurnEnd: vi.fn(() => [turnStart, turnEnd]),
			},
			agent: { state: { messages: [stateMessage] } },
			sessionManager: { appendTurnBoundary: vi.fn() },
			_emit: vi.fn(),
		};

		(AgentSession as any).prototype._injectTurnBoundaries.call(fakeThis, {
			type: "turn_end",
			message: eventMessage,
			toolResults: [],
		});

		expect(fakeThis.agent.state.messages.map((m: any) => m.role)).toEqual([
			"turnStart",
			"assistant",
			"turnEnd",
		]);
		expect(fakeThis.sessionManager.appendTurnBoundary).toHaveBeenCalledTimes(2);
		expect(fakeThis._emit).toHaveBeenCalledWith({ type: "turn_boundary", turnStart, turnEnd });
	});

	test("agent-session: suppresses truly phantom empty turn, but still emits for non-empty unanchored turn", () => {
		const [turnStartA, turnEndA] = mkBoundary(1);
		const [turnStartB, turnEndB] = mkBoundary(2);
		const fakeThis: any = {
			_carterKit: {
				onAssistantTurnEnd: vi
					.fn()
					.mockReturnValueOnce([turnStartA, turnEndA])
					.mockReturnValueOnce([turnStartB, turnEndB]),
			},
			agent: { state: { messages: [] as any[] } },
			sessionManager: { appendTurnBoundary: vi.fn() },
			_emit: vi.fn(),
		};

		// Truly phantom: no anchor, no content, no tool results -> suppressed
		(AgentSession as any).prototype._injectTurnBoundaries.call(fakeThis, {
			type: "turn_end",
			message: mkAssistant({ stopReason: "aborted", content: [] }),
			toolResults: [],
		});

		expect(fakeThis.sessionManager.appendTurnBoundary).toHaveBeenCalledTimes(0);
		expect(fakeThis._emit).toHaveBeenCalledTimes(0);

		// Unanchored but real: has content -> still emit/persist boundaries
		(AgentSession as any).prototype._injectTurnBoundaries.call(fakeThis, {
			type: "turn_end",
			message: mkAssistant({ content: [{ type: "text", text: "hi" }] }),
			toolResults: [],
		});

		expect(fakeThis.sessionManager.appendTurnBoundary).toHaveBeenCalledTimes(2);
		expect(fakeThis._emit).toHaveBeenCalledWith({ type: "turn_boundary", turnStart: turnStartB, turnEnd: turnEndB });
	});
});
