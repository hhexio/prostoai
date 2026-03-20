import { Injectable } from '@nestjs/common';

@Injectable()
export class RouterService {
  route(type: string): string {
    if (type === 'photo') return 'gpt-4o-vision';
    if (type === 'voice' || type === 'audio') return 'whisper';
    return 'gpt-4.1-mini';
  }
}
