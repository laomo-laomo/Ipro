/**
 * LLM Service - Unified abstraction for multiple LLM providers
 *
 * Supports: DeepSeek, OpenAI, MiniMax, Qwen, and future providers.
 * Configure via LLM_PROVIDER in .env
 *
 * Uses node:https instead of global fetch to avoid Node.js 24+ undici timeout issues.
 */

import https from 'https';

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string | Array<{ type: 'text' | 'image_url'; text?: string; image_url?: { url: string } }>;
}

export interface ChatCompletionParams {
  model?: string;
  messages: ChatMessage[];
  temperature?: number;
  max_tokens?: number;
  response_format?: { type: 'json_object' } | { type: 'text' };
}

export interface ChatCompletionResponse {
  content: string;
  model: string;
  usage?: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
}

/**
 * HTTPS POST helper using node:https to avoid undici fetch issues
 */
function httpsPost(url: string, headers: Record<string, string>, body: string, timeout = 120000): Promise<any> {
  return new Promise((resolve, reject) => {
    const parsedUrl = new URL(url);
    const options: https.RequestOptions = {
      hostname: parsedUrl.hostname,
      port: parsedUrl.port || 443,
      path: parsedUrl.pathname,
      method: 'POST',
      headers: {
        ...headers,
        'Content-Length': Buffer.byteLength(body),
      },
      timeout,
    };

    const req = https.request(options, (res) => {
      const chunks: Buffer[] = [];
      res.on('data', (chunk: Buffer) => chunks.push(chunk));
      res.on('end', () => {
        const buffer = Buffer.concat(chunks);
        const data = buffer.toString('utf8');
        try {
          resolve(JSON.parse(data));
        } catch {
          reject(new Error(`Invalid JSON response: ${data.slice(0, 200)}`));
        }
      });
    });

    req.on('timeout', () => {
      req.destroy();
      reject(new Error(`HTTPS request timeout after ${timeout}ms`));
    });

    req.on('error', (err) => reject(err));
    req.write(body);
    req.end();
  });
}

// ---- Providers ----

interface LLMProvider {
  chatCompletion(params: ChatCompletionParams): Promise<ChatCompletionResponse>;
  listModels(): string[];
}

class MiniMaxProvider implements LLMProvider {
  private apiKey: string;
  private baseUrl = 'https://api.minimax.chat/v1';
  private defaultModel: string;

  // Available models (fetched 2026-05-27)
  static MODELS = [
    'MiniMax-M2.7',           // Best quality, thinking model
    'MiniMax-M2.7-highspeed', // Fast variant
    'MiniMax-M2.5',           // Balanced
    'MiniMax-M2.5-highspeed',
    'MiniMax-M2.1',           // Fast & cheap
    'MiniMax-M2.1-highspeed',
    'MiniMax-M2',             // Legacy
  ];

  constructor(apiKey: string, defaultModel?: string) {
    this.apiKey = apiKey;
    this.defaultModel = defaultModel || MiniMaxProvider.MODELS[0];
  }

  listModels(): string[] { return MiniMaxProvider.MODELS; }

  async chatCompletion(params: ChatCompletionParams): Promise<ChatCompletionResponse> {
    const model = params.model || this.defaultModel;
    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: params.messages,
        temperature: params.temperature ?? 0.7,
        max_tokens: params.max_tokens ?? 4096,
        response_format: params.response_format,
      }),
    });

    const data = await response.json() as any;
    if (!response.ok) {
      const err = data?.error?.message || data?.detail || `HTTP ${response.status}`;
      throw new Error(`${model}: ${err}`);
    }

    let content = data.choices?.[0]?.message?.content || '';
    // Strip thinking chain for MiniMax M2 models
    content = content.replace(/<think>[\s\S]*?<\/think>/g, '').trim();

    return {
      content,
      model: data.model || model,
      usage: data.usage,
    };
  }
}

class DeepSeekProvider implements LLMProvider {
  private apiKey: string;
  private baseUrl = 'https://api.deepseek.com';
  private defaultModel: string;

  static MODELS = [
    'deepseek-chat',       // DeepSeek-V4-Flash (default, fast & cheap)
    'deepseek-reasoner',   // DeepSeek-R1 (reasoning model)
  ];

  constructor(apiKey: string, defaultModel?: string) {
    this.apiKey = apiKey;
    this.defaultModel = defaultModel || DeepSeekProvider.MODELS[0];
  }

  listModels(): string[] { return DeepSeekProvider.MODELS; }

