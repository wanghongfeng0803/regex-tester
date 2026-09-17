// UI 交互控制模块
// 负责用户输入处理、结果渲染、事件绑定
(function () {
    'use strict';

    var E = window.RegexEngine;
    var DEBOUNCE_MS = 300;

    // ---------- 常用正则模板 ----------
    var REGEX_TEMPLATES = [
        { name: '邮箱', pattern: "[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\\.[A-Za-z]{2,}" },
        { name: '手机号', pattern: "1[3-9]\\d{9}" },
        { name: 'URL', pattern: "https?://[A-Za-z0-9.-]+(?::\\d+)?(?:/[^\\s]*)?" },
        { name: 'IP 地址', pattern: "(?:(?:25[0-5]|2[0-4]\\d|[01]?\\d\\d?)\\.){3}(?:25[0-5]|2[0-4]\\d|[01]?\\d\\d?)" },
        { name: '身份证号', pattern: "\\b\\d{17}[\\dXx]\\b" },
        { name: '日期 (YYYY-MM-DD)', pattern: "\\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\\d|3[01])" },
        { name: '数字（整数/小数）', pattern: "-?\\d+(?:\\.\\d+)?" },
        { name: '中文字符', pattern: "[一-龥]+" },
        { name: '邮政编码', pattern: "(?<!\\d)[1-9]\\d{5}(?!\\d)" },
        { name: '十六进制颜色码', pattern: "#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})\\b" }
    ];

    var SAMPLE_TEXT = [
        '欢迎使用正则表达式测试工具！',
        '联系方式：test.user@example.com，手机 13812345678。',
        '服务器地址 https://example.com:8080/path，IP 为 192.168.1.1。',
        '编号 007 的颜色是 #3FA950，价格 12.5 元，日期 2026-09-17。'
    ].join('\n');

    // ---------- 状态与 DOM 引用 ----------
    var state = {
        flags: { g: true, i: false, m: false, s: false },
        regex: null,      // 编译成功的 RegExp
        error: null,      // 编译错误信息
        matches: [],      // 当前全部匹配
        activeNum: null   // 当前选中的匹配序号
    };
    var dom = {};

    // ---------- 工具函数 ----------
    function $(id) { return document.getElementById(id); }

    function debounce(fn, wait) {
        var timer = null;
        return function () {
            var args = arguments, self = this;
            clearTimeout(timer);
            timer = setTimeout(function () { fn.apply(self, args); }, wait);
        };
    }

    function getFlagsString() {
        return ['g', 'i', 'm', 's'].filter(function (f) { return state.flags[f]; }).join('');
    }

    // ---------- 核心更新流程 ----------
    function recompute() {
        var pattern = dom.regexInput.value;
        var result = E.parseRegex(pattern, getFlagsString());
        state.regex = result.regex;
        state.error = result.error;

        if (state.error) {
            state.matches = [];
            state.activeNum = null;
        } else if (state.regex) {
            state.matches = E.executeMatch(dom.testText.value, state.regex);
            if (state.activeNum && !state.matches.some(function (m) { return m.num === state.activeNum; })) {
                state.activeNum = null;
            }
        } else {
            state.matches = [];
            state.activeNum = null;
        }

        renderError();
        renderMatchCount();
        renderHighlight();
        renderMatchDetails();
        renderReplacePreview();
        syncScroll();
    }

    var scheduleRegexRecompute = debounce(recompute, DEBOUNCE_MS);

    // ---------- 错误提示与统计 ----------
    function renderError() {
        if (state.error) {
            dom.errorBox.hidden = false;
            dom.errorText.textContent = state.error;
            dom.regexInput.classList.add('has-error');
        } else {
            dom.errorBox.hidden = true;
            dom.regexInput.classList.remove('has-error');
        }
    }

    function renderMatchCount() {
        dom.matchCount.classList.remove('has-matches', 'is-error');
        if (state.error) {
            dom.matchCount.textContent = '语法错误';
            dom.matchCount.classList.add('is-error');
        } else if (!state.regex) {
            dom.matchCount.textContent = '0 个匹配';
        } else if (state.matches.length >= E.MAX_MATCHES) {
            dom.matchCount.textContent = E.MAX_MATCHES + '+ 个匹配';
            dom.matchCount.classList.add('has-matches');
        } else {
            dom.matchCount.textContent = state.matches.length + ' 个匹配';
            if (state.matches.length > 0) {
                dom.matchCount.classList.add('has-matches');
            }
        }
    }

    // ---------- 测试文本高亮 ----------
    function buildHighlightHtml(text) {
        var html = '';
        var pos = 0;
        state.matches.forEach(function (m) {
            html += E.escapeHtml(text.slice(pos, m.start));
            var cls = 'match-mark';
            if (m.match === '') { cls += ' zero-width'; }
            if (m.num === state.activeNum) { cls += ' is-active'; }
            html += '<span class="' + cls + '" data-num="' + m.num + '">' +
                    E.escapeHtml(m.match) + '</span>';
            pos = m.end;
        });
        html += E.escapeHtml(text.slice(pos));
        // 末尾换行在 <pre> 中会折叠，补一个零宽空格以与 textarea 行高对齐
        if (text.length > 0 && text.charAt(text.length - 1) === '\n') {
            html += '&#8203;';
        }
        return html;
    }

    function renderHighlight() {
        dom.highlightCode.innerHTML = buildHighlightHtml(dom.testText.value);
    }

    function syncScroll() {
        dom.highlightLayer.scrollTop = dom.testText.scrollTop;
        dom.highlightLayer.scrollLeft = dom.testText.scrollLeft;
    }

    // ---------- 匹配详情面板 ----------
    function renderMatchDetails() {
        dom.matchDetails.innerHTML = '';

        if (!state.regex) {
            dom.matchDetails.innerHTML = '<div class="empty-tip">输入正则后将在此显示匹配详情</div>';
            return;
        }
        if (state.error) {
            dom.matchDetails.innerHTML = '<div class="empty-tip">正则表达式存在语法错误</div>';
            return;
        }
        if (state.matches.length === 0) {
            dom.matchDetails.innerHTML = '<div class="empty-tip">未找到匹配内容</div>';
            return;
        }

        var frag = document.createDocumentFragment();
        state.matches.forEach(function (m) {
            frag.appendChild(buildMatchCard(m));
        });
        dom.matchDetails.appendChild(frag);
    }

    function buildMatchCard(m) {
        var card = document.createElement('div');
        card.className = 'match-card' + (m.num === state.activeNum ? ' is-active' : '');
        card.dataset.num = String(m.num);

        var head = document.createElement('div');
        head.className = 'match-card-head';

        var num = document.createElement('span');
        num.className = 'match-num';
        num.textContent = '#' + m.num;

        var range = document.createElement('span');
        range.className = 'match-range';
        range.textContent = '位置 ' + m.start + ' - ' + m.end;

        head.appendChild(num);
        head.appendChild(range);
        card.appendChild(head);

        var content = document.createElement('div');
        content.className = 'match-content';
        if (m.match === '') {
            content.classList.add('is-empty');
            content.textContent = '（零宽匹配）';
        } else {
            content.textContent = m.match;
        }
        card.appendChild(content);

        if (m.groups.length > 0) {
            var groups = document.createElement('div');
            groups.className = 'match-groups';
            m.groups.forEach(function (g, idx) {
                var row = document.createElement('div');
                row.className = 'group-row';
                var name = document.createElement('span');
                name.className = 'group-name';
                name.textContent = 'group ' + (idx + 1) + ': ';
                var val = document.createElement('span');
                if (g === null) {
                    val.className = 'group-val undef';
                    val.textContent = '未参与匹配';
                } else if (g === '') {
                    val.className = 'group-val undef';
                    val.textContent = '空字符串';
                } else {
                    val.className = 'group-val';
                    val.textContent = g;
                }
                row.appendChild(name);
                row.appendChild(val);
                groups.appendChild(row);
            });
            card.appendChild(groups);
        }
        return card;
    }

    // ---------- 点击详情跳转到对应匹配 ----------
    function jumpToMatch(num) {
        state.activeNum = num;
        renderHighlight();
        renderMatchDetails();

        var mark = dom.highlightCode.querySelector('.match-mark[data-num="' + num + '"]');
        if (mark) {
            var rects = mark.getClientRects();
            var markRect = rects[0] || mark.getBoundingClientRect();
            var wrapRect = dom.editorWrap.getBoundingClientRect();
            var target = dom.testText.scrollTop + markRect.top - wrapRect.top - 60;
            dom.testText.scrollTop = Math.max(0, target);
            syncScroll();
        }

        var m = state.matches[num - 1];
        if (m) {
            dom.testText.focus();
            dom.testText.setSelectionRange(m.start, m.end);
        }
    }

    // ---------- 悬停高亮块显示详情 ----------
    function findMatchNumAtPoint(x, y) {
        var marks = dom.highlightCode.querySelectorAll('.match-mark');
        for (var i = 0; i < marks.length; i++) {
            var rects = marks[i].getClientRects();
            for (var j = 0; j < rects.length; j++) {
                var r = rects[j];
                if (x >= r.left - 2 && x <= r.right + 2 && y >= r.top && y <= r.bottom) {
                    return parseInt(marks[i].dataset.num, 10);
                }
            }
        }
        return null;
    }

    function showTooltip(num, x, y) {
        var m = state.matches[num - 1];
        if (!m) { return; }
        var rows = [
            ['匹配序号', '#' + m.num],
            ['匹配内容', m.match === '' ? '（零宽匹配）' : m.match],
            ['起始位置', String(m.start)],
            ['结束位置', String(m.end)]
        ];
        m.groups.forEach(function (g, idx) {
            var text;
            if (g === null) { text = '未参与匹配'; }
            else if (g === '') { text = '空字符串'; }
            else { text = g; }
            rows.push(['group ' + (idx + 1), text]);
        });

        dom.tooltip.innerHTML =
            '<div class="tooltip-title">匹配详情</div>' +
            rows.map(function (r) {
                var empty = (r[1] === '（零宽匹配）') ? ' is-empty' : '';
                return '<div class="tooltip-row"><span class="tooltip-key">' + E.escapeHtml(r[0]) +
                       '：</span><span class="tooltip-val' + empty + '">' +
                       E.escapeHtml(r[1]) + '</span></div>';
            }).join('');
        dom.tooltip.hidden = false;

        var tipW = dom.tooltip.offsetWidth;
        var tipH = dom.tooltip.offsetHeight;
        var left = x + 14;
        var top = y + 14;
        if (left + tipW > window.innerWidth - 8) { left = x - tipW - 14; }
        if (top + tipH > window.innerHeight - 8) { top = y - tipH - 14; }
        dom.tooltip.style.left = left + 'px';
        dom.tooltip.style.top = top + 'px';
    }

    function bindTooltip() {
        dom.editorWrap.addEventListener('mousemove', function (e) {
            if (state.matches.length === 0) { return; }
            var num = findMatchNumAtPoint(e.clientX, e.clientY);
            if (num === null) {
                dom.tooltip.hidden = true;
                dom.editorWrap.classList.remove('is-hovering-match');
            } else {
                dom.editorWrap.classList.add('is-hovering-match');
                showTooltip(num, e.clientX, e.clientY);
            }
        });
        dom.editorWrap.addEventListener('mouseleave', function () {
            dom.tooltip.hidden = true;
            dom.editorWrap.classList.remove('is-hovering-match');
        });
    }

    // ---------- 替换功能 ----------
    function renderReplacePreview() {
        var text = dom.testText.value;
        var repl = dom.replaceInput.value;
        dom.replaceScope.textContent = state.flags.g ? '全局替换' : '仅替换首个';

        if (!state.regex || state.error || state.matches.length === 0) {
            dom.diffBefore.innerHTML = E.escapeHtml(text) || '<span style="color:var(--muted)">（无文本）</span>';
            dom.diffAfter.innerHTML = E.escapeHtml(text) || '<span style="color:var(--muted)">（无文本）</span>';
            return;
        }

        var built = E.buildReplaceParts(text, state.matches, repl, state.flags.g);
        var beforeHtml = '';
        var afterHtml = '';
        built.parts.forEach(function (p) {
            if (p.type === 'text') {
                beforeHtml += E.escapeHtml(p.value);
                afterHtml += E.escapeHtml(p.value);
            } else if (p.type === 'del') {
                beforeHtml += '<span class="diff-del">' + E.escapeHtml(p.value) + '</span>';
            } else {
                afterHtml += '<span class="diff-ins">' + E.escapeHtml(p.value) + '</span>';
            }
        });
        dom.diffBefore.innerHTML = beforeHtml;
        dom.diffAfter.innerHTML = afterHtml;
    }

    // ---------- 常用正则模板 ----------
    function renderTemplates() {
        var frag = document.createDocumentFragment();
        REGEX_TEMPLATES.forEach(function (tpl) {
            var li = document.createElement('li');
            var btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'template-btn';
            btn.title = '点击填入：' + tpl.pattern;

            var name = document.createElement('span');
            name.className = 'template-name';
            name.textContent = tpl.name;

            var pattern = document.createElement('span');
            pattern.className = 'template-pattern';
            pattern.textContent = tpl.pattern;

            btn.appendChild(name);
            btn.appendChild(pattern);
            btn.addEventListener('click', function () {
                dom.regexInput.value = tpl.pattern;
                recompute();
                dom.regexInput.focus();
            });
            li.appendChild(btn);
            frag.appendChild(li);
        });
        dom.templateUl.appendChild(frag);
    }

    // ---------- flags 切换 ----------
    function bindFlags() {
        dom.flags.addEventListener('click', function (e) {
            var btn = e.target.closest('.flag-btn');
            if (!btn) { return; }
            var flag = btn.dataset.flag;
            state.flags[flag] = !state.flags[flag];
            btn.classList.toggle('is-active', state.flags[flag]);
            recompute();
        });
    }

    // ---------- 事件绑定 ----------
    function bindEvents() {
        dom.regexInput.addEventListener('input', scheduleRegexRecompute);
        dom.testText.addEventListener('input', recompute);
        dom.testText.addEventListener('scroll', syncScroll);
        dom.replaceInput.addEventListener('input', renderReplacePreview);

        dom.matchDetails.addEventListener('click', function (e) {
            var card = e.target.closest('.match-card');
            if (card) { jumpToMatch(parseInt(card.dataset.num, 10)); }
        });

        bindFlags();
        bindTooltip();
    }

    function cacheDom() {
        dom.regexInput = $('regex-input');
        dom.flags = $('flags');
        dom.matchCount = $('match-count');
        dom.errorBox = $('regex-error');
        dom.errorText = $('regex-error-text');
        dom.testText = $('test-text');
        dom.editorWrap = $('editor-wrap');
        dom.highlightLayer = $('highlight-layer');
        dom.highlightCode = $('highlight-code');
        dom.matchDetails = $('match-details');
        dom.replaceInput = $('replace-input');
        dom.replaceScope = $('replace-scope');
        dom.diffBefore = $('diff-before');
        dom.diffAfter = $('diff-after');
        dom.templateUl = $('template-ul');
        dom.tooltip = $('match-tooltip');
    }

    // ---------- 初始化 ----------
    function initUI() {
        cacheDom();
        renderTemplates();
        bindEvents();
        dom.testText.value = SAMPLE_TEXT;
        recompute();
    }

    initUI();
})();
