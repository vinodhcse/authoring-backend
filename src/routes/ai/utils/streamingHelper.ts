// File: utils/streamingHelper.ts
import { Response } from 'express';
import { Together } from 'together-ai';
import { get_encoding } from '@dqbd/tiktoken';

interface StreamOptions {
  model: { name: string; type: 'json' | 'text'; temperature: number };
  systemPrompt: string;
  userPrompt: string;
  inputText: string[];
  responseType: 'json' | 'text';
  res: Response;
  together: Together;
  userId: string;
  feature: string;
}

function countWords(text: string | null | undefined): number {
  if (!text) return 0;
  return text.split(/\s+/).filter(word => word.length > 0).length;
}

function countTokens(text: string | null | undefined): number {
  if (!text) return 0;
  try {
    const encoding = get_encoding("cl100k_base");
    const tokens = encoding.encode(text);
    return tokens.length || Math.ceil(countWords(text) * 0.75);
  } catch {
    return Math.ceil(countWords(text) * 0.75);
  }
}

async function updateUserCredits(userId: string, inputTokens: number, outputTokens: number, totalTokens: number) {
  console.log(`Updating credits for user ${userId}: Input = ${inputTokens}, Output = ${outputTokens}, Total = ${totalTokens}`);
  return true;
}

export async function streamToFrontend({
  model,
  systemPrompt,
  userPrompt,
  inputText,
  responseType,
  res,
  together,
  userId,
  feature
}: StreamOptions): Promise<{ success: boolean; retryFallback: boolean }> {
  let attempt = 0;
  let buffer = '';
  let originalParagraphResponse: string[][] = [];
  const maxRetries = 3;
  let retryFallback = false;
  let success = false;

  const initialSystemPromptTokens = countTokens(systemPrompt);
  const initialUserPromptTokens = countTokens(userPrompt);
  let totalInputTokens = initialSystemPromptTokens + initialUserPromptTokens;
  let max_tokens = Math.ceil((initialUserPromptTokens * 2) + (totalInputTokens * 1.4) + (initialUserPromptTokens * 1.4));
  let currentUserPrompt = userPrompt;

  while (attempt < maxRetries) {
    attempt++;
    try {
      const stream = await together.chat.completions.create({
        model: model.name,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: currentUserPrompt }
        ],
        temperature: model.temperature,
        max_tokens,
        stream: true,
        ...(model.type === 'json' && {
          response_format: {
            type: 'json_schema',
            schema: {
              type: 'object',
              properties: {
                rephrasedParagraphs: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      rephrasedParagraphIndex: { type: 'integer' },
                      rephrasedParagraphContent: { type: 'string' },
                      originalParagraphContents: { type: 'array', items: { type: 'string' } }
                    },
                    required: ['rephrasedParagraphIndex', 'rephrasedParagraphContent', 'originalParagraphContents']
                  }
                }
              },
              required: ['rephrasedParagraphs']
            }
          }
        })
      });
      console.log(`Payload to model ${model.name}...`, {
        model: model.name,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: currentUserPrompt }
        ],
        temperature: model.temperature,
        max_tokens,
        stream: true,
        ...(model.type === 'json' && {
          response_format: {
            type: 'json_schema',
            schema: {
              type: 'object',
              properties: {
                rephrasedParagraphs: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      rephrasedParagraphIndex: { type: 'integer' },
                      rephrasedParagraphContent: { type: 'string' },
                      originalParagraphContents: { type: 'array', items: { type: 'string' } }
                    },
                    required: ['rephrasedParagraphIndex', 'rephrasedParagraphContent', 'originalParagraphContents']
                  }
                }
              },
              required: ['rephrasedParagraphs']
            }
          }
        })
      });
      for await (const chunk of stream) {
        const usage = chunk.usage;
        if (usage) {
          await updateUserCredits(userId, usage.prompt_tokens || 0, usage.completion_tokens || 0, usage.total_tokens || 0);
          continue;
        }

        const finishReason = chunk.choices?.[0]?.finish_reason;
        if (finishReason === 'length') {
          console.warn(`Token limit reached on model ${model.name}`);
          const processedCount = originalParagraphResponse.length;
          const remainingParagraphs = inputText.slice(processedCount);
          const joined = remainingParagraphs.join('\n\n');
          currentUserPrompt = `<originalText>${joined}</originalText>`;

          const updatedUserPromptTokens = countTokens(currentUserPrompt);
          max_tokens = Math.ceil((updatedUserPromptTokens * 2) + (initialSystemPromptTokens * 1.4) + (updatedUserPromptTokens * 1.4));
          totalInputTokens = initialSystemPromptTokens + updatedUserPromptTokens;

          continue;
        } else if (finishReason === 'stop') {
          success = true;
          continue;
        }

        const content = chunk.choices?.[0]?.delta?.content || chunk.choices?.[0]?.text;
        if (!content) continue;

        buffer += content;

        if (model.type === 'json') {
          const match = buffer.match(/\{\s*"rephrasedParagraphIndex"\s*:\s*\d+[^}]+\}/);
          if (match) {
            try {
              const parsed = JSON.parse(match[0]);
              res.write(`${JSON.stringify(parsed)}\n`);
              res.flush();
              buffer = '';
              originalParagraphResponse.push(parsed.originalParagraphContents);
              success = true;
            } catch {
              // wait for full JSON
            }
          }
        } else {
          if (feature === 'rephrase') {
            // buffer until end
          } else {
            res.write(`${JSON.stringify({ text: content })}\n`);
            res.flush();
            success = true;
          }
        }
      }

      if (model.type === 'text' && feature === 'rephrase' && buffer.length > 0) {
        const textResponse = {
          rephrasedParagraphIndex: 1,
          rephrasedParagraphContent: buffer,
          originalParagraphContents: inputText
        };
        res.write(`${JSON.stringify(textResponse)}\n`);
        res.flush();
        success = true;
      }

      break;
    } catch (err) {
      console.error(`Service error with model ${model.name}:`, err);
      retryFallback = true;
      break;
    }
  }

  return { success, retryFallback };
}
