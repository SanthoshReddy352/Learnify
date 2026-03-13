const GEMINI_MODELS = [
    'gemini-2.5-flash-lite',
    'gemini-2.0-flash-lite',
    'gemini-2.0-flash',
    'gemini-2.5-flash'
];

/**
 * Generates content using Google Gemini API with fallback support.
 * Adapts OpenAI-style messages to Gemini format.
 */
export async function generateWithGemini(messages, options = {}) {
    const {
        temperature = 0.7,
        maxOutputTokens = 8000,
        apiKey = null  // Allow custom API key
    } = options;

    const geminiApiKey = apiKey || process.env.GEMINI_API_KEY;
    if (!geminiApiKey) {
        throw new Error('GEMINI_API_KEY is not provided and not set in environment');
    }

    // Adapt Messages: Extract system prompt and user messages
    const systemMessage = messages.find(m => m.role === 'system');
    const userMessages = messages.filter(m => m.role === 'user' || m.role === 'assistant');

    let lastError = null;

    for (const model of GEMINI_MODELS) {
        try {
            console.log(`[AI] Attempting with model: ${model}`);
            
            const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${geminiApiKey}`;
            
            // Construct Payload
            const payload = {
                contents: userMessages.map(m => ({
                    role: m.role === 'user' ? 'user' : 'model',
                    parts: [{ text: m.content }]
                })),
                generationConfig: {
                    temperature,
                    maxOutputTokens
                }
            };

            // Add System Instruction if present
            if (systemMessage) {
                payload.systemInstruction = {
                    parts: [{ text: systemMessage.content }]
                };
            }

            const response = await fetch(url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(payload)
            });

            if (!response.ok) {
                const errorText = await response.text();
                console.warn(`[AI] Model ${model} failed with status ${response.status}: ${errorText.slice(0, 200)}...`);
                
                // If it's a 404, the model name might be invalid (e.g. experimental), try next
                // If 429 (Resource Exhausted), try next
                lastError = new Error(`Model ${model} failed: ${response.status} ${response.statusText}`);
                continue;
            }

            const data = await response.json();
            
            // Log the response for debugging
            console.log(`[AI] Response from ${model}:`, JSON.stringify(data).slice(0, 300));
            
            // Validate response structure more carefully
            if (!data.candidates || !Array.isArray(data.candidates) || data.candidates.length === 0) {
                 console.warn(`[AI] Model ${model} returned no candidates. Response:`, JSON.stringify(data).slice(0, 500));
                 lastError = new Error(`Model ${model} returned no candidates`);
                 continue;
            }

            const candidate = data.candidates[0];
            
            if (!candidate.content || !candidate.content.parts || !Array.isArray(candidate.content.parts) || candidate.content.parts.length === 0) {
                console.warn(`[AI] Model ${model} candidate has invalid content structure. Candidate:`, JSON.stringify(candidate).slice(0, 500));
                lastError = new Error(`Model ${model} returned invalid content structure`);
                continue;
            }

            const content = candidate.content.parts[0].text;
            
            if (!content) {
                console.warn(`[AI] Model ${model} returned empty text content`);
                lastError = new Error(`Model ${model} returned empty content`);
                continue;
            }
            
            console.log(`[AI] Success with model: ${model}`);
            
            // Return in a structure similar to what our app expects (OpenAI style wrapper for compatibility if needed, or just data)
            // But our app expects { choices: [{ message: { content: ... } }] } based on previous code.
            // Let's return that structure to minimize refactoring in route.js
            return {
                choices: [
                    {
                        message: {
                            content: content
                        }
                    }
                ]
            };

        } catch (error) {
            console.error(`[AI] Unexpected error with model ${model}:`, error);
            lastError = error;
        }
    }

    throw lastError || new Error('All Gemini models failed to generate content.');
}

/**
 * Generates an image using Stability AI's Stable Diffusion XL via Hugging Face Inference API.
 * Uses the HUGGINGFACE_API_KEY from environment.
 */
export async function generateImageWithStableDiffusion(prompt, options = {}) {
    // Prioritize passed apiKey, then environment variable
    const apiKeysString = options.apiKey || process.env.HUGGINGFACE_API_KEY;
    if (!apiKeysString) {
        throw new Error('HUGGINGFACE_API_KEY is not set in environment and no key provided');
    }

    const apiKeys = apiKeysString.split(',').map(key => key.trim()).filter(key => key.length > 0);
    
    if (apiKeys.length === 0) {
         throw new Error('No valid Hugging Face API keys found');
    }

    const modelId = "stabilityai/stable-diffusion-xl-base-1.0";
    let lastError = null;

    console.log(`[AI-Image] Generating with ${modelId} for: "${prompt.slice(0, 50)}..."`);

    // Try each key sequentially
    for (const apiKey of apiKeys) {
        try {
            const response = await fetch(
                `https://router.huggingface.co/hf-inference/models/${modelId}`,
                {
                    headers: {
                        Authorization: `Bearer ${apiKey}`,
                        "Content-Type": "application/json",
                    },
                    method: "POST",
                    body: JSON.stringify({ inputs: prompt }),
                }
            );

            if (!response.ok) {
                 const text = await response.text();
                 throw new Error(`Status ${response.status}: ${text}`);
            }

            // Hugging Face returns the raw image blob
            const arrayBuffer = await response.arrayBuffer();
            const buffer = Buffer.from(arrayBuffer);
            const base64 = buffer.toString('base64');
            
            console.log(`[AI-Image] Success with ${modelId} using key ending in ...${apiKey.slice(-4)}`);
            return base64;

        } catch (error) {
            console.warn(`[AI-Image] Failed with key ...${apiKey.slice(-4)}: ${error.message}`);
            lastError = error;
            // Continue to next key
        }
    }

    // If we get here, all keys failed
    console.error(`[AI-Image] All keys failed for ${modelId}`);
    throw lastError || new Error('All Hugging Face API keys failed');
}
