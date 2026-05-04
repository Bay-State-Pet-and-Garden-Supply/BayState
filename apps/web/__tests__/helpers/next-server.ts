import { TextDecoder, TextEncoder } from 'node:util';
import { ReadableStream } from 'node:stream/web';

Object.assign(global, {
    TextEncoder,
    TextDecoder,
});

if (typeof global.ReadableStream === 'undefined') {
    global.ReadableStream = ReadableStream;
}

type MockNextRequestInit = {
    body?: unknown;
};

type MockNextResponseInit = {
    status?: number;
    headers?: HeadersInit;
};

export class NextRequest {
    nextUrl: URL;
    bodyUsed = false;
    private readonly requestBody: unknown;

    constructor(url: string, init?: MockNextRequestInit) {
        this.nextUrl = new URL(url);
        this.requestBody = init?.body;
    }

    async json() {
        this.bodyUsed = true;

        if (typeof this.requestBody === 'string') {
            return JSON.parse(this.requestBody);
        }

        return this.requestBody ?? {};
    }
}

export class NextResponse {
    body: unknown;
    status: number;
    headers: Headers;

    constructor(body: unknown, init?: MockNextResponseInit) {
        this.body = body;
        this.status = init?.status ?? 200;
        this.headers = new Headers(init?.headers);
    }

    static json(body: unknown, init?: MockNextResponseInit) {
        return new this(body, {
            ...init,
            headers: {
                'Content-Type': 'application/json',
                ...(init?.headers ?? {}),
            },
        });
    }

    async json() {
        if (typeof this.body === 'string') {
            try {
                return JSON.parse(this.body);
            } catch {
                return this.body;
            }
        }

        return this.body;
    }
}
