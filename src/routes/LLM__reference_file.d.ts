export declare const OLLAMA_API_URL: string;
export declare const OLLAMA_MODEL: string;
export interface MappingResult {
  suggested_paragraph: string;
  original_indices: number[];
}
export declare function callOllama(
  systemPrompt: string,
  userPrompt: string,
  format: 'json' | 'text'
): Promise<any>;
