import { cn } from '@/lib/utils';

describe('cn utility', () => {
  it('should merge tailwind classes correctly', () => {
    const result = cn('bg-red-500', 'bg-blue-500');
    expect(result).toBe('bg-blue-500');
  });

  it('should handle conditional classes', () => {
    const result = cn('text-lg', true && 'text-xl', false && 'text-sm');
    expect(result).toBe('text-xl');
  });
});
