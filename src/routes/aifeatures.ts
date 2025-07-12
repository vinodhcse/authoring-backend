import express, { Request, Response, NextFunction } from 'express';
import compression from 'compression';
import { callOllama, callOllamaStream, splitIntoParagraphs, mapRephrasedToOriginalLLM } from './aicore';

const router = express.Router();
router.use(compression()); // Enable response compression and flushing

interface PromptContext {
  contextType: string;
  id: string;
  prompt: string;
}

//const OLLAMA_REPHRASING_MODEL = "qwen3:8b";
//const OLLAMA_MAPPING_MODEL = "qwen3:8b";

//const OLLAMA_REPHRASING_MODEL = "wizardlm2:7b";
//const OLLAMA_MAPPING_MODEL = "wizardlm2:7b";

const OLLAMA_REPHRASING_MODEL = "gemma3:4b";
const OLLAMA_MAPPING_MODEL = "gemma3:4b";

router.post('/rephraser1', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const {
      textToRephrase,
      textBefore,
      textAfter,
      customInstructions,
      promptContexts,
    } = req.body;

    if (!textToRephrase || !Array.isArray(textToRephrase) || textToRephrase.length === 0) {
      return res.status(400).json({ error: 'Invalid or missing textToRephrase' });
    }

    const fullTextToRephrase = textToRephrase.join('\n\n');

    const rephraseSystemPrompt = `You are a master storyteller and a world-class literary editor. Your task is to elevate a piece of writing by rephrasing it.

Analyze the user's text paragraph by paragraph, and sentence by sentence.
Your rephrasing should:
1.  **Enrich the Language**: Use more evocative vocabulary and sophisticated sentence structures.
2.  **Enhance the Prose**: Improve the rhythm, flow, and clarity of the writing.
3.  **Deepen the Tone**: Subtly weave a more melancholic and somber tone throughout the narrative.
4.  **Preserve the Core**: Maintain the original plot, character intentions, and key details. Do not add new plot points or characters.
5.  **Paragraph Structure**: Each paragraph in the rephrased text should correspond to a single paragraph in the original text, preserving the original structure.
6.  **Maintain Original Meaning**: Ensure that the rephrased text conveys the same meaning and intent as the original.
7.  **Use of Context**: If provided, use the context from <textBefore> and <textAfter> to inform your rephrasing.
8.  **DO not return the same line**: Do not return the same line as in the original text. Always rephrase every paragraph that enriches its vocabulary and standard.

Additional Instructions:
${customInstructions || 'None'}

Context:
<textBefore>
${textBefore || 'None'}
</textBefore>
<textAfter>
${textAfter || 'None'}
</textAfter>

Other Context:
${promptContexts?.map((ctx: PromptContext) => `Type: ${ctx.contextType}, ID: ${ctx.id}, Prompt: ${ctx.prompt}`).join('\n') || 'None'}

Return ONLY the final rephrased paragraphs separated by double line breaks, with no explanations.`;

    const rephraseResponse = await callOllama(rephraseSystemPrompt, fullTextToRephrase, 'text', OLLAMA_REPHRASING_MODEL);
    let rephrasedText = rephraseResponse.response;

    if (!rephrasedText || typeof rephrasedText !== 'string' || rephrasedText.trim() === '') {
      return res.status(500).json({ error: 'Failed to rephrase text' });
    }

    // 🔥 REMOVE any <think>...</think> block if present
    rephrasedText = rephrasedText.replace(/<think>[\s\S]*?<\/think>/g, '').trim();
    console.log("-----------------------------------------------------------------------------------");
    console.log('Cleaned rephrased text:', rephrasedText);
    console.log("-----------------------------------------------------------------------------------");

    //const rephrasedParagraphs = splitIntoParagraphs(rephrasedText);

    const mappings = await mapRephrasedToOriginalLLM(textToRephrase, rephrasedText, OLLAMA_MAPPING_MODEL);
    console.log('Mappings from rephrased to original:', mappings);
    
    res.status(200).json(mappings);
  } catch (err) {
    console.error('Error during rephrasing process:', err);
    next(err);
  }
});


