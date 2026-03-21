// 对话附件（chat_uploads）文件管理

let chatFilesCache = [];
let chatFilesDisplayed = [];
let chatFilesEditRelativePath = '';
let chatFilesRenameRelativePath = '';

function initChatFilesPage() {
    ensureChatFilesDocClickClose();
    loadChatFilesPage();
}

function chatFilesCloseAllMenus() {
    document.querySelectorAll('.chat-files-dropdown').forEach((el) => {
        el.hidden = true;
        el.style.position = '';
        el.style.left = '';
        el.style.top = '';
        el.style.right = '';
        el.style.minWidth = '';
        el.style.zIndex = '';
        el.classList.remove('chat-files-dropdown-fixed');
    });
}

/**
 * 「更多」菜单使用 fixed 定位，避免表格外层 overflow 把菜单裁成一条细线。
 */
function chatFilesToggleMoreMenu(ev, idx) {
    if (ev) ev.stopPropagation();
    const menu = document.getElementById('chat-files-menu-' + idx);
    const btn = ev && ev.currentTarget;
    if (!menu) return;
    const opening = menu.hidden;
    chatFilesCloseAllMenus();
    if (!opening) return;

    menu.hidden = false;
    menu.classList.add('chat-files-dropdown-fixed');
    if (!btn || typeof btn.getBoundingClientRect !== 'function') return;

    requestAnimationFrame(() => {
        const r = btn.getBoundingClientRect();
        const vw = window.innerWidth;
        const vh = window.innerHeight;
        const margin = 8;
        const minW = 220;
        menu.style.boxSizing = 'border-box';
        menu.style.position = 'fixed';
        menu.style.zIndex = '5000';
        menu.style.minWidth = minW + 'px';
        menu.style.right = 'auto';

        const w = Math.max(minW, menu.offsetWidth || minW);
        let left = r.right - w;
        if (left < margin) left = margin;
        if (left + w > vw - margin) left = Math.max(margin, vw - margin - w);
        menu.style.left = left + 'px';

        const gap = 6;
        let top = r.bottom + gap;
        const estH = menu.offsetHeight || 120;
        if (top + estH > vh - margin && r.top - gap - estH >= margin) {
            top = r.top - gap - estH;
        }
        menu.style.top = top + 'px';
    });
}

window.chatFilesCloseAllMenus = chatFilesCloseAllMenus;
window.chatFilesToggleMoreMenu = chatFilesToggleMoreMenu;

function ensureChatFilesDocClickClose() {
    if (window.__chatFilesDocClose) return;
    window.__chatFilesDocClose = true;
    document.addEventListener('click', function (ev) {
        if (ev.target.closest && ev.target.closest('.chat-files-dropdown-wrap')) return;
        chatFilesCloseAllMenus();
    });
    document.addEventListener('keydown', function (ev) {
        if (ev.key === 'Escape') chatFilesCloseAllMenus();
    });
    window.addEventListener(
        'scroll',
        function () {
            chatFilesCloseAllMenus();
        },
        true
    );
    window.addEventListener('resize', function () {
        chatFilesCloseAllMenus();
    });
}

async function loadChatFilesPage() {
    const wrap = document.getElementById('chat-files-list-wrap');
    if (!wrap) return;
    wrap.innerHTML = '<div class="loading-spinner" data-i18n="common.loading">加载中…</div>';
    if (typeof window.applyTranslations === 'function') {
        window.applyTranslations(wrap);
    }

    const conv = document.getElementById('chat-files-filter-conv');
    const convQ = conv ? conv.value.trim() : '';
    let url = '/api/chat-uploads';
    if (convQ) {
        url += '?conversation=' + encodeURIComponent(convQ);
    }

    try {
        const res = await apiFetch(url);
        if (!res.ok) {
            const t = await res.text();
            throw new Error(t || res.status);
        }
        const data = await res.json();
        chatFilesCache = Array.isArray(data.files) ? data.files : [];
        renderChatFilesTable();
    } catch (e) {
        console.error(e);
        const msg = (typeof window.t === 'function') ? window.t('chatFilesPage.errorLoad') : '加载失败';
        wrap.innerHTML = '<div class="error-message">' + escapeHtml(msg + ': ' + (e.message || String(e))) + '</div>';
    }
}

