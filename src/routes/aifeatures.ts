import express, { Request, Response, NextFunction } from 'express';
import compression from 'compression';
import { callOllama, callOllamaStream, splitIntoParagraphs, mapRephrasedToOriginalLLM } from './aicore'; // Assuming these are in aicore.ts
import Together from 'together-ai';
import dotenv from 'dotenv';
import { get_encoding } from '@dqbd/tiktoken';
import JSONStreamParser from 'json-stream-parser'; // Make sure you have this installed: npm install json-stream-parser
import { P } from 'pino';
import { UserImportBuilder } from 'firebase-admin/lib/auth/user-import-builder';

const router = express.Router();
router.use(compression()); // Enable response compression and flushing

dotenv.config();

console.log("Using Together API Key:", process.env.TOGETHER_API_KEY ? "Loaded" : "Not Loaded");
const together = new Together({ apiKey: process.env.TOGETHER_API_KEY });

// Define your models with a primary and fallbacks
const MODELS = [
    {
        name: "Qwen/Qwen3-235B-A22B-fp8-tput1", // Primary JSON-output model
        temperature: 0.66,
        type: "json"
    },
    {
        name: "meta-llama/Llama-4-Maverick-17B-128E-Instruct-FP8_1", // Fallback JSON-output model
        temperature: 0.66,
        type: "json"
    },
    {
        name: "Qwen/Qwen1.5-72B-Chat", // Fallback text-only model
        temperature: 0.66,
        type: "text"
    },
    {
        name: "google/gemma-3n-E4B-it", // Fallback text-only model
        temperature: 0.66,
        type: "text"
    },
    
];

// Helper function to update user credits (replace with your actual database/service call)
async function updateUserCredits(userId: string, inputTokens: number, outputTokens: number, totalTokens: number) {
    console.log(`Updating credits for user ${userId}: Input Tokens = ${inputTokens}, Output Tokens = ${outputTokens}, totalTokens = ${totalTokens}`);
    return true; // Simulate success
}

// Helper to count words
function countWords(text: string | null | undefined): number {
    if (!text) return 0;
    return text.split(/\s+/).filter(word => word.length > 0).length;
}

// Helper to calculate tokens
function countTokens(text: string | null | undefined): number {
    if (!text) return 0;
    try {
        const encoding = get_encoding("cl100k_base"); // Common encoding for many models
        const tokens = encoding.encode(text);
        if (tokens.length === 0) {
            console.warn(`Warning: No tokens generated for text "${text.substring(0, 50)}..."`);
            return countWords(text) * 0.75; // Fallback to word count estimation
        }
        return tokens.length;
    } catch (error) {
        console.warn(`Could not determine exact token count for "${text.substring(0, 50)}...". Estimating by word count.`, error);
        return Math.ceil(countWords(text) * 0.75); // Rough estimation if encoding fails
    }
}

// Backend: formatStreamPart function - Sends discrete JSON objects followed by a newline
function formatStreamPart(data: { type: string; [key: string]: any } | { done: boolean }): string {
    return `${JSON.stringify(data)}\n`;
}

interface PromptContext {
    contextType: string;
    id: string;
    prompt: string;
}

// Define the structure of a rephrased paragraph object that the model should return
interface RephrasedParagraph {
    rephrasedParagraphIndex: number;
    rephrasedParagraphContent: string;
    originalParagraphContents: string[];
}

