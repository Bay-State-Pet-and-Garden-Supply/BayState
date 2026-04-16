import os
import re

def fix_duplicate_classnames(file_path):
    with open(file_path, 'r', encoding='utf-8') as f:
        content = f.read()

    original_content = content

    # Match tags with multiple className props
    # e.g. <Card className="..." className="...">
    def remove_duplicates(match):
        tag_content = match.group(0)
        # Find all className="..." or className={`...`}
        patterns = [
            r'className="[^"]*"',
            r"className='[^']*'",
            r'className=\{`[^`]*`\}',
            r'className=\{[^\}]*\}'
        ]
        
        all_class_names = []
        for p in patterns:
            all_class_names.extend(re.findall(p, tag_content))
        
        if len(all_class_names) > 1:
            # Keep only the first one (or merge them, but usually they are identical here)
            first = all_class_names[0]
            # Replace all occurrences with empty string then put the first one back
            new_tag_content = tag_content
            for cn in all_class_names:
                new_tag_content = new_tag_content.replace(cn, '', 1)
            
            # Insert the first one back after the tag name
            tag_name_match = re.match(r'<(\w+)', new_tag_content)
            if tag_name_match:
                tag_name = tag_name_match.group(0)
                new_tag_content = new_tag_content.replace(tag_name, f'{tag_name} {first}', 1)
            
            # Clean up extra spaces
            new_tag_content = re.sub(r'\s+', ' ', new_tag_content)
            new_tag_content = new_tag_content.replace(' >', '>')
            new_tag_content = new_tag_content.replace(' />', ' />')
            
            return new_tag_content
        return tag_content

    # Match any opening tag that might have multiple classNames
    content = re.sub(r'<\w+[^>]*className=[^>]*>', remove_duplicates, content)

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
            if fix_duplicate_classnames(os.path.join(root, file)):
                count += 1
                print(f"Fixed: {file}")

print(f"Total files fixed: {count}")
