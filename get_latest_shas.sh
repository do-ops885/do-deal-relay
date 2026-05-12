get_tag_sha() {
    repo=$1
    tag=$2
    sha=$(git ls-remote --tags https://github.com/${repo}.git ${tag} | awk '{print $1}')
    # If it's a lightweight tag, the first one is the commit.
    # If it's an annotated tag, the one with ^{} is the commit.
    commit_sha=$(git ls-remote --tags https://github.com/${repo}.git "${tag}^{}" | awk '{print $1}')
    if [ -n "$commit_sha" ]; then
        echo "${repo}@${tag} -> ${commit_sha}"
    else
        echo "${repo}@${tag} -> ${sha}"
    fi
}

get_tag_sha actions/checkout v4
get_tag_sha actions/setup-node v4
get_tag_sha actions/setup-python v5
get_tag_sha actions/setup-go v5
get_tag_sha actions/upload-artifact v4
get_tag_sha actions/github-script v7
get_tag_sha actions/stale v9
get_tag_sha codecov/codecov-action v5
get_tag_sha aquasecurity/trivy-action v0.28.0
get_tag_sha cloudflare/wrangler-action v3
get_tag_sha peter-evans/create-pull-request v7
get_tag_sha reviewdog/action-actionlint v1
get_tag_sha Ardiannn08/resolve-outdated-comment v1
get_tag_sha dtolnay/rust-toolchain master
