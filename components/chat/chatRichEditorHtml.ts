/** Inline HTML for WebView contentEditable compose field (mirrors Next.js ChatRichComposeInput). */
export const CHAT_RICH_EDITOR_HTML = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  html, body {
    height: 100%;
    background: transparent;
    -webkit-text-size-adjust: 100%;
  }
  #editor {
    min-height: 36px;
    max-height: 120px;
    overflow-y: auto;
    padding: 10px 12px;
    font-size: 14px;
    line-height: 1.35;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    color: #292966;
    outline: none;
    -webkit-user-select: text;
    word-break: break-word;
    -webkit-tap-highlight-color: transparent;
  }
  #editor:empty:before {
    content: attr(data-placeholder);
    color: #8A8FA8;
    pointer-events: none;
  }
</style>
</head>
<body>
<div id="editor" contenteditable="true" data-placeholder="Type a message"></div>
<script>
  const editor = document.getElementById('editor');
  const NEST_ORDER = ['bold', 'italic', 'underline', 'strike'];

  function post(obj) {
    if (window.ReactNativeWebView) {
      window.ReactNativeWebView.postMessage(JSON.stringify(obj));
    }
  }

  function normalizeFormats(formats) {
    return NEST_ORDER.filter(function (f) { return formats.indexOf(f) !== -1; });
  }

  function formatsEqual(a, b) {
    if (a.length !== b.length) return false;
    for (var i = 0; i < NEST_ORDER.length; i++) {
      var f = NEST_ORDER[i];
      var inA = a.indexOf(f) !== -1;
      var inB = b.indexOf(f) !== -1;
      if (inA !== inB) return false;
    }
    return true;
  }

  function openDelimiter(format) {
    if (format === 'bold') return '**';
    if (format === 'italic') return '*';
    if (format === 'underline') return '<u>';
    if (format === 'strike') return '~~';
    return '';
  }

  function closeDelimiter(format) {
    if (format === 'bold') return '**';
    if (format === 'italic') return '*';
    if (format === 'underline') return '</u>';
    if (format === 'strike') return '~~';
    return '';
  }

  function commonPrefixLength(a, b) {
    var i = 0;
    while (i < a.length && i < b.length && a[i] === b[i]) i++;
    return i;
  }

  function syncFormatDelimiters(current, target) {
    var cur = normalizeFormats(current);
    var tgt = normalizeFormats(target);
    var prefix = commonPrefixLength(cur, tgt);
    var delta = '';
    for (var i = cur.length - 1; i >= prefix; i--) delta += closeDelimiter(cur[i]);
    for (var j = prefix; j < tgt.length; j++) delta += openDelimiter(tgt[j]);
    return { nextCurrent: tgt, delta: delta };
  }

  var BLOCK_TAGS = { div: 1, p: 1, h1: 1, h2: 1, h3: 1, h4: 1, h5: 1, h6: 1, blockquote: 1, pre: 1, li: 1 };

  function segmentsEndWithNewline(segments) {
    var last = segments[segments.length - 1];
    return !!(last && last.text && last.text.charAt(last.text.length - 1) === '\\n');
  }

  function isEmptyBlockElement(el) {
    return !(el.textContent || '').replace(/\\u00a0/g, '').trim();
  }

  function isBlockTag(tag) {
    return Object.prototype.hasOwnProperty.call(BLOCK_TAGS, tag);
  }

  function getFormatsFromElement(el) {
    var tag = el.tagName.toLowerCase();
    var formats = [];
    if (tag === 'b' || tag === 'strong') formats.push('bold');
    if (tag === 'i' || tag === 'em') formats.push('italic');
    if (tag === 'u') formats.push('underline');
    if (tag === 's' || tag === 'strike' || tag === 'del') formats.push('strike');
    if (tag === 'span') {
      var style = (el.getAttribute('style') || '').toLowerCase();
      if (/font-weight:\\s*(bold|[7-9]00)/.test(style)) formats.push('bold');
      if (/font-style:\\s*italic/.test(style)) formats.push('italic');
      if (/text-decoration[^;]*underline/.test(style)) formats.push('underline');
      if (/line-through/.test(style)) formats.push('strike');
    }
    return formats;
  }

  function splitSegmentByEdgeWhitespace(segment) {
    var formats = normalizeFormats(segment.formats);
    if (!formats.length || !/\\s/.test(segment.text)) return [segment];
    var leading = (segment.text.match(/^\\s*/) || [''])[0];
    var trailing = (segment.text.match(/\\s*$/) || [''])[0];
    var core = segment.text.slice(leading.length, segment.text.length - trailing.length);
    var parts = [];
    if (leading) parts.push({ text: leading, formats: [] });
    if (core) parts.push({ text: core, formats: formats });
    if (trailing) parts.push({ text: trailing, formats: [] });
    return parts.length ? parts : [{ text: segment.text, formats: [] }];
  }

  function normalizeSegments(segments) {
    var split = [];
    for (var s = 0; s < segments.length; s++) {
      var pieces = splitSegmentByEdgeWhitespace(segments[s]);
      split = split.concat(pieces);
    }
    var merged = [];
    for (var i = 0; i < split.length; i++) {
      var segment = { text: split[i].text, formats: normalizeFormats(split[i].formats) };
      if (!segment.text) continue;
      var last = merged[merged.length - 1];
      if (last && formatsEqual(last.formats, segment.formats)) {
        last.text += segment.text;
      } else {
        merged.push(segment);
      }
    }
    return merged;
  }

  function collectSegments(node, inherited) {
    var segments = [];
    if (node.nodeType === Node.TEXT_NODE) {
      var text = (node.textContent || '').replace(/\\u00a0/g, ' ');
      if (text) segments.push({ text: text, formats: normalizeFormats(inherited) });
      return segments;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return segments;
    var el = node;
    var tag = el.tagName.toLowerCase();
    if (tag === 'br') {
      segments.push({ text: '\\n', formats: normalizeFormats(inherited) });
      return segments;
    }
    if (isBlockTag(tag) && isEmptyBlockElement(el)) {
      segments.push({ text: '\\n', formats: [] });
      return segments;
    }
    var nodeFormats = getFormatsFromElement(el);
    var combined = normalizeFormats(inherited.concat(nodeFormats));
    var children = el.childNodes;
    for (var i = 0; i < children.length; i++) {
      var child = children[i];
      segments = segments.concat(collectSegments(child, combined));
      if (child.nodeType === Node.ELEMENT_NODE) {
        var childEl = child;
        var childTag = childEl.tagName.toLowerCase();
        if (isBlockTag(childTag) && !isEmptyBlockElement(childEl) && !segmentsEndWithNewline(segments)) {
          segments.push({ text: '\\n', formats: [] });
        }
      }
    }
    return segments;
  }

  function serializeSegments(segments) {
    var result = '';
    var currentFormats = [];
    for (var i = 0; i < segments.length; i++) {
      var segment = segments[i];
      if (!formatsEqual(currentFormats, segment.formats)) {
        var synced = syncFormatDelimiters(currentFormats, segment.formats);
        result += synced.delta;
        currentFormats = synced.nextCurrent;
      }
      result += segment.text;
    }
    for (var j = currentFormats.length - 1; j >= 0; j--) {
      result += closeDelimiter(currentFormats[j]);
    }
    return result;
  }

  function editorHtmlToMarkdown(html) {
    var trimmed = (html || '').trim();
    if (!trimmed || trimmed === '<br>' || trimmed === '<div><br></div>') return '';
    var div = document.createElement('div');
    div.innerHTML = trimmed;
    var segments = normalizeSegments(collectSegments(div, []));
    return serializeSegments(segments).replace(/\\n{3,}/g, '\\n\\n').trim();
  }

  function getFormatState() {
    try {
      return {
        bold: document.queryCommandState('bold'),
        italic: document.queryCommandState('italic'),
        underline: document.queryCommandState('underline'),
        strikeThrough: document.queryCommandState('strikeThrough'),
      };
    } catch (e) {
      return { bold: false, italic: false, underline: false, strikeThrough: false };
    }
  }

  function notify() {
    var html = editor.innerHTML;
    post({
      type: 'change',
      html: html,
      markdown: editorHtmlToMarkdown(html),
      plain: (editor.innerText || '').replace(/\\u00a0/g, ' ').trim(),
      height: Math.min(Math.max(editor.scrollHeight, 36), 120),
      format: getFormatState(),
    });
  }

  editor.addEventListener('input', notify);
  editor.addEventListener('keyup', notify);
  editor.addEventListener('mouseup', notify);
  editor.addEventListener('focus', notify);

  document.addEventListener('selectionchange', function () {
    var sel = document.getSelection();
    if (!sel || !sel.anchorNode || !editor.contains(sel.anchorNode)) return;
    post({ type: 'format', format: getFormatState() });
  });

  window.handleNativeCommand = function (cmd) {
    editor.focus();
    if (cmd === 'clear') {
      editor.innerHTML = '';
      editor.style.height = '36px';
      notify();
      return;
    }
    document.execCommand(cmd, false);
    notify();
  };

  window.insertTextAtSelection = function (text) {
    if (!text) return;
    editor.focus();
    document.execCommand('insertText', false, text);
    notify();
  };

  window.setEditorEnabled = function (enabled) {
    editor.contentEditable = enabled ? 'true' : 'false';
  };

  post({ type: 'ready' });
</script>
</body>
</html>`;
