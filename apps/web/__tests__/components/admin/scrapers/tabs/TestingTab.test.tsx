/**
 * @jest-environment jsdom
 *
 * RED tests for TestingTab UI — Task 10 of Scraper QA Integration plan.
 * These tests define the contract for features that don't exist yet:
 *   - "Run Test" button that POSTs to /api/admin/scrapers/test
 *   - Loading state while test is running
 *   - Pass/fail results display after completion
 *   - Expected vs actual diff view for failed assertions
 *
 * All tests should FAIL until Tasks 11-12 implement the UI.
 */
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TestingTab } from '@/components/admin/scrapers/tabs/TestingTab';
import { useForm, FormProvider } from 'react-hook-form';
import { ConfigFormValues, defaultConfigValues } from '@/components/admin/scrapers/form-schema';

const mockFetch = jest.fn();
global.fetch = mockFetch;

jest.mock('lucide-react', () => {
  const React = require('react');
  const icons: Record<string, React.FC<{ className?: string }>> = {};
  const handler: ProxyHandler<typeof icons> = {
    get: (_target, prop) => {
      if (typeof prop === 'string') {
        return (props: { className?: string }) =>
          React.createElement('svg', { 'data-testid': `icon-${prop}`, className: props?.className });
      }
      return undefined;
    },
  };
  return new Proxy(icons, handler);
});

/** Wrap TestingTab in a FormProvider so useFormContext works. */
function renderWithFormProvider(
  ui: React.ReactElement,
  overrides?: Partial<ConfigFormValues>,
) {
  function Wrapper({ children }: { children: React.ReactNode }) {
    const methods = useForm<ConfigFormValues>({
      defaultValues: { ...defaultConfigValues, ...overrides },
    });
    return <FormProvider {...methods}>{children}</FormProvider>;
  }

  return render(ui, { wrapper: Wrapper });
}

/** Mock response: POST /api/admin/scrapers/test returns job_id and running status. */
function mockTestRunCreated(jobId = 'job_abc123') {
  return {
    ok: true,
    status: 200,
    json: async () => ({ job_id: jobId, status: 'running' }),
  };
}

/** Mock response: GET poll returns completed results with all assertions passing. */
function mockTestResultsAllPass() {
  return {
    ok: true,
    status: 200,
    json: async () => ({
      job_id: 'job_abc123',
      status: 'completed',
      results: [
        {
          sku: '123456',
          passed: true,
          assertions: [
            { field: 'name', expected: 'Widget A', actual: 'Widget A', passed: true },
            { field: 'price', expected: '$9.99', actual: '$9.99', passed: true },
          ],
        },
      ],
      summary: { total: 1, passed: 1, failed: 0 },
    }),
  };
}

/** Mock response: GET poll returns completed results with some assertion failures. */
function mockTestResultsWithFailures() {
  return {
    ok: true,
    status: 200,
    json: async () => ({
      job_id: 'job_abc123',
      status: 'completed',
      results: [
        {
          sku: '123456',
          passed: true,
          assertions: [
            { field: 'name', expected: 'Widget A', actual: 'Widget A', passed: true },
            { field: 'price', expected: '$9.99', actual: '$12.99', passed: false },
          ],
        },
        {
          sku: '999999-FAKE',
          passed: false,
          assertions: [
            { field: 'name', expected: null, actual: 'Some Product', passed: false },
          ],
        },
      ],
      summary: { total: 2, passed: 1, failed: 1 },
    }),
  };
}