function chatFilesNameFilter(files) {
    const el = document.getElementById('chat-files-filter-name');
    const q = el ? el.value.trim().toLowerCase() : '';
    if (!q) return files;
    return files.filter((f) => (f.name || '').toLowerCase().includes(q));
}

/** 仅前端按文件名筛选，不重新请求 */
function chatFilesFilterNameOnInput() {
    if (!chatFilesCache.length) return;
    renderChatFilesTable();
}

function formatChatFileBytes(n) {
    if (n < 1024) return n + ' B';
    if (n < 1024 * 1024) return (n / 1024).toFixed(1) + ' KB';
    return (n / (1024 * 1024)).toFixed(1) + ' MB';
}

function chatFilesShowToast(message) {
    const el = document.createElement('div');
    el.className = 'chat-files-toast';
    el.setAttribute('role', 'status');
    el.textContent = message;
    document.body.appendChild(el);
    requestAnimationFrame(() => el.classList.add('chat-files-toast-visible'));
    setTimeout(() => {
        el.classList.remove('chat-files-toast-visible');
        setTimeout(() => el.remove(), 300);
    }, 2200);
}

async function chatFilesCopyText(text) {
    try {
        if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
            await navigator.clipboard.writeText(text);
            return true;
        }
    } catch (e) {
        /* fall through */
    }
    try {
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.setAttribute('readonly', '');
        ta.style.position = 'fixed';
        ta.style.left = '-9999px';
        document.body.appendChild(ta);
        ta.select();
        const ok = document.execCommand('copy');
        document.body.removeChild(ta);
        return ok;
    } catch (e2) {
        return false;
    }
}

async function copyChatFilePathIdx(idx) {
    const f = chatFilesDisplayed[idx];
    if (!f) return;
    const text = (f.absolutePath && String(f.absolutePath).trim())
        ? String(f.absolutePath).trim()
        : ('chat_uploads/' + String(f.relativePath || '').replace(/^\/+/, ''));
    const ok = await chatFilesCopyText(text);
    if (ok) {
        const msg = (typeof window.t === 'function') ? window.t('chatFilesPage.pathCopied') : '路径已复制，可粘贴到对话中引用';
        chatFilesShowToast(msg);
    } else {
        const fail = (typeof window.t === 'function') ? window.t('common.copyFailed') : '复制失败';
        alert(fail);
    }
}

/** 常见二进制扩展名：此类文件无法在纯文本编辑器中打开 */
const CHAT_FILES_BINARY_EXT = new Set([
    'png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'ico', 'tif', 'tiff', 'heic', 'heif', 'svgz',
    'pdf', 'zip', 'rar', '7z', 'tar', 'gz', 'bz2', 'xz', 'zst',
    'mp3', 'm4a', 'wav', 'ogg', 'flac', 'aac',
    'mp4', 'avi', 'mkv', 'mov', 'wmv', 'webm', 'm4v',
    'exe', 'dll', 'so', 'dylib', 'bin', 'app', 'dmg', 'pkg',
    'woff', 'woff2', 'ttf', 'otf', 'eot',
    'sqlite', 'db', 'sqlite3',
    'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'odt', 'ods',
    'class', 'jar', 'war', 'apk', 'ipa',
    'iso', 'img'
]);

function chatFileIsBinaryByName(fileName) {
    if (!fileName || typeof fileName !== 'string') return false;
    const i = fileName.lastIndexOf('.');
    if (i < 0 || i === fileName.length - 1) return false;
    const ext = fileName.slice(i + 1).toLowerCase();
    return CHAT_FILES_BINARY_EXT.has(ext);
}

function chatFilesEditBlockedHint() {
    return (typeof window.t === 'function')
        ? window.t('chatFilesPage.editBinaryHint')
        : '图片、压缩包等二进制文件无法在此以文本方式编辑，请使用「下载」。';
}

function chatFilesAlertMessage(raw) {
    const s = (raw == null) ? '' : String(raw).trim();
    const lower = s.toLowerCase();
    if (lower.includes('binary file not editable') || lower.includes('binary')) {
        return chatFilesEditBlockedHint();
    }
    if (lower.includes('file too large') || lower.includes('entity too large') || lower.includes('413')) {
        return (typeof window.t === 'function') ? window.t('chatFilesPage.editTooLarge') : '文件过大，无法在此编辑。';
    }
    return s || ((typeof window.t === 'function') ? window.t('chatFilesPage.errorGeneric') : '操作失败');
}

