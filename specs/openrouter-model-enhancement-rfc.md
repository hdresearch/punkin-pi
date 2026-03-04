# RFC: OpenRouter Model Enhancement

**Author:** Carter Schonwald  
**Date:** 2026-03-03  
**Status:** Draft  
**Tracking:** punkin-pi/specs/openrouter-model-enhancement-rfc.md

---

## Summary

Enhance punkin's OpenRouter integration to:
1. Fix reasoning parameter format (critical bug)
2. Capture full model metadata from OpenRouter API
3. Support extended sampling parameters
4. Enable proper provider routing (BYOK, Anthropic sub-keys, etc.)
5. Add video modality support
6. Derive model-family-specific compat settings at build time

---

## Motivation

### The Immediate Bug

When using reasoning-capable models via OpenRouter (e.g., `qwen/qwen3.5-35b-a3b`), users see only CoT output with no final response.

**Root cause:** We send `reasoning_effort: "high"` (OpenAI native format), but OpenRouter expects:

```json
{
  "reasoning": {
    "effort": "high"
  }
}
```

### The Deeper Problem

We're dropping significant metadata from the OpenRouter API that would enable:
- Proper reasoning format selection per model family
- Extended sampling controls (top_k, min_p, etc.)
- Provider routing for BYOK and sub-keys
- Video input support
- Informed defaults per model

**Currently captured:**
- id, name, context_length, max_completion_tokens
- pricing (input, output, cache)
- basic modalities (text, image)
- reasoning capability (boolean)

**Currently dropped:**
- `hugging_face_id` — model provenance
- `supported_parameters` — exactly what each model accepts
- `default_parameters` — recommended settings
- `architecture.input_modalities` — includes video
- `canonical_slug` — versioned identifier
- `description` — model documentation
- `expiration_date` — deprecation tracking

---

## Design

### 1. Type Definitions

#### 1.1 Sampling Options

```typescript
/**
 * Extended sampling parameters.
 * 
 * These map to OpenAI-compatible parameters but are normalized
 * to camelCase in our API. When sending to providers, we convert
 * to the provider's expected format (usually snake_case).
 * 
 * Not all providers support all parameters. When a parameter is
 * unsupported, it may be silently ignored or cause an error
 * depending on the provider's behavior.
 */
export interface SamplingOptions {
  /** 
   * Randomness of output. 0 = deterministic, higher = more random.
   * Range: [0, 2] for most providers.
   * Default: varies by model (often 1.0 for Qwen, 0.7 for GPT)
   */
  temperature?: number;
  
  /**
   * Nucleus sampling: only consider tokens with cumulative probability >= topP.
   * Range: (0, 1]
   * Mutually exclusive with topK on some providers.
   */
  topP?: number;
  
  /**
   * Only consider the top K most likely tokens.
   * Range: [1, vocabulary_size]
   * Mutually exclusive with topP on some providers.
   */
  topK?: number;
  
  /**
   * Minimum probability threshold. Tokens below this probability are excluded.
   * Range: [0, 1]
   * Newer alternative to topP, cleaner semantics.
   * Supported by: Qwen, some others
   */
  minP?: number;
  
  /**
   * Penalize tokens based on their frequency in the output so far.
   * Range: [-2, 2], 0 = no penalty
   * Positive = discourage repetition, negative = encourage
   */
  frequencyPenalty?: number;
  
  /**
   * Penalize tokens that have appeared at all in the output.
   * Range: [-2, 2], 0 = no penalty
   */
  presencePenalty?: number;
  
  /**
   * Combined repetition penalty (Qwen/Llama style).
   * Range: [1, 2], 1 = no penalty
   * Different semantics from frequency/presence penalties.
   */
  repetitionPenalty?: number;
  
  /**
   * Random seed for deterministic generation.
   * Same seed + same input = same output (provider permitting).
   */
  seed?: number;
}
```

#### 1.2 OpenRouter Reasoning

