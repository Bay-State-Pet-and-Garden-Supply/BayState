import { render, screen, fireEvent } from '@testing-library/react';
import { DataTable, type Column, getNestedValue } from '@/components/admin/data-table';

interface TestItem {
  id: string;
  name: string;
  price: number;
  status: string;
  nested: { value: number };
}

const mockData: TestItem[] = [
  { id: '1', name: 'Apple', price: 1.5, status: 'active', nested: { value: 10 } },
  { id: '2', name: 'Banana', price: 0.75, status: 'inactive', nested: { value: 20 } },
  { id: '3', name: 'Cherry', price: 3.0, status: 'active', nested: { value: 30 } },
  { id: '4', name: 'Date', price: 2.25, status: 'active', nested: { value: 40 } },
  { id: '5', name: 'Elderberry', price: 5.0, status: 'inactive', nested: { value: 50 } },
];

const columns: Column<TestItem>[] = [
  { key: 'name', header: 'Name', sortable: true, searchable: true },
  { key: 'price', header: 'Price', sortable: true },
  { key: 'status', header: 'Status', sortable: true },
];

describe('DataTable', () => {
  describe('rendering', () => {
    it('renders table with headers and data', () => {
      render(<DataTable data={mockData} columns={columns} />);

      expect(screen.getByText('Name')).toBeInTheDocument();
      expect(screen.getByText('Price')).toBeInTheDocument();
      expect(screen.getByText('Status')).toBeInTheDocument();

      expect(screen.getByText('Apple')).toBeInTheDocument();
      expect(screen.getByText('Banana')).toBeInTheDocument();
    });

    it('shows empty message when no data', () => {
      render(
        <DataTable
          data={[]}
          columns={columns}
          emptyMessage="No items found."
        />
      );

      expect(screen.getByText('No items found.')).toBeInTheDocument();
    });

    it('shows loading state', () => {
      render(<DataTable data={[]} columns={columns} loading />);

      // Loader2 has animate-spin class
      expect(document.querySelector('.animate-spin')).toBeInTheDocument();
    });

    it('renders custom cell content with render function', () => {
      const columnsWithRender: Column<TestItem>[] = [
        {
          key: 'price',
          header: 'Price',
          render: (value) => <span data-testid="custom-price">${String(value)}</span>,
        },
      ];

      render(<DataTable data={mockData} columns={columnsWithRender} />);

      expect(screen.getAllByTestId('custom-price')).toHaveLength(5);
    });
  });

  describe('search', () => {
    it('filters data based on search input', () => {
      render(<DataTable data={mockData} columns={columns} />);

      const searchInput = screen.getByPlaceholderText('Search...');
      fireEvent.change(searchInput, { target: { value: 'apple' } });

      expect(screen.getByText('Apple')).toBeInTheDocument();
      expect(screen.queryByText('Banana')).not.toBeInTheDocument();
    });

    it('shows all results when search is cleared', () => {
      render(<DataTable data={mockData} columns={columns} />);

      const searchInput = screen.getByPlaceholderText('Search...');
      fireEvent.change(searchInput, { target: { value: 'apple' } });
      fireEvent.change(searchInput, { target: { value: '' } });

      expect(screen.getByText('Apple')).toBeInTheDocument();
      expect(screen.getByText('Banana')).toBeInTheDocument();
    });

    it('uses custom search placeholder', () => {
      render(
        <DataTable
          data={mockData}
          columns={columns}
          searchPlaceholder="Find items..."
        />
      );

      expect(screen.getByPlaceholderText('Find items...')).toBeInTheDocument();
    });
  });

  describe('sorting', () => {
    it('sorts ascending on first click', () => {
      render(<DataTable data={mockData} columns={columns} pageSize={10} />);

      const nameHeader = screen.getByText('Name');
      fireEvent.click(nameHeader);

      const rows = screen.getAllByRole('row');
      // Header row + 5 data rows
      expect(rows[1]).toHaveTextContent('Apple');
      expect(rows[2]).toHaveTextContent('Banana');
    });

    it('sorts descending on second click', () => {
      render(<DataTable data={mockData} columns={columns} pageSize={10} />);

      const nameHeader = screen.getByText('Name');
      fireEvent.click(nameHeader);
      fireEvent.click(nameHeader);

      const rows = screen.getAllByRole('row');
      expect(rows[1]).toHaveTextContent('Elderberry');
    });

    it('resets sort on third click', () => {
      render(<DataTable data={mockData} columns={columns} pageSize={10} />);

      const nameHeader = screen.getByText('Name');
      fireEvent.click(nameHeader); // asc
      fireEvent.click(nameHeader); // desc
      fireEvent.click(nameHeader); // reset

      // Back to original order
      const rows = screen.getAllByRole('row');
      expect(rows[1]).toHaveTextContent('Apple');
    });
  });

  describe('pagination', () => {
    it('shows correct number of items per page', () => {
      render(<DataTable data={mockData} columns={columns} pageSize={2} />);

      expect(screen.getByText('Apple')).toBeInTheDocument();
      expect(screen.getByText('Banana')).toBeInTheDocument();
      expect(screen.queryByText('Cherry')).not.toBeInTheDocument();
    });

    it('navigates to next page', () => {
      render(<DataTable data={mockData} columns={columns} pageSize={2} />);

      // Find all buttons and get the one after "First"
      const buttons = screen.getAllByRole('button');
      // The pagination buttons are: First, Prev (chevron-left), Next (chevron-right), Last
      // Filter to find buttons in pagination area
      const nextButton = buttons.find(
        (btn) => btn.querySelector('.lucide-chevron-right')
      );
      expect(nextButton).toBeTruthy();
      fireEvent.click(nextButton!);

      expect(screen.queryByText('Apple')).not.toBeInTheDocument();
      expect(screen.getByText('Cherry')).toBeInTheDocument();
    });

    it('displays pagination info correctly', () => {
      render(<DataTable data={mockData} columns={columns} pageSize={2} />);

      expect(screen.getByText(/Showing 1 to 2 of 5 entries/)).toBeInTheDocument();
    });

    it('changes page size', () => {
      render(
        <DataTable
          data={mockData}
          columns={columns}
          pageSize={2}
          pageSizeOptions={[2, 5, 10]}
        />
      );

      const select = screen.getByRole('combobox');
      fireEvent.change(select, { target: { value: '5' } });

      expect(screen.getByText('Apple')).toBeInTheDocument();
      expect(screen.getByText('Elderberry')).toBeInTheDocument();
    });
  });

  describe('selection', () => {
    it('renders checkboxes when selectable', () => {
      render(<DataTable data={mockData} columns={columns} selectable />);

      const checkboxes = screen.getAllByRole('checkbox');
      // 1 header checkbox + 5 row checkboxes (but paginated to 10 by default, so all 5)
      expect(checkboxes.length).toBeGreaterThan(1);
    });

    it('calls onSelectionChange when row selected', () => {
      const handleSelection = jest.fn();
      render(
        <DataTable
          data={mockData}
          columns={columns}
          selectable
          onSelectionChange={handleSelection}
        />
      );

      const checkboxes = screen.getAllByRole('checkbox');
      fireEvent.click(checkboxes[1]); // First row checkbox

      expect(handleSelection).toHaveBeenCalledWith([mockData[0]]);
    });

    it('selects all when header checkbox clicked', () => {
      const handleSelection = jest.fn();
      render(
        <DataTable
          data={mockData}
          columns={columns}
          selectable
          onSelectionChange={handleSelection}
          pageSize={10}
        />
      );

      const checkboxes = screen.getAllByRole('checkbox');
      fireEvent.click(checkboxes[0]); // Header checkbox

      expect(handleSelection).toHaveBeenCalledWith(mockData);
    });

    it('shows selection count', () => {
      render(
        <DataTable data={mockData} columns={columns} selectable pageSize={10} />
      );

      const checkboxes = screen.getAllByRole('checkbox');
      fireEvent.click(checkboxes[1]);
      fireEvent.click(checkboxes[2]);

      expect(screen.getByText('2 row(s) selected')).toBeInTheDocument();
    });
  });

  describe('actions', () => {
    it('renders action buttons', () => {
      const actions = jest.fn(() => <button>Edit</button>);
      render(<DataTable data={mockData} columns={columns} actions={actions} />);

      expect(screen.getAllByRole('button', { name: 'Edit' })).toHaveLength(5);
    });
  });

  describe('row click', () => {
    it('calls onRowClick when row clicked', () => {
      const handleRowClick = jest.fn();
      render(
        <DataTable
          data={mockData}
          columns={columns}
          onRowClick={handleRowClick}
        />
      );

      fireEvent.click(screen.getByText('Apple'));

      expect(handleRowClick).toHaveBeenCalledWith(mockData[0]);
    });
  });
});

describe('getNestedValue', () => {
  it('gets top-level value', () => {
    const obj = { name: 'Test' };
    expect(getNestedValue(obj, 'name')).toBe('Test');
  });

  it('gets nested value with dot notation', () => {
    const obj = { user: { profile: { name: 'John' } } };
    expect(getNestedValue(obj, 'user.profile.name')).toBe('John');
  });

  it('returns undefined for non-existent path', () => {
    const obj = { name: 'Test' };
    expect(getNestedValue(obj, 'age')).toBeUndefined();
  });

  it('returns undefined for partial path', () => {
    const obj = { user: { name: 'Test' } };
    expect(getNestedValue(obj, 'user.profile.name')).toBeUndefined();
  });
});
