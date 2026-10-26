import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { AiService } from './ai.service.js';

describe('AiService', () => {
  let aiService: AiService;
  let mockConfigService: any;
  const originalFetch = global.fetch;

  beforeEach(() => {
    mockConfigService = {
      get: vi.fn((key: string) => {
        if (key === 'OPENROUTER_API_KEY') return 'test_api_key';
        if (key === 'OPENROUTER_MODEL') return 'openrouter/free';
        return null;
      }),
    };

    aiService = new AiService(mockConfigService);
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('should return null if description is empty or whitespace', async () => {
    const result1 = await aiService.generateSummary('');
    const result2 = await aiService.generateSummary('   ');

    expect(result1).toBeNull();
    expect(result2).toBeNull();
  });

  it('should return null if API key is not configured', async () => {
    mockConfigService.get.mockReturnValue(null);

    const result = await aiService.generateSummary('A sunny day at the beach');
    expect(result).toBeNull();
  });

  it('should return summary text on successful OpenRouter response', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [
          {
            message: {
              content: 'A golden sunset over the tranquil ocean waters.',
            },
          },
        ],
      }),
    } as any);

    const result = await aiService.generateSummary(
      'An amazing sunset while sitting on the sand looking at the sea.',
    );

    expect(result).toBe('A golden sunset over the tranquil ocean waters.');
  });

  it('should return null gracefully if OpenRouter returns non-200 status', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 429,
      text: async () => 'Rate limit exceeded',
    } as any);

    const result = await aiService.generateSummary('Valid description');
    expect(result).toBeNull();
  });

  it('should return null gracefully if fetch throws network error', async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error('Network error'));

    const result = await aiService.generateSummary('Valid description');
    expect(result).toBeNull();
  });
});
