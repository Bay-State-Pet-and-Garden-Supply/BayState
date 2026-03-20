import fs from 'fs';
import path from 'path';

describe('Middleware', () => {
  it('should expose the proxy entry point in the app root', () => {
    const proxyPath = path.join(process.cwd(), 'proxy.ts');
    expect(fs.existsSync(proxyPath)).toBe(true);
  });

  it('should contain protection logic for admin routes', () => {
    const middlewareLogicPath = path.join(process.cwd(), 'lib/supabase/middleware.ts');
    expect(fs.existsSync(middlewareLogicPath)).toBe(true);
    const content = fs.readFileSync(middlewareLogicPath, 'utf-8');
    expect(content).toMatch(/\/admin/);
  });
});
