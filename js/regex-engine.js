// 正则匹配引擎模块
// 负责正则解析、匹配执行、捕获组提取与替换字符串展开
// 同时兼容浏览器（window.RegexEngine）与 Node 冒烟测试
(function (root) {
    'use strict';

    var MAX_MATCHES = 10000; // 防止空正则等场景产生过多匹配

    /**
     * 规范化 flags 字符串：去重、仅保留支持的标志
     */
    function normalizeFlags(flags) {
        var allowed = ['g', 'i', 'm', 's'];
        var seen = {};
        var out = '';
        String(flags || '').split('').forEach(function (f) {
            if (allowed.indexOf(f) !== -1 && !seen[f]) {
                seen[f] = true;
                out += f;
            }
        });
        return out;
    }

    /**
     * 将浏览器原生错误信息翻译为更易懂的中文提示
     */
    function translateError(message) {
        var raw = String(message || '');
        var brief = raw.split(':').pop().trim();
        var rules = [
            [/unterminated group/i, '括号未闭合：缺少对应的 ")"'],
            [/unterminated character class/i, '字符类未闭合：缺少对应的 "]"'],
            [/nothing to repeat/i, '量词无效："*"、"+"、"?" 或 "{n}" 前没有可重复的内容'],
            [/invalid group/i, '分组写法无效，请检查 "(?" 开头的语法'],
            [/invalid escape/i, '无效的转义序列：反斜杠后的字符不合法'],
            [/octal escape/i, '正则中不允许使用八进制转义'],
            [/invalid unicode/i, '无效的 Unicode 转义：\\u 后需要 4 位十六进制数'],
            [/invalid quantifier|lone quantifier/i, '量词写法无效，请检查 {} 的使用'],
            [/range out of order|character class range/i, '字符类中的范围顺序颠倒（例如 z-a）'],
            [/invalid property/i, '无效的 Unicode 属性名，请检查 \\p{...}'],
            [/bad.*surrogate|unicode/i, 'Unicode 模式下存在非法的代理项']
        ];
        for (var i = 0; i < rules.length; i++) {
            if (rules[i][0].test(raw)) {
                return rules[i][1];
            }
        }
        return brief || '正则表达式语法错误';
    }

    /**
     * 编译正则表达式
     * @returns {{regex: RegExp|null, error: string|null}}
     */
    function parseRegex(pattern, flags) {
        if (pattern === null || pattern === undefined || String(pattern).length === 0) {
            return { regex: null, error: null };
        }
        try {
            var regex = new RegExp(pattern, normalizeFlags(flags));
            return { regex: regex, error: null };
        } catch (e) {
            return { regex: null, error: translateError(e.message) };
        }
    }

    /**
     * 执行匹配，返回所有匹配结果
     * @returns {Array<{num:number, start:number, end:number, match:string, groups:Array, named:Object|null}>}
     */
    function executeMatch(text, regex) {
        var matches = [];
        if (!regex || text === null || text === undefined) {
            return matches;
        }
        // 内部统一加上 g 标志以便遍历全部匹配，不影响单次匹配语义展示
        var flags = regex.flags || '';
        if (flags.indexOf('g') === -1) {
            flags += 'g';
        }
        var re = new RegExp(regex.source, flags);
        var m;
        while ((m = re.exec(String(text))) !== null) {
            var groups = [];
            for (var i = 1; i < m.length; i++) {
                groups.push(m[i] === undefined ? null : m[i]);
            }
            matches.push({
                num: matches.length + 1,
                start: m.index,
                end: m.index + m[0].length,
                match: m[0],
                groups: groups,
                named: m.groups || null
            });
            if (matches.length >= MAX_MATCHES) {
                break;
            }
            if (m[0] === '') {
                re.lastIndex++; // 零宽匹配，手动推进避免死循环
            }
        }
        return matches;
    }

    /**
     * 展开替换字符串，支持 $$、$&、$`、$'、$1..$99、$<name>
     * @param {string} replacement 替换模板
     * @param {Object} m 单个匹配结果
     * @param {string} text 完整原文
     */
    function expandReplacement(replacement, m, text) {
        var repl = String(replacement || '');
        var out = '';
        var i = 0;

        function groupValue(n) {
            if (n >= 1 && n <= m.groups.length) {
                var v = m.groups[n - 1];
                return v === null ? '' : v;
            }
            return null;
        }

        while (i < repl.length) {
            var ch = repl.charAt(i);
            if (ch !== '$') {
                out += ch;
                i++;
                continue;
            }
            var next = repl.charAt(i + 1);
            if (next === '') {
                out += '$';
                break;
            }
            if (next === '$') {
                out += '$';
                i += 2;
            } else if (next === '&') {
                out += m.match;
                i += 2;
            } else if (next === '`') {
                out += String(text).slice(0, m.start);
                i += 2;
            } else if (next === "'") {
                out += String(text).slice(m.end);
                i += 2;
            } else if (next === '<') {
                var close = repl.indexOf('>', i + 2);
                var name = close === -1 ? '' : repl.slice(i + 2, close);
                if (close !== -1 && m.named && Object.prototype.hasOwnProperty.call(m.named, name)) {
                    out += m.named[name] || '';
                    i = close + 1;
                } else {
                    out += '$';
                    i++;
                }
            } else if (next >= '0' && next <= '9') {
                var d1 = parseInt(next, 10);
                var c2 = repl.charAt(i + 2);
                if (c2 >= '0' && c2 <= '9') {
                    var two = parseInt(repl.substr(i + 1, 2), 10);
                    var v2 = groupValue(two);
                    if (v2 !== null) {
                        out += v2;
                        i += 3;
                        continue;
                    }
                }
                var v1 = groupValue(d1);
                if (v1 !== null) {
                    out += v1;
                    i += 2;
                } else {
                    // 引用了不存在的分组时，按原生语义保留原字符
                    out += '$' + next;
                    i += 2;
                }
            } else {
                out += '$';
                i++;
            }
        }
        return out;
    }

    /**
     * 基于匹配结果构造替换分段（同时用于差异渲染与结果拼接）
     * @returns {{parts: Array<{type:'text'|'del'|'ins', value:string}>, result:string}}
     */
    function buildReplaceParts(text, matches, replacement, isGlobal) {
        text = String(text || '');
        var selected = isGlobal ? matches : matches.slice(0, 1);
        var parts = [];
        var result = '';
        var pos = 0;

        selected.forEach(function (m) {
            var before = text.slice(pos, m.start);
            var inserted = expandReplacement(replacement, m, text);
            parts.push({ type: 'text', value: before });
            parts.push({ type: 'del', value: m.match });
            parts.push({ type: 'ins', value: inserted });
            result += before + inserted;
            pos = m.end;
        });

        var tail = text.slice(pos);
        parts.push({ type: 'text', value: tail });
        result += tail;

        return { parts: parts, result: result };
    }

    /**
     * HTML 转义（同时转义引号，可安全用于属性）
     */
    function escapeHtml(str) {
        return String(str == null ? '' : str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    var api = {
        normalizeFlags: normalizeFlags,
        parseRegex: parseRegex,
        executeMatch: executeMatch,
        expandReplacement: expandReplacement,
        buildReplaceParts: buildReplaceParts,
        escapeHtml: escapeHtml,
        MAX_MATCHES: MAX_MATCHES
    };

    root.RegexEngine = api;
    // 兼容骨架中的全局函数命名
    root.parseRegex = parseRegex;
    root.executeMatch = executeMatch;
})(typeof window !== 'undefined' ? window : globalThis);
