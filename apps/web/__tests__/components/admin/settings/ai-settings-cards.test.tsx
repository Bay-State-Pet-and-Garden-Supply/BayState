import { render, screen, waitFor } from '@testing-library/react';
import { AIProviderProfilesCard } from '@/components/admin/settings/AIProviderProfilesCard';

const mockProfilesResponse = {
  success: true,
  configs: [
    {
      id: 'profile-1',
      name: 'Production DeepSeek',
      provider_type: 'deepseek',
      base_url: 'https://api.deepseek.com',
      default_model: 'deepseek-chat',
      is_active: true,
      api_key: '••••••••••••1234',
      updated_at: '2026-05-20T04:00:00Z',
    },
    {
      id: 'profile-2',
      name: 'Local LM Studio',
      provider_type: 'lmstudio',
      base_url: 'http://localhost:1234/v1',
      default_model: 'google/gemma-4-e4b',
      is_active: false,
      api_key: '••••••••••••',
      updated_at: null,
    }
  ]
};

describe('AIProviderProfilesCard', () => {
  beforeEach(() => {
    global.fetch = jest.fn().mockImplementation(() => {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve(mockProfilesResponse),
      });
    }) as jest.Mock;
  });

  afterEach(() => {
    jest.resetAllMocks();
  });

  it('renders a list of AI provider profiles', async () => {
    render(<AIProviderProfilesCard />);

    await waitFor(() => {
      expect(screen.getByText('Production DeepSeek')).toBeInTheDocument();
    });

    expect(screen.getByText('Local LM Studio')).toBeInTheDocument();
    expect(screen.getByText('Extraction')).toBeInTheDocument();
    expect(screen.getByText('deepseek-chat')).toBeInTheDocument();
    expect(screen.getByText('google/gemma-4-e4b')).toBeInTheDocument();
  });
});
