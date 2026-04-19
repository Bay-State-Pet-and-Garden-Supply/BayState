import os
import re

def check_server_actions(directory):
    for root, dirs, files in os.walk(directory):
        for file in files:
            if file.endswith(('.ts', '.tsx')):
                filepath = os.path.join(root, file)
                try:
                    with open(filepath, 'r') as f:
                        content = f.read()
                        if "'use server'" in content or '"use server"' in content:
                            # Find all exported functions
                            # This regex looks for 'export function name' or 'export async function name'
                            # and 'export const name = function' etc.
                            
                            # Standard function exports
                            exports = re.findall(r'export\s+(async\s+)?function\s+([a-zA-Z0-9_]+)', content)
                            for is_async, name in exports:
                                if not is_async:
                                    print(f"File: {filepath} -> Non-async export: function {name}")

                            # Const arrow function exports
                            const_exports = re.findall(r'export\s+const\s+([a-zA-Z0-9_]+)\s*=\s*(async\s+)?(\([^)]*\)|[a-zA-Z0-9_]+)\s*=>', content)
                            for name, is_async, params in const_exports:
                                if not is_async:
                                    print(f"File: {filepath} -> Non-async export: const {name}")
                                    
                            # Const standard function exports
                            const_expr_exports = re.findall(r'export\s+const\s+([a-zA-Z0-9_]+)\s*=\s*(async\s+)?function', content)
                            for name, is_async in const_expr_exports:
                                if not is_async:
                                    print(f"File: {filepath} -> Non-async export: const expression {name}")

                except Exception as e:
                    print(f"Could not read {filepath}: {e}")

if __name__ == "__main__":
    check_server_actions('apps/web')
