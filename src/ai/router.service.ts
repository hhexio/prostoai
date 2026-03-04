import { Injectable } from '@nestjs/common';

const DRAW_KEYWORDS_RU = [
  'нарисуй', 'нарисовать', 'сгенерируй', 'сгенерировать', 'создай изображение',
  'создай картинку', 'создай рисунок', 'генерация изображения', 'рисунок',
  'изображение', 'картинку', 'фото сгенерируй',
];

const DRAW_KEYWORDS_EN = [
  'draw', 'generate image', 'create image', 'make image', 'generate picture',
  'create picture', 'make picture', 'image of', 'picture of', 'imagine',
];

const COMPLEX_KEYWORDS_RU = [
  'проанализируй', 'сравни', 'объясни подробно', 'напиши код',
  'алгоритм', 'архитектура', 'разработай', 'напиши программу',
  'напиши скрипт', 'реализуй', 'детально', 'расскажи подробно',
];

const COMPLEX_KEYWORDS_EN = [
  'analyze', 'analyse', 'compare', 'explain in detail', 'write code',
  'algorithm', 'architecture', 'implement', 'develop', 'detailed',
  'write a program', 'write a script',
];

const CODE_MARKERS = ['```', 'function', 'class ', 'import ', 'const ', 'let ', 'var ', 'async ', 'await '];

@Injectable()
export class RouterService {
  route(type: string, text?: string): string {
    if (type === 'photo') return 'gemini-vision';
    if (type === 'voice' || type === 'audio') return 'whisper';

    if (text) {
      const lower = text.toLowerCase();

      const isDrawRequest = [
        ...DRAW_KEYWORDS_RU,
        ...DRAW_KEYWORDS_EN,
      ].some((kw) => lower.includes(kw));

      if (isDrawRequest) return 'imagen-fast';

      if (this.isComplexQuery(text)) return 'gpt-5';
    }

    return 'gemini-flash';
  }

  isComplexQuery(text: string): boolean {
    if (text.length > 500) return true;

    const lower = text.toLowerCase();

    const hasCodeMarker = CODE_MARKERS.some((m) => lower.includes(m));
    if (hasCodeMarker) return true;

    const hasComplexKeyword = [
      ...COMPLEX_KEYWORDS_RU,
      ...COMPLEX_KEYWORDS_EN,
    ].some((kw) => lower.includes(kw));

    return hasComplexKeyword;
  }
}
