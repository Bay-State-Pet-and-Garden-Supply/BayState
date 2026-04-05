const mockGenerateContent = jest.fn();
const mockGenerateContentStream = jest.fn();

jest.mock('@google/genai', () => ({
    GoogleGenAI: jest.fn().mockImplementation(() => ({
        models: {
            generateContent: mockGenerateContent,
            generateContentStream: mockGenerateContentStream,
        },
    })),
}));

import {
    buildGeminiBatchRequest,
    extractGeminiResponseText,
    GeminiClientAdapter,
} from '@/lib/providers/gemini-client';

describe('GeminiClientAdapter', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('builds Gemini batch requests using the batch wire format', () => {
        const request = buildGeminiBatchRequest({
            key: 'SKU-1',
            prompt: 'Prompt body',
            systemInstruction: 'System message',
            responseJsonSchema: { type: 'object' },
            temperature: 0.1,
            maxOutputTokens: 256,
            metadata: { sku: 'SKU-1' },
        }) as {
            key: string;
            request: Record<string, unknown>;
        };

        expect(request.key).toBe('SKU-1');
        expect(request.request).toEqual(
            expect.objectContaining({
                contents: [
                    {
                        role: 'user',
                        parts: [{ text: 'Prompt body' }],
                    },
                ],
                generation_config: expect.objectContaining({
                    temperature: 0.1,
                    max_output_tokens: 256,
                    response_mime_type: 'application/json',
                    response_json_schema: { type: 'object' },
                }),
                system_instruction: {
                    parts: [{ text: 'System message' }],
                },
                metadata: { sku: 'SKU-1' },
            })
        );
    });

    it('extracts response text from candidate parts when top-level text is absent', () => {
        expect(
            extractGeminiResponseText({
                candidates: [
                    {
                        content: {
                            parts: [{ text: '{"name":' }, { text: '"Ball"}' }],
                        },
                    },
                ],
            })
        ).toBe('{"name":"Ball"}');
    });

    it('generates structured output and returns usage metadata', async () => {
        mockGenerateContent.mockResolvedValue({
            text: '{"name":"Ball"}',
            usageMetadata: {
                promptTokenCount: 12,
                candidatesTokenCount: 5,
                totalTokenCount: 17,
            },
        });

        const client = new GeminiClientAdapter('test-key');
        const result = await client.generate({
            model: 'gemini-2.5-flash',
            prompt: 'Prompt body',
            systemInstruction: 'System message',
            responseJsonSchema: { type: 'object' },
            temperature: 0.2,
            maxOutputTokens: 512,
        });

        expect(mockGenerateContent).toHaveBeenCalledWith({
            model: 'gemini-2.5-flash',
            contents: 'Prompt body',
            config: {
                systemInstruction: 'System message',
                responseMimeType: 'application/json',
                responseJsonSchema: { type: 'object' },
                temperature: 0.2,
                maxOutputTokens: 512,
            },
        });
        expect(result).toEqual(
            expect.objectContaining({
                text: '{"name":"Ball"}',
                usage: {
                    promptTokens: 12,
                    completionTokens: 5,
                    totalTokens: 17,
                },
            })
        );
    });

    it('streams text chunks from the Gemini SDK stream', async () => {
        async function* makeStream() {
            yield { text: '{"name":' };
            yield { text: '"Ball"}' };
            yield {};
        }

        mockGenerateContentStream.mockResolvedValue(makeStream());

        const client = new GeminiClientAdapter('test-key');
        const stream = await client.stream({
            model: 'gemini-2.5-flash',
            prompt: 'Prompt body',
        });

        const chunks: string[] = [];
        for await (const chunk of stream) {
            chunks.push(chunk);
        }

        expect(chunks).toEqual(['{"name":', '"Ball"}']);
    });

    it('serializes prepared batch requests as JSONL', () => {
        const client = new GeminiClientAdapter('test-key');
        const jsonl = client.prepareBatchRequests([
            {
                key: 'SKU-1',
                prompt: 'Prompt one',
            },
            {
                key: 'SKU-2',
                prompt: 'Prompt two',
            },
        ]);

        const lines = jsonl.split('\n').map((line) => JSON.parse(line) as { key: string });
        expect(lines.map((line) => line.key)).toEqual(['SKU-1', 'SKU-2']);
    });
});
