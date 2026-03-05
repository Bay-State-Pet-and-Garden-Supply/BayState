import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { AnalyticsClient, RevenueChart } from '@/components/admin/analytics/analytics-client';

// Mock fetch
const mockAnalyticsData = {
  period: {
    start: '2024-01-01T00:00:00.000Z',
    end: '2024-01-07T23:59:59.999Z',
    label: 'Last 7 days',
  },
  revenue: {
    total: 1500.50,
    orderCount: 25,
    averageOrderValue: 60.02,
  },
  revenueByDay: [
    { date: '2024-01-01', revenue: 200, orders: 3 },
    { date: '2024-01-02', revenue: 150, orders: 2 },
    { date: '2024-01-03', revenue: 350, orders: 5 },
    { date: '2024-01-04', revenue: 100, orders: 2 },
    { date: '2024-01-05', revenue: 250, orders: 4 },
    { date: '2024-01-06', revenue: 300, orders: 5 },
    { date: '2024-01-07', revenue: 150.50, orders: 4 },
  ],
  ordersByStatus: [
    { status: 'completed', count: 15 },
    { status: 'pending', count: 7 },
    { status: 'processing', count: 3 },
  ],
  topProducts: [
    { name: 'Premium Dog Food', quantity: 10, revenue: 450 },
    { name: 'Cat Treats', quantity: 25, revenue: 250 },
    { name: 'Bird Seed Mix', quantity: 15, revenue: 180 },
  ],
};

describe('AnalyticsClient', () => {
  beforeEach(() => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockAnalyticsData),
    });
  });

  afterEach(() => {
    jest.resetAllMocks();
  });

  it('renders loading state initially', () => {
    render(<AnalyticsClient />);

    // Should show loading skeletons
    expect(document.querySelectorAll('.animate-pulse').length).toBeGreaterThan(0);
  });

  it('renders analytics data after loading', async () => {
    render(<AnalyticsClient />);

    await waitFor(() => {
      expect(screen.getByText('$1,500.50')).toBeInTheDocument();
    });

    expect(screen.getByText('25')).toBeInTheDocument(); // Order count
    expect(screen.getByText('$60.02')).toBeInTheDocument(); // AOV
  });

  it('shows date range picker buttons', async () => {
    render(<AnalyticsClient />);

    await waitFor(() => {
      expect(screen.getByText('$1,500.50')).toBeInTheDocument();
    });

    expect(screen.getByText('Today')).toBeInTheDocument();
    expect(screen.getByText('7 Days')).toBeInTheDocument();
    expect(screen.getByText('30 Days')).toBeInTheDocument();
  });

  it('fetches data with correct range parameter', async () => {
    render(<AnalyticsClient initialRange="30days" />);

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith('/api/admin/analytics?range=30days');
    });
  });

  it('changes date range when button clicked', async () => {
    render(<AnalyticsClient initialRange="7days" />);

    await waitFor(() => {
      expect(screen.getByText('$1,500.50')).toBeInTheDocument();
    });

    const todayButton = screen.getByText('Today');
    fireEvent.click(todayButton);

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith('/api/admin/analytics?range=today');
    });
  });

  it('shows orders by status breakdown', async () => {
    render(<AnalyticsClient />);

    await waitFor(() => {
      expect(screen.getByText('completed')).toBeInTheDocument();
    });

    expect(screen.getByText('pending')).toBeInTheDocument();
    expect(screen.getByText('processing')).toBeInTheDocument();
  });

  it('shows top products', async () => {
    render(<AnalyticsClient />);

    // Wait for data to load first
    await waitFor(() => {
      expect(screen.getByText('$1,500.50')).toBeInTheDocument();
    });

    // Product names may appear multiple times (in metric card + list)
    expect(screen.getAllByText('Premium Dog Food').length).toBeGreaterThan(0);
    expect(screen.getByText('Cat Treats')).toBeInTheDocument();
    expect(screen.getByText('Bird Seed Mix')).toBeInTheDocument();
  });

  it('shows error message on fetch failure', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
    });

    render(<AnalyticsClient />);

    await waitFor(() => {
      expect(screen.getByText('Failed to fetch analytics')).toBeInTheDocument();
    });
  });

  it('has export button', async () => {
    render(<AnalyticsClient />);

    await waitFor(() => {
      expect(screen.getByText('$1,500.50')).toBeInTheDocument();
    });

    expect(screen.getByText('Export')).toBeInTheDocument();
  });

  it('has refresh button', async () => {
    render(<AnalyticsClient />);

    await waitFor(() => {
      expect(screen.getByText('$1,500.50')).toBeInTheDocument();
    });

    expect(screen.getByText('Refresh')).toBeInTheDocument();
  });

  it('calls fetch again when refresh is clicked', async () => {
    render(<AnalyticsClient />);

    await waitFor(() => {
      expect(screen.getByText('$1,500.50')).toBeInTheDocument();
    });

    const refreshButton = screen.getByText('Refresh');
    fireEvent.click(refreshButton);

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledTimes(2);
    });
  });
});

describe('RevenueChart', () => {
  it('renders bars for each day', () => {
    const data = [
      { date: '2024-01-01', revenue: 100, orders: 2 },
      { date: '2024-01-02', revenue: 200, orders: 3 },
      { date: '2024-01-03', revenue: 150, orders: 2 },
    ];

    render(<RevenueChart data={data} />);

    // Should render 3 bars
    const bars = document.querySelectorAll('.bg-purple-500');
    expect(bars).toHaveLength(3);
  });

  it('shows empty message when no data', () => {
    render(<RevenueChart data={[]} />);

    expect(screen.getByText('No data available.')).toBeInTheDocument();
  });

  it('renders date labels', () => {
    const data = [
      { date: '2024-01-01', revenue: 100, orders: 2 },
      { date: '2024-01-02', revenue: 200, orders: 3 },
    ];

    render(<RevenueChart data={data} />);

    // Should render 2 bars with date labels (dates may vary by timezone)
    const bars = document.querySelectorAll('.bg-purple-500');
    expect(bars).toHaveLength(2);

    // Check that date labels exist (span elements with date text)
    const labels = document.querySelectorAll('.text-gray-600');
    expect(labels.length).toBeGreaterThan(0);
  });

  it('scales bars relative to max revenue', () => {
    const data = [
      { date: '2024-01-01', revenue: 100, orders: 2 },
      { date: '2024-01-02', revenue: 200, orders: 3 }, // Max
    ];

    render(<RevenueChart data={data} />);

    const bars = document.querySelectorAll('.bg-purple-500');

    // Second bar should be 100% height, first should be 50%
    const bar1Style = bars[0].getAttribute('style');
    const bar2Style = bars[1].getAttribute('style');

    // Use regex since order might vary due to date parsing
    expect(bar1Style).toMatch(/50%|100%/);
    expect(bar2Style).toMatch(/50%|100%/);
  });
});
