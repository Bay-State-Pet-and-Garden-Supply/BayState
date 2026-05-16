import os
import glob
import re

files_to_check = glob.glob('apps/web/**/*.ts', recursive=True) + glob.glob('apps/web/**/*.tsx', recursive=True)

for filepath in files_to_check:
    if 'node_modules' in filepath or '.next' in filepath:
        continue
    with open(filepath, 'r') as f:
        content = f.read()

    new_content = content.replace("'scrape_jobs'", "'enrichment_jobs'")
    new_content = new_content.replace('"scrape_jobs"', '"enrichment_jobs"')
    new_content = new_content.replace('`scrape_jobs`', '`enrichment_jobs`')
    
    new_content = new_content.replace(".eq('status', 'pending')", ".eq('status', 'queued')")
    new_content = new_content.replace('.eq("status", "pending")', '.eq("status", "queued")')
    new_content = new_content.replace(".eq('status','pending')", ".eq('status','queued')")
    new_content = new_content.replace("=== 'pending'", "=== 'queued'")
    new_content = new_content.replace('=== "pending"', '=== "queued"')
    new_content = new_content.replace("== 'pending'", "== 'queued'")
    new_content = new_content.replace('== "pending"', '== "queued"')
    new_content = new_content.replace("status: 'pending'", "status: 'queued'")
    new_content = new_content.replace('status: "pending"', 'status: "queued"')
    new_content = new_content.replace("'pending' |", "'queued' |")
    
    # Replace runner_id with claimed_by, but avoid replacing runner_id if it's not related to enrichment_jobs
    # Let's just do a string replacement of runner_id to claimed_by for those specific API routes
    new_content = re.sub(r'\brunner_id\b', 'claimed_by', new_content)
    
    # Also fix some types if 'pending' was an enum
    new_content = new_content.replace('"pending" |', '"queued" |')

    if new_content != content:
        with open(filepath, 'w') as f:
            f.write(new_content)
        print(f"Updated {filepath}")
