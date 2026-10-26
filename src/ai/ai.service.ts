import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);
  private readonly apiUrl = 'https://openrouter.ai/api/v1/chat/completions';

  constructor(private readonly configService: ConfigService) {}

  async generateSummary(description: string): Promise<string | null> {
    if (!description || description.trim().length === 0) {
      return null;
    }

    const apiKey =
      this.configService.get<string>('OPENROUTER_API_KEY') ||
      this.configService.get<string>('OPEN_ROUTER_API_KEY');

    const model =
      this.configService.get<string>('OPENROUTER_MODEL') || 'openrouter/free';

    if (!apiKey) {
      this.logger.warn(
        'OPENROUTER_API_KEY is not defined. Skipping AI summary generation.',
      );
      return null;
    }

    try {
      const response = await fetch(this.apiUrl, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': 'http://localhost:3000',
          'X-Title': 'Travel Photo Journal',
        },
        body: JSON.stringify({
          model,
          messages: [
            {
              role: 'system',
              content:
                'You are an AI assistant for a travel photo journal. Generate a clean, captivating 1-2 sentence summary of the provided travel description. Do not include quotes, options, bullet points, or markdown formatting—return only the plain summary text directly.',
            },
            {
              role: 'user',
              content: description,
            },
          ],
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        this.logger.warn(
          `OpenRouter API responded with status ${response.status}: ${errorText}`,
        );
        return null;
      }

      const data: any = await response.json();
      const summary = data?.choices?.[0]?.message?.content?.trim();

      if (summary) {
        this.logger.log('AI summary generated successfully.');
        return summary;
      }

      return null;
    } catch (error: any) {
      this.logger.error(
        `Failed to generate AI summary via OpenRouter: ${error?.message || error}`,
      );
      // Graceful fallback so photo upload/update does not crash
      return null;
    }
  }
}
