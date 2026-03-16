export interface ModelConfig {
  id: string;
  apiModel: string;
  displayName: string;
  multiplier: number;
  maxTokens: number;
  category: 'chat' | 'image' | 'vision' | 'audio';
  estimatedTokens: number;
  endpoint?: string; // undefined = openai, "google" = Gemini API
}

export const MODELS: Record<string, ModelConfig> = {
  // Chat Models (OpenAI endpoint)
  'gpt-4.1-mini': {
    id: 'gpt-4.1-mini',
    apiModel: 'gpt-4.1-mini',
    displayName: 'GPT-4.1 Mini',
    multiplier: 1,
    maxTokens: 2000,
    category: 'chat',

    estimatedTokens: 1500,
  },
  'gpt-5-mini': {
    id: 'gpt-5-mini',
    apiModel: 'gpt-5-mini',
    displayName: 'GPT-5 Mini',
    multiplier: 1.5,
    maxTokens: 2000,
    category: 'chat',

    estimatedTokens: 2000,
  },
  'gpt-4o': {
    id: 'gpt-4o',
    apiModel: 'gpt-4o',
    displayName: 'GPT-4o',
    multiplier: 2,
    maxTokens: 2000,
    category: 'chat',

    estimatedTokens: 2000,
  },
  'gpt-5.2': {
    id: 'gpt-5.2',
    apiModel: 'gpt-5.2',
    displayName: 'GPT-5.2',
    multiplier: 3.3,
    maxTokens: 2000,
    category: 'chat',

    estimatedTokens: 2000,
  },

  // Image Models (OpenAI endpoint)
  'gpt-image-1-mini': {
    id: 'gpt-image-1-mini',
    apiModel: 'gpt-image-1-mini',
    displayName: 'GPT Image Mini',
    multiplier: 1,
    maxTokens: 8000,
    category: 'image',

    estimatedTokens: 8000,
  },
  'gpt-image-1': {
    id: 'gpt-image-1',
    apiModel: 'gpt-image-1',
    displayName: 'GPT Image 1',
    multiplier: 1,
    maxTokens: 15000,
    category: 'image',

    estimatedTokens: 15000,
  },
  'gpt-image-1.5': {
    id: 'gpt-image-1.5',
    apiModel: 'gpt-image-1.5',
    displayName: 'GPT Image 1.5',
    multiplier: 1,
    maxTokens: 30000,
    category: 'image',

    estimatedTokens: 30000,
  },
  'dall-e-3': {
    id: 'dall-e-3',
    apiModel: 'dall-e-3',
    displayName: 'DALL-E 3',
    multiplier: 1,
    maxTokens: 15000,
    category: 'image',

    estimatedTokens: 15000,
  },

  // Nano Banana 2 (Google Gemini endpoint)
  'nano-banana-2': {
    id: 'nano-banana-2',
    apiModel: 'gemini-3.1-flash-image-preview',
    displayName: 'Nano Banana 2',
    multiplier: 1,
    maxTokens: 15000,
    category: 'image',

    estimatedTokens: 15000,
    endpoint: 'google',
  },

  // Vision Model
  'gpt-4o-vision': {
    id: 'gpt-4o-vision',
    apiModel: 'gpt-4o',
    displayName: 'GPT-4o Vision',
    multiplier: 2,
    maxTokens: 1500,
    category: 'vision',

    estimatedTokens: 1500,
  },

  // Audio Model
  'whisper': {
    id: 'whisper',
    apiModel: 'whisper-1',
    displayName: 'Whisper',
    multiplier: 1,
    maxTokens: 2000,
    category: 'audio',

    estimatedTokens: 2000,
  },
};

export function getModel(id: string): ModelConfig | undefined {
  return MODELS[id];
}

export function getModelsByCategory(category: ModelConfig['category']): ModelConfig[] {
  return Object.values(MODELS).filter((m) => m.category === category);
}