router.post('/rephrase', async (req: Request, res: Response) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders(); 

    const {
        textToRephrase,
        textBefore,
        textAfter,
        customInstructions,
        promptContexts,
    }: {
        textToRephrase: string[];
        textBefore?: string;
        textAfter?: string;
        customInstructions?: string;
        promptContexts?: PromptContext[];
    } = req.body;

    if (!textToRephrase || !Array.isArray(textToRephrase) || textToRephrase.length === 0) {
        res.write(formatStreamPart({ type: 'error', message: 'Invalid or missing textToRephrase' }));
        return res.status(400).end(); 
    }

    const fullTextToRephrase = textToRephrase.join('\n\n');
    

    const userId = 'your_user_id'; 

    const userPrompt = `<originalText>${fullTextToRephrase || 'None'}</originalText>`;
    let retryUserPrompt = userPrompt;
    const systemPromptJson = `You are a master storyteller and a world-class literary editor. Your task is to elevate a piece of writing by rephrasing it. Only answer in JSON.

Analyze the user's text paragraph by paragraph, and sentence by sentence. Only use the text enclosed within <originalText> and </originalText> for rephrasing.
Rephrase each input Paragraph at a time. Don't combine Multipel paragraphs into one rephrased paragraph.
Utilize text within textBefore and textAfter tags as only reference.
Your rephrasing should:
1.  **Enrich the Language**: Use more evocative vocabulary and sophisticated sentence structures.
2.  **Enhance the Prose**: Improve the rhythm, flow, and clarity of the writing.
3.  **Deepen the Tone**: Subtly weave a more melancholic and somber tone throughout the narrative.
4.  **Preserve the Core**: Maintain the original plot, character intentions, and key details. Do not add new plot points or characters.
5.  **Paragraph Structure**: Each paragraph in the rephrased text should correspond to a single paragraph in the original text, preserving the original structure.
6.  **Maintain Original Meaning**: Ensure that the rephrased text conveys the same meaning and intent as the original.
7.  **Use of Context**: If provided, use the context from <textBefore> and <textAfter> to inform your rephrasing.
8.  **DO not return the same line**: Do not return the same line as in the original text. Always rephrase every paragraph that enriches its vocabulary and standard.
`;

    const systemPromptText = `You are a master storyteller and a world-class literary editor. Your task is to elevate a piece of writing by rephrasing it. Only use the text enclosed within <originalText> and </originalText> for rephrasing. Preserve the core meaning, enrich the language, enhance the prose, and deepen the tone to be more melancholic and somber. Provide the rephrased text directly, without any additional formatting like JSON.
    Additional Instructions:
${customInstructions || 'Make the tone more engaging and vivid.'}

Context:
<textBefore>
${textBefore || 'None'}
</textBefore>
<textAfter>
${textAfter || 'None'}
</textAfter>

${promptContexts ? 'Other Context\n' + promptContexts.map((ctx: PromptContext) => `Type: ${ctx.contextType}, ID: ${ctx.id}, Prompt: ${ctx.prompt}`).join('\n') : 'Other Context\nNone'}
`;

    let totalInputTokens = 0;
    let totalOutputTokens = 0;
    let finalOutputSuccess = false; 
    let requireRetryWithFallbackModels = false;
    const initialSystemPromptTokens = countTokens(systemPromptJson);
    const initialUserPromptTokens = countTokens(userPrompt);
    totalInputTokens = initialSystemPromptTokens + initialUserPromptTokens;

    const inputWordsLength = countWords(fullTextToRephrase);
    let max_tokens = Math.ceil((initialUserPromptTokens * 3) + (totalInputTokens * 1.4)+ (initialUserPromptTokens * 1.4));
    console.log(`Calculated max_tokens: ${max_tokens}`);
    console.log(`Initial System Prompt Tokens: ${initialSystemPromptTokens}, User Prompt Tokens: ${initialUserPromptTokens}, Total Input Tokens: ${totalInputTokens}`);

    const jsonResponseSchema = {
        type: "json_schema",
        schema: {
            type: "object",
            properties: {
                rephrasedParagraphs: {
                    type: "array",
                    title: "Rephrased paragraphs",
                    description: "A list of rephrased paragraphs",
                    items: {
                        type: "object",
                        properties: {
                            rephrasedParagraphIndex: {
                                type: "integer",
                                description: "The sequential index of the rephrased paragraph (e.g., 1 for the first rephrased paragraph, 2 for the second, and so on)."
                            },
                            rephrasedParagraphContent: {
                                type: "string",
                                description: "The rephrased content of the paragraph. This content should be an elevated, enhanced, and melancholic version of the original text, while preserving its core meaning."
                            },
                            originalParagraphContents: {
                                type: "array",
                                description: "A list of strings, where each string is the exact content of an original paragraph that was used to form this rephrased paragraph. Only include paragraphs from the original text. If no clear mapping is found for this rephrased paragraph, this array should be empty.",
                                items: {
                                    type: "string"
                                }
                            }
                        },
                        required: [
                            "rephrasedParagraphIndex",
                            "rephrasedParagraphContent",
                            "originalParagraphContents"
                        ],
                        additionalProperties: false
                    }
                }
            },
            required: [
                "rephrasedParagraphs"
            ],
            additionalProperties: false
        }
    };

    for (let i = 0; i < MODELS.length; i++) {
        const currentModelConfig = MODELS[i];
        const currentModelName = currentModelConfig.name;
        const currentModelType = currentModelConfig.type;
        const currentModelTemperature = currentModelConfig.temperature || 0.66; // Default temperature if not specified
        let originalParagraphResponse = []
        if (i >0 && requireRetryWithFallbackModels) return;

        console.log(`Attempting to use model: ${currentModelName} (Type: ${currentModelType})`);
       // res.write(formatStreamPart({ type: 'info', message: `Using model: ${currentModelName}` }));
        //res.flush();
        let modelResposneStatus = '';
        let modalFailureReason = '';
        let attempt = 1;
        try {
            console.log(`Starting attempt ${attempt} for model: ${currentModelName}`);
            console.log('modelResposneStatus:', modelResposneStatus, 'modalFailureReason:', modalFailureReason, 'attempt:', attempt);
            while( attempt === 1 || (modelResposneStatus === 'Failed' && modalFailureReason === 'TOKENS_LIMIT' && attempt < 4)) {
                console.log(`Attempt ${attempt} for model: ${currentModelName}`);
                let updatedUserPrompt = userPrompt;
                if ( retryUserPrompt ) {
                    updatedUserPrompt = retryUserPrompt;
                        
                        const updatedUserPromptTokens = countTokens(userPrompt);
                        max_tokens = Math.ceil((updatedUserPromptTokens * 2) + (totalInputTokens * 1.4)+ (updatedUserPromptTokens * 1.4));
                        const updatedTotalInputTokens = initialSystemPromptTokens + updatedUserPromptTokens;
                        console.log(`Updated max_tokens: ${max_tokens}`);
                        console.log(`Updated System Prompt Tokens: ${initialSystemPromptTokens}, User Prompt Tokens: ${updatedUserPromptTokens}, Total Input Tokens: ${updatedTotalInputTokens}`);
   
                }
                const chatCompletionOptions: Together.Chat.Completions.ChatCompletionCreateParams = {
                model: currentModelName,
                max_tokens: max_tokens,
                temperature: currentModelTemperature,               
                messages: [
                    { role: "system", content: currentModelType === "json" ? systemPromptJson : systemPromptText },
                    { role: "user", content: updatedUserPrompt }
                ],
                stream: true,
                ...(currentModelType === "json" && { response_format: {
                                    type: "json_schema",
                                    schema: {
                                        type: "object",
                                        properties: {
                                            rephrasedParagraphs: {
                                                type: "array",
                                                title: "Rephrased paragraphs",
                                                description: "A list of rephrased paragraphs",
                                                items: {
                                                    type: "object",
                                                    properties: {
                                                        rephrasedParagraphIndex: {
                                                            type: "integer",
                                                            description: "The sequential index of the rephrased paragraph (e.g., 1 for the first rephrased paragraph, 2 for the second, and so on)."
                                                        },
                                                        rephrasedParagraphContent: {
                                                            type: "string",
                                                            description: "The rephrased content of the paragraph. This content should be an elevated, enhanced, and melancholic version of the original text, while preserving its core meaning."
                                                        },
                                                        originalParagraphContents: {
                                                            type: "array",
                                                            description: "A list of strings, where each string is the exact content of an original paragraph that was used to form this rephrased paragraph. Only include paragraphs from the original text. If no clear mapping is found for this rephrased paragraph, this array should be empty.",
                                                            items: {
                                                                type: "string"
                                                            }
                                                        }
                                                    },
                                                    required: [
                                                        "rephrasedParagraphIndex",
                                                        "rephrasedParagraphContent",
                                                        "originalParagraphContents"
                                                    ],
                                                    additionalProperties: false
                                                }
                                            }
                                        },
                                        required: [
                                            "rephrasedParagraphs"
                                        ],
                                        additionalProperties: false
                                    }
                                } })
            };
            
            console.log("Payload: Chat completion options:", chatCompletionOptions);

            const responseStream = await together.chat.completions.create(chatCompletionOptions);
            console.log("Response stream received from Together.ai, starting to process...");

            if (currentModelType === "json") {

                let buffer = '';

                for await (const chunk of responseStream) {
                    let content = '';

                    if (chunk.usage ) {
                        console.log('Usage data:', chunk.usage);
                        totalOutputTokens = 0;
                        if (chunk.usage.total_tokens !== undefined) {
                            totalOutputTokens = chunk.usage.total_tokens || 0;
                        } else {
                             const promptTokens = chunk.usage.prompt_tokens || 0;
                            const completionTokens = chunk.usage.completion_tokens || 0;
                            totalOutputTokens = promptTokens + completionTokens;
                        }
                        updateUserCredits(userId, chunk.usage.promptTokens, chunk.usage.completionTokens, chunk.usage.total_tokens);
                        continue;
                        
                        
                    } 

                    if (chunk.choices?.[0]?.finish_reason === 'length') {
                        console.warn(`Model ${currentModelName} finished due to length limit.`, chunk.choices[0]);
                        modelResposneStatus = 'Failed';
                        modalFailureReason = 'TOKENS_LIMIT';
                        continue;

                    } else if (chunk.choices?.[0]?.finish_reason === 'stop') {
                        console.log(`Model ${currentModelName} finished normally.`);
                        modelResposneStatus = 'Success';    
                        continue;
                    }

                    

                    if (chunk.choices?.[0]?.delta?.content !== undefined) {
                        content = chunk.choices[0].delta.content;
                    } else if (chunk.choices?.[0]?.text !== undefined) {
                        content = chunk.choices[0].text;
                    }

                    if (content) {
                        buffer += content;
                     //   console.log('buffer', buffer);

                        


                        // Try to extract and stream complete `rephrasedParagraph` objects
                        
                        //const regex = /{[^{}]*?"rephrasedParagraphIndex"[^{}]*?"rephrasedParagraphContent"[^{}]*?"originalParagraphContents"[^{}]*?\[[\s\S]*?\][^{}]*?}/g;
                        const regex = /{\s*"rephrasedParagraphIndex"\s*:\s*\d+\s*,\s*"rephrasedParagraphContent"\s*:\s*"(?:[^"\\]|\\.)*?"\s*,\s*"originalParagraphContents"\s*:\s*\[[\s\S]*?\]\s*}/g;
                        
                        
                        let match = buffer.match(regex);
                         
                        if (!match) continue;
                            
                            const matchedText = match[0];

                            try {
                                console.log("Matched paragraph:", matchedText);
                                const obj = JSON.parse(matchedText);
                                console.log('✅ Matched:', obj.rephrasedParagraphIndex);

                                originalParagraphResponse.push(obj.originalParagraphContents);

                                // Remove matched text from buffer
                                
                                //console.log('Buffer before slicing:', buffer);
                                //console.log('Buffer before  slicing index:', buffer.indexOf(matchedText));
                                //buffer = buffer.slice(buffer.indexOf(matchedText) + matchedText.length);
                                buffer = '';
                                //console.log('Buffer after slicing:', buffer);
                                // stream to frontend
                                 res.write(formatStreamPart(obj));
                                res.flush();

                            } catch (e) {
                                console.warn('Error after regex parsing:', e);
                                console.warn('Error after regex parsing: Invalid JSON:', matchedText);
                            }
                    }

                  // totalOutputTokens += countTokens(content);

                  

                }

                if (modelResposneStatus === 'Failed' && modalFailureReason === 'TOKENS_LIMIT') {
                        console.warn(`Model ${currentModelName} failed due to token limit.`);
                        if (attempt <= 3) {
                            if (originalParagraphResponse?.length < textToRephrase.length) {
                                const remainingParagraphs = textToRephrase.slice(originalParagraphResponse);
                                const remainingParagraphsText = remainingParagraphs.join('\n');
                                retryUserPrompt = `<originalText>${remainingParagraphsText || 'None'}</originalText>`;
    
                                attempt = attempt + 1;
                            } else {
                                console.error(`Model ${currentModelName} failed after repeating attempts due to token limit.`);     
                                requireRetryWithFallbackModels = true;
                            }        
                            
                        } else {
                            console.error(`Model ${currentModelName} failed after 3 attempts due to token limit.`);
                        }
                    } else if (modelResposneStatus === 'Success') {
                        console.log(`Model ${currentModelName} completed successfully.`);
                        finalOutputSuccess = true; 
                        res.write(formatStreamPart({ done: true }));
                        res.flush();
                        break; // Exit the loop for this model
                    }


            } else { // Handle text-only models
                let accumulatedText = '';
                for await (const chunk of responseStream) {
                    if (chunk.choices && chunk.choices.length > 0 && chunk.choices[0].delta && chunk.choices[0].delta.content) {
                        const content = chunk.choices[0].delta.content;
                        accumulatedText += content;
                        
                    }
                }
                if (accumulatedText && accumulatedText.length > 0) {
                    const textResponse = {
                            rephrasedParagraphIndex:1,
                            rephrasedParagraphContent: accumulatedText,
                            originalParagraphContents: textToRephrase
                        };
                    res.write(`${JSON.stringify(textResponse)}\n`);

                    res.flush();
                    totalOutputTokens += countTokens(accumulatedText);
                    finalOutputSuccess = true; 
                } else {
                    console.error(`Model ${currentModelName} was not able to rephrase properly.`);
                    finalOutputSuccess = false;
                }

                
                
                // For text model, send a different completion signal or just the general 'done'
                res.write(formatStreamPart({ done: true })); 
                res.flush();
            }
            break; 
                
            }
            if (modelResposneStatus === 'Success') {
                console.log(`Model ${currentModelName} completed successfully. Skipping retryFallbackModels`);
                break; // Exit the loop for this model
            }
            
        } catch (error: any) {
            console.error(`Error with model ${currentModelName}:`, error);
            let errorMessage = `Error from model ${currentModelName}`;
            if (error instanceof SyntaxError || (error.message && error.message.includes('JSON parse error'))) {
                errorMessage = `Model ${currentModelName} returned malformed or incomplete JSON: ${error.message}`;
            } else if (error.status && error.headers) { 
                errorMessage = `API error from ${currentModelName} (Status: ${error.status}): ${error.message}`;
            } else {
                errorMessage = `Unexpected error from ${currentModelName}: ${error.message}`;
            }


        }
    }

    if (!finalOutputSuccess) {
        res.write(formatStreamPart({ type: 'error', message: 'All models failed to generate a valid response.' }));
        res.flush();
    }

  
    res.end(); 
});

export default router;