#!/usr/bin/env bash

set -euo pipefail

if [[ $# -ne 3 ]]; then
	echo "Usage: $0 <pageTitle> <baseUrl> <githubUrl>" >&2
	exit 1
fi

page_title="$1"
base_url="$2"
github_url="$3"

config_file="quartz.config.ts"
layout_file="quartz.layout.ts"

if [[ ! -f "$config_file" ]]; then
	echo "Missing $config_file" >&2
	exit 1
fi

if [[ ! -f "$layout_file" ]]; then
	echo "Missing $layout_file" >&2
	exit 1
fi

replace_in_file() {
	local file="$1"
	local placeholder="$2"
	local value="$3"

	local escaped_value
	escaped_value=$(printf '%s' "$value" | sed -e 's/[\\&]/\\\\&/g')

	if grep -q "$placeholder" "$file"; then
		sed -i "s|$placeholder|$escaped_value|g" "$file"
	fi
}

replace_in_file "$config_file" "\$1" "$page_title"
replace_in_file "$config_file" "\$2" "$base_url"
replace_in_file "$layout_file" "\$3" "$github_url"

echo "Updated $config_file and $layout_file"

