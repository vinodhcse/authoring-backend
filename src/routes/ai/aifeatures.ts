// File: routes/ai/aiFeatures.ts
import express, { Request, Response } from 'express';
import compression from 'compression';
import dotenv from 'dotenv';
import Together from 'together-ai';
import { buildPromptForFeature } from './utils/promptBuilder';
import { getModelsByFeature } from './utils/modelSelector';
import { streamToFrontend } from './utils/streamingHelper';

dotenv.config();
const router = express.Router();
const together = new Together({ apiKey: process.env.TOGETHER_API_KEY });

router.use(compression());

router.post('/process', async (req: Request, res: Response) => {
  const { feature, text, textBefore, textAfter, promptContexts, customInstructions } = req.body;

  if (!feature || !Array.isArray(text) || text.length === 0) {
    return res.status(400).json({ error: 'Invalid request' });
  }

  console.log(`Processing feature: ${feature}`);

  const { systemPrompt, userPrompt, type } = buildPromptForFeature(feature, {
    text,
    textBefore,
    textAfter,
    promptContexts,
    customInstructions
  });

  const models = getModelsByFeature(feature);
  const userId = (req as any).user?.userId;

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();
  
  for (const model of models) {
    try {
      const { success, retryFallback } = await streamToFrontend({
        model,
        systemPrompt,
        userPrompt,
        inputText: text,
        responseType: type,
        res,
        together,
        userId,
        feature
      });

     
      if (success) {
        console.log(`Model ${model.name} processed successfully.`);
        res.write(`${JSON.stringify({ done: true })}\n`);
        res.end();
        return;
      } else if (retryFallback) {
        console.log(`Model ${model.name} requires fallback.`);
        continue;
      }
    } catch (err) {
      console.error(`Failed model ${model.name}:`, err);
      continue;
    }
  }

  res.write(`${JSON.stringify({ type: 'error', message: 'All models failed.' })}\n`);
  res.end();
});

export default router;
