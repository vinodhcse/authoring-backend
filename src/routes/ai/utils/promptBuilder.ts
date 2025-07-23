// File: utils/promptBuilder.ts

interface PromptContext {
  contextType: string;
  id: string;
  prompt: string;
}

export function buildPromptForFeature(
  feature: string,
  {
    text,
    textBefore,
    textAfter,
    promptContexts,
    customInstructions,
  }: {
    text: string[];
    textBefore?: string;
    textAfter?: string;
    promptContexts?: PromptContext[];
    customInstructions?: string;
  }
): { systemPrompt: string; userPrompt: string; type: 'json' | 'text' } {
  const joinedText = text.join('\n\n');
  const defaultInstruction = 'Make the tone more engaging and vivid.';
  //const contextString = promptContexts?.map(ctx => `Type: ${ctx.contextType}, ID: ${ctx.id}, Prompt: ${ctx.prompt}`).join('\n') || 'None';
  const contextString =  'None';
  let additionalContext = `
AdditionalContext:
<textBefore>
${textBefore || 'None'}
</textBefore>
<textAfter>
${textAfter || 'None'}
</textAfter>

<PlotContext>
  ${contextString}  
</PlotContext>
`;

  switch (feature) {
    case 'rephrase1':
      return {
        systemPrompt: `You are a master storyteller and a world-class literary editor. Your task is to elevate a piece of writing by rephrasing it. Only answer in JSON.
        Follow the user specific Instructions on tone enrichment and language sophistication.
        ${customInstructions || defaultInstruction}

        Analyze the user's text paragraph by paragraph, and sentence by sentence. Only use the text enclosed within <originalText> and </originalText> for rephrasing.
        Rephrase each input Paragraph at a time. Don't combine multiple paragraphs into one rephrased paragraph.
        Utilize text within textBefore and textAfter tags as only reference.

        Your rephrasing should:
        1.  **Enrich the Language**: Use more evocative vocabulary and sophisticated sentence structures.
        2.  **Enhance the Prose**: Improve the rhythm, flow, and clarity of the writing.
        3.  **Preserve the Core**: Maintain the original plot, character intentions, and key details. Do not add new plot points or characters.
        4.  **Paragraph Structure**: Each paragraph in the rephrased text should correspond to a single paragraph in the original text, preserving the original structure.
        5.  **Maintain Original Meaning**: Ensure that the rephrased text conveys the same meaning and intent as the original.
        6.  **Use of Context**: If provided, use the context from <textBefore> and <textAfter> to inform your rephrasing.
        7.  **Do not return the same line**: Always enrich and elevate every paragraph.
        ${additionalContext || ''}

`,
        userPrompt: `<originalText>${joinedText}</originalText>`,
        type: 'json',
      };
    case 'rephrase':
      return {
        systemPrompt: `You are a master storyteller and a world-class literary editor. Your task is to elevate a piece of writing by rephrasing it. Only answer in JSON.
        Whenever you're given text, rephrase it using the following instructions: 
        <instructions>${customInstructions || defaultInstruction}</instructions>

        Analyze the user's text paragraph by paragraph, and sentence by sentence. Only use the text enclosed within <originalText> and </originalText> for rephrasing.
        Rephrase each input Paragraph at a time. Don't combine multiple paragraphs into one rephrased paragraph.
        Utilize text within textBefore and textAfter tags as only reference.

        Your rephrasing should:
        1.  **Enrich the Language**: Use more evocative vocabulary and sophisticated sentence structures.
        2.  **Enhance the Prose**: Improve the rhythm, flow, and clarity of the writing.
        3.  **Preserve the Core**: Maintain the original plot, character intentions, and key details. Do not add new plot points or characters.
        4.  **Paragraph Structure**: Each paragraph in the rephrased text should correspond to a single paragraph in the original text, preserving the original structure.
        5.  **Maintain Original Meaning**: Ensure that the rephrased text conveys the same meaning and intent as the original.
        6.  **Use of Context**: If provided, use the context from <textBefore> and <textAfter> to inform your rephrasing.
        7.  **Do not return the same line**: Always enrich and elevate every paragraph.
        ${additionalContext || ''}

`,
        userPrompt: `<originalText>${joinedText}</originalText>`,
        type: 'json',
      };
    case 'expand':
      return {
        systemPrompt: `You are a creative writer. Expand the input with vivid details. ${customInstructions || defaultInstruction}`,
        userPrompt: joinedText,
        type: 'text',
      };
    case 'shorten':
      return {
        systemPrompt: `You are a concise editor. Shorten the text while retaining the key message. ${customInstructions || defaultInstruction} Only return the shortened text, do not return any other text or explanaitons.`,
        userPrompt: joinedText,
        type: 'text',
      };
    case 'summarize':
      return {
        systemPrompt: `Summarize the following text with clarity and brevity. ${customInstructions || defaultInstruction}`,
        userPrompt: joinedText,
        type: 'text',
      };
    default:
      throw new Error(`Unsupported feature: ${feature}`);
  }
}
