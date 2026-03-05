/**
 * @jest-environment node
 */
import { Server as HTTPServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';
import { io as ioClient, Socket as ClientSocket } from 'socket.io-client';
import { validateRunnerAuth } from '@/lib/scraper-auth';

jest.mock('@/lib/scraper-auth', () => ({
    validateRunnerAuth: jest.fn(),
}));

describe('WebSocket /api/admin/scraper-network/test/ws', () => {
    let httpServer: HTTPServer;
    let ioServer: SocketIOServer;
    let serverSocket: any;
    let clientSocket: ClientSocket;
    const TEST_PORT = 3001;

    beforeEach((done) => {
        // Create HTTP server for testing
        httpServer = new HTTPServer();
        ioServer = new SocketIOServer(httpServer, {
            cors: {
                origin: '*',
                methods: ['GET', 'POST'],
            },
        });

        // Setup authentication middleware
        ioServer.use(async (socket, next) => {
            const token = socket.handshake.auth.token;
            const apiKey = socket.handshake.auth.apiKey;

            const authResult = await validateRunnerAuth({ apiKey });

            if (!authResult) {
                return next(new Error('Authentication failed'));
            }

            (socket as any).runnerName = authResult.runnerName;
            (socket as any).authMethod = authResult.authMethod;
            next();
        });

        // Setup connection handler
        ioServer.on('connection', (socket) => {
            serverSocket = socket;

            // Join room for specific test runs
            socket.on('subscribe:test', (testRunId: string) => {
                socket.join(`test:${testRunId}`);
                socket.emit('subscribed', { room: `test:${testRunId}` });
            });

            // Leave room
            socket.on('unsubscribe:test', (testRunId: string) => {
                socket.leave(`test:${testRunId}`);
                socket.emit('unsubscribed', { room: `test:${testRunId}` });
            });

            // Join room for job monitoring
            socket.on('subscribe:job', (jobId: string) => {
                socket.join(`job:${jobId}`);
                socket.emit('subscribed', { room: `job:${jobId}` });
            });

            // Broadcast events to rooms
            socket.on('test:progress', (data: { testRunId: string; progress: number }) => {
                ioServer.to(`test:${data.testRunId}`).emit('progress', data);
            });

            socket.on('test:result', (data: { testRunId: string; result: any }) => {
                ioServer.to(`test:${data.testRunId}`).emit('result', data);
            });

            socket.on('job:status', (data: { jobId: string; status: string }) => {
                ioServer.to(`job:${data.jobId}`).emit('status', data);
            });
        });

        httpServer.listen(TEST_PORT, () => {
            done();
        });
    });

    afterEach(() => {
        if (clientSocket?.connected) {
            clientSocket.disconnect();
        }
        ioServer.close();
        httpServer.close();
        jest.clearAllMocks();
    });

    it('should reject connection without valid authentication', (done) => {
        (validateRunnerAuth as jest.Mock).mockResolvedValue(null);

        clientSocket = ioClient(`http://localhost:${TEST_PORT}`, {
            auth: { apiKey: 'invalid-key' },
        });

        clientSocket.on('connect_error', (error) => {
            expect(error.message).toBe('Authentication failed');
            done();
        });

        clientSocket.on('connect', () => {
            done(new Error('Should not connect with invalid auth'));
        });
    });

    it('should accept connection with valid API key', (done) => {
        (validateRunnerAuth as jest.Mock).mockResolvedValue({
            runnerName: 'test-runner',
            keyId: 'key-123',
            authMethod: 'api_key',
        });

        clientSocket = ioClient(`http://localhost:${TEST_PORT}`, {
            auth: { apiKey: 'bsr_valid-key' },
        });

        clientSocket.on('connect', () => {
            expect(clientSocket.connected).toBe(true);
            done();
        });

        clientSocket.on('connect_error', (error) => {
            done(error);
        });
    });

    it('should allow client to subscribe to test room', (done) => {
        (validateRunnerAuth as jest.Mock).mockResolvedValue({
            runnerName: 'test-runner',
            keyId: 'key-123',
            authMethod: 'api_key',
        });

        clientSocket = ioClient(`http://localhost:${TEST_PORT}`, {
            auth: { apiKey: 'bsr_valid-key' },
        });

        clientSocket.on('connect', () => {
            clientSocket.emit('subscribe:test', 'test-run-123');
        });

        clientSocket.on('subscribed', (data) => {
            expect(data.room).toBe('test:test-run-123');
            done();
        });

        clientSocket.on('connect_error', (error) => {
            done(error);
        });
    });

    it('should allow client to unsubscribe from test room', (done) => {
        (validateRunnerAuth as jest.Mock).mockResolvedValue({
            runnerName: 'test-runner',
            keyId: 'key-123',
            authMethod: 'api_key',
        });

        clientSocket = ioClient(`http://localhost:${TEST_PORT}`, {
            auth: { apiKey: 'bsr_valid-key' },
        });

        let subscribed = false;

        clientSocket.on('connect', () => {
            clientSocket.emit('subscribe:test', 'test-run-456');
        });

        clientSocket.on('subscribed', (data) => {
            if (!subscribed) {
                subscribed = true;
                expect(data.room).toBe('test:test-run-456');
                clientSocket.emit('unsubscribe:test', 'test-run-456');
            }
        });

        clientSocket.on('unsubscribed', (data) => {
            expect(data.room).toBe('test:test-run-456');
            done();
        });

        clientSocket.on('connect_error', (error) => {
            done(error);
        });
    });

    it('should forward progress events to subscribed clients', (done) => {
        (validateRunnerAuth as jest.Mock).mockResolvedValue({
            runnerName: 'test-runner',
            keyId: 'key-123',
            authMethod: 'api_key',
        });

        clientSocket = ioClient(`http://localhost:${TEST_PORT}`, {
            auth: { apiKey: 'bsr_valid-key' },
        });

        clientSocket.on('connect', () => {
            clientSocket.emit('subscribe:test', 'test-run-789');
        });

        clientSocket.on('subscribed', () => {
            // Simulate progress event from server
            clientSocket.emit('test:progress', {
                testRunId: 'test-run-789',
                progress: 50,
            });
        });

        clientSocket.on('progress', (data) => {
            expect(data.testRunId).toBe('test-run-789');
            expect(data.progress).toBe(50);
            done();
        });

        clientSocket.on('connect_error', (error) => {
            done(error);
        });
    });

    it('should allow subscription to job rooms', (done) => {
        (validateRunnerAuth as jest.Mock).mockResolvedValue({
            runnerName: 'test-runner',
            keyId: 'key-123',
            authMethod: 'api_key',
        });

        clientSocket = ioClient(`http://localhost:${TEST_PORT}`, {
            auth: { apiKey: 'bsr_valid-key' },
        });

        clientSocket.on('connect', () => {
            clientSocket.emit('subscribe:job', 'job-abc-123');
        });

        clientSocket.on('subscribed', (data) => {
            expect(data.room).toBe('job:job-abc-123');
            done();
        });

        clientSocket.on('connect_error', (error) => {
            done(error);
        });
    });

    it('should forward job status events to subscribed clients', (done) => {
        (validateRunnerAuth as jest.Mock).mockResolvedValue({
            runnerName: 'test-runner',
            keyId: 'key-123',
            authMethod: 'api_key',
        });

        clientSocket = ioClient(`http://localhost:${TEST_PORT}`, {
            auth: { apiKey: 'bsr_valid-key' },
        });

        clientSocket.on('connect', () => {
            clientSocket.emit('subscribe:job', 'job-xyz-456');
        });

        clientSocket.on('subscribed', () => {
            // Simulate job status event
            clientSocket.emit('job:status', {
                jobId: 'job-xyz-456',
                status: 'running',
            });
        });

        clientSocket.on('status', (data) => {
            expect(data.jobId).toBe('job-xyz-456');
            expect(data.status).toBe('running');
            done();
        });

        clientSocket.on('connect_error', (error) => {
            done(error);
        });
    });

    it('should forward test result events to subscribed clients', (done) => {
        (validateRunnerAuth as jest.Mock).mockResolvedValue({
            runnerName: 'test-runner',
            keyId: 'key-123',
            authMethod: 'api_key',
        });

        clientSocket = ioClient(`http://localhost:${TEST_PORT}`, {
            auth: { apiKey: 'bsr_valid-key' },
        });

        const testResult = {
            sku: 'TEST-SKU-001',
            success: true,
            price: 19.99,
            inStock: true,
        };

        clientSocket.on('connect', () => {
            clientSocket.emit('subscribe:test', 'test-run-result-1');
        });

        clientSocket.on('subscribed', () => {
            clientSocket.emit('test:result', {
                testRunId: 'test-run-result-1',
                result: testResult,
            });
        });

        clientSocket.on('result', (data) => {
            expect(data.testRunId).toBe('test-run-result-1');
            expect(data.result).toEqual(testResult);
            done();
        });

        clientSocket.on('connect_error', (error) => {
            done(error);
        });
    });

    it('should handle multiple simultaneous subscriptions', (done) => {
        (validateRunnerAuth as jest.Mock).mockResolvedValue({
            runnerName: 'test-runner',
            keyId: 'key-123',
            authMethod: 'api_key',
        });

        clientSocket = ioClient(`http://localhost:${TEST_PORT}`, {
            auth: { apiKey: 'bsr_valid-key' },
        });

        let testSubscribed = false;
        let jobSubscribed = false;

        clientSocket.on('connect', () => {
            clientSocket.emit('subscribe:test', 'test-multi-1');
            clientSocket.emit('subscribe:job', 'job-multi-1');
        });

        clientSocket.on('subscribed', (data) => {
            if (data.room === 'test:test-multi-1') {
                testSubscribed = true;
            }
            if (data.room === 'job:job-multi-1') {
                jobSubscribed = true;
            }

            if (testSubscribed && jobSubscribed) {
                expect(testSubscribed).toBe(true);
                expect(jobSubscribed).toBe(true);
                done();
            }
        });

        clientSocket.on('connect_error', (error) => {
            done(error);
        });
    });
});
