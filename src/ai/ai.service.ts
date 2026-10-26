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

    const configuredModel = this.configService.get<string>('OPENROUTER_MODEL');
    const fallbackModels = [
      'dots-studio/dots-3-note-preview:free',
      'recursive/flint-v1.0:free',
      'nvidia/nemotron-3.5-lightning:free',
    ];
    const models =
      configuredModel && configuredModel !== 'openrouter/free'
        ? [configuredModel, ...fallbackModels]
        : fallbackModels;

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
          models,
          reasoning: { effort: 'none' },
          temperature: 0.3,
          max_tokens: 300,
          messages: [
            {
              role: 'system',
              content:
                'You are a direct text summarizer. Generate a clean, captivating 1-2 sentence summary of the provided text, regardless of the topic (whether travel, business, technical, telecom, personal, or general notes). Do not evaluate or comment on the topic, and never output thought processes, reasoning, disclaimers, quotes, or markdown. Return ONLY the direct 1-2 sentence summary.',
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
      let summary = data?.choices?.[0]?.message?.content?.trim() || '';

      if (summary) {
        // Strip any leaked reasoning or think blocks from reasoning models
        summary = summary.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();

        // Discard safety moderation guardrail false positives
        if (/^User Safety:\s*safe$/i.test(summary)) {
          return null;
        }

        // If the model leaked conversational meta-reasoning like 'So we summarize the gig: "..."'
        const metaSummaryMatch = summary.match(
          /(?:So we summarize(?: the gig| the text)?|In summary):\s*["“]?([^"”]+)["”]?/i,
        );
        if (metaSummaryMatch && metaSummaryMatch[1]) {
          summary = metaSummaryMatch[1].trim();
        }

        // Strip conversational prefixes
        summary = summary
          .replace(
            /^(summary|here is a summary of the text|here is the summary):\s*/i,
            '',
          )
          .trim();

        // Strip surrounding quotes
        if (
          (summary.startsWith('"') && summary.endsWith('"')) ||
          (summary.startsWith('“') && summary.endsWith('”'))
        ) {
          summary = summary.slice(1, -1).trim();
        }

        if (summary.length > 0) {
          this.logger.log('AI summary generated successfully.');
          return summary;
        }
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
