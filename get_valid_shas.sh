get_sha() {
    repo=$1
    ref=$2
    # Try tags first, then branches
    sha=$(git ls-remote --tags https://github.com/${repo}.git ${ref} | head -n 1 | awk '{print $1}')
    if [ -z "$sha" ]; then
        sha=$(git ls-remote --heads https://github.com/${repo}.git ${ref} | head -n 1 | awk '{print $1}')
    fi
    if [ -z "$sha" ]; then
         # Try without refs/ prefix in case it's a full ref or we need to search
         sha=$(git ls-remote https://github.com/${repo}.git ${ref} | head -n 1 | awk '{print $1}')
    fi
    echo "${repo}@${ref} -> ${sha}"
}

get_sha actions/checkout v4
get_sha actions/setup-node v4
get_sha actions/setup-python v5
get_sha actions/setup-go v5
get_sha actions/upload-artifact v4
get_sha actions/github-script v7
get_sha actions/stale v9
get_sha codecov/codecov-action v5
get_sha aquasecurity/trivy-action v0.28.0
get_sha cloudflare/wrangler-action v3
get_sha peter-evans/create-pull-request v7
get_sha reviewdog/action-actionlint v1
get_sha Ardiannn08/resolve-outdated-comment v1
get_sha dtolnay/rust-toolchain master