```typescript
/**
 * OpenRouter's unified reasoning configuration.
 * 
 * OpenRouter normalizes reasoning across providers:
 * - Translates to `enable_thinking` for Qwen
 * - Translates to `thinking` object for Z.ai/GLM
 * - Translates to extended thinking for Anthropic
 * - Translates to `thinkingLevel` for Gemini 3
 * 
 * We send this format when targeting OpenRouter, regardless of
 * the underlying model. OpenRouter handles the translation.
 */
export interface OpenRouterReasoning {
  /**
   * Reasoning effort level (OpenAI-style).
   * Maps to different token budgets internally.
   * 
   * Approximate mappings:
   * - xhigh: ~95% of max_tokens for reasoning
   * - high: ~80%
   * - medium: ~50%
   * - low: ~20%
   * - minimal: ~10%
   * - none: disabled
   */
  effort?: "xhigh" | "high" | "medium" | "low" | "minimal" | "none";
  
  /**
   * Direct token budget for reasoning (Anthropic-style).
   * Takes precedence over `effort` when specified.
   * Minimum: 1024, Maximum: 128000
   */
  maxTokens?: number;
  
  /**
   * Use reasoning internally but exclude from response.
   * Model still "thinks" but you don't see it.
   * Useful for: faster responses, cost savings, cleaner output
   */
  exclude?: boolean;
  
  /**
   * Explicitly enable with defaults (effort: "medium").
   * Convenience flag.
   */
  enabled?: boolean;
}
```

#### 1.3 OpenRouter Provider Routing

```typescript
/**
 * OpenRouter provider routing configuration.
 * 
 * Controls how OpenRouter routes requests to underlying providers.
 * Enables BYOK (Bring Your Own Key), provider preferences,
 * performance requirements, and cost controls.
 * 
 * @see https://openrouter.ai/docs/guides/routing/provider-selection
 */
export interface OpenRouterProviderRouting {
  /**
   * Only use these providers. Request fails if none available.
   * Use for BYOK: set your API key in OpenRouter, then `only: ["anthropic"]`
   * 
   * Provider slugs: "anthropic", "openai", "google", "together", 
   * "deepinfra", "fireworks", etc.
   */
  only?: string[];
  
  /**
   * Try providers in this order before falling back to others.
   * Unlike `only`, this allows fallbacks to other providers.
   */
  order?: string[];
  
  /**
   * Skip these providers entirely.
   */
  ignore?: string[];
  
  /**
   * Allow fallback to other providers if preferred ones fail.
   * Default: true
   */
  allowFallbacks?: boolean;
  
  /**
   * Only route to providers that support ALL parameters in request.
   * Default: false (unsupported params are silently ignored)
   */
  requireParameters?: boolean;
  
  /**
   * Data collection policy.
   * - "allow": may use providers that log/train on data
   * - "deny": only use providers with no data retention
   */
  dataCollection?: "allow" | "deny";
  
  /**
   * Enforce Zero Data Retention.
   * Stricter than dataCollection: "deny"
   */
  zdr?: boolean;
  
  /**
   * Filter by quantization level.
   * Values: "int4", "int8", "fp4", "fp6", "fp8", "fp16", "bf16", "fp32"
   */
  quantizations?: string[];
  
  /**
   * Sort providers by attribute. Disables load balancing.
   * - "price": cheapest first
   * - "throughput": fastest tokens/sec first
   * - "latency": lowest latency first
   * 
   * Object form allows cross-model sorting with `partition: "none"`.
   */
  sort?: "price" | "throughput" | "latency" | {
    by: "price" | "throughput" | "latency";
    /** "model" (default): sort within each model. "none": sort globally */
    partition?: "model" | "none";
  };
  
  /**
   * Preferred minimum throughput (tokens/sec).
   * Providers below threshold are deprioritized, not excluded.
   */
  preferredMinThroughput?: number | PercentileThresholds;
  
  /**
   * Preferred maximum latency (seconds).
   * Providers above threshold are deprioritized, not excluded.
   */
  preferredMaxLatency?: number | PercentileThresholds;
  
  /**
   * Maximum price willing to pay.
   * Providers above this are excluded entirely.
   */
  maxPrice?: {
    prompt?: number;      // $/million tokens
    completion?: number;  // $/million tokens
    request?: number;     // $/request (for per-request pricing)
    image?: number;       // $/image
  };
}

/**
 * Percentile-based performance thresholds.
 * Higher percentiles = more confidence about worst-case performance.
 */
export interface PercentileThresholds {
  p50?: number;  // Median
  p75?: number;
  p90?: number;
  p99?: number;
}
```

