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

  it('should sanitize reasoning blocks, prefixes, and quotes from model responses', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [
          {
            message: {
              content:
                '<think>The user gave telecom services not travel. We must summarize...</think>\nSummary: "Professional assistance with Grameenphone services and bulk SMS API integration."',
            },
          },
        ],
      }),
    } as any);

    const result = await aiService.generateSummary(
      'Welcome to my gig! Expert assistance with Grameenphone services, including bulk SMS API integration, recharge.',
    );

    expect(result).toBe(
      'Professional assistance with Grameenphone services and bulk SMS API integration.',
    );
  });

  it('should clean conversational meta-reasoning leaks if model includes thought debates', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [
          {
            message: {
              content:
                'We need to produce a clean summary. But the user gave a gig description. So we summarize the gig: "Expert assistance with Grameenphone services, including bulk SMS API integration, recharge"',
            },
          },
        ],
      }),
    } as any);

    const result = await aiService.generateSummary('Telecom gig text');
    expect(result).toBe(
      'Expert assistance with Grameenphone services, including bulk SMS API integration, recharge',
    );
  });

  it('should return null gracefully if fetch throws network error', async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error('Network error'));

    const result = await aiService.generateSummary('Valid description');
    expect(result).toBeNull();
  });
});
