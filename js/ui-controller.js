// UI 交互控制模块
// 负责用户输入处理、结果渲染、事件绑定

// ===== 常用正则模板 =====
var REGEX_TEMPLATES = [
    { name: '邮箱', pattern: '[\\w.+-]+@[\\w-]+\\.[\\w.]+', flags: 'g' },
    { name: '手机号', pattern: '1[3-9]\\d{9}', flags: 'g' },
    { name: 'URL', pattern: 'https?://[\\w.-]+(?::\\d+)?(?:/[\\w./?%&=+#-]*)?', flags: 'g' },
    { name: 'IP 地址', pattern: '\\b(?:(?:25[0-5]|2[0-4]\\d|1\\d{2}|[1-9]?\\d)\\.){3}(?:25[0-5]|2[0-4]\\d|1\\d{2}|[1-9]?\\d)\\b', flags: 'g' },
    { name: '身份证号', pattern: '\\b\\d{6}(?:19|20)\\d{2}(?:0[1-9]|1[0-2])(?:0[1-9]|[12]\\d|3[01])\\d{3}[\\dXx]\\b', flags: 'g' },
    { name: '日期 (YYYY-MM-DD)', pattern: '\\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\\d|3[01])', flags: 'g' },
    { name: '数字（含小数/负数）', pattern: '-?\\d+(?:\\.\\d+)?', flags: 'g' },
    { name: '中文字符', pattern: '[\\u4e00-\\u9fa5]+', flags: 'g' },
    { name: '邮政编码', pattern: '\\b[1-9]\\d{5}\\b', flags: 'g' },
    { name: '十六进制颜色码', pattern: '#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})\\b', flags: 'g' }
];

// ===== 全局状态 =====
var state = {
    flags: { g: true, i: false, m: false, s: false },
    matches: [],
    regex: null
};

// ===== DOM 引用 =====
var els = {};

function cacheElements() {
    els.regexInput = document.getElementById('regex-input');
    els.flagsDisplay = document.getElementById('flags-display');
    els.flagBtns = document.querySelectorAll('.flag-btn');
    els.matchStats = document.getElementById('match-stats');
    els.regexError = document.getElementById('regex-error');
    els.textInput = document.getElementById('text-input');
    els.highlightLayer = document.getElementById('highlight-layer');
    els.matchList = document.getElementById('match-list');
    els.replaceInput = document.getElementById('replace-input');
    els.replacePreview = document.getElementById('replace-preview');
    els.replaceOutput = document.getElementById('replace-output');
    els.templateItems = document.getElementById('template-items');
    els.tooltip = document.getElementById('match-tooltip');
}

// ===== 工具函数 =====

/** 防抖：延迟 wait 毫秒执行，重复触发则重新计时 */
function debounce(fn, wait) {
    var timer = null;
    return function () {
        var args = arguments;
        clearTimeout(timer);
        timer = setTimeout(function () { fn.apply(null, args); }, wait);
    };
}

