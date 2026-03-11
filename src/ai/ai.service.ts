import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';
import * as FormData from 'form-data';
import { getModel, MODELS } from './models.config';

export interface AiResponse {
  text?: string;
  imageUrl?: string;
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
          { model: model.apiModel, messages, max_tokens: model.maxTokens },
          { headers: this.headers, timeout: 30000 },
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
          { model: model.apiModel, prompt, n: 1, size: '1024x1024' },
          { headers: this.headers, timeout: 60000 },
        ),
      );

      const imageUrl = response.data?.data?.[0]?.url ?? response.data?.data?.[0]?.b64_json;

      return {
        imageUrl,
        inputTokens: 0,
        outputTokens: 0,
        totalCost: model.estimatedTokens,
        responseTime: Date.now() - start,
      };
    } catch (err) {
      throw this.handleError(err);
    }
  }

  async analyzePhoto(modelId: string, imageBase64: string, question?: string): Promise<AiResponse> {
    const model = getModel(modelId);
    if (!model) throw new Error(`Unknown model: ${modelId}`);

    const text = question ?? 'Опиши это изображение подробно.';
    const start = Date.now();

    try {
      const response = await firstValueFrom(
        this.httpService.post(
          `${this.baseUrl}/chat/completions`,
          {
            model: model.apiModel,
            messages: [
              {
                role: 'user',
                content: [
                  { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${imageBase64}` } },
                  { type: 'text', text },
                ],
              },
            ],
            max_tokens: model.maxTokens,
          },
          { headers: this.headers, timeout: 30000 },
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
          timeout: 60000,
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
    return Math.ceil(model.estimatedTokens * model.multiplier);
  }

  private handleError(err: any): Error {
    const status = err?.response?.status;
    if (status === 429) return new Error('RATE_LIMIT');
    if (status >= 500) return new Error('SERVICE_UNAVAILABLE');
    if (err.code === 'ECONNABORTED' || err.message?.includes('timeout')) return new Error('TIMEOUT');
    this.logger.error('ProxyAPI error', err?.response?.data ?? err.message);
    return new Error('UNKNOWN_ERROR');
  }
}
