'use strict';
(() => {
  const list = document.querySelector('#download-list');
  const toast = document.querySelector('#copy-notice');
  let timer;
  function element(tag, className, text) { const node = document.createElement(tag); if (className) node.className = className; if (text !== undefined) node.textContent = text; return node; }
  function safeUrl(value) {
    if (typeof value !== 'string' || !value.trim()) return null;
    try { const url = new URL(value, location.href); return url.protocol === 'https:' || (url.origin === location.origin && url.protocol === 'http:') ? url : null; } catch { return null; }
  }
  function notice(message) { clearTimeout(timer); toast.textContent = message; toast.hidden = false; timer = setTimeout(() => { toast.hidden = true; }, 7000); }
  fetch('version-manifest.json', { cache: 'no-store', credentials: 'omit' }).then(response => { if (!response.ok) throw new Error('manifest'); return response.json(); }).then(manifest => {
    if (!Array.isArray(manifest.artifacts)) throw new Error('manifest-shape');
    list.replaceChildren();
    for (const [index, artifact] of manifest.artifacts.entries()) {
      const card = element('article', 'download-card');
      card.append(element('span', 'package-label', `PACKAGE ${String(index + 1).padStart(2, '0')} / v${manifest.version || '待定'}`), element('h3', '', artifact.name || artifact.id), element('p', '', artifact.requirements || '系统要求待补充'), element('p', '', typeof artifact.validation === 'string' ? artifact.validation : '实际验证范围以仓库记录为准。'));
      const url = safeUrl(artifact.url);
      const available = artifact.status === 'published' && url && /^[a-fA-F0-9]{64}$/.test(artifact.sha256 || '');
      const action = element(available ? 'a' : 'button', 'button ' + (available ? 'primary' : 'unavailable'), available ? '下载已发布产物 ↓' : '待发布 · 暂不提供下载');
      if (available) { action.href = url.href; action.setAttribute('download', ''); } else { action.type = 'button'; action.disabled = true; }
      card.append(action, element('code', '', available ? 'SHA-256 / ' + artifact.sha256 : '只有发布链接与 SHA-256 均就绪后才启用下载。'));
      list.append(card);
    }
    const published = manifest.artifacts.filter(artifact => artifact.status === 'published' && safeUrl(artifact.url) && /^[a-fA-F0-9]{64}$/.test(artifact.sha256 || '')).length;
    document.querySelector('#release-badge').textContent = `v${manifest.version || '待定'} · ${published ? '已有发布产物，验证范围见说明' : '新版预览，安装产物待发布'}`;
    const china = manifest.verification?.chinaNetwork;
    document.querySelector('#release-status').textContent = `${published ? `${published} 个平台产物已发布。` : '当前是新版预览，未发布的安装产物不会伪装成可下载。'} 国内整条下载链路：${china === 'passed' ? '已记录验证结果，请查看验证范围。' : '待验收；网页、依赖和镜像需分别核对。'}`;
  }).catch(() => {
    list.replaceChildren(element('div', 'loading-state', '版本清单暂时无法读取。请通过 HTTP 服务预览，并核对 version-manifest.json；这里不会显示未经验证的下载链接。'));
    document.querySelector('#release-badge').textContent = '发布状态暂未读取';
    document.querySelector('#release-status').textContent = '当前无法核对发布链接、SHA-256 或实际验证状态。';
  });
  async function copy() {
    const guide = new URL('ai-install.txt', location.href).href;
    const text = `请帮我安装“大肥鱼 · QQ 养鱼计划”，项目：https://github.com/youseff37/echo-companion 。先读取 ${guide} 及同目录 version-manifest.json，核对系统、版本、真实发布 URL、SHA-256 与验证状态。未发布的产物不要当作已经可用；先走免费本机部署。官方 QQ × DSH 与个人号 NapCat 桥接是不同接入路线，不要混用。扫码、填写 Key 与回复范围由我亲自操作，不上传密钥、二维码和聊天记录。不要自动开始 QQ 回复，真实发送前让我指定测试会话。服务器与国内链路尚待验收时须明确说明。`;
    try { await navigator.clipboard.writeText(text); notice('已复制。交给有本机操作能力的 AI，就可以按说明开始。'); }
    catch {
      let box = document.querySelector('#copy-fallback');
      if (!box) { box = element('textarea', 'copy-fallback'); box.id = 'copy-fallback'; box.rows = 7; box.setAttribute('aria-label', '给安装 AI 的完整说明'); document.querySelector('.hero-actions').after(box); }
      box.value = text; box.focus(); box.select(); notice('浏览器未允许自动复制，请复制已选中的安装说明。');
    }
  }
  document.querySelectorAll('[data-copy-ai]').forEach(button => button.addEventListener('click', copy));
})();