#### 1.4 OpenRouter Model Metadata

```typescript
/**
 * Extended metadata captured from OpenRouter API.
 * Stored in model definitions for runtime decisions.
 */
export interface OpenRouterModelMetadata {
  /**
   * HuggingFace model ID for provenance.
   * Example: "Qwen/Qwen3.5-35B-A3B"
   */
  huggingFaceId?: string;
  
  /**
   * Versioned model identifier.
   * Example: "qwen/qwen3.5-35b-a3b-20260224"
   */
  canonicalSlug?: string;
  
  /**
   * Model description from provider.
   */
  description?: string;
  
  /**
   * Parameters this model supports.
   * Used to validate requests and derive compat settings.
   * 
   * Common values: "temperature", "top_p", "top_k", "min_p",
   * "frequency_penalty", "presence_penalty", "reasoning",
   * "include_reasoning", "tools", "tool_choice", "response_format",
   * "structured_outputs", "seed", "logprobs", etc.
   */
  supportedParameters?: string[];
  
  /**
   * Model's default parameter values.
   * Used when user doesn't specify.
   */
  defaultParameters?: Partial<SamplingOptions>;
  
  /**
   * When this model will be deprecated.
   * ISO 8601 date string or null if no planned deprecation.
   */
  expirationDate?: string | null;
  
  /**
   * Unix timestamp when model was added to OpenRouter.
   */
  created?: number;
}
```

#### 1.5 Extended Model Type

```typescript
export interface Model<A extends Api> {
  /** Model identifier (e.g., "qwen/qwen3.5-35b-a3b") */
  id: string;
  
  /** Human-readable name */
  name: string;
  
  /** API type for this model */
  api: A;
  
  /** Provider identifier */
  provider: KnownProvider;
  
  /** Base URL for API requests */
  baseUrl: string;
  
  /** Whether model supports reasoning/thinking */
  reasoning: boolean;
  
  /**
   * Supported input modalities.
   * Extended to include video.
   */
  input: ("text" | "image" | "video")[];
  
  /** Pricing per million tokens */
  cost: {
    input: number;
    output: number;
    cacheRead: number;
    cacheWrite: number;
  };
  
  /** Maximum context window in tokens */
  contextWindow: number;
  
  /** Maximum output tokens */
  maxTokens: number;
  
  /** Optional headers to include in requests */
  headers?: Record<string, string>;
  
  /** API compatibility settings */
  compat?: OpenAICompletionsCompat;
  
  /**
   * NEW: OpenRouter-specific metadata.
   * Only populated for models fetched from OpenRouter.
   */
  openRouter?: OpenRouterModelMetadata;
  
  /**
   * NEW: Model's default sampling parameters.
   * Used as fallback when user doesn't specify.
   */
  defaultParameters?: Partial<SamplingOptions>;
}
```

#### 1.6 Extended OpenAICompletionsCompat

```typescript
export interface OpenAICompletionsCompat {
  // ... existing fields ...
  
  /**
   * Format for reasoning/thinking parameter.
   * 
   * - "openai": `reasoning_effort` (o1, o3, GPT-5 series)
   * - "zai": `thinking: { type: "enabled" }` (GLM models)
   * - "qwen": `enable_thinking: boolean` (direct Qwen API)
   * - "openrouter": `reasoning: { effort: "..." }` (OpenRouter unified)
   * 
   * For OpenRouter models, we use "openrouter" format regardless of
   * underlying model family — OpenRouter handles translation.
   * 
   * Default: "openai" (or auto-detected from provider)
   */
  thinkingFormat?: "openai" | "zai" | "qwen" | "openrouter";
  
  /**
   * OpenRouter-specific routing preferences.
   * Only used when baseUrl points to OpenRouter.
   */
  openRouterRouting?: OpenRouterProviderRouting;
}
```

---

### 2. Generator Changes

#### 2.1 Model Family Detection

