import urllib.request
import re

actions = {
    "actions/checkout": "v4",
    "actions/setup-node": "v4",
    "actions/setup-python": "v5",
    "actions/setup-go": "v5",
    "actions/upload-artifact": "v4",
    "actions/github-script": "v7",
    "actions/stale": "v9",
    "codecov/codecov-action": "v5",
    "aquasecurity/trivy-action": "v0.28.0",
    "cloudflare/wrangler-action": "v3",
    "peter-evans/create-pull-request": "v7",
    "reviewdog/action-actionlint": "v1",
    "Ardiannn08/resolve-outdated-comment": "v1",
}

def get_latest_sha(repo, tag):
    try:
        url = f"https://github.com/{repo}/tree/{tag}"
        with urllib.request.urlopen(url) as response:
            content = response.read().decode('utf-8')
            # Look for the commit SHA in the page content
            match = re.search(r'/[a-f0-9]{40}', content)
            if match:
                return match.group(0)[1:]
    except Exception as e:
        print(f"Error fetching {repo}: {e}")
    return None

for action, tag in actions.items():
    sha = get_latest_sha(action, tag)
    print(f"{action}@{tag} -> {sha}")