function renderChatFilesTable() {
    const wrap = document.getElementById('chat-files-list-wrap');
    if (!wrap) return;

    chatFilesDisplayed = chatFilesNameFilter(chatFilesCache);
    const emptyMsg = (typeof window.t === 'function') ? window.t('chatFilesPage.empty') : '暂无文件';
    if (!chatFilesDisplayed.length) {
        wrap.innerHTML = '<div class="empty-state" data-i18n="chatFilesPage.empty">' + escapeHtml(emptyMsg) + '</div>';
        if (typeof window.applyTranslations === 'function') {
            window.applyTranslations(wrap);
        }
        return;
    }

    const thDate = (typeof window.t === 'function') ? window.t('chatFilesPage.colDate') : '日期';
    const thConv = (typeof window.t === 'function') ? window.t('chatFilesPage.colConversation') : '会话';
    const thName = (typeof window.t === 'function') ? window.t('chatFilesPage.colName') : '文件名';
    const thSize = (typeof window.t === 'function') ? window.t('chatFilesPage.colSize') : '大小';
    const thModified = (typeof window.t === 'function') ? window.t('chatFilesPage.colModified') : '修改时间';
    const thActions = (typeof window.t === 'function') ? window.t('chatFilesPage.colActions') : '操作';

    const svgCopy = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>';
    const svgDownload = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>';
    const svgMore = '<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="12" cy="5" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="12" cy="19" r="1.5"/></svg>';

    const tCopyTitle = escapeHtml((typeof window.t === 'function') ? window.t('chatFilesPage.copyPathTitle') : '复制服务器上的绝对路径，可粘贴到对话中引用');
    const tDlTitle = escapeHtml((typeof window.t === 'function') ? window.t('chatFilesPage.download') : '下载');
    const tMoreTitle = escapeHtml((typeof window.t === 'function') ? window.t('chatFilesPage.moreActions') : '更多操作');

    const rows = chatFilesDisplayed.map((f, idx) => {
        const rp = f.relativePath || '';
        const pathForTitle = (f.absolutePath && String(f.absolutePath).trim()) ? String(f.absolutePath).trim() : rp;
        const nameEsc = escapeHtml(f.name || '');
        const conv = f.conversationId || '';
        const convEsc = escapeHtml(conv);
        const dt = f.modifiedUnix ? new Date(f.modifiedUnix * 1000).toLocaleString() : '—';
        const canOpenChat = conv && conv !== '_manual' && conv !== '_new';

        const bin = chatFileIsBinaryByName(f.name);
        const editHint = escapeHtml(chatFilesEditBlockedHint());
        const editUnavailable = (typeof window.t === 'function') ? escapeHtml(window.t('chatFilesPage.editUnavailable')) : '不可编辑';
        const tEdit = (typeof window.t === 'function') ? escapeHtml(window.t('chatFilesPage.edit')) : '编辑';
        const tOpenChat = (typeof window.t === 'function') ? escapeHtml(window.t('chatFilesPage.openChat')) : '打开对话';
        const tRename = (typeof window.t === 'function') ? escapeHtml(window.t('chatFilesPage.rename')) : '重命名';
        const tDelete = (typeof window.t === 'function') ? escapeHtml(window.t('common.delete')) : '删除';

        const menuParts = [];
        if (canOpenChat) {
            menuParts.push(`<button type="button" class="chat-files-dropdown-item" onclick="chatFilesCloseAllMenus(); openChatFilesConversationIdx(${idx});">${tOpenChat}</button>`);
        }
        if (!bin) {
            menuParts.push(`<button type="button" class="chat-files-dropdown-item" onclick="chatFilesCloseAllMenus(); openChatFilesEditIdx(${idx});">${tEdit}</button>`);
        } else {
            menuParts.push(`<div class="chat-files-dropdown-item is-disabled" title="${editHint}">${editUnavailable}</div>`);
        }
        menuParts.push(`<button type="button" class="chat-files-dropdown-item" onclick="chatFilesCloseAllMenus(); openChatFilesRenameIdx(${idx});">${tRename}</button>`);
        menuParts.push(`<button type="button" class="chat-files-dropdown-item is-danger" onclick="chatFilesCloseAllMenus(); deleteChatFileIdx(${idx});">${tDelete}</button>`);
        const menuHtml = menuParts.join('');

        return `<tr>
            <td>${escapeHtml(f.date || '—')}</td>
            <td class="chat-files-cell-conv"><code title="${convEsc}">${convEsc}</code></td>
            <td class="chat-files-cell-name" title="${escapeHtml(pathForTitle)}">${nameEsc}</td>
            <td>${formatChatFileBytes(f.size || 0)}</td>
            <td>${escapeHtml(dt)}</td>
            <td class="chat-files-actions">
                <div class="chat-files-action-bar">
                    <button type="button" class="btn-icon" title="${tCopyTitle}" onclick="copyChatFilePathIdx(${idx})">${svgCopy}</button>
                    <button type="button" class="btn-icon" title="${tDlTitle}" onclick="downloadChatFileIdx(${idx})">${svgDownload}</button>
                    <div class="chat-files-dropdown-wrap">
                        <button type="button" class="btn-icon" title="${tMoreTitle}" aria-haspopup="true" onclick="chatFilesToggleMoreMenu(event, ${idx})">${svgMore}</button>
                        <div class="chat-files-dropdown" id="chat-files-menu-${idx}" hidden>${menuHtml}</div>
                    </div>
                </div>
            </td>
        </tr>`;
    }).join('');

    ensureChatFilesDocClickClose();

    wrap.innerHTML = `<table class="chat-files-table"><thead><tr>
        <th>${escapeHtml(thDate)}</th>
        <th>${escapeHtml(thConv)}</th>
        <th>${escapeHtml(thName)}</th>
        <th>${escapeHtml(thSize)}</th>
        <th>${escapeHtml(thModified)}</th>
        <th>${escapeHtml(thActions)}</th>
    </tr></thead><tbody>${rows}</tbody></table>`;
}

