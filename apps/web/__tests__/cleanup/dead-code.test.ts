import * as fs from 'fs';
import * as path from 'path';

describe('Dead Code Cleanup', () => {
    const projectRoot = process.cwd();

    it('should include BatchEnhanceDialog.tsx', () => {
        const filePath = path.join(projectRoot, 'components', 'admin', 'pipeline', 'BatchEnhanceDialog.tsx');
        expect(fs.existsSync(filePath)).toBe(true);
    });

    it('should export BatchEnhanceDialog component', () => {
        const filePath = path.join(projectRoot, 'components', 'admin', 'pipeline', 'BatchEnhanceDialog.tsx');
        const content = fs.readFileSync(filePath, 'utf-8');

        expect(content).toContain('export function BatchEnhanceDialog');
    });
});
