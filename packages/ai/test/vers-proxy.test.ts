/**
 * Vers LLM Proxy Provider Tests
 *
 * Routes Anthropic models through the Vers proxy (tokens.vers.sh).
 * Requires LLM_PROXY_KEY to be set.
 *
 * Run: LLM_PROXY_KEY=sk-vers-... npx vitest run test/vers-proxy.test.ts
 */

import { Type } from "@sinclair/typebox";
import { describe, expect, it } from "vitest";
import { getModel } from "../src/models.js";
import { complete, stream } from "../src/stream.js";
import type { Api, Context, Model, StreamOptions, Tool } from "../src/types.js";
import { StringEnum } from "../src/utils/typebox-helpers.js";

const versApiKey = process.env.LLM_PROXY_KEY;

const calculatorSchema = Type.Object({
	a: Type.Number({ description: "First number" }),
	b: Type.Number({ description: "Second number" }),
	operation: StringEnum(["add", "subtract", "multiply", "divide"], {
		description: "The operation to perform. One of 'add', 'subtract', 'multiply', 'divide'.",
	}),
});

const calculatorTool: Tool<typeof calculatorSchema> = {
	name: "math_operation",
	description: "Perform basic arithmetic operations",
	parameters: calculatorSchema,
};

async function basicTextGeneration<TApi extends Api>(model: Model<TApi>, options?: StreamOptions) {
	const context: Context = {
		systemPrompt: "You are a helpful assistant. Be concise.",
		messages: [{ role: "user", content: "Reply with exactly: 'Hello test successful'", timestamp: Date.now() }],
	};
	const response = await complete(model, context, options);

	expect(response.role).toBe("assistant");
	expect(response.content).toBeTruthy();
	expect(response.usage.input + response.usage.cacheRead).toBeGreaterThan(0);
	expect(response.usage.output).toBeGreaterThan(0);
	expect(response.errorMessage).toBeFalsy();
	expect(response.content.map((b) => (b.type === "text" ? b.text : "")).join("")).toContain("Hello test successful");
}

async function handleToolCall<TApi extends Api>(model: Model<TApi>, options?: StreamOptions) {
	const context: Context = {
		systemPrompt: "You are a helpful assistant that uses tools when asked.",
		messages: [{ role: "user", content: "What is 42 + 17? Use the math_operation tool.", timestamp: Date.now() }],
		tools: [calculatorTool],
	};
	const response = await complete(model, context, options);

	expect(response.role).toBe("assistant");
	const toolCalls = response.content.filter((b) => b.type === "toolCall");
	expect(toolCalls.length).toBeGreaterThan(0);

	const toolCall = toolCalls[0];
	if (toolCall.type === "toolCall") {
		expect(toolCall.name).toBe("math_operation");
		expect(toolCall.arguments).toMatchObject({ a: 42, b: 17, operation: "add" });
	}
}

async function handleStreaming<TApi extends Api>(model: Model<TApi>, options?: StreamOptions) {
	const context: Context = {
		systemPrompt: "You are a helpful assistant. Be concise.",
		messages: [{ role: "user", content: "Count from 1 to 5, one number per line.", timestamp: Date.now() }],
	};

	const events: string[] = [];
	const eventStream = stream(model, context, options);

	for await (const event of eventStream) {
		events.push(event.type);
	}

	expect(events).toContain("start");
	expect(events).toContain("text_start");
	expect(events).toContain("text_delta");
	expect(events).toContain("text_end");
	expect(events.at(-1)).toBe("done");
}

async function handleThinking<TApi extends Api>(model: Model<TApi>, options?: StreamOptions) {
	const context: Context = {
		systemPrompt: "You are a helpful assistant.",
		messages: [{ role: "user", content: "What is 15 * 23? Think step by step.", timestamp: Date.now() }],
	};
	const response = await complete(model, context, options);

	expect(response.role).toBe("assistant");
	expect(response.content).toBeTruthy();
	expect(response.errorMessage).toBeFalsy();

	const thinkingBlocks = response.content.filter((b) => b.type === "thinking");
	expect(thinkingBlocks.length).toBeGreaterThan(0);

	const textBlocks = response.content.filter((b) => b.type === "text");
	expect(textBlocks.length).toBeGreaterThan(0);
	expect(textBlocks.map((b) => (b.type === "text" ? b.text : "")).join("")).toContain("345");
}

describe("Vers Proxy Provider", () => {
	describe.skipIf(!versApiKey)("claude-sonnet-4-6 (via Vers proxy)", () => {
		const model = getModel("vers", "claude-sonnet-4-6");
		const opts = { apiKey: versApiKey! };

		it("should complete basic text generation", { retry: 3, timeout: 30000 }, async () => {
			await basicTextGeneration(model, opts);
		});

		it("should handle tool calling", { retry: 3, timeout: 30000 }, async () => {
			await handleToolCall(model, opts);
		});

		it("should handle streaming", { retry: 3, timeout: 30000 }, async () => {
			await handleStreaming(model, opts);
		});

		it("should handle thinking", { retry: 3, timeout: 60000 }, async () => {
			await handleThinking(model, { ...opts, thinkingEnabled: true, thinkingBudgetTokens: 2048 });
		});
	});

	describe.skipIf(!versApiKey)("claude-haiku-4-5-20251001 (via Vers proxy)", () => {
		const model = getModel("vers", "claude-haiku-4-5-20251001");
		const opts = { apiKey: versApiKey! };

		it("should complete basic text generation", { retry: 3, timeout: 30000 }, async () => {
			await basicTextGeneration(model, opts);
		});

		it("should handle tool calling", { retry: 3, timeout: 30000 }, async () => {
			await handleToolCall(model, opts);
		});

		it("should handle streaming", { retry: 3, timeout: 30000 }, async () => {
			await handleStreaming(model, opts);
		});
	});

	describe("model registry", () => {
		it("should have vers models registered", () => {
			const model = getModel("vers", "claude-sonnet-4-6");
			expect(model).toBeDefined();
			expect(model.provider).toBe("vers");
			expect(model.baseUrl).toBe("https://tokens.vers.sh");
			expect(model.api).toBe("anthropic-messages");
		});

		it("should have all expected vers models", () => {
			const expectedModels = [
				"claude-sonnet-4-6",
				"claude-opus-4-6",
				"claude-sonnet-4-20250514",
				"claude-opus-4-20250514",
				"claude-haiku-4-5-20251001",
			];
			for (const id of expectedModels) {
				const model = getModel("vers", id);
				expect(model, `vers model '${id}' should exist`).toBeDefined();
				expect(model.provider).toBe("vers");
				expect(model.baseUrl).toBe("https://tokens.vers.sh");
			}
		});
	});
});
