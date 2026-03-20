import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';
import * as FormData from 'form-data';
import { getModel, MODELS } from './models.config';

export interface AiResponse {
  text?: string;
  imageUrl?: string;
  imageBuffer?: Buffer;
  audioText?: string;
  inputTokens: number;
  outputTokens: number;
  totalCost: number;
  responseTime: number;
}

@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);
  private readonly baseUrl: string;
  private readonly apiKey: string;

  constructor(
    private readonly httpService: HttpService,
    private readonly config: ConfigService,
  ) {
    this.baseUrl = this.config.get('PROXYAPI_URL')!;
    this.apiKey = this.config.get('PROXYAPI_KEY')!;
  }

  private get headers() {
    return { Authorization: `Bearer ${this.apiKey}` };
  }

  async chat(modelId: string, userMessage: string, systemPrompt?: string): Promise<AiResponse> {
    const model = getModel(modelId);
    if (!model) throw new Error(`Unknown model: ${modelId}`);

    const messages: Array<{ role: string; content: string | any[] }> = [];
    if (systemPrompt) messages.push({ role: 'system', content: systemPrompt });
    messages.push({ role: 'user', content: userMessage });

    const start = Date.now();
    try {
      const response = await firstValueFrom(
        this.httpService.post(
          `${this.baseUrl}/chat/completions`,
          { model: model.apiModel, messages, max_completion_tokens: model.maxTokens },
          { headers: this.headers, timeout: 120000 },
        ),
      );

      const data = response.data;
      const inputTokens = data.usage?.prompt_tokens ?? 0;
      const outputTokens = data.usage?.completion_tokens ?? 0;
      const totalCost = Math.ceil((inputTokens + outputTokens) * model.multiplier);

      return {
        text: data.choices?.[0]?.message?.content ?? '',
        inputTokens,
        outputTokens,
        totalCost,
        responseTime: Date.now() - start,
      };
    } catch (err) {
      throw this.handleError(err);
    }
  }

  async generateImage(modelId: string, prompt: string): Promise<AiResponse> {
    const model = getModel(modelId);
    if (!model) throw new Error(`Unknown model: ${modelId}`);

    const start = Date.now();
    try {
      const response = await firstValueFrom(
        this.httpService.post(
          `${this.baseUrl}/images/generations`,
          { model: model.apiModel, prompt, n: 1, size: '1024x1024', quality: 'medium', response_format: 'b64_json' },
          { headers: this.headers, timeout: 120000 },
        ),
      );

      const b64 = response.data?.data?.[0]?.b64_json;
      const imageBuffer = b64 ? Buffer.from(b64, 'base64') : undefined;

      const inputTokens = response.data?.usage?.input_tokens ?? 0;
      const outputTokens = response.data?.usage?.output_tokens ?? 0;

      return {
        imageBuffer,
        inputTokens,
        outputTokens,
        totalCost: model.estimatedTokens,
        responseTime: Date.now() - start,
      };
    } catch (err) {
      throw this.handleError(err);
    }
  }

  async generateImageWithReference(modelId: string, prompt: string, imageBuffer: Buffer): Promise<AiResponse> {
    const model = getModel(modelId);
    if (!model) throw new Error(`Unknown model: ${modelId}`);

    const start = Date.now();
    try {
      const form = new FormData();
      form.append('model', model.apiModel);
      form.append('prompt', prompt);
      form.append('image[]', imageBuffer, { filename: 'image.png', contentType: 'image/png' });
      form.append('n', '1');
      form.append('size', '1024x1024');

      const response = await firstValueFrom(
        this.httpService.post(
          `${this.baseUrl}/images/edits`,
          form,
          {
            headers: {
              ...this.headers,
              ...form.getHeaders(),
            },
            timeout: 120000,
          },
        ),
      );

      const data = response.data?.data?.[0];
      let resultBuffer: Buffer | undefined;

      if (data?.b64_json) {
        resultBuffer = Buffer.from(data.b64_json, 'base64');
      } else if (data?.url) {
        try {
          const imgResponse = await firstValueFrom(
            this.httpService.get(data.url, {
              responseType: 'arraybuffer',
              timeout: 30000,
            }),
          );
          resultBuffer = Buffer.from(imgResponse.data);
        } catch (err) {
          this.logger.error('Failed to download edited image', err?.message);
        }
      }

      return {
        imageBuffer: resultBuffer,
        inputTokens: response.data?.usage?.input_tokens ?? 0,
        outputTokens: response.data?.usage?.output_tokens ?? 0,
        totalCost: model.estimatedTokens,
        responseTime: Date.now() - start,
      };
    } catch (err) {
      throw this.handleError(err);
    }
  }

  async generateImageWithMultipleReferences(modelId: string, prompt: string, images: Buffer[]): Promise<AiResponse> {
    const model = getModel(modelId);
    if (!model) throw new Error(`Unknown model: ${modelId}`);

    const start = Date.now();
    try {
      const form = new FormData();
      form.append('model', model.apiModel);
      form.append('prompt', prompt || 'edit these images');
      form.append('n', '1');
      form.append('size', '1024x1024');
      form.append('response_format', 'b64_json');

      images.forEach((img, i) => {
        form.append('image[]', img, { filename: `image_${i}.png`, contentType: 'image/png' });
      });

      const response = await firstValueFrom(
        this.httpService.post(
          `${this.baseUrl}/images/edits`,
          form,
          { headers: { ...this.headers, ...form.getHeaders() }, timeout: 120000 },
        ),
      );

      const data = response.data?.data?.[0];
      const imageBuffer = data?.b64_json ? Buffer.from(data.b64_json, 'base64') : undefined;

      return {
        imageBuffer,
        inputTokens: response.data?.usage?.input_tokens ?? 0,
        outputTokens: response.data?.usage?.output_tokens ?? 0,
        totalCost: model.estimatedTokens,
        responseTime: Date.now() - start,
      };
    } catch (err) {
      throw this.handleError(err);
    }
  }

  async generateImageGemini(modelId: string, prompt: string, imageBase64?: string): Promise<AiResponse> {
    const model = getModel(modelId);
    if (!model) throw new Error(`Unknown model: ${modelId}`);

    // Build parts array
    const parts: any[] = [{ text: prompt }];

    if (imageBase64) {
      parts.push({
        inline_data: {
          mime_type: 'image/jpeg',
          data: imageBase64,
        },
      });
    }

    return this.callGeminiWithParts(parts, model.apiModel, model.estimatedTokens);
  }

  async generateImageGeminiRaw(parts: any[]): Promise<AiResponse> {
    const model = getModel('nano-banana-2');
    if (!model) throw new Error('nano-banana-2 model not found');

    return this.callGeminiWithParts(parts, model.apiModel, model.estimatedTokens, 120000);
  }

  private async callGeminiWithParts(
    parts: any[],
    apiModel: string,
    estimatedTokens: number,
    timeout = 120000,
  ): Promise<AiResponse> {
    const startTime = Date.now();

    try {
      const response = await firstValueFrom(
        this.httpService.post(
          `https://api.proxyapi.ru/google/v1beta/models/${apiModel}:generateContent`,
          {
            contents: [{ parts }],
            generationConfig: {
              responseModalities: ['TEXT', 'IMAGE'],
            },
          },
          {
            headers: {
              Authorization: `Bearer ${this.apiKey}`,
              'Content-Type': 'application/json',
            },
            timeout,
          },
        ),
      );

      const data = response.data;
      let imageBuffer: Buffer | null = null;
      let textResponse: string | null = null;

      this.logger.debug('Gemini raw response keys: ' + JSON.stringify(Object.keys(data)));

      if (data.candidates && data.candidates[0]?.content?.parts) {
        for (const part of data.candidates[0].content.parts) {
          if (part.inlineData) {
            imageBuffer = Buffer.from(part.inlineData.data, 'base64');
          } else if (part.inline_data) {
            imageBuffer = Buffer.from(part.inline_data.data, 'base64');
          }
          if (part.text) {
            textResponse = part.text;
          }
        }
        this.logger.debug(`Gemini parsed: hasImage=${!!imageBuffer}, hasText=${!!textResponse}, parts=${data.candidates[0].content.parts.length}`);
      } else {
        this.logger.warn('Gemini: no candidates/parts in response. ' +
          `candidates=${!!data.candidates}, ` +
          `blockReason=${data.promptFeedback?.blockReason ?? 'none'}, ` +
          `raw=${JSON.stringify(data).slice(0, 500)}`);
      }

      if (!imageBuffer && !textResponse) {
        throw new Error('Gemini returned empty response — no image and no text');
      }

      return {
        imageBuffer: imageBuffer ?? undefined,
        text: textResponse ?? undefined,
        inputTokens: 0,
        outputTokens: estimatedTokens,
        totalCost: estimatedTokens,
        responseTime: Date.now() - startTime,
      };
    } catch (err) {
      throw this.handleError(err);
    }
  }

  async analyzePhoto(modelId: string, imageBase64: string, question?: string, systemPrompt?: string): Promise<AiResponse> {
    const model = getModel(modelId);
    if (!model) throw new Error(`Unknown model: ${modelId}`);

    const text = question ?? 'Опиши это изображение подробно.';
    const start = Date.now();

    const messages: any[] = [];
    if (systemPrompt) messages.push({ role: 'system', content: systemPrompt });
    messages.push({
      role: 'user',
      content: [
        { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${imageBase64}` } },
        { type: 'text', text },
      ],
    });

    try {
      const response = await firstValueFrom(
        this.httpService.post(
          `${this.baseUrl}/chat/completions`,
          {
            model: model.apiModel,
            messages,
            max_completion_tokens: model.maxTokens,
          },
          { headers: this.headers, timeout: 120000 },
        ),
      );

      const data = response.data;
      const inputTokens = data.usage?.prompt_tokens ?? 0;
      const outputTokens = data.usage?.completion_tokens ?? 0;
      const totalCost = Math.ceil((inputTokens + outputTokens) * model.multiplier);

      return {
        text: data.choices?.[0]?.message?.content ?? '',
        inputTokens,
        outputTokens,
        totalCost,
        responseTime: Date.now() - start,
      };
    } catch (err) {
      throw this.handleError(err);
    }
  }

  async transcribeAudio(audioBuffer: Buffer, filename = 'audio.ogg'): Promise<AiResponse> {
    const model = MODELS['whisper'];
    const start = Date.now();

    try {
      const form = new FormData();
      form.append('file', audioBuffer, { filename, contentType: 'audio/ogg' });
      form.append('model', model.apiModel);

      const response = await firstValueFrom(
        this.httpService.post(`${this.baseUrl}/audio/transcriptions`, form, {
          headers: { ...this.headers, ...form.getHeaders() },
          timeout: 120000,
        }),
      );

      return {
        audioText: response.data?.text ?? '',
        inputTokens: 0,
        outputTokens: 0,
        totalCost: model.estimatedTokens,
        responseTime: Date.now() - start,
      };
    } catch (err) {
      throw this.handleError(err);
    }
  }

  estimateCost(modelId: string): number {
    const model = getModel(modelId);
    if (!model) return 0;
    return model.estimatedTokens;
  }

  private handleError(err: any): Error {
    const status = err?.response?.status;
    if (status === 429) return new Error('RATE_LIMIT');
    if (status >= 500) return new Error('SERVICE_UNAVAILABLE');
    if (err.code === 'ECONNABORTED' || err.message?.includes('timeout')) return new Error('TIMEOUT');
    this.logger.error('ProxyAPI error', { status: err?.response?.status, message: err?.message });
    return new Error('UNKNOWN_ERROR');
  }
}
