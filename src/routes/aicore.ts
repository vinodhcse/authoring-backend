import fetch from 'node-fetch';

const OLLAMA_API_URL = "http://localhost:11434/api/generate";
const OLLAMA_MODEL = "qwen3:8b";

export async function callOllama(
  systemPrompt: string,
  userPrompt: string,
  format: 'json' | 'text' = 'text'
): Promise<any> {
  const payload: { [key: string]: any } = {
    model: OLLAMA_MODEL,
    system: systemPrompt,
    prompt: userPrompt,
    stream: false,
  };

  if (format === 'json') {
    payload.format = 'json';
  }

  const response = await fetch(OLLAMA_API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    console.error("Ollama API Error Response:", errorBody);
    throw new Error(`Ollama API returned an error: ${response.statusText}. Is the server running?`);
  }

  return response.json();
}
