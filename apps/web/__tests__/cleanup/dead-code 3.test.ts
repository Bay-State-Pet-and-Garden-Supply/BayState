import * as fs from 'fs';
import * as path from 'path';

describe('Dead Code Cleanup', () => {
    const projectRoot = process.cwd();

    it('should have deleted BatchEnhanceDialog.tsx', () => {
        const filePath = path.join(projectRoot, 'components', 'admin', 'pipeline', 'BatchEnhanceDialog.tsx');
        expect(fs.existsSync(filePath)).toBe(false);
    });

    it('should have no imports of BatchEnhanceDialog in pipeline components', () => {
        const pipelineDir = path.join(projectRoot, 'components', 'admin', 'pipeline');
        
        if (fs.existsSync(pipelineDir)) {
            const files = fs.readdirSync(pipelineDir).filter(f => f.endsWith('.tsx') || f.endsWith('.ts'));
            
            for (const file of files) {
                const content = fs.readFileSync(path.join(pipelineDir, file), 'utf-8');
                expect(content).not.toContain('BatchEnhanceDialog');
            }
        }
    });
});