function openChatFilesConversationIdx(idx) {
    const f = chatFilesDisplayed[idx];
    if (!f || !f.conversationId) return;
    openChatFilesConversation(f.conversationId);
}

function downloadChatFileIdx(idx) {
    const f = chatFilesDisplayed[idx];
    if (!f) return;
    downloadChatFile(f.relativePath, f.name);
}

function openChatFilesEditIdx(idx) {
    const f = chatFilesDisplayed[idx];
    if (!f) return;
    if (chatFileIsBinaryByName(f.name)) {
        alert(chatFilesEditBlockedHint());
        return;
    }
    openChatFilesEdit(f.relativePath);
}

function openChatFilesRenameIdx(idx) {
    const f = chatFilesDisplayed[idx];
    if (!f) return;
    openChatFilesRename(f.relativePath, f.name);
}

function deleteChatFileIdx(idx) {
    const f = chatFilesDisplayed[idx];
    if (!f) return;
    deleteChatFile(f.relativePath);
}

function openChatFilesConversation(conversationId) {
    if (!conversationId) return;
    window.location.hash = 'chat?conversation=' + encodeURIComponent(conversationId);
    if (typeof switchPage === 'function') {
        switchPage('chat');
    }
    setTimeout(() => {
        if (typeof loadConversation === 'function') {
            loadConversation(conversationId);
        }
    }, 400);
}

async function downloadChatFile(relativePath, filename) {
    try {
        const url = '/api/chat-uploads/download?path=' + encodeURIComponent(relativePath);
        const res = await apiFetch(url);
        if (!res.ok) {
            throw new Error(await res.text());
        }
        const blob = await res.blob();
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = filename || 'download';
        a.click();
        URL.revokeObjectURL(a.href);
    } catch (e) {
        alert((e && e.message) ? e.message : String(e));
    }
}

async function deleteChatFile(relativePath) {
    const q = (typeof window.t === 'function') ? window.t('chatFilesPage.confirmDelete') : '确定删除该文件？';
    if (!confirm(q)) return;
    try {
        const res = await apiFetch('/api/chat-uploads', {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ path: relativePath })
        });
        if (!res.ok) {
            throw new Error(await res.text());
        }
        loadChatFilesPage();
    } catch (e) {
        alert((e && e.message) ? e.message : String(e));
    }
}