```typescript
/**
 * Derive compatibility settings from model ID and supported parameters.
 * 
 * This runs at BUILD TIME when generating models.generated.ts.
 * Runtime detection in detectCompat() serves as fallback.
 * 
 * @param modelId - Full model ID (e.g., "qwen/qwen3.5-35b-a3b")
 * @param supportedParams - Array of supported parameter names
 * @param provider - Provider slug (e.g., "openrouter")
 * @returns Partial compat settings to merge with defaults
 */
function deriveModelCompat(
  modelId: string,
  supportedParams: string[] | undefined,
  provider: string
): Partial<OpenAICompletionsCompat> {
  const id = modelId.toLowerCase();
  const params = new Set(supportedParams || []);
  const compat: Partial<OpenAICompletionsCompat> = {};
  
  // OpenRouter models use OpenRouter's unified reasoning format
  if (provider === "openrouter") {
    compat.thinkingFormat = "openrouter";
    // OpenRouter handles translation to underlying model format
    return compat;
  }
  
  // Direct provider detection (non-OpenRouter)
  
  // GLM / Z.ai
  if (id.includes("glm") || id.includes("zhipu") || id.startsWith("z.ai/")) {
    compat.thinkingFormat = "zai";
    compat.supportsDeveloperRole = false;
  }
  // Qwen (direct API, not via OpenRouter)
  else if (id.includes("qwen")) {
    compat.thinkingFormat = "qwen";
  }
  // DeepSeek (direct API)
  else if (id.includes("deepseek")) {
    // DeepSeek uses similar format to Qwen
    compat.thinkingFormat = "qwen";
  }
  // OpenAI (o1, o3, GPT-5 series)
  else if (params.has("reasoning_effort")) {
    compat.thinkingFormat = "openai";
    compat.supportsReasoningEffort = true;
  }
  
  return compat;
}
```

#### 2.2 Input Modality Parsing

```typescript
/**
 * Parse input modalities from OpenRouter architecture field.
 * 
 * @param inputModalities - Array like ["text", "image", "video"]
 * @param legacyModality - Fallback string like "text+image->text"
 * @returns Normalized modality array
 */
function parseInputModalities(
  inputModalities?: string[],
  legacyModality?: string
): ("text" | "image" | "video")[] {
  const result: ("text" | "image" | "video")[] = ["text"];
  
  if (inputModalities && Array.isArray(inputModalities)) {
    if (inputModalities.includes("image")) result.push("image");
    if (inputModalities.includes("video")) result.push("video");
  } else if (legacyModality) {
    // Fallback: parse from "text+image+video->text" format
    if (legacyModality.includes("image")) result.push("image");
    if (legacyModality.includes("video")) result.push("video");
  }
  
  return result;
}
```

#### 2.3 Updated fetchOpenRouterModels

```typescript
async function fetchOpenRouterModels(): Promise<Model<"openai-completions">[]> {
  console.log("Fetching models from OpenRouter API...");
  
  const response = await fetch("https://openrouter.ai/api/v1/models");
  if (!response.ok) {
    console.error(`OpenRouter API error: ${response.status}`);
    return [];
  }
  
  const data = await response.json();
  if (!data.data || !Array.isArray(data.data)) {
    console.error("Invalid OpenRouter API response structure");
    return [];
  }
  
  const models: Model<"openai-completions">[] = [];
  
  for (const model of data.data) {
    // Skip models without tool support (our primary use case)
    if (!model.supported_parameters?.includes("tools")) continue;
    
    // Parse input modalities (including video)
    const input = parseInputModalities(
      model.architecture?.input_modalities,
      model.architecture?.modality
    );
    
    // Derive compatibility settings
    const compat = deriveModelCompat(
      model.id,
      model.supported_parameters,
      "openrouter"
    );
    
    // Parse pricing ($/token -> $/million tokens)
    const inputCost = parseFloat(model.pricing?.prompt || "0") * 1_000_000;
    const outputCost = parseFloat(model.pricing?.completion || "0") * 1_000_000;
    const cacheReadCost = parseFloat(model.pricing?.input_cache_read || "0") * 1_000_000;
    const cacheWriteCost = parseFloat(model.pricing?.input_cache_write || "0") * 1_000_000;
    
    // Parse default parameters
    const defaultParameters: Partial<SamplingOptions> = {};
    if (model.default_parameters) {
      if (typeof model.default_parameters.temperature === "number") {
        defaultParameters.temperature = model.default_parameters.temperature;
      }
      if (typeof model.default_parameters.top_p === "number") {
        defaultParameters.topP = model.default_parameters.top_p;
      }
      if (typeof model.default_parameters.frequency_penalty === "number") {
        defaultParameters.frequencyPenalty = model.default_parameters.frequency_penalty;
      }
    }
    
    const normalizedModel: Model<"openai-completions"> = {
      id: model.id,
      name: model.name || model.id,
      api: "openai-completions",
      provider: "openrouter",
      baseUrl: "https://openrouter.ai/api/v1",
      reasoning: model.supported_parameters?.includes("reasoning") || false,
      input,
      cost: {
        input: inputCost,
        output: outputCost,
        cacheRead: cacheReadCost,
        cacheWrite: cacheWriteCost,
      },
      contextWindow: model.context_length || 4096,
      maxTokens: model.top_provider?.max_completion_tokens || 4096,
      // Only include compat if we have settings
      ...(Object.keys(compat).length > 0 && { compat }),
      // Only include defaultParameters if we have any
      ...(Object.keys(defaultParameters).length > 0 && { defaultParameters }),
      // OpenRouter-specific metadata
      openRouter: {
        huggingFaceId: model.hugging_face_id || undefined,
        canonicalSlug: model.canonical_slug || undefined,
        description: model.description || undefined,
        supportedParameters: model.supported_parameters || undefined,
        defaultParameters: model.default_parameters || undefined,
        expirationDate: model.expiration_date || undefined,
        created: model.created || undefined,
      },
    };
    
    models.push(normalizedModel);
  }
  
  console.log(`Fetched ${models.length} tool-capable models from OpenRouter`);
  return models;
}
```

