export interface ModelConfig {
  id: string;
  apiModel: string;
  displayName: string;
  multiplier: number;
  maxTokens: number;
  category: 'chat' | 'image' | 'vision' | 'audio';
  isFree: boolean;
  estimatedTokens: number;
}

export const MODELS: Record<string, ModelConfig> = {
  'gemini-flash': {
    id: 'gemini-flash',
    apiModel: 'gemini-2.5-flash',
    displayName: 'Gemini 2.5 Flash',
    multiplier: 1,
    maxTokens: 1500,
    category: 'chat',
    isFree: true,
    estimatedTokens: 700,
  },
  'deepseek-r1': {
    id: 'deepseek-r1',
    apiModel: 'deepseek-r1',
    displayName: 'DeepSeek R1',
    multiplier: 1.3,
    maxTokens: 2000,
    category: 'chat',
    isFree: false,
    estimatedTokens: 1000,
  },
  'claude-haiku': {
    id: 'claude-haiku',
    apiModel: 'claude-haiku-4-5',
    displayName: 'Claude Haiku 4.5',
    multiplier: 2,
    maxTokens: 2000,
    category: 'chat',
    isFree: false,
    estimatedTokens: 1500,
  },
  'gpt-5': {
    id: 'gpt-5',
    apiModel: 'gpt-4.1',
    displayName: 'GPT-4.1',
    multiplier: 3.3,
    maxTokens: 2000,
    category: 'chat',
    isFree: false,
    estimatedTokens: 2500,
  },
  'imagen-fast': {
    id: 'imagen-fast',
    apiModel: 'imagen-4-fast',
    displayName: 'Imagen 4 Fast',
    multiplier: 1,
    maxTokens: 8000,
    category: 'image',
    isFree: true,
    estimatedTokens: 8000,
  },
  'nano-banana': {
    id: 'nano-banana',
    apiModel: 'nano-banana-2',
    displayName: 'Nano Banana 2',
    multiplier: 1,
    maxTokens: 15000,
    category: 'image',
    isFree: false,
    estimatedTokens: 15000,
  },
  'gpt-image': {
    id: 'gpt-image',
    apiModel: 'gpt-image-1',
    displayName: 'GPT Image 1.5',
    multiplier: 1,
    maxTokens: 30000,
    category: 'image',
    isFree: false,
    estimatedTokens: 30000,
  },
  'gemini-vision': {
    id: 'gemini-vision',
    apiModel: 'gemini-2.5-flash',
    displayName: 'Gemini Flash Vision',
    multiplier: 1,
    maxTokens: 1500,
    category: 'vision',
    isFree: true,
    estimatedTokens: 1500,
  },
  'whisper': {
    id: 'whisper',
    apiModel: 'whisper-1',
    displayName: 'Whisper',
    multiplier: 1,
    maxTokens: 2000,
    category: 'audio',
    isFree: false,
    estimatedTokens: 2000,
  },
};

export function getModel(id: string): ModelConfig | undefined {
  return MODELS[id];
}

export function getModelsByCategory(category: ModelConfig['category']): ModelConfig[] {
  return Object.values(MODELS).filter((m) => m.category === category);
}
