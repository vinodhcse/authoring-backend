import express, { Request, Response, NextFunction } from 'express';
import { callOllama } from './aicore';

const router = express.Router();

// Define the PromptContext interface
interface PromptContext {
  contextType: string;
  id: string;
  prompt: string;
}

// POST /ai/rephrase
router.post('/rephrase', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const {
      bookId,
      versionId,
      chapterId,
      textToRephrase,
      textBefore,
      textAfter,
      llmModel = 'default',
      customInstructions,
      promptContexts,
    } = req.body;

    if (!textToRephrase || !Array.isArray(textToRephrase) || textToRephrase.length === 0) {
      return res.status(400).json({ error: 'Invalid or missing textToRephrase' });
    }

    // Step 1: Rephrase the text
    const fullTextToRephrase = textToRephrase.join('\n\n');
    const rephraseSystemPrompt = `You are a master storyteller and a world-class literary editor. Your task is to elevate a piece of writing by rephrasing it.

Analyze the user's text paragraph by paragraph, and sentence by sentence.
Your rephrasing should:
1. **Enrich the Language**: Use more evocative vocabulary and sophisticated sentence structures.
2. **Enhance the Prose**: Improve the rhythm, flow, and clarity of the writing.
3. **Deepen the Tone**: Subtly weave a more melancholic and somber tone throughout the narrative.
4. **Preserve the Core**: Maintain the original plot, character intentions, and key details. Do not add new plot points or characters.

Additional Instructions:
${customInstructions || 'None'}

Context:
  For contextual information, refer to surrounding words in the scene, DO NOT REPEAT THEM:
  <textBefore>
   ${textBefore || 'None'}
  </textBefore>
  <textAfter>
    ${textAfter || 'None'}
  </textAfter>
  
  
For More contextual information, refer to surrounding words in the scene, DO NOT REPEAT THEM:
${promptContexts.map((ctx: PromptContext) => `Type: ${ctx.contextType}, ID: ${ctx.id}, Prompt: ${ctx.prompt}`).join('\n')}

Return ONLY the fully rephrased text. Do not include any of your own commentary, introductions, or explanations. Just the final, edited story.`;

 //   console.log("--- AI Rephrase System Prompt (Step 1) ---\n", rephraseSystemPrompt);

    const rephraseResponse = await callOllama(rephraseSystemPrompt, fullTextToRephrase, 'text');
    const rephrasedText = rephraseResponse.response;

    if (!rephrasedText || typeof rephrasedText !== 'string' || rephrasedText.trim() === '') {
      return res.status(500).json({ error: 'Failed to rephrase text' });
    }

    console.log("--- AI Rephrase Response (Step 1) ---\n", rephrasedText);

    // Step 2: Map the rephrased text back to the original paragraphs
    const mappingSystemPrompt = `You are a text analysis expert. Your task is to map a rephrased text back to an original set of paragraphs.
I will provide you with an 'original_paragraphs' string and a 'rephrased_text' string.
You MUST produce a valid JSON object with a single key: \"mapped_suggestions\".
The value of \"mapped_suggestions\" MUST be an array of objects.
Each object in the array represents a paragraph from the 'rephrased_text' and MUST have the following keys:
1. \"rephrasedParagraph\": A string containing one paragraph from the rephrased text.
2. \"originalParagraph\": A string containing the corresponding original paragraph.

RULES:
- Every paragraph from the 'rephrased_text' must appear exactly once in the 'mapped_suggestions' array, in the correct order.
- If a rephrased paragraph corresponds to multiple original paragraphs (a merge), include all original paragraphs in 'originalParagraph'.
- If a rephrased paragraph is entirely new (a hallucination), 'originalParagraph' should be an empty string.
- If a rephrased paragraph corresponds to a single original paragraph, 'originalParagraph' should contain that paragraph.`;

    const userPromptForMapping = `Here is the data to process:
    ${JSON.stringify({ original_paragraphs: fullTextToRephrase, rephrased_text: rephrasedText }, null, 2)}`;

    const mappingResponse = await callOllama(mappingSystemPrompt, userPromptForMapping, 'json');
    const mappedSuggestions = mappingResponse.response;

    console.log("--- AI Mapping Response (Step 2) ---\n", mappedSuggestions);

    // Sanitize and validate the mapping response
    let sanitizedMappingResponse;
    try {
      // Attempt to sanitize the JSON response
      let jsonString = mappingResponse.response;

      
        if (!jsonString || typeof jsonString !== 'string') {
            throw new Error("AI returned an empty or invalid response for mapping.");
        }
        
        // Strip markdown fences that models sometimes add
        const fenceRegex = /^```(?:json)?\s*\n?(.*)\n?\s*```$/s;
        const match = jsonString.trim().match(fenceRegex);
        if (match && match[1]) {
            jsonString = match[1].trim();
        }

      try {
        sanitizedMappingResponse = JSON.parse(jsonString);
      } catch (parseError) {
        console.error('Initial JSON parsing failed. Attempting fallback correction.', parseError);
        
      }
    } catch (parseError) {
      console.error('Failed to sanitize and parse mapping response:', parseError);
      console.error('Problematic JSON:', mappingResponse.response);
      return res.status(500).json({
        error: 'Malformed mapping response from LLM',
        details: (parseError instanceof Error) ? parseError.message : 'Unknown error',
      });
    }
    console.log('Sanitized JSON String:', sanitizedMappingResponse);
    // Validate and format the response
    if (!sanitizedMappingResponse || !Array.isArray(sanitizedMappingResponse?.mapped_suggestions)) {
      return res.status(500).json({ error: 'Failed to map rephrased text' });
    }

    const formattedResponse = sanitizedMappingResponse?.mapped_suggestions.map((item: { rephrasedParagraph: string; originalParagraph: string }) => ({
      rephrasedParagraph: item.rephrasedParagraph,
      originalParagraph: item.originalParagraph || '', // Ensure originalParagraph is always a string
    }));

    res.status(200).json({ rephrasedText: formattedResponse });
  } catch (err) {
    console.error('Error during rephrasing process:', err);
    next(err);
  }
});

export default router;
