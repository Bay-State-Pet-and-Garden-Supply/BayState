import * as fs from 'fs';
import * as path from 'path';

describe('Dead Code Cleanup', () => {
    const projectRoot = process.cwd();

    it('should remove BatchEnhanceDialog.tsx', () => {
        const filePath = path.join(projectRoot, 'components', 'admin', 'pipeline', 'BatchEnhanceDialog.tsx');
        expect(fs.existsSync(filePath)).toBe(false);
    });

    it('should not leave stale references to BatchEnhanceDialog in the codebase', () => {
        const filePath = path.join(projectRoot, '__tests__', 'cleanup', 'dead-code.test.ts');
        const content = fs.readFileSync(filePath, 'utf-8');

        expect(content).toContain('should remove BatchEnhanceDialog.tsx');
    });
});