router.post('/rephrase', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const {
      textToRephrase,
      textBefore,
      textAfter,
      customInstructions,
      promptContexts,
    } = req.body;

    if (!textToRephrase || !Array.isArray(textToRephrase) || textToRephrase.length === 0) {
      return res.status(400).json({ error: 'Invalid or missing textToRephrase' });
    }

    const fullTextToRephrase = textToRephrase.join('\n\n');

    const rephraseSystemPrompt = `You are a master storyteller and a world-class literary editor. Your task is to elevate a piece of writing by rephrasing it.

Analyze the user's text paragraph by paragraph, and sentence by sentence.
Your rephrasing should:
1.  **Enrich the Language**: Use more evocative vocabulary and sophisticated sentence structures.
2.  **Enhance the Prose**: Improve the rhythm, flow, and clarity of the writing.
3.  **Deepen the Tone**: Subtly weave a more melancholic and somber tone throughout the narrative.
4.  **Preserve the Core**: Maintain the original plot, character intentions, and key details. Do not add new plot points or characters.
5.  **Rephase paragraph by baragraph**: Always rephrase paragraph by paragraph, do not rephrase the entire text at once.
6.  **Paragraph Structure**: Each paragraph in the rephrased text should correspond to a single paragraph in the original text, preserving the original structure.
7.  **Maintain Original Meaning**: Ensure that the rephrased text conveys the same meaning and intent as the original.
8.  **Use of Context**: If provided, use the context from <textBefore> and <textAfter> to inform your rephrasing.
9.  **Do not Skip lines**: Do not skip lines in the original text.
9.  **Avoid Over-Complexity**: While enriching the text, do not make it overly complex or difficult to read.


Additional Instructions:
${customInstructions || 'None'}

Context:
<textBefore>
${textBefore || 'None'}
</textBefore>
<textAfter>
${textAfter || 'None'}
</textAfter>

Other Context:
${promptContexts?.map((ctx: PromptContext) => `Type: ${ctx.contextType}, ID: ${ctx.id}, Prompt: ${ctx.prompt}`).join('\n') || 'None'}

Return ONLY the final rephrased paragraphs separated by double line breaks, with no explanations.`;

    const rephraseResponse = await callOllama(rephraseSystemPrompt, fullTextToRephrase, 'text', OLLAMA_REPHRASING_MODEL);
    let rephrasedText = rephraseResponse.response;

    if (!rephrasedText || typeof rephrasedText !== 'string' || rephrasedText.trim() === '') {
      return res.status(500).json({ error: 'Failed to rephrase text' });
    }

    // 🔥 REMOVE any <think>...</think> block if present
    rephrasedText = rephrasedText.replace(/<think>[\s\S]*?<\/think>/g, '').trim();
    console.log("-----------------------------------------------------------------------------------");
    console.log('Cleaned rephrased text:', rephrasedText);
    console.log("-----------------------------------------------------------------------------------");

    res.status(200).json({ rephrasedText: rephrasedText });
  } catch (err) {
    console.error('Error during rephrasing process:', err);
    next(err);
  }
});


