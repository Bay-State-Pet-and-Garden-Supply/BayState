import os
import re

def check_server_actions(directory):
    # Regex to find export [something] but not export async function or export interface/type
    # We want to catch things like:
    # export const myAction = ...
    # export function myAction() { ... } (without async)
    
    # But first, find all files with 'use server'
    server_action_files = []
    for root, dirs, files in os.walk(directory):
        for file in files:
            if file.endswith(('.ts', '.tsx')):
                filepath = os.path.join(root, file)
                try:
                    with open(filepath, 'r') as f:
                        if "'use server'" in f.read(500) or '"use server"' in f.read(500):
                            server_action_files.append(filepath)
                except:
                    pass

    for filepath in server_action_files:
        with open(filepath, 'r') as f:
            content = f.read()
            
            # Find all exports
            # This regex looks for 'export' followed by something other than 'type', 'interface', 'async function'
            
            # 1. Any 'export function' that isn't 'async'
            non_async_funcs = re.findall(r'^export\s+function\s+([a-zA-Z0-9_]+)', content, re.MULTILINE)
            for name in non_async_funcs:
                print(f"ERROR: {filepath} exports non-async function: {name}")

            # 2. Any 'export const/let/var' that isn't a function or is a non-async function
            # This is harder to catch with regex perfectly, but let's try to find non-async arrow functions
            const_exports = re.findall(r'^export\s+(const|let|var)\s+([a-zA-Z0-9_]+)\s*=', content, re.MULTILINE)
            for kind, name in const_exports:
                # Check what follows the '='
                # If it's not 'async', it might be a problem if it's used as an action
                # But Next.js prohibits ANY non-function export from 'use server' files
                print(f"WARNING: {filepath} exports {kind}: {name} (Only async functions allowed in 'use server' files)")

            # 3. Check for 'export default'
            if 'export default' in content:
                print(f"WARNING: {filepath} has export default (Not recommended in 'use server' files)")

if __name__ == "__main__":
    check_server_actions('apps/web')
