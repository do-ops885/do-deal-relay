import re
import os

workflow_dir = '.github/workflows'
for filename in os.listdir(workflow_dir):
    if filename.endswith('.yml') or filename.endswith('.yaml'):
        path = os.path.join(workflow_dir, filename)
        with open(path, 'r') as f:
            content = f.read()
            matches = re.findall(r'uses: ([^@\s]+)@([^\s]+)', content)
            for action, ref in matches:
                if not ref.startswith('./') and not re.match(r'^[a-f0-9]{40}$', ref):
                    print(f"File: {path}, Action: {action}, Ref: {ref}")