router.post('/diffChecker', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { originalText, newText } = req.body;

    if (!originalText || !newText) {
      return res.status(400).json({ error: 'Missing originalText or newText' });
    }

    const diffSystemPrompt = `You are an expert text analysis AI. Your task is to compare two texts paragraph by paragraph and identify differences.

    I will provide you with 'OriginalText' and 'NewText' within <originalText></originalText> and <newText></newText>.

    For each paragraph in 'NewText', compare it to the corresponding paragraph in 'OriginalText' and identify:
    - Additions
    - Deletions
    - Modifications

    Your output should be a JSON object for each paragraph streamed one at a time. Each object should have:
    {
      "newParagraph": "The paragraph from NewText",
      "originalParagraph": "The corresponding paragraph from OriginalText",
      "diff": "A description of the differences",
      "done": false
    }

    IMPORTANT: Do not include any reasoning, explanations, or summaries in your response. Return only the required JSON objects in the exact format specified above. Do not add any extra text or commentary.`;

    const diffUserPrompt = `
    <originalText>
    ${originalText}
    </originalText>

    <newText>
    ${newText}
    </newText>
    
    **Output Instructions**:
    Your output should be a JSON object for each paragraph streamed one at a time. Each object should have:
    {
      "newParagraph": "The paragraph from NewText",
      "originalParagraph": "The corresponding paragraph from OriginalText",
      "diff": "A description of the differences",
      "done": false
    }

    IMPORTANT: Do not include any reasoning, explanations, or summaries in your response. Return only the required JSON objects in the exact format specified above. Do not add any extra text or commentary.
    `;

    const llmStream = await callOllamaStream(diffSystemPrompt, diffUserPrompt, OLLAMA_MAPPING_MODEL);

    let accumulatedResponse = '';
    let thinkingCompleted = false;

    res.setHeader('Content-Type', 'application/json');

    llmStream.on('data', (chunk: Buffer) => {
      const rawData = chunk.toString();

      try {
        const parsedData = JSON.parse(rawData); // Parse rawData as JSON

        if (parsedData.response) {
          accumulatedResponse += parsedData.response; // Add parsed response to accumulatedResponse
        }
      } catch (err) {
        console.error('Error parsing rawData:', err);
      }

      // Check and remove <think> blocks
      if (accumulatedResponse.includes('</think>')) {
        accumulatedResponse = accumulatedResponse.replace(/<think>[\s\S]*?<\/think>/g, '');
        thinkingCompleted = true; // Mark that <think> blocks are removed
      }

      // Only attempt to parse JSON if <think> blocks are removed
      if (thinkingCompleted) {
        console.log('Thinking Completed  Accumulated Response:', accumulatedResponse);
        try {
          let startIndex = accumulatedResponse.indexOf('{');
          let endIndex = accumulatedResponse.lastIndexOf('}');

          while (startIndex !== -1 && endIndex > startIndex) {
            const potentialJson = accumulatedResponse.slice(startIndex, endIndex + 1);

            try {
              const parsedData = JSON.parse(potentialJson);

              if (parsedData.newParagraph && parsedData.originalParagraph) {
                console.log('Complete Parsed JSON:', parsedData);
                res.write(JSON.stringify({
                  newParagraph: parsedData.newParagraph,
                  originalParagraph: parsedData.originalParagraph,
                  diff: parsedData.diff,
                  done: false,
                }) + '\n'); // Send JSON immediately

                if (res.flush) {
                  res.flush(); // Explicitly flush the response buffer
                }
              }

              // Remove processed JSON from accumulated response
              accumulatedResponse = accumulatedResponse.slice(endIndex + 1);
              startIndex = accumulatedResponse.indexOf('{');
              endIndex = accumulatedResponse.lastIndexOf('}');
            } catch (jsonError) {
              // If JSON parsing fails, continue accumulating
              break;
            }
          }
        } catch (err) {
          console.error('Error parsing accumulated response:', err);
        }
      }
    });

    llmStream.on('end', () => {
      console.log('Stream ended. Sending final done object.');
      res.write(JSON.stringify({ done: true }) + '\n');
      if (res.flush) {
        res.flush(); // Explicitly flush the response buffer
      }
      res.end();
    });

    llmStream.on('error', (err: Error) => {
      console.error('Error streaming from LLM:', err);
      res.status(500).json({ error: 'Error streaming from LLM', details: err.message });
    });
  } catch (err) {
    console.error('Error during diff checking process:', err);
    next(err);
  }
});

export default router;
