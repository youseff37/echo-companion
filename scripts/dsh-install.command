#!/bin/sh
set -eu
cd "$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"
if [ -x .bundled/bin/node ]; then
  PATH="$PWD/.bundled/bin:$PATH"
  export PATH
fi
if ! command -v node >/dev/null 2>&1; then
  echo '未找到 Node.js。请使用完整发布包，或先安装 Node.js 与 npm。'
  exit 1
fi
exec node scripts/dsh.mjs install
