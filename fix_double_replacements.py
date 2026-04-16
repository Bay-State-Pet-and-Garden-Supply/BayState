import os
import re

def fix_double_replacements(file_path):
    with open(file_path, 'r', encoding='utf-8') as f:
        content = f.read()

    original_content = content

    # Fix rounded-none-none, rounded-none-none-none, etc.
    content = re.sub(r'\brounded-none(-none)+\b', 'rounded-none', content)
    
    # Fix shadow-[4px_4px_0px_rgba(0,0,0,1)]-[4px_4px_0px_rgba(0,0,0,1)]
    content = re.sub(r'shadow-\[4px_4px_0px_rgba\(0,0,0,1\)\](-\[4px_4px_0px_rgba\(0,0,0,1\)\])+', 'shadow-[4px_4px_0px_rgba(0,0,0,1)]', content)

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
            if fix_double_replacements(os.path.join(root, file)):
                count += 1
                print(f"Fixed: {file}")

print(f"Total files fixed: {count}")
