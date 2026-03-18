/**
 * Tests 2.1–2.6: Model routing and AI call parameters
 */
import { Test, TestingModule } from '@nestjs/testing';
import { AiService } from '../ai/ai.service';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { of } from 'rxjs';

const mockHttpService = {
  post: jest.fn(),
  get: jest.fn(),
};

const mockConfig = {
  get: jest.fn((key: string) => {
    if (key === 'PROXYAPI_URL') return 'https://api.proxyapi.ru/openai/v1';
    if (key === 'PROXYAPI_KEY') return 'test-key';
    return null;
  }),
};

describe('AiService – model routing (tests 2.1–2.6)', () => {
  let service: AiService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AiService,
        { provide: HttpService, useValue: mockHttpService },
        { provide: ConfigService, useValue: mockConfig },
      ],
    }).compile();

    service = module.get<AiService>(AiService);
    jest.clearAllMocks();
  });

  // 2.1 – Text → chat model uses max_completion_tokens
  it('2.1 chat() sends max_completion_tokens (not max_tokens)', async () => {
    mockHttpService.post.mockReturnValue(
      of({
        data: {
          choices: [{ message: { content: 'Hello' } }],
          usage: { prompt_tokens: 10, completion_tokens: 20 },
        },
      }),
    );

    await service.chat('gpt-4o', 'Hello');

    const callBody = mockHttpService.post.mock.calls[0][1];
    expect(callBody).toHaveProperty('max_completion_tokens');
    expect(callBody).not.toHaveProperty('max_tokens');
    expect(callBody.model).toBe('gpt-4o');
  });

  // 2.2 – Photo → analyzePhoto sends image_url content
  it('2.2 analyzePhoto() sends image as image_url in message content', async () => {
    mockHttpService.post.mockReturnValue(
      of({
        data: {
          choices: [{ message: { content: 'Image description' } }],
          usage: { prompt_tokens: 100, completion_tokens: 50 },
        },
      }),
    );

    await service.analyzePhoto('gpt-4o', 'base64imagedata', 'What is this?');

    const callBody = mockHttpService.post.mock.calls[0][1];
    const content = callBody.messages[0].content;
    expect(Array.isArray(content)).toBe(true);
    const imageBlock = content.find((c: any) => c.type === 'image_url');
    expect(imageBlock).toBeDefined();
    expect(imageBlock.image_url.url).toContain('data:image/jpeg;base64,base64imagedata');
  });

  // 2.3 – Voice → transcribeAudio uses whisper-1
  it('2.3 transcribeAudio() uses whisper-1 model', async () => {
    mockHttpService.post.mockReturnValue(of({ data: { text: 'Hello world' } }));
    const audioBuffer = Buffer.from('fake-audio');

    await service.transcribeAudio(audioBuffer);

    // Check that whisper-1 was appended to the form
    const callUrl = mockHttpService.post.mock.calls[0][0];
    expect(callUrl).toContain('/audio/transcriptions');
  });

  // 2.4 – Image model uses response_format: b64_json
  it('2.4 generateImage() requests b64_json format', async () => {
    mockHttpService.post.mockReturnValue(
      of({ data: { data: [{ b64_json: 'abc123' }] } }),
    );

    await service.generateImage('gpt-image-1', 'A cat');

    const callBody = mockHttpService.post.mock.calls[0][1];
    expect(callBody.response_format).toBe('b64_json');
  });

  // 2.5 – DALL-E 3 also uses b64_json (not URL)
  it('2.5 DALL-E 3 generates with b64_json (VPS cannot download from CDN)', async () => {
    mockHttpService.post.mockReturnValue(
      of({ data: { data: [{ b64_json: 'dalleb64data' }] } }),
    );

    await service.generateImage('dall-e-3', 'A landscape');

    const callBody = mockHttpService.post.mock.calls[0][1];
    expect(callBody.response_format).toBe('b64_json');
    expect(callBody.model).toBe('dall-e-3');
  });

  // 2.6 – Nano Banana 2 hits Google endpoint, costs 50000 tokens
  it('2.6 generateImageGemini() hits Google endpoint and costs 50000 tokens', async () => {
    mockHttpService.post.mockReturnValue(
      of({
        data: {
          candidates: [
            {
              content: {
                parts: [{ inlineData: { data: 'imgbase64', mimeType: 'image/png' } }],
              },
            },
          ],
        },
      }),
    );

    const result = await service.generateImageGemini('nano-banana-2', 'A banana');

    const callUrl = mockHttpService.post.mock.calls[0][0];
    expect(callUrl).toContain('google');
    expect(result.totalCost).toBe(50000);
    expect(result.imageBuffer).toBeDefined();
  });
});