async function openChatFilesEdit(relativePath) {
    chatFilesEditRelativePath = relativePath;
    const pathEl = document.getElementById('chat-files-edit-path');
    const ta = document.getElementById('chat-files-edit-textarea');
    const modal = document.getElementById('chat-files-edit-modal');
    if (pathEl) pathEl.textContent = relativePath;
    if (ta) ta.value = '';
    if (modal) modal.style.display = 'block';

    try {
        const res = await apiFetch('/api/chat-uploads/content?path=' + encodeURIComponent(relativePath));
        if (!res.ok) {
            let errText = '';
            try {
                const err = await res.json();
                errText = err.error || JSON.stringify(err);
            } catch (e2) {
                errText = await res.text();
            }
            throw new Error(errText || res.status);
        }
        const data = await res.json();
        if (ta) ta.value = data.content != null ? String(data.content) : '';
    } catch (e) {
        if (modal) modal.style.display = 'none';
        alert(chatFilesAlertMessage(e && e.message));
    }
}

function closeChatFilesEditModal() {
    const modal = document.getElementById('chat-files-edit-modal');
    if (modal) modal.style.display = 'none';
    chatFilesEditRelativePath = '';
}

async function saveChatFilesEdit() {
    const ta = document.getElementById('chat-files-edit-textarea');
    if (!ta || !chatFilesEditRelativePath) return;
    try {
        const res = await apiFetch('/api/chat-uploads/content', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ path: chatFilesEditRelativePath, content: ta.value })
        });
        if (!res.ok) {
            throw new Error(await res.text());
        }
        closeChatFilesEditModal();
        loadChatFilesPage();
    } catch (e) {
        alert(chatFilesAlertMessage(e && e.message));
    }
}

function openChatFilesRename(relativePath, currentName) {
    chatFilesRenameRelativePath = relativePath;
    const input = document.getElementById('chat-files-rename-input');
    const modal = document.getElementById('chat-files-rename-modal');
    if (input) input.value = currentName || '';
    if (modal) modal.style.display = 'block';
    setTimeout(() => { if (input) input.focus(); }, 100);
}

function closeChatFilesRenameModal() {
    const modal = document.getElementById('chat-files-rename-modal');
    if (modal) modal.style.display = 'none';
    chatFilesRenameRelativePath = '';
}

async function submitChatFilesRename() {
    const input = document.getElementById('chat-files-rename-input');
    const newName = input ? input.value.trim() : '';
    if (!newName || !chatFilesRenameRelativePath) {
        closeChatFilesRenameModal();
        return;
    }
    try {
        const res = await apiFetch('/api/chat-uploads/rename', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ path: chatFilesRenameRelativePath, newName: newName })
        });
        if (!res.ok) {
            throw new Error(await res.text());
        }
        closeChatFilesRenameModal();
        loadChatFilesPage();
    } catch (e) {
        alert((e && e.message) ? e.message : String(e));
    }
}

async function onChatFilesUploadPick(ev) {
    const input = ev.target;
    const file = input && input.files && input.files[0];
    if (!file) return;
    const form = new FormData();
    form.append('file', file);
    const conv = document.getElementById('chat-files-filter-conv');
    if (conv && conv.value.trim()) {
        form.append('conversationId', conv.value.trim());
    }
    try {
        const res = await apiFetch('/api/chat-uploads', { method: 'POST', body: form });
        if (!res.ok) {
            throw new Error(await res.text());
        }
        const data = await res.json().catch(() => ({}));
        loadChatFilesPage();
        if (data && data.ok) {
            const msg = (typeof window.t === 'function')
                ? window.t('chatFilesPage.uploadOkHint')
                : '上传成功。在列表中点击「复制路径」即可粘贴到对话中引用。';
            chatFilesShowToast(msg);
        }
    } catch (e) {
        alert((e && e.message) ? e.message : String(e));
    } finally {
        input.value = '';
    }
}

// 语言切换后重新渲染列表：表头与「更多」菜单由 JS 拼接，无 data-i18n，需用当前语言的 t() 再生成一遍
document.addEventListener('languagechange', function () {
    if (typeof window.currentPage !== 'function') return;
    if (window.currentPage() !== 'chat-files') return;
    if (typeof renderChatFilesTable === 'function') {
        renderChatFilesTable();
    }
});
