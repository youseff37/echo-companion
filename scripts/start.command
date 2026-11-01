#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")/.."
command -v node >/dev/null || { echo '请从 https://nodejs.org 安装 Node.js LTS，然后重新运行。'; read -r -p '按回车退出'; exit 1; }
node scripts/doctor.mjs
if [[ ! -d node_modules/ws ]]; then npm ci --ignore-scripts; fi
exec node src/server.mjs