---

### 3. Provider Changes

#### 3.1 Updated buildParams

```typescript
function buildParams(
  model: Model<"openai-completions">,
  context: Context,
  options?: OpenAICompletionsOptions
): OpenAI.Chat.Completions.ChatCompletionCreateParamsStreaming {
  const compat = getCompat(model);
  const messages = convertMessages(model, context, compat);
  maybeAddOpenRouterAnthropicCacheControl(model, messages);

  const params: OpenAI.Chat.Completions.ChatCompletionCreateParamsStreaming = {
    model: model.id,
    messages,
    stream: true,
  };

  // Stream options
  if (compat.supportsUsageInStreaming !== false) {
    (params as any).stream_options = { include_usage: true };
  }

  if (compat.supportsStore) {
    params.store = false;
  }

  // Max tokens
  if (options?.maxTokens) {
    if (compat.maxTokensField === "max_tokens") {
      (params as any).max_tokens = options.maxTokens;
    } else {
      params.max_completion_tokens = options.maxTokens;
    }
  }

  // Temperature (with model default fallback)
  if (options?.temperature !== undefined) {
    params.temperature = options.temperature;
  } else if (model.defaultParameters?.temperature !== undefined) {
    params.temperature = model.defaultParameters.temperature;
  }

  // Extended sampling parameters
  if (options?.topP !== undefined) {
    params.top_p = options.topP;
  } else if (model.defaultParameters?.topP !== undefined) {
    params.top_p = model.defaultParameters.topP;
  }
  
  if (options?.topK !== undefined) {
    (params as any).top_k = options.topK;
  }
  
  if (options?.minP !== undefined) {
    (params as any).min_p = options.minP;
  }
  
  if (options?.frequencyPenalty !== undefined) {
    params.frequency_penalty = options.frequencyPenalty;
  }
  
  if (options?.presencePenalty !== undefined) {
    params.presence_penalty = options.presencePenalty;
  }
  
  if (options?.repetitionPenalty !== undefined) {
    (params as any).repetition_penalty = options.repetitionPenalty;
  }
  
  if (options?.seed !== undefined) {
    params.seed = options.seed;
  }

  // Tools
  if (context.tools) {
    params.tools = convertTools(context.tools, compat);
  } else if (hasToolHistory(context.messages)) {
    params.tools = [];
  }

  if (options?.toolChoice) {
    params.tool_choice = options.toolChoice;
  }

  // ========================================
  // REASONING CONFIGURATION
  // ========================================
  // 
  // Different providers have different reasoning formats.
  // We handle this in priority order:
  // 
  // 1. OpenRouter unified format (when provider is openrouter)
  // 2. Z.ai/GLM format
  // 3. Qwen direct format
  // 4. OpenAI native format (o1, o3, GPT-5)
  //
  // OpenRouter handles translation to underlying model format,
  // so we always use their unified format for OpenRouter models.
  
  if (compat.thinkingFormat === "openrouter" && model.reasoning && options?.reasoningEffort) {
    // OpenRouter unified reasoning object
    (params as any).reasoning = {
      effort: options.reasoningEffort,
    };
  } else if (compat.thinkingFormat === "zai" && model.reasoning) {
    // Z.ai/GLM: binary thinking toggle
    (params as any).thinking = { 
      type: options?.reasoningEffort ? "enabled" : "disabled" 
    };
  } else if (compat.thinkingFormat === "qwen" && model.reasoning) {
    // Qwen direct: boolean flag
    (params as any).enable_thinking = !!options?.reasoningEffort;
  } else if (options?.reasoningEffort && model.reasoning && compat.supportsReasoningEffort) {
    // OpenAI native: reasoning_effort string
    params.reasoning_effort = options.reasoningEffort;
  }

  // ========================================
  // OPENROUTER PROVIDER ROUTING
  // ========================================
  //
  // Enables BYOK, provider preferences, performance requirements.
  // Only applies when targeting OpenRouter.
  
  if (model.baseUrl.includes("openrouter.ai") && compat.openRouterRouting) {
    const routing = compat.openRouterRouting;
    if (Object.keys(routing).length > 0) {
      // Convert camelCase to snake_case for OpenRouter API
      const provider: Record<string, unknown> = {};
      
      if (routing.only) provider.only = routing.only;
      if (routing.order) provider.order = routing.order;
      if (routing.ignore) provider.ignore = routing.ignore;
      if (routing.allowFallbacks !== undefined) provider.allow_fallbacks = routing.allowFallbacks;
      if (routing.requireParameters !== undefined) provider.require_parameters = routing.requireParameters;
      if (routing.dataCollection) provider.data_collection = routing.dataCollection;
      if (routing.zdr !== undefined) provider.zdr = routing.zdr;
      if (routing.quantizations) provider.quantizations = routing.quantizations;
      if (routing.sort) provider.sort = routing.sort;
      if (routing.preferredMinThroughput !== undefined) {
        provider.preferred_min_throughput = routing.preferredMinThroughput;
      }
      if (routing.preferredMaxLatency !== undefined) {
        provider.preferred_max_latency = routing.preferredMaxLatency;
      }
      if (routing.maxPrice) provider.max_price = routing.maxPrice;
      
      if (Object.keys(provider).length > 0) {
        (params as any).provider = provider;
      }
    }
  }

  // Vercel AI Gateway routing (existing)
  if (model.baseUrl.includes("ai-gateway.vercel.sh") && model.compat?.vercelGatewayRouting) {
    const routing = model.compat.vercelGatewayRouting;
    if (routing.only || routing.order) {
      const gatewayOptions: Record<string, string[]> = {};
      if (routing.only) gatewayOptions.only = routing.only;
      if (routing.order) gatewayOptions.order = routing.order;
      (params as any).providerOptions = { gateway: gatewayOptions };
    }
  }

  return params;
}
```

