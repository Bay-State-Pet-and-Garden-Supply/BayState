import os
import re

def refactor_file(file_path):
    with open(file_path, 'r', encoding='utf-8') as f:
        content = f.read()

    original_content = content

    # 1. Replace rounded-* with rounded-none
    content = re.sub(r'\brounded-(sm|md|lg|xl|2xl|full)\b', 'rounded-none', content)
    # Also handle the bare 'rounded' class, avoiding matching 'rounded-none'
    content = re.sub(r'\brounded\b(?![-\w])', 'rounded-none', content)

    # 2. Replace shadow-* with custom shadow
    content = re.sub(r'\bshadow-(sm|md|lg|xl)\b', 'shadow-[4px_4px_0px_rgba(0,0,0,1)]', content)
    # Also handle bare 'shadow' if it's likely a tailwind class, avoiding matching shadow-[...]
    content = re.sub(r'\bshadow\b(?![-\w\[])', 'shadow-[4px_4px_0px_rgba(0,0,0,1)]', content)

    # 3. Handle borders
    content = re.sub(r'\bborder-[lrtb]-4\b', 'border-4', content)

    # Handle Card specifically
    def card_fix(match):
        tag_start = match.group(1) # <Card
        rest = match.group(2)
        
        if 'className=' in rest:
            # Update existing className
            def update_class(m):
                quote = m.group(1)
                existing = m.group(2)
                
                # If it already has the brand style, return it as is
                if 'border-2 border-zinc-950 rounded-none' in existing:
                    return m.group(0)
                
                new_classes = existing
                
                # Check for border
                if 'border' not in existing:
                    new_classes += ' border-2 border-zinc-950'
                else:
                    if 'border-zinc-950' not in existing:
                        new_classes += ' border-zinc-950'
                    if 'border-2' not in existing and 'border-4' not in existing:
                        if 'border-' in existing:
                             new_classes = re.sub(r'\bborder-[01]\b', 'border-2', new_classes)
                        else:
                             new_classes = new_classes.replace('border', 'border-2')
                
                if 'rounded-none' not in existing:
                    new_classes += ' rounded-none'
                
                new_classes = re.sub(r'\s+', ' ', new_classes).strip()
                return f'className={quote}{new_classes}{quote}'
            
            new_rest = re.sub(r'className=(["\'`])([^"\'`]*)\1', update_class, rest)
            return f'{tag_start}{new_rest}'
        else:
            return f'{tag_start} className="border-2 border-zinc-950 rounded-none"{rest}'

    content = re.sub(r'(<Card)\b([^>]*?)', card_fix, content)

    # 4. Headers
    def header_fix(match):
        tag = match.group(1)
        attrs = match.group(2)
        text = match.group(3)
        
        if 'font-black' in attrs or 'font-black' in text:
            return match.group(0) # Already styled
            
        if 'className=' in attrs:
            def append_classes(m):
                quote = m.group(1)
                existing = m.group(2)
                if 'font-black' not in existing:
                    return f'className={quote}{existing} font-black uppercase tracking-tight{quote}'
                return m.group(0)
            
            new_attrs = re.sub(r'className=(["\'`])([^"\'`]*)\1', append_classes, attrs)
            return f'<{tag}{new_attrs}>{text}</{tag}>'
        else:
            return f'<{tag} className="font-black uppercase tracking-tight"{attrs}>{text}</{tag}>'

    content = re.sub(r'<(h[12])([^>]*)>(.*?)</\1>', header_fix, content, count=1)

    if content != original_content:
        with open(file_path, 'w', encoding='utf-8') as f:
            f.write(content)
        return True
    return False

admin_dir = r'C:\Users\thoma\OneDrive\Desktop\scripts\BayState\apps\web\app\admin'
count = 0
for root, dirs, files in os.walk(admin_dir):
    for file in files:
        if file.endswith('.tsx'):
            if refactor_file(os.path.join(root, file)):
                count += 1
                print(f"Refactored: {file}")

print(f"Total files refactored: {count}")
