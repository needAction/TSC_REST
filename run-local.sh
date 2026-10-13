#!/bin/sh
script_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd) || exit 1
exec node "$script_dir/scripts/run.cjs" local