#### 3.2 Updated detectCompat (Runtime Fallback)

```typescript
/**
 * Detect compatibility settings from provider and baseUrl.
 * 
 * This is RUNTIME fallback detection. Build-time detection in
 * generate-models.ts is preferred because it's explicit in the
 * generated file and easier to debug.
 * 
 * Runtime detection catches:
 * - Custom model configurations not in generated file
 * - Models added after last generation
 * - Edge cases
 */
function detectCompat(model: Model<"openai-completions">): Required<OpenAICompletionsCompat> {
  const provider = model.provider;
  const baseUrl = model.baseUrl;
  const modelId = model.id.toLowerCase();

  // Provider detection
  const isZai = provider === "zai" || baseUrl.includes("api.z.ai");
  const isOpenRouter = provider === "openrouter" || baseUrl.includes("openrouter.ai");
  const isQwen = modelId.includes("qwen") && !isOpenRouter;
  const isDeepSeek = modelId.includes("deepseek") && !isOpenRouter;
  const isGLM = (modelId.includes("glm") || modelId.includes("zhipu")) && !isOpenRouter;

  const isNonStandard =
    provider === "cerebras" ||
    baseUrl.includes("cerebras.ai") ||
    provider === "xai" ||
    baseUrl.includes("api.x.ai") ||
    provider === "mistral" ||
    baseUrl.includes("mistral.ai") ||
    baseUrl.includes("chutes.ai") ||
    baseUrl.includes("deepseek.com") ||
    isZai ||
    provider === "opencode" ||
    baseUrl.includes("opencode.ai");

  const useMaxTokens = 
    provider === "mistral" || 
    baseUrl.includes("mistral.ai") || 
    baseUrl.includes("chutes.ai");

  const isGrok = provider === "xai" || baseUrl.includes("api.x.ai");
  const isMistral = provider === "mistral" || baseUrl.includes("mistral.ai");

  // Determine thinking format
  let thinkingFormat: "openai" | "zai" | "qwen" | "openrouter" = "openai";
  if (isOpenRouter) {
    thinkingFormat = "openrouter";
  } else if (isZai || isGLM) {
    thinkingFormat = "zai";
  } else if (isQwen || isDeepSeek) {
    thinkingFormat = "qwen";
  }

  return {
    supportsStore: !isNonStandard,
    supportsDeveloperRole: !isNonStandard && !isZai && !isGLM,
    supportsReasoningEffort: !isGrok && !isZai && !isOpenRouter,
    supportsUsageInStreaming: true,
    maxTokensField: useMaxTokens ? "max_tokens" : "max_completion_tokens",
    requiresToolResultName: isMistral,
    requiresAssistantAfterToolResult: false,
    requiresThinkingAsText: isMistral,
    requiresMistralToolIds: isMistral,
    thinkingFormat,
    openRouterRouting: {},
    vercelGatewayRouting: {},
    supportsStrictMode: true,
  };
}
```

