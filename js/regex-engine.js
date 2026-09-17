// 正则匹配引擎模块
// 负责正则解析、匹配执行、捕获组提取、替换计算

/**
 * 解析正则表达式
 * @param {string} pattern 正则源码
 * @param {string} flags 标志位字符串，如 "gim"
 * @returns {{ regex: RegExp|null, error: string|null }}
 */
function parseRegex(pattern, flags) {
    if (!pattern) {
        return { regex: null, error: null };
    }
    try {
        return { regex: new RegExp(pattern, flags), error: null };
    } catch (e) {
        // e.message 形如 "Invalid regular expression: /.../: 原因"，提取原因部分
        var msg = e.message || '未知错误';
        var colonIdx = msg.lastIndexOf(':');
        if (colonIdx > -1 && msg.indexOf('Invalid regular expression') === 0) {
            msg = msg.slice(colonIdx + 1).trim();
        }
        return { regex: null, error: msg };
    }
}

/**
 * 执行匹配，返回所有匹配结果
 * @param {string} text 待匹配文本
 * @param {RegExp} regex 正则对象
 * @returns {Array<{ index:number, match:string, groups:Array, start:number, end:number }>}
 */
function executeMatch(text, regex) {
    var matches = [];
    if (!regex || !text) {
        return matches;
    }

    // 无 g 标志时只取第一个匹配；有 g 时遍历全部
    if (!regex.global) {
        var m = regex.exec(text);
        if (m) {
            matches.push(buildMatchRecord(m, 1));
        }
        return matches;
    }

    regex.lastIndex = 0;
    var result;
    var guard = 0;
    var MAX = 10000; // 安全上限，防止极端情况卡死
    while ((result = regex.exec(text)) !== null && guard < MAX) {
        matches.push(buildMatchRecord(result, matches.length + 1));
        // 零长度匹配时手动推进，避免死循环
        if (result[0].length === 0) {
            regex.lastIndex++;
        }
        guard++;
    }
    return matches;
}

/**
 * 构造单条匹配记录
 */
function buildMatchRecord(execResult, index) {
    return {
        index: index,
        match: execResult[0],
        groups: execResult.slice(1), // 捕获组（未参与的组为 undefined）
        start: execResult.index,
        end: execResult.index + execResult[0].length
    };
}

/**
 * 计算替换结果，并生成用于差异展示的片段列表
 * @param {string} text 原文
 * @param {RegExp} regex 正则对象
 * @param {string} replacement 替换字符串（支持 $1、$2 等）
 * @returns {{ result:string, segments:Array<{type:string, text:string}> }}
 *   segments 中 type 取值：same（未变）/ removed（被替换掉的原文）/ added（替换后的新内容）
 */
function buildReplaceResult(text, regex, replacement) {
    if (!regex) {
        return { result: text, segments: [{ type: 'same', text: text }] };
    }

    // 逐匹配计算替换后的字符串（利用 replace 回调拿到每次匹配的捕获组）
    var replacedParts = [];
    var result = text.replace(regex, function () {
        var args = Array.prototype.slice.call(arguments);
        var matchStr = args[0];
        var offset, groups;
        // 含命名捕获组时回调最后会多一个 groups 对象参数，需要区分
        if (typeof args[args.length - 1] === 'object' && args[args.length - 1] !== null) {
            offset = args[args.length - 3];
            groups = args.slice(1, args.length - 3);
        } else {
            offset = args[args.length - 2];
            groups = args.slice(1, args.length - 2);
        }
        var replaced = expandReplacement(replacement, matchStr, groups);
        replacedParts.push({ offset: offset, match: matchStr, replaced: replaced });
        return replaced;
    });

    // 依据 replacedParts 生成 diff 片段
    var segments = [];
    var cursor = 0;
    for (var i = 0; i < replacedParts.length; i++) {
        var part = replacedParts[i];
        if (part.offset > cursor) {
            segments.push({ type: 'same', text: text.slice(cursor, part.offset) });
        }
        if (part.match.length > 0) {
            segments.push({ type: 'removed', text: part.match });
        }
        if (part.replaced.length > 0) {
            segments.push({ type: 'added', text: part.replaced });
        }
        cursor = part.offset + part.match.length;
    }
    if (cursor < text.length) {
        segments.push({ type: 'same', text: text.slice(cursor) });
    }

    return { result: result, segments: segments };
}

/**
 * 手动展开替换字符串中的特殊引用
 * 支持：$$（字面 $）、$&（整个匹配）、$1-$99（捕获组）
 * @param {string} replacement 替换模板
 * @param {string} matchStr 当前匹配到的文本
 * @param {Array} groups 捕获组数组（未参与的组为 undefined）
 * @returns {string}
 */
function expandReplacement(replacement, matchStr, groups) {
    return replacement.replace(/\$(\$|&|\d{1,2})/g, function (token, ref) {
        if (ref === '$') return '$';
        if (ref === '&') return matchStr;
        var num = parseInt(ref, 10);
        // 两位数引用超出组数时，按一位数 + 字面数字处理（与 JS 原生行为一致）
        if (num > groups.length && num > 9) {
            var tens = Math.floor(num / 10);
            if (tens <= groups.length) {
                return (groups[tens - 1] || '') + String(num % 10);
            }
            return token;
        }
        if (num >= 1 && num <= groups.length) {
            return groups[num - 1] === undefined ? '' : groups[num - 1];
        }
        return token;
    });
}
