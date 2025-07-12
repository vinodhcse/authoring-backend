import fetch from 'node-fetch';

const OLLAMA_API_URL = "http://localhost:11434/api/generate";
const OLLAMA_MAPPING_MODEL = "gemma3:4b";

export async function callOllama(systemPrompt: string, userPrompt: string, format: 'json' | 'text' = 'text', model: string): Promise<any> {
  const payload: { [key: string]: any } = {
    model,
    system: systemPrompt,
    prompt: userPrompt,
    stream: false,
  };

  if (format === 'json') payload.format = 'json';
  console.log("-----------------------------------------------------------------------------------");
  console.log("LLM payload:", JSON.stringify(payload));
  console.log("-----------------------------------------------------------------------------------");

  const response = await fetch(OLLAMA_API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    console.error("Ollama API Error Response:", errorBody);
    throw new Error(`Ollama API returned an error: ${response.statusText}`);
  }

  return response.json();
}

/**
 * Maps rephrased paragraphs to original paragraphs using a single LLM call with userPrompt input.
 */
export const mapRephrasedToOriginalLLM = async (
  originalParagraphs: string,
  rephrasedText: string,
  llmModel: string = OLLAMA_MAPPING_MODEL
): Promise<{ rephrasedParagraph: string; originalParagraph: string }[]> => {

  const originalJoined = originalParagraphs;
  const rephrasedJoined = rephrasedText;
  console.log("-----------------------------------------------------------------------------------");
  console.log("Original paragraphs joined:", originalJoined);
  console.log("-----------------------------------------------------------------------------------");
  console.log("Rephrased paragraphs joined:", rephrasedJoined);
  console.log("-----------------------------------------------------------------------------------");
  const mappingSystemPrompt = `You are an expert text analysis AI. Your task is to map paragraphs from a 'Rephrased Text' back to their corresponding paragraphs in an 'Original Text'.
  

Each paragraph in the 'Rephrased Text' might be derived from one or more paragraphs in the 'OriginalText'. Your goal is to identify which original paragraphs contributed to each rephrased paragraph.

I will provide you with the 'OriginalText' and the 'RephrasedText' in the prompt within <originalText></originalText> and  <rephrasedText> </rephrasedText>. 



Your output should be a JSON array, where each object in the array represents a rephrased paragraph and lists the indices of the original paragraphs that were used to create it.
In the originalParagraphContents, Always include only the paragraphs from the original text, not the rephrased text.
If you don't find a clear mapping for a rephrased paragraph, you can return an empty array or null for the originalParagraphContents.
Remmeber, the rephrased text may contain multiple paragraphs, and you should map each rephrased paragraph to one or more original paragraphs.

**Example Output Format:**
json
[
  {
    "rephrasedParagraphIndex": 1,
    "rephrasedParagraphContent": "This is the content of the first rephrased paragraph.",
    "originalParagraphContents": ["This is the first pargrap"]
  },
  {
    "rephrasedParagraphIndex": 2,
    "rephrasedParagraphContent": "The second rephrased paragraph combines ideas from the original first and third paragraphs.",
    "originalParagraphContents": ["the second paragraph contains multiple lines", "the tird line is also partof secodn pargagph] // sometimes, two original paragraphs might be joined into one rephrased paragraph
  },
  {
    "rephrasedParagraphIndex": 3,
    "rephrasedParagraphContent": "This rephrased paragraph is a new addition and doesn't directly map to previous content.",
    "originalParagraphContents": [] // sometime no matching paragraph is foudn for the reophrased paragraph
  }
]

  
  `;

  const mappingUserPrompt = `
  Please find the inputs below (originalText and rephrasedText)
<originalText>
  ${originalJoined}
</originalText>  



<rephrasedText>
  ${rephrasedJoined}
</rephrasedText>


`;

  const llmResponse = await callOllama(mappingSystemPrompt, mappingUserPrompt, 'json', llmModel);
  console.log("LLM mapping raw response:", llmResponse);

   try {
    let parsed;
    if (typeof llmResponse.response === 'string') {
      parsed = JSON.parse(llmResponse.response);
    } else {
      parsed = llmResponse.response;
    }

    if (parsed && parsed.rephrasedParagraphs && Array.isArray(parsed.rephrasedParagraphs)) {
      return parsed.rephrasedParagraphs.map(p => ({
        rephrasedParagraph: p.rephrasedParagraphContent.replace(/\n\n+/g, '\n\n').trim(),
        originalParagraph: p.originalParagraphContents.join('\n\n').replace(/\n\n+/g, '\n\n').trim()
      }));
    } else {
      console.error("Invalid mapping response structure:", parsed);
    }
  } catch (err) {
    console.error("Failed to parse LLM mapping response:", err);
  }

  // fallback empty mappings
  return [{
    rephrasedParagraph: rephrasedText.replace(/\n\n+/g, '\n\n').trim(),
    originalParagraph: ''
  }];
};

/**
 * Utility to split text into paragraphs by double line breaks
 */
export const splitIntoParagraphs = (text: string): string[] => {
  return text
    .split(/\r?\n\r?\n/)
    .map(p => p.trim())
    .filter(p => p.length > 0);
};

export async function callOllamaStream(systemPrompt: string, userPrompt: string, model: string): Promise<NodeJS.ReadableStream> {
  const payload = {
    model,
    system: systemPrompt,
    prompt: userPrompt,
    stream: true, // Enable streaming
  };

  console.log("-----------------------------------------------------------------------------------");
  console.log("LLM payload for streaming:", JSON.stringify(payload));   
  console.log

  const response = await fetch(OLLAMA_API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    console.error("Ollama API Error Response:", errorBody);
    throw new Error(`Ollama API returned an error: ${response.statusText}`);
  }

  return response.body as NodeJS.ReadableStream; // Return the Readable stream
}