---

### 4. Usage Examples

#### 4.1 Basic Reasoning with Qwen via OpenRouter

```typescript
import { streamSimple } from "@punkin/ai";

const model = MODELS["openrouter"]["qwen/qwen3.5-35b-a3b"];

const stream = streamSimple(model, {
  systemPrompt: "You are a helpful assistant.",
  messages: [{ role: "user", content: "Explain quantum entanglement." }],
}, {
  reasoning: "high",  // Uses OpenRouter's unified format
});
```

#### 4.2 Using Anthropic Sub-Key via OpenRouter

```typescript
const model = {
  ...MODELS["openrouter"]["anthropic/claude-sonnet-4.5"],
  compat: {
    ...MODELS["openrouter"]["anthropic/claude-sonnet-4.5"].compat,
    openRouterRouting: {
      only: ["anthropic"],      // Force Anthropic provider
      allowFallbacks: false,    // Don't fall back to others
    },
  },
};

const stream = streamSimple(model, context, options);
```

#### 4.3 Extended Sampling Parameters

```typescript
const stream = streamSimple(model, context, {
  temperature: 0.7,
  topP: 0.9,
  topK: 40,
  minP: 0.05,
  frequencyPenalty: 0.5,
  seed: 42,
  reasoning: "medium",
});
```

---

### 5. Migration

#### 5.1 Backwards Compatibility

All changes are additive:
- New fields are optional
- Existing model definitions continue to work
- Runtime detection provides fallback

#### 5.2 Migration Steps

1. **Update types.ts** with new interfaces
2. **Update generate-models.ts** with new extraction logic
3. **Update openai-completions.ts** with new param handling
4. **Regenerate models.generated.ts** — `npm run generate:models`
5. **Run tests** — existing tests should pass
6. **Add new tests** for reasoning formats

---

### 6. Testing

#### 6.1 Unit Tests

