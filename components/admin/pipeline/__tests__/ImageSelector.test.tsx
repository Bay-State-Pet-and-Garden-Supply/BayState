import { render, screen, fireEvent } from '@testing-library/react';
import { ImageSelector } from '@/components/admin/pipeline/ImageSelector';

describe('ImageSelector', () => {
  const mockImages = [
    'https://example.com/image1.jpg',
    'https://example.com/image2.jpg',
    'https://example.com/image3.jpg',
  ];

  const mockOnSave = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('rendering', () => {
    it('renders with image URLs prop', () => {
      render(<ImageSelector images={mockImages} onSave={mockOnSave} />);

      // Should render all images
      mockImages.forEach((_, index) => {
        expect(screen.getByRole('img', { name: new RegExp(`Product image ${index + 1}`) })).toBeInTheDocument();
      })
    });

    it('shows empty state when no images provided', () => {
      render(<ImageSelector images={[]} onSave={mockOnSave} />);

      expect(screen.getByText(/no images available/i)).toBeInTheDocument();
    });
  });

  describe('selection', () => {
    it('clicking image selects it (toggle)', () => {
      render(<ImageSelector images={mockImages} onSave={mockOnSave} />);

      const firstImage = screen.getByRole('img', { name: /Product image 1/ });
      fireEvent.click(firstImage);

      // Should have visual indication of selection (border/styling)
      expect(firstImage).toHaveClass(/border.*#008850|ring.*forest-green|selected/i);
    });

    it('selected images are tracked in state', () => {
      render(<ImageSelector images={mockImages} onSave={mockOnSave} />);

      const firstImage = screen.getByRole('img', { name: /Product image 1/ });
      const secondImage = screen.getByRole('img', { name: /Product image 2/ });

      // Select first image
      fireEvent.click(firstImage);
      // Select second image
      fireEvent.click(secondImage);

      // Both should show as selected
      expect(firstImage).toHaveClass(/selected|ring|border.*#008850/i);
      expect(secondImage).toHaveClass(/selected|ring|border.*#008850/i);
    });
  });

  describe('save functionality', () => {
    it('save button calls onSave callback with selected URLs', () => {
      render(<ImageSelector images={mockImages} onSave={mockOnSave} />);

      const firstImage = screen.getByRole('img', { name: /Product image 1/ });
      fireEvent.click(firstImage);

      const saveButton = screen.getByRole('button', { name: /save selected images/i });
      fireEvent.click(saveButton);

      expect(mockOnSave).toHaveBeenCalledTimes(1);
      expect(mockOnSave).toHaveBeenCalledWith(['https://example.com/image1.jpg']);
    });

    it('save button is disabled when no images selected', () => {
      render(<ImageSelector images={mockImages} onSave={mockOnSave} />);

      const saveButton = screen.getByRole('button', { name: /save selected images/i });

      expect(saveButton).toBeDisabled();
    });
  });
});
