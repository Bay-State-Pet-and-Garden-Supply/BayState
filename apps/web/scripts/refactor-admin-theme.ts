import fs from 'fs';
import path from 'path';

const TARGET_DIRS = [
  'app/admin',
  'components/admin'
];

const REPLACEMENTS = [
  // Backgrounds
  { from: /\bbg-white\b/g, to: 'bg-card' },
  { from: /\bbg-zinc-50\b/g, to: 'bg-muted' },
  { from: /\bbg-zinc-100\b/g, to: 'bg-muted' },
  { from: /\bbg-zinc-200\b/g, to: 'bg-muted' },
  
  // Text
  { from: /\btext-zinc-950\b/g, to: 'text-foreground' },
  { from: /\btext-zinc-900\b/g, to: 'text-foreground' },
  { from: /\btext-black\b/g, to: 'text-foreground' },
  
  // Borders
  { from: /\bborder-zinc-900\b/g, to: 'border-border' },
  { from: /\bborder-zinc-950\b/g, to: 'border-border' },
  { from: /\bborder-zinc-200\b/g, to: 'border-border' },
  { from: /\bborder-black\b/g, to: 'border-border' },
  
  // Shadows (Admin Is Border-Only)
  { from: /shadow-\[[^\]]*rgba\(0,0,0,1\)[^\]]*\]/g, to: '' },
];

function walk(dir: string, callback: (file: string) => void) {
  const files = fs.readdirSync(dir);
  files.forEach((file) => {
    const filepath = path.join(dir, file);
    const stats = fs.statSync(filepath);
    if (stats.isDirectory()) {
      walk(filepath, callback);
    } else if (stats.isFile() && (filepath.endsWith('.tsx') || filepath.endsWith('.ts'))) {
      callback(filepath);
    }
  });
}

function refactor() {
  let changedFilesCount = 0;
  let totalReplacements = 0;

  TARGET_DIRS.forEach((dir) => {
    const fullDir = path.resolve(process.cwd(), dir);
    if (!fs.existsSync(fullDir)) {
      console.warn(`Directory not found: ${fullDir}`);
      return;
    }

    walk(fullDir, (file) => {
      let content = fs.readFileSync(file, 'utf8');
      let changed = false;

      REPLACEMENTS.forEach((rep) => {
        const matches = content.match(rep.from);
        if (matches) {
          content = content.replace(rep.from, rep.to);
          totalReplacements += matches.length;
          changed = true;
        }
      });

      if (changed) {
        // Clean up double spaces that might have been left by shadow removal
        content = content.replace(/  +/g, ' ');
        // Clean up empty className attributes or trailing spaces in className
        content = content.replace(/className=" +"/g, 'className=""');
        content = content.replace(/className="([^"]+) "/g, 'className="$1"');
        content = content.replace(/className=" ([^"]+)"/g, 'className="$1"');

        fs.writeFileSync(file, content, 'utf8');
        changedFilesCount++;
        console.log(`Updated: ${file}`);
      }
    });
  });

  console.log(`\nRefactor complete!`);
  console.log(`Changed files: ${changedFilesCount}`);
  console.log(`Total replacements: ${totalReplacements}`);
}

refactor();
