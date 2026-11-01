#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")/.."
if [[ -x .bundled/bin/node ]]; then export PATH="$PWD/.bundled/bin:$PATH"; fi
command -v node >/dev/null || { echo '未找到 Node。请下载含运行环境的完整安装包，或从 https://nodejs.org 安装 Node.js LTS 后重试。'; read -r -p '按回车退出'; exit 1; }
node scripts/doctor.mjs
if [[ ! -d node_modules/ws ]]; then npm ci --ignore-scripts || { echo '依赖下载失败。检查网络后重新运行此入口，已有配置会保留。'; exit 1; }; fi
export ECHO_OPEN_BROWSER=1
exec node src/server.mjs
