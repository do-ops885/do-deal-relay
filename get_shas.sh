get_sha() {
    repo=$1
    ref=$2
    sha=$(git ls-remote https://github.com/${repo}.git ${ref} | awk '{print $1}')
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
get_sha Ardiannn08/resolve-outdated-comment main
get_sha dtolnay/rust-toolchain master
