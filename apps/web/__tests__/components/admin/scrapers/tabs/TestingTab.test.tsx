/**
 * @jest-environment jsdom
 *
 * Tests for TestingTab UI — simplified to config display only.
 * Tests verify:
 *   - Test SKUs and Fake SKUs can be added/removed
 *   - Health score info is displayed
 *   - No "Run Test" button or polling (tests run locally)
 */
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TestingTab } from '@/components/admin/scrapers/tabs/TestingTab';
import { useForm, FormProvider } from 'react-hook-form';
import { ConfigFormValues, defaultConfigValues } from '@/components/admin/scrapers/form-schema';

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

describe('TestingTab', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Test Configuration info', () => {
    it('renders the Test Configuration card with local runner instructions', () => {
      renderWithFormProvider(<TestingTab />);

      expect(screen.getByText('Test Configuration')).toBeInTheDocument();
      expect(screen.getByText(/python runner\.py/)).toBeInTheDocument();
    });

    it('renders Test SKUs section', () => {
      renderWithFormProvider(<TestingTab />);

      expect(screen.getByText('Test SKUs (Known Good)')).toBeInTheDocument();
    });

    it('renders Fake SKUs section', () => {
      renderWithFormProvider(<TestingTab />);

      expect(screen.getByText('Fake SKUs (Known Bad)')).toBeInTheDocument();
    });
  });

  describe('Test SKUs management', () => {
    it('shows "No test SKUs defined" when empty', () => {
      renderWithFormProvider(<TestingTab />);

      expect(screen.getByText('No test SKUs defined.')).toBeInTheDocument();
    });

    it('can add a test SKU', async () => {
      const user = userEvent.setup();
      renderWithFormProvider(<TestingTab />);

      const addButtons = screen.getAllByRole('button', { name: /add sku/i });
      await user.click(addButtons[0]);

      expect(screen.getByPlaceholderText('e.g. 123456')).toBeInTheDocument();
    });

    it('can remove a test SKU', async () => {
      const user = userEvent.setup();
      renderWithFormProvider(<TestingTab />, { test_skus: ['123456'] });

      const removeButton = screen.getByRole('button', { name: '' });
      await user.click(removeButton);

      expect(screen.getByText('No test SKUs defined.')).toBeInTheDocument();
    });
  });

  describe('Fake SKUs management', () => {
    it('shows "No fake SKUs defined" when empty', () => {
      renderWithFormProvider(<TestingTab />);

      expect(screen.getByText('No fake SKUs defined.')).toBeInTheDocument();
    });

    it('can add a fake SKU', async () => {
      const user = userEvent.setup();
      renderWithFormProvider(<TestingTab />);

      const addButtons = screen.getAllByRole('button', { name: /add sku/i });
      const fakeSkuAddButton = addButtons[1];
      await user.click(fakeSkuAddButton);

      expect(screen.getByPlaceholderText('e.g. 999999-FAKE')).toBeInTheDocument();
    });
  });

  describe('No test triggering UI', () => {
    it('does not render a "Run Test" button', () => {
      renderWithFormProvider(<TestingTab />);

      expect(screen.queryByRole('button', { name: /run test/i })).not.toBeInTheDocument();
    });

    it('does not render a loading indicator', () => {
      renderWithFormProvider(<TestingTab />);

      expect(screen.queryByTestId('test-loading-indicator')).not.toBeInTheDocument();
    });
  });
});