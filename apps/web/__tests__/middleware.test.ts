import fs from 'fs';
import path from 'path';

describe('Middleware', () => {
  it('should exist in the root or src directory', () => {
    const middlewarePath = path.join(process.cwd(), 'middleware.ts');
    expect(fs.existsSync(middlewarePath)).toBe(true);
  });

  it('should contain protection logic for admin routes', () => {
    const middlewareLogicPath = path.join(process.cwd(), 'lib/supabase/middleware.ts');
    expect(fs.existsSync(middlewareLogicPath)).toBe(true);
    const content = fs.readFileSync(middlewareLogicPath, 'utf-8');
    expect(content).toMatch(/\/admin/);
  });
});