  async chatCompletion(params: ChatCompletionParams): Promise<ChatCompletionResponse> {
    const model = params.model || this.defaultModel;
    const body = JSON.stringify({
      model,
      messages: params.messages,
      temperature: params.temperature ?? 0.8,
      max_tokens: params.max_tokens ?? 4096,
      response_format: params.response_format,
    });

    const data = await httpsPost(
      `${this.baseUrl}/chat/completions`,
      {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`,
      },
      body,
    );

    if (data.error) {
      throw new Error(`${model}: ${data.error.message || JSON.stringify(data.error)}`);
    }

    return {
      content: data.choices?.[0]?.message?.content || '',
      model: data.model || model,
      usage: data.usage,
    };
  }
}

class QwenProvider implements LLMProvider {
  private apiKey: string;
  private baseUrl = 'https://coding.dashscope.aliyuncs.com/v1';
  private defaultModel: string;

  // Available Qwen models (coding.dashscope)
  static MODELS = [
    'qwen3-coder-plus',     // Best coding model (recommended)
    'qwen3-coder',          // Fast coding model
  ];

  constructor(apiKey: string, defaultModel?: string) {
    this.apiKey = apiKey;
    this.defaultModel = defaultModel || QwenProvider.MODELS[0];
  }

  listModels(): string[] { return QwenProvider.MODELS; }

  async chatCompletion(params: ChatCompletionParams): Promise<ChatCompletionResponse> {
    const model = params.model || this.defaultModel;
    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: params.messages,
        temperature: params.temperature ?? 0.8,
        max_tokens: params.max_tokens ?? 4096,
        response_format: params.response_format,
      }),
    });

    const data = await response.json() as any;
    if (!response.ok) {
      throw new Error(`${model}: ${data?.error?.message || `HTTP ${response.status}`}`);
    }

    return {
      content: data.choices?.[0]?.message?.content || '',
      model: data.model || model,
      usage: data.usage,
    };
  }
}

class OpenAIProvider implements LLMProvider {
  private apiKey: string;
  private baseUrl = 'https://api.openai.com/v1';
  private defaultModel: string;

  static MODELS = ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo'];

  constructor(apiKey: string, defaultModel?: string) {
    this.apiKey = apiKey;
    this.defaultModel = defaultModel || OpenAIProvider.MODELS[0];
  }

  listModels(): string[] { return OpenAIProvider.MODELS; }

  async chatCompletion(params: ChatCompletionParams): Promise<ChatCompletionResponse> {
    const model = params.model || this.defaultModel;
    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: params.messages,
        temperature: params.temperature ?? 0.8,
        max_tokens: params.max_tokens ?? 4096,
        response_format: params.response_format,
      }),
    });

    const data = await response.json() as any;
    if (!response.ok) {
      throw new Error(`${model}: ${data?.error?.message || `HTTP ${response.status}`}`);
    }

    return {
      content: data.choices?.[0]?.message?.content || '',
      model: data.model || model,
      usage: data.usage,
    };
  }
}

// ---- Factory ----

let cachedProvider: LLMProvider | null = null;

export function getLLMProvider(): LLMProvider {
  if (cachedProvider) return cachedProvider;

  const provider = (process.env.LLM_PROVIDER || 'deepseek').trim().toLowerCase();
  const defaultModel = process.env.LLM_DEFAULT_MODEL?.trim();

  if (provider === 'deepseek') {
    const key = process.env.DEEPSEEK_API_KEY || '';
    if (!key) throw new Error('DEEPSEEK_API_KEY not configured');
    cachedProvider = new DeepSeekProvider(key, defaultModel);
  } else if (provider === 'qwen') {
    const key = process.env.QWEN_API_KEY || '';
    if (!key) throw new Error('QWEN_API_KEY not configured');
    cachedProvider = new QwenProvider(key, defaultModel);
  } else if (provider === 'minimax') {
    const key = process.env.MINIMAX_CHAT_API_KEY || process.env.MINIMAX_API_KEY || '';
    if (!key) throw new Error('MINIMAX_CHAT_API_KEY not configured');
    cachedProvider = new MiniMaxProvider(key, defaultModel);
  } else {
    const key = process.env.OPENAI_API_KEY || '';
    if (!key) throw new Error('OPENAI_API_KEY not configured');
    cachedProvider = new OpenAIProvider(key, defaultModel);
  }

  return cachedProvider;
}

// ---- High-level helpers ----

/**
 * Chat with LLM and parse JSON response (strips markdown fences)
 */
export async function chatJSON(params: ChatCompletionParams): Promise<any> {
  const llm = getLLMProvider();
  const result = await llm.chatCompletion({
    ...params,
    response_format: { type: 'json_object' },
  });

  // Extract JSON from possible markdown fences
  let content = result.content;
  const jsonMatch = content.match(/\{[\s\S]*\}/);
  if (jsonMatch) content = jsonMatch[0];

  try {
    return JSON.parse(content);
  } catch {
    throw new Error(`Failed to parse LLM response as JSON: ${content.slice(0, 200)}`);
  }
}

export default { getLLMProvider, chatJSON };