describe('TestingTab', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockFetch.mockReset();
  });

  describe('Run Test button', () => {
    it('renders a "Run Test" button', () => {
      renderWithFormProvider(<TestingTab />);

      expect(screen.getByRole('button', { name: /run test/i })).toBeInTheDocument();
    });

    it('disables the button while a test is running', async () => {
      mockFetch.mockImplementation(() => new Promise(() => {}));

      renderWithFormProvider(<TestingTab />);

      const runButton = screen.getByRole('button', { name: /run test/i });
      await userEvent.setup().click(runButton);

      await waitFor(() => {
        expect(runButton).toBeDisabled();
      });
    });
  });

  describe('POST /api/admin/scrapers/test', () => {
    it('sends POST request with scraper config when "Run Test" is clicked', async () => {
      const user = userEvent.setup();
      mockFetch.mockResolvedValueOnce(mockTestRunCreated());

      renderWithFormProvider(<TestingTab />, {
        test_skus: ['123456'],
        fake_skus: ['999999-FAKE'],
      });

      const runButton = screen.getByRole('button', { name: /run test/i });
      await user.click(runButton);

      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalledTimes(1);
      });

      const [url, options] = mockFetch.mock.calls[0];
      expect(url).toBe('/api/admin/scrapers/test');
      expect(options.method).toBe('POST');
      expect(options.headers['Content-Type']).toBe('application/json');

      const body = JSON.parse(options.body);
      expect(body).toHaveProperty('test_skus');
      expect(body).toHaveProperty('fake_skus');
    });

    it('includes scraper slug in the POST body', async () => {
      const user = userEvent.setup();
      mockFetch.mockResolvedValueOnce(mockTestRunCreated());

      renderWithFormProvider(<TestingTab />, {
        name: 'acme-pet-supply',
        test_skus: ['123456'],
      });

      const runButton = screen.getByRole('button', { name: /run test/i });
      await user.click(runButton);

      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalledTimes(1);
      });

      const [, options] = mockFetch.mock.calls[0];
      const body = JSON.parse(options.body);
      expect(body.name).toBe('acme-pet-supply');
    });
  });

  describe('Loading state', () => {
    it('shows a loading indicator while test is running', async () => {
      const user = userEvent.setup();
      mockFetch.mockResolvedValueOnce(mockTestRunCreated());
      mockFetch.mockImplementationOnce(() => new Promise(() => {}));

      renderWithFormProvider(<TestingTab />);

      const runButton = screen.getByRole('button', { name: /run test/i });
      await user.click(runButton);

      await waitFor(() => {
        expect(screen.getByTestId('test-loading-indicator')).toBeInTheDocument();
      });
    });

    it('shows "Running test..." text while test is in progress', async () => {
      const user = userEvent.setup();
      mockFetch.mockResolvedValueOnce(mockTestRunCreated());
      mockFetch.mockImplementationOnce(() => new Promise(() => {}));

      renderWithFormProvider(<TestingTab />);

      const runButton = screen.getByRole('button', { name: /run test/i });
      await user.click(runButton);

      await waitFor(() => {
        expect(screen.getByText(/running test/i)).toBeInTheDocument();
      });
    });
  });

  describe('Results display', () => {
    it('shows pass badge for a successful test result', async () => {
      const user = userEvent.setup();
      mockFetch.mockResolvedValueOnce(mockTestRunCreated());
      mockFetch.mockResolvedValueOnce(mockTestResultsAllPass());

      renderWithFormProvider(<TestingTab />);

      const runButton = screen.getByRole('button', { name: /run test/i });
      await user.click(runButton);

      await waitFor(() => {
        expect(screen.getByText(/passed/i)).toBeInTheDocument();
      });
    });

    it('shows fail badge for a failed test result', async () => {
      const user = userEvent.setup();
      mockFetch.mockResolvedValueOnce(mockTestRunCreated());
      mockFetch.mockResolvedValueOnce(mockTestResultsWithFailures());

      renderWithFormProvider(<TestingTab />);

      const runButton = screen.getByRole('button', { name: /run test/i });
      await user.click(runButton);

      await waitFor(() => {
        expect(screen.getByText(/failed/i)).toBeInTheDocument();
      });
    });

    it('displays summary counts (total, passed, failed)', async () => {
      const user = userEvent.setup();
      mockFetch.mockResolvedValueOnce(mockTestRunCreated());
      mockFetch.mockResolvedValueOnce(mockTestResultsWithFailures());

      renderWithFormProvider(<TestingTab />);

      const runButton = screen.getByRole('button', { name: /run test/i });
      await user.click(runButton);

      await waitFor(() => {
        expect(screen.getByText(/2 total/i)).toBeInTheDocument();
        expect(screen.getByText(/1 passed/i)).toBeInTheDocument();
        expect(screen.getByText(/1 failed/i)).toBeInTheDocument();
      });
    });

    it('shows SKU in each result row', async () => {
      const user = userEvent.setup();
      mockFetch.mockResolvedValueOnce(mockTestRunCreated());
      mockFetch.mockResolvedValueOnce(mockTestResultsWithFailures());

      renderWithFormProvider(<TestingTab />);

      const runButton = screen.getByRole('button', { name: /run test/i });
      await user.click(runButton);

      await waitFor(() => {
        expect(screen.getByText('123456')).toBeInTheDocument();
        expect(screen.getByText('999999-FAKE')).toBeInTheDocument();
      });
    });
  });

  describe('Diff view for failed assertions', () => {
    it('shows expected vs actual values for failed field assertions', async () => {
      const user = userEvent.setup();
      mockFetch.mockResolvedValueOnce(mockTestRunCreated());
      mockFetch.mockResolvedValueOnce(mockTestResultsWithFailures());

      renderWithFormProvider(<TestingTab />);

      const runButton = screen.getByRole('button', { name: /run test/i });
      await user.click(runButton);

      await waitFor(() => {
        expect(screen.getByText('$9.99')).toBeInTheDocument();
        expect(screen.getByText('$12.99')).toBeInTheDocument();
      });
    });

    it('labels expected and actual values clearly', async () => {
      const user = userEvent.setup();
      mockFetch.mockResolvedValueOnce(mockTestRunCreated());
      mockFetch.mockResolvedValueOnce(mockTestResultsWithFailures());

      renderWithFormProvider(<TestingTab />);

      const runButton = screen.getByRole('button', { name: /run test/i });
      await user.click(runButton);

      await waitFor(() => {
        expect(screen.getByText(/expected/i)).toBeInTheDocument();
        expect(screen.getByText(/actual/i)).toBeInTheDocument();
      });
    });

    it('shows field name for each assertion in the diff', async () => {
      const user = userEvent.setup();
      mockFetch.mockResolvedValueOnce(mockTestRunCreated());
      mockFetch.mockResolvedValueOnce(mockTestResultsWithFailures());

      renderWithFormProvider(<TestingTab />);

      const runButton = screen.getByRole('button', { name: /run test/i });
      await user.click(runButton);

      await waitFor(() => {
        expect(screen.getByText('price')).toBeInTheDocument();
      });
    });

    it('shows "(empty)" or similar for null expected values in fake SKU assertions', async () => {
      const user = userEvent.setup();
      mockFetch.mockResolvedValueOnce(mockTestRunCreated());
      mockFetch.mockResolvedValueOnce(mockTestResultsWithFailures());

      renderWithFormProvider(<TestingTab />);

      const runButton = screen.getByRole('button', { name: /run test/i });
      await user.click(runButton);

      await waitFor(() => {
        expect(screen.getByText(/\(empty\)|\(null\)|—/i)).toBeInTheDocument();
      });
    });
  });

  describe('Error handling', () => {
    it('shows error message when test run fails to start', async () => {
      const user = userEvent.setup();
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        json: async () => ({ error: 'Internal server error' }),
      });

      renderWithFormProvider(<TestingTab />);

      const runButton = screen.getByRole('button', { name: /run test/i });
      await user.click(runButton);

      await waitFor(() => {
        expect(screen.getByText(/error/i)).toBeInTheDocument();
      });
    });

    it('re-enables the "Run Test" button after an error', async () => {
      const user = userEvent.setup();
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        json: async () => ({ error: 'Internal server error' }),
      });

      renderWithFormProvider(<TestingTab />);

      const runButton = screen.getByRole('button', { name: /run test/i });
      await user.click(runButton);

      await waitFor(() => {
        expect(runButton).not.toBeDisabled();
      });
    });
  });
});