```typescript
describe("OpenRouter reasoning format", () => {
  it("sends unified reasoning object for OpenRouter models", () => {
    const model = {
      ...mockModel,
      provider: "openrouter",
      baseUrl: "https://openrouter.ai/api/v1",
      reasoning: true,
      compat: { thinkingFormat: "openrouter" },
    };
    
    const params = buildParams(model, context, { reasoningEffort: "high" });
    
    expect(params.reasoning).toEqual({ effort: "high" });
    expect(params.reasoning_effort).toBeUndefined();
  });
  
  it("sends enable_thinking for direct Qwen API", () => {
    const model = {
      ...mockModel,
      provider: "qwen",
      baseUrl: "https://dashscope.aliyuncs.com",
      reasoning: true,
      compat: { thinkingFormat: "qwen" },
    };
    
    const params = buildParams(model, context, { reasoningEffort: "high" });
    
    expect(params.enable_thinking).toBe(true);
    expect(params.reasoning).toBeUndefined();
  });
});

describe("Provider routing", () => {
  it("converts camelCase routing to snake_case for OpenRouter", () => {
    const model = {
      ...mockModel,
      provider: "openrouter",
      baseUrl: "https://openrouter.ai/api/v1",
      compat: {
        openRouterRouting: {
          only: ["anthropic"],
          allowFallbacks: false,
          requireParameters: true,
        },
      },
    };
    
    const params = buildParams(model, context, {});
    
    expect(params.provider).toEqual({
      only: ["anthropic"],
      allow_fallbacks: false,
      require_parameters: true,
    });
  });
});

describe("Model family detection", () => {
  it("detects Qwen models", () => {
    const compat = deriveModelCompat("qwen/qwen3.5-35b-a3b", ["reasoning"], "openrouter");
    expect(compat.thinkingFormat).toBe("openrouter");
  });
  
  it("detects GLM models", () => {
    const compat = deriveModelCompat("z.ai/glm-4-plus", ["reasoning"], "zai");
    expect(compat.thinkingFormat).toBe("zai");
  });
});
```

#### 6.2 Integration Tests

```typescript
describe("OpenRouter integration", () => {
  it("successfully streams reasoning from Qwen", async () => {
    const model = MODELS["openrouter"]["qwen/qwen3.5-35b-a3b"];
    const stream = streamSimple(model, {
      systemPrompt: "Be concise.",
      messages: [{ role: "user", content: "What is 2+2?" }],
    }, { reasoning: "low" });
    
    let hasReasoning = false;
    let hasContent = false;
    
    for await (const event of stream) {
      if (event.type === "thinking_delta") hasReasoning = true;
      if (event.type === "text_delta") hasContent = true;
    }
    
    expect(hasContent).toBe(true);
    // Reasoning may or may not appear depending on model
  });
});
```

---

### 7. Future Work

1. **Validation schemas** — Zod schemas for OpenRouter API responses
2. **Automatic refresh** — Periodically re-fetch model metadata
3. **Performance tracking** — Log which reasoning format is used
4. **UI for routing config** — Expose provider routing in TUI settings

---

## Appendix A: Model Family Reference

| Family | Provider | Thinking Format | Notes |
|--------|----------|-----------------|-------|
| Qwen | OpenRouter | `openrouter` | OpenRouter translates to `enable_thinking` |
| Qwen | Direct | `qwen` | `enable_thinking: boolean` |
| GLM | Z.ai | `zai` | `thinking: { type: "enabled" }` |
| GLM | OpenRouter | `openrouter` | OpenRouter translates |
| DeepSeek | OpenRouter | `openrouter` | OpenRouter translates |
| DeepSeek | Direct | `qwen` | Same as Qwen format |
| Claude | OpenRouter | `openrouter` | OpenRouter handles extended thinking |
| Claude | Direct | N/A | Use anthropic-messages API |
| Gemini | OpenRouter | `openrouter` | OpenRouter translates to `thinkingLevel` |
| Gemini | Direct | N/A | Use google API |
| GPT-5/o3 | OpenRouter | `openrouter` | OpenRouter translates |
| GPT-5/o3 | OpenAI | `openai` | `reasoning_effort` string |

## Appendix B: OpenRouter Provider Slugs

Common slugs for `only`/`order`/`ignore`:

```
anthropic, openai, google, together, deepinfra, fireworks,
groq, cerebras, mistral, cohere, perplexity, azure,
amazon-bedrock, alibaba, xai, deepseek, minimax, z.ai,
venice, parasail, novita, hyperbolic, featherless
```

Full list: https://openrouter.ai/docs/guides/routing/provider-selection