/** HTML 转义，防止注入 */
function escapeHtml(str) {
    return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

/** 当前 flags 对象转字符串，如 "gi" */
function flagsToString() {
    var order = ['g', 'i', 'm', 's'];
    var out = '';
    for (var i = 0; i < order.length; i++) {
        if (state.flags[order[i]]) out += order[i];
    }
    return out;
}

/** 截断过长文本用于展示 */
function truncate(str, max) {
    if (str.length <= max) return str;
    return str.slice(0, max) + '…';
}

// ===== 核心更新流程 =====

/** 重新解析正则并刷新所有视图 */
function update() {
    var pattern = els.regexInput.value;
    var flags = flagsToString();

    els.flagsDisplay.textContent = flags;

    var parsed = parseRegex(pattern, flags);

    // 语法错误：显示错误提示，清空结果
    if (parsed.error) {
        state.regex = null;
        state.matches = [];
        showError(parsed.error);
        renderHighlights(els.textInput.value, []);
        renderMatchDetails([]);
        renderStats(0);
        renderReplacePreview();
        return;
    }

    hideError();
    state.regex = parsed.regex;
    state.matches = state.regex ? executeMatch(els.textInput.value, state.regex) : [];

    renderHighlights(els.textInput.value, state.matches);
    renderMatchDetails(state.matches);
    renderStats(state.matches.length);
    renderReplacePreview();
}

function showError(msg) {
    els.regexError.textContent = '正则语法错误：' + msg;
    els.regexError.classList.remove('hidden');
    els.regexInput.classList.add('error');
}

function hideError() {
    els.regexError.classList.add('hidden');
    els.regexInput.classList.remove('error');
}

function renderStats(count) {
    els.matchStats.textContent = count + ' 个匹配';
    els.matchStats.classList.toggle('has-match', count > 0);
}

// ===== 高亮渲染 =====

function renderHighlights(text, matches) {
    if (!text) {
        els.highlightLayer.innerHTML = '';
        return;
    }

    var html = '';
    var cursor = 0;
    for (var i = 0; i < matches.length; i++) {
        var m = matches[i];
        // 匹配前的普通文本
        html += escapeHtml(text.slice(cursor, m.start));
        // 匹配块（带编号，data-index 用于悬停定位）
        html += '<span class="match-highlight" data-index="' + (m.index - 1) + '">' +
                '<span class="match-num">' + m.index + '</span>' +
                escapeHtml(m.match) +
                '</span>';
        cursor = m.end;
    }
    html += escapeHtml(text.slice(cursor));

    // 文本以换行结尾时补一个空格，保证高亮层与输入框高度一致
    if (text.charAt(text.length - 1) === '\n') {
        html += ' ';
    }

    els.highlightLayer.innerHTML = html;
    syncScroll();
}

/** 高亮层滚动位置与输入框保持一致 */
function syncScroll() {
    els.highlightLayer.scrollTop = els.textInput.scrollTop;
    els.highlightLayer.scrollLeft = els.textInput.scrollLeft;
}

// ===== 匹配详情面板 =====

function renderMatchDetails(matches) {
    if (!matches.length) {
        els.matchList.innerHTML = '<div class="empty-tip">' +
            (els.regexInput.value ? '没有匹配结果' : '输入正则表达式开始匹配') +
            '</div>';
        return;
    }

    var html = '';
    for (var i = 0; i < matches.length; i++) {
        var m = matches[i];
        html += '<div class="match-item" data-index="' + (m.index - 1) + '">';
        html += '<div class="match-item-header">';
        html += '<span class="match-item-index">#' + m.index + '</span>';
        html += '<span class="match-item-text" title="' + escapeHtml(m.match) + '">' +
                escapeHtml(truncate(m.match, 40)) + '</span>';
        html += '</div>';
        html += '<div class="match-item-pos">位置: ' + m.start + ' - ' + m.end + '</div>';

        // 捕获组
        if (m.groups.length > 0) {
            html += '<div class="match-item-groups">';
            for (var g = 0; g < m.groups.length; g++) {
                var val = m.groups[g] === undefined ? '(未参与匹配)' : m.groups[g];
                html += '<div class="group-row">' +
                        '<span class="group-name">group ' + (g + 1) + ':</span> ' +
                        '<span class="group-value">' + escapeHtml(truncate(String(val), 60)) + '</span>' +
                        '</div>';
            }
            html += '</div>';
        }
        html += '</div>';
    }
    els.matchList.innerHTML = html;
}

/** 点击详情项：跳转并闪烁文本中对应的匹配块 */
function jumpToMatch(matchIdx) {
    var m = state.matches[matchIdx];
    if (!m) return;

    // 输入框选中该匹配，便于用户看到位置
    els.textInput.focus();
    els.textInput.setSelectionRange(m.start, m.end);

    // 高亮块滚动到可视区域并闪烁
    var span = els.highlightLayer.querySelector('.match-highlight[data-index="' + matchIdx + '"]');
    if (span) {
        syncScroll();
        span.scrollIntoView({ block: 'center' });
        // scrollIntoView 会滚动高亮层，把滚动量同步回输入框
        els.textInput.scrollTop = els.highlightLayer.scrollTop;
        els.textInput.scrollLeft = els.highlightLayer.scrollLeft;
        span.classList.remove('jump-target');
        // 强制重绘以重新触发动画
        void span.offsetWidth;
        span.classList.add('jump-target');
    }
}

// ===== 悬停提示框 =====

function showTooltip(matchIdx, targetEl) {
    var m = state.matches[matchIdx];
    if (!m) return;

    var html = '';
    html += '<div class="tooltip-row"><span class="tooltip-label">匹配 #' + m.index + '</span></div>';
    html += '<div class="tooltip-row"><span class="tooltip-label">内容: </span>' +
            '<span class="tooltip-value">' + escapeHtml(truncate(m.match, 80)) + '</span></div>';
    html += '<div class="tooltip-row"><span class="tooltip-label">位置: </span>' +
            '<span class="tooltip-value">' + m.start + ' - ' + m.end + '（长度 ' + m.match.length + '）</span></div>';
    if (m.groups.length > 0) {
        for (var g = 0; g < m.groups.length; g++) {
            var val = m.groups[g] === undefined ? '(未参与匹配)' : m.groups[g];
            html += '<div class="tooltip-row"><span class="tooltip-group">group ' + (g + 1) + ': </span>' +
                    '<span class="tooltip-value">' + escapeHtml(truncate(String(val), 60)) + '</span></div>';
        }
    }

    els.tooltip.innerHTML = html;
    els.tooltip.classList.remove('hidden');

    // 定位在匹配块下方，防止超出屏幕右侧
    var rect = targetEl.getBoundingClientRect();
    var tipWidth = els.tooltip.offsetWidth;
    var left = rect.left;
    if (left + tipWidth > window.innerWidth - 10) {
        left = window.innerWidth - tipWidth - 10;
    }
    els.tooltip.style.left = Math.max(10, left) + 'px';
    els.tooltip.style.top = (rect.bottom + 6) + 'px';
}

function hideTooltip() {
    els.tooltip.classList.add('hidden');
}

// ===== 替换预览 =====

function renderReplacePreview() {
    var replacement = els.replaceInput.value;

    // 没有替换内容或没有可用正则时隐藏预览
    if (!replacement || !state.regex || !els.textInput.value) {
        els.replacePreview.classList.add('hidden');
        els.replaceOutput.innerHTML = '';
        return;
    }

    var result = buildReplaceResult(els.textInput.value, state.regex, replacement);

    var html = '';
    for (var i = 0; i < result.segments.length; i++) {
        var seg = result.segments[i];
        if (seg.type === 'removed') {
            html += '<span class="diff-removed">' + escapeHtml(seg.text) + '</span>';
        } else if (seg.type === 'added') {
            html += '<span class="diff-added">' + escapeHtml(seg.text) + '</span>';
        } else {
            html += escapeHtml(seg.text);
        }
    }

    els.replaceOutput.innerHTML = html;
    els.replacePreview.classList.remove('hidden');
}

// ===== 模板列表 =====

function renderTemplates() {
    var html = '';
    for (var i = 0; i < REGEX_TEMPLATES.length; i++) {
        var t = REGEX_TEMPLATES[i];
        html += '<div class="template-item" data-index="' + i + '">' +
                '<div class="template-name">' + escapeHtml(t.name) + '</div>' +
                '<div class="template-pattern">' + escapeHtml(t.pattern) + '</div>' +
                '</div>';
    }
    els.templateItems.innerHTML = html;
}

function applyTemplate(idx) {
    var t = REGEX_TEMPLATES[idx];
    if (!t) return;
    els.regexInput.value = t.pattern;
    // 应用模板自带的 flags
    for (var f in state.flags) {
        state.flags[f] = t.flags.indexOf(f) !== -1;
    }
    updateFlagButtons();
    update();
    els.regexInput.focus();
}

function updateFlagButtons() {
    els.flagBtns.forEach(function (btn) {
        var flag = btn.getAttribute('data-flag');
        btn.classList.toggle('active', !!state.flags[flag]);
    });
}

// ===== 事件绑定 =====

function bindEvents() {
    var debouncedUpdate = debounce(update, 300);

    // 正则与测试文本输入：300ms 防抖实时匹配
    els.regexInput.addEventListener('input', debouncedUpdate);
    els.textInput.addEventListener('input', debouncedUpdate);

    // 替换输入也走防抖，实时预览
    els.replaceInput.addEventListener('input', debouncedUpdate);

    // 输入框滚动时同步高亮层
    els.textInput.addEventListener('scroll', syncScroll);

    // flags 切换按钮
    els.flagBtns.forEach(function (btn) {
        btn.addEventListener('click', function () {
            var flag = btn.getAttribute('data-flag');
            state.flags[flag] = !state.flags[flag];
            btn.classList.toggle('active', state.flags[flag]);
            update();
        });
    });

    // 详情项点击跳转（事件委托）
    els.matchList.addEventListener('click', function (e) {
        var item = e.target.closest('.match-item');
        if (item) {
            jumpToMatch(parseInt(item.getAttribute('data-index'), 10));
        }
    });

    // 高亮块悬停显示提示框（事件委托）
    els.highlightLayer.addEventListener('mouseover', function (e) {
        var span = e.target.closest('.match-highlight');
        if (span) {
            showTooltip(parseInt(span.getAttribute('data-index'), 10), span);
        }
    });
    els.highlightLayer.addEventListener('mouseout', function (e) {
        if (e.target.closest('.match-highlight')) {
            hideTooltip();
        }
    });

    // 模板点击填入（事件委托）
    els.templateItems.addEventListener('click', function (e) {
        var item = e.target.closest('.template-item');
        if (item) {
            applyTemplate(parseInt(item.getAttribute('data-index'), 10));
        }
    });
}

// ===== 初始化 =====

function initUI() {
    cacheElements();
    renderTemplates();
    bindEvents();

    // 示例数据，方便打开页面即可看到效果
    els.regexInput.value = '\\b\\w+@\\w+\\.\\w+\\b';
    els.textInput.value = '联系方式：\n张三 zhangsan@example.com\n李四 lisi@test.org\n备用邮箱 backup_01@mail-domain.cn\n电话：13812345678';
    els.replaceInput.value = '';

    update();
}

initUI();
