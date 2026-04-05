const mockUpload = jest.fn();
const mockDownload = jest.fn();
const mockBatchCreate = jest.fn();
const mockBatchGet = jest.fn();
const mockBatchCancel = jest.fn();

jest.mock('@google/genai', () => ({
    GoogleGenAI: jest.fn().mockImplementation(() => ({
        files: {
            upload: mockUpload,
            download: mockDownload,
        },
        batches: {
            create: mockBatchCreate,
            get: mockBatchGet,
            cancel: mockBatchCancel,
        },
    })),
}));

jest.mock('fs/promises', () => ({
    __esModule: true,
    default: {
        readFile: jest.fn(),
        unlink: jest.fn(),
    },
}));

import fs from 'fs/promises';
import { GeminiBatchProvider } from '@/lib/providers/gemini-batch';

const fsMock = fs as unknown as {
    readFile: jest.Mock;
    unlink: jest.Mock;
};

describe('GeminiBatchProvider', () => {
    beforeAll(() => {
        if (typeof File === 'undefined') {
            class MockFile extends Blob {
                readonly name: string;

                constructor(parts: BlobPart[], name: string, options?: FilePropertyBag) {
                    super(parts, options);
                    this.name = name;
                }
            }

            Object.assign(globalThis, { File: MockFile });
        }
    });

    beforeEach(() => {
        jest.clearAllMocks();
        fsMock.unlink.mockResolvedValue(undefined);
    });

    it('submits Gemini batch jobs through uploaded JSONL files', async () => {
        mockUpload.mockResolvedValue({ name: 'files/input-1' });
        mockBatchCreate.mockResolvedValue({
            name: 'batches/123',
            state: 'JOB_STATE_PENDING',
            model: 'models/gemini-2.5-flash',
            dest: { fileName: 'files/output-1' },
        });

        const provider = new GeminiBatchProvider('test-key');
        const result = await provider.submitBatch({
            model: 'models/gemini-2.5-flash',
            displayName: 'batch-one',
            content: '{"key":"SKU-1"}',
        });

        expect(mockUpload).toHaveBeenCalledWith(
            expect.objectContaining({
                config: {
                    mimeType: 'application/jsonl',
                    displayName: 'batch-one',
                },
            })
        );
        expect(mockBatchCreate).toHaveBeenCalledWith({
            model: 'models/gemini-2.5-flash',
            src: 'files/input-1',
            config: {
                displayName: 'batch-one',
            },
        });
        expect(result).toEqual(
            expect.objectContaining({
                id: 'batches/123',
                status: 'validating',
                inputFileId: 'files/input-1',
                outputFileId: 'files/output-1',
                model: 'models/gemini-2.5-flash',
            })
        );
    });

    it('maps Gemini batch status into the shared status contract', async () => {
        mockBatchGet.mockResolvedValue({
            name: 'batches/123',
            state: 'JOB_STATE_RUNNING',
            model: 'models/gemini-2.5-flash',
            src: 'files/input-1',
            dest: { fileName: 'files/output-1' },
        });

        const provider = new GeminiBatchProvider('test-key');
        const status = await provider.getBatchStatus('batches/123');

        expect(status).toEqual(
            expect.objectContaining({
                id: 'batches/123',
                status: 'in_progress',
                inputFileId: 'files/input-1',
                outputFileId: 'files/output-1',
                model: 'models/gemini-2.5-flash',
            })
        );
    });

    it('downloads and parses JSONL batch results', async () => {
        mockBatchGet.mockResolvedValue({
            name: 'batches/123',
            state: 'JOB_STATE_SUCCEEDED',
            dest: { fileName: 'files/output-1' },
        });
        fsMock.readFile.mockResolvedValue(
            [
                JSON.stringify({
                    key: 'SKU-1',
                    response: {
                        candidates: [
                            {
                                content: {
                                    parts: [{ text: '{"name":"Ball"}' }],
                                },
                            },
                        ],
                        usageMetadata: {
                            promptTokenCount: 3,
                            candidatesTokenCount: 5,
                            totalTokenCount: 8,
                        },
                    },
                }),
                JSON.stringify({
                    key: 'SKU-2',
                    error: { message: 'provider failed' },
                }),
            ].join('\n')
        );

        const provider = new GeminiBatchProvider('test-key');
        const results = await provider.retrieveResults('batches/123');

        expect(mockDownload).toHaveBeenCalledWith(
            expect.objectContaining({
                file: 'files/output-1',
                downloadPath: expect.any(String),
            })
        );
        expect(results).toEqual([
            expect.objectContaining({
                key: 'SKU-1',
                text: '{"name":"Ball"}',
                usage: {
                    promptTokens: 3,
                    completionTokens: 5,
                    totalTokens: 8,
                },
            }),
            expect.objectContaining({
                key: 'SKU-2',
                error: 'provider failed',
            }),
        ]);
        expect(fsMock.unlink).toHaveBeenCalledWith(expect.any(String));
    });

    it('cancels Gemini batch jobs', async () => {
        const provider = new GeminiBatchProvider('test-key');
        await provider.cancelBatch('batches/123');

        expect(mockBatchCancel).toHaveBeenCalledWith({ name: 'batches/123' });
    });
});
