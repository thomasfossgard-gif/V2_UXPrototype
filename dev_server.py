#!/usr/bin/env python3
"""Dev server for UXPrototype.

Extends SimpleHTTPRequestHandler with POST /save-visual-styles, which
rewrites the VISUAL_STYLES_DEFAULT block in index.html. Used by the
Visuals tab's "Save to Code" button so visual tweaks become defaults
without leaving the browser.
"""
import http.server
import json
import os
import re
import subprocess
import sys
from pathlib import Path

# Windows: exit immediately when the console window is closed (CTRL_CLOSE_EVENT).
# Without this, closing the window leaves Python running on the port.
if sys.platform == 'win32':
    import ctypes
    import ctypes.wintypes as _wt
    _HANDLER = ctypes.WINFUNCTYPE(_wt.BOOL, _wt.DWORD)
    @_HANDLER
    def _win_ctrl(event):
        if event == 2:  # CTRL_CLOSE_EVENT
            os._exit(0)
        return False
    ctypes.windll.kernel32.SetConsoleCtrlHandler(_win_ctrl, True)

PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8765
ROOT = Path(__file__).parent.resolve()
INDEX = ROOT / 'index.html'
NOTES = ROOT / 'notes.json'

VS_BLOCK_PATTERN      = re.compile(r'const VISUAL_STYLES_DEFAULT = \{[\s\S]*?\n\};')
PATHFIND_PATTERN      = re.compile(r'const PATHFIND_PARAMS = \{[\s\S]*?\n\};')
SMELTER_PARAMS_PATTERN  = re.compile(r'const SMELTER_PARAMS = \{[\s\S]*?\n\};')
WORKER_TIMINGS_PATTERN  = re.compile(r'const WORKER_TIMINGS = \{[\s\S]*?\n\};')
MONEY_PARAMS_PATTERN    = re.compile(r'const MONEY_PARAMS = \{[\s\S]*?\n\};')
THIRST_PARAMS_PATTERN   = re.compile(r'const THIRST_PARAMS = \{[\s\S]*?\n\};')
# Use bracket counting to find the workers array — regex can't handle nested [...] inside.
def _find_workers_array(text):
    """Return (prefix_end, array_start, array_end+1) indices for palette.workers [...].
    prefix_end: index right after 'workers:' whitespace (start of '[')
    Returns None if not found."""
    m = re.search(r'const palette\s*=\s*\{[^[]*workers:\s*', text, re.DOTALL)
    if not m:
        return None
    arr_start = m.end()
    if arr_start >= len(text) or text[arr_start] != '[':
        return None
    depth = 0
    i = arr_start
    in_str = None
    while i < len(text):
        c = text[i]
        if in_str:
            if c == '\\':
                i += 2
                continue
            if c == in_str:
                in_str = None
        elif c in ('"', "'"):
            in_str = c
        elif c == '[':
            depth += 1
        elif c == ']':
            depth -= 1
            if depth == 0:
                return (m.start(), arr_start, i + 1)
        i += 1
    return None

def _replace_workers_array(text, new_workers_js):
    """Replace the palette.workers [...] with new_workers_js. Returns new text."""
    result = _find_workers_array(text)
    if result is None:
        raise RuntimeError('palette.workers array not found in index.html')
    _, arr_start, arr_end = result
    return text[:arr_start] + new_workers_js + text[arr_end:]
# Matches the BUNDLED_LEVEL constant (single-line compact JSON)
BUNDLED_LEVEL_PATTERN = re.compile(r'(const BUNDLED_LEVEL = )(\{[^\n]*\});')
WORKER_CHATTER_PATTERN = re.compile(r'const WORKER_STATE_CHATTER = \{[\s\S]*?\n\};')
CHILL_PHRASES_PATTERN  = re.compile(r'const CHILL_PHRASES = \[[\s\S]*?\n\];')
CHILL_CHANCE_PATTERN   = re.compile(r'let _chillChatterChance = [0-9.]+;')
DURATION_MS_PATTERN    = re.compile(r'(durationMs:\s*)\d+')

JS_IDENT = re.compile(r'^[A-Za-z_$][A-Za-z0-9_$]*$')


def js_string(s):
    """Serialize a Python string as a single-quoted JS string literal."""
    out = ["'"]
    for ch in s:
        if ch == '\\':
            out.append('\\\\')
        elif ch == "'":
            out.append("\\'")
        elif ch == '\n':
            out.append('\\n')
        elif ch == '\r':
            out.append('\\r')
        elif ch == '\t':
            out.append('\\t')
        elif ord(ch) < 0x20:
            out.append('\\u%04x' % ord(ch))
        else:
            out.append(ch)
    out.append("'")
    return ''.join(out)


def js_serialize(value, indent=2, level=1):
    """Serialize a Python value as a JS literal matching the project's style:
    unquoted keys when they're valid identifiers, single-quoted strings, trailing
    commas after every item.
    """
    if value is None:
        return 'null'
    if isinstance(value, bool):
        return 'true' if value else 'false'
    if isinstance(value, (int, float)):
        return json.dumps(value)
    if isinstance(value, str):
        return js_string(value)
    if isinstance(value, list):
        if not value:
            return '[]'
        prefix = ' ' * (indent * level)
        outer = ' ' * (indent * (level - 1))
        items = ',\n'.join(prefix + js_serialize(v, indent, level + 1) for v in value)
        return '[\n' + items + ',\n' + outer + ']'
    if isinstance(value, dict):
        if not value:
            return '{}'
        prefix = ' ' * (indent * level)
        outer = ' ' * (indent * (level - 1))
        lines = []
        for k, v in value.items():
            key = k if (isinstance(k, str) and JS_IDENT.match(k)) else json.dumps(k)
            lines.append(prefix + key + ': ' + js_serialize(v, indent, level + 1))
        return '{\n' + ',\n'.join(lines) + ',\n' + outer + '}'
    raise ValueError(f'Unsupported type: {type(value).__name__}')


class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def do_GET(self):
        if self.path == '/git-branch':
            try:
                result = subprocess.run(
                    ['git', 'rev-parse', '--abbrev-ref', 'HEAD'],
                    capture_output=True, text=True, cwd=str(ROOT)
                )
                branch = result.stdout.strip() if result.returncode == 0 else 'unknown'
            except Exception:
                branch = 'unknown'
            self._json_response(200, {'branch': branch, 'folder': ROOT.name})
        else:
            super().do_GET()

    def do_POST(self):
        length = int(self.headers.get('Content-Length', '0'))
        try:
            data = json.loads(self.rfile.read(length))
        except Exception as e:
            self._json_response(400, {'ok': False, 'error': f'Invalid JSON: {e}'})
            return

        if self.path == '/save-visual-styles':
            try:
                self._patch_index(data)
            except Exception as e:
                self._json_response(500, {'ok': False, 'error': str(e)})
                return
            self._json_response(200, {'ok': True})

        elif self.path == '/save-gameplay-params':
            try:
                self._patch_gameplay_params(data)
            except Exception as e:
                self._json_response(500, {'ok': False, 'error': str(e)})
                return
            self._json_response(200, {'ok': True})

        elif self.path == '/save-worker-palette':
            try:
                self._patch_worker_palette(data)
            except Exception as e:
                self._json_response(500, {'ok': False, 'error': str(e)})
                return
            self._json_response(200, {'ok': True})

        elif self.path == '/save-worker-props':
            try:
                self._patch_worker_props(data)
            except Exception as e:
                self._json_response(500, {'ok': False, 'error': str(e)})
                return
            self._json_response(200, {'ok': True})

        elif self.path == '/save-thirst-params':
            try:
                self._patch_thirst_params(data)
            except Exception as e:
                self._json_response(500, {'ok': False, 'error': str(e)})
                return
            self._json_response(200, {'ok': True})

        elif self.path == '/save-talking':
            try:
                self._patch_talking(data)
            except Exception as e:
                self._json_response(500, {'ok': False, 'error': str(e)})
                return
            self._json_response(200, {'ok': True})

        elif self.path == '/save-notes':
            try:
                NOTES.write_text(json.dumps(data, indent=2, ensure_ascii=False), encoding='utf-8')
            except Exception as e:
                self._json_response(500, {'ok': False, 'error': str(e)})
                return
            self._json_response(200, {'ok': True})

        elif self.path == '/save-bundled-level':
            try:
                self._patch_bundled_level(data)
            except Exception as e:
                self._json_response(500, {'ok': False, 'error': str(e)})
                return
            self._json_response(200, {'ok': True})

        else:
            self.send_error(404, 'Unknown endpoint')

    def _patch_index(self, data):
        text = INDEX.read_text(encoding='utf-8')
        if not VS_BLOCK_PATTERN.search(text):
            raise RuntimeError('VISUAL_STYLES_DEFAULT block not found in index.html')
        body = js_serialize(data)
        new_block = 'const VISUAL_STYLES_DEFAULT = ' + body + ';'
        # lambda replacement so backslashes in JSON aren't interpreted as backreferences.
        new_text = VS_BLOCK_PATTERN.sub(lambda m: new_block, text, count=1)
        INDEX.write_text(new_text, encoding='utf-8')

    def _patch_worker_palette(self, workers_data):
        text = INDEX.read_text(encoding='utf-8')
        text = _replace_workers_array(text, js_serialize(workers_data))
        # Also sync BUNDLED_LEVEL's palette.workers so page reload doesn't revert changes.
        bl_match = BUNDLED_LEVEL_PATTERN.search(text)
        if bl_match:
            try:
                bl = json.loads(bl_match.group(2))
                keep_fields = {'id', 'kind', 'color', 'capacity', 'name', 'chipCount'}
                bl.setdefault('palette', {})['workers'] = [
                    {k: v for k, v in w.items() if k in keep_fields}
                    for w in workers_data
                ]
                new_bl = json.dumps(bl, separators=(',', ':'), ensure_ascii=False)
                text = BUNDLED_LEVEL_PATTERN.sub(
                    lambda m: m.group(1) + new_bl + ';', text, count=1
                )
            except Exception as e:
                raise RuntimeError(f'BUNDLED_LEVEL patch failed: {e}')
        INDEX.write_text(text, encoding='utf-8')

    def _patch_worker_props(self, data):
        workers_data = data.get('workers')
        pathfind = data.get('pathfind')
        smelter  = data.get('smelter')
        worker   = data.get('worker')
        money    = data.get('money')
        if workers_data is None or pathfind is None or smelter is None or worker is None:
            raise ValueError("Expected {workers: [...], pathfind: {...}, smelter: {...}, worker: {...}}")
        text = INDEX.read_text(encoding='utf-8')
        # Patch palette.workers
        text = _replace_workers_array(text, js_serialize(workers_data))
        # Sync BUNDLED_LEVEL palette.workers
        bl_match = BUNDLED_LEVEL_PATTERN.search(text)
        if bl_match:
            try:
                bl = json.loads(bl_match.group(2))
                keep_fields = {'id', 'kind', 'color', 'capacity', 'name', 'chipCount'}
                bl.setdefault('palette', {})['workers'] = [
                    {k: v for k, v in w.items() if k in keep_fields}
                    for w in workers_data
                ]
                new_bl = json.dumps(bl, separators=(',', ':'), ensure_ascii=False)
                text = BUNDLED_LEVEL_PATTERN.sub(
                    lambda m: m.group(1) + new_bl + ';', text, count=1
                )
            except Exception as e:
                raise RuntimeError(f'BUNDLED_LEVEL patch failed: {e}')
        # Patch gameplay params
        if not PATHFIND_PATTERN.search(text):
            raise RuntimeError('PATHFIND_PARAMS block not found in index.html')
        if not SMELTER_PARAMS_PATTERN.search(text):
            raise RuntimeError('SMELTER_PARAMS block not found in index.html')
        if not WORKER_TIMINGS_PATTERN.search(text):
            raise RuntimeError('WORKER_TIMINGS block not found in index.html')
        text = PATHFIND_PATTERN.sub(
            lambda m: 'const PATHFIND_PARAMS = ' + js_serialize(pathfind) + ';', text, count=1)
        text = SMELTER_PARAMS_PATTERN.sub(
            lambda m: 'const SMELTER_PARAMS = ' + js_serialize(smelter) + ';', text, count=1)
        text = WORKER_TIMINGS_PATTERN.sub(
            lambda m: 'const WORKER_TIMINGS = ' + js_serialize(worker) + ';', text, count=1)
        if money is not None and MONEY_PARAMS_PATTERN.search(text):
            text = MONEY_PARAMS_PATTERN.sub(
                lambda m: 'const MONEY_PARAMS = ' + js_serialize(money) + ';', text, count=1)
        thirst = data.get('thirst')
        if thirst is not None and THIRST_PARAMS_PATTERN.search(text):
            text = THIRST_PARAMS_PATTERN.sub(
                lambda m: 'const THIRST_PARAMS = ' + js_serialize(thirst) + ';', text, count=1)
        INDEX.write_text(text, encoding='utf-8')

    def _patch_bundled_level(self, level_data):
        text = INDEX.read_text(encoding='utf-8')
        new_bl = json.dumps(level_data, separators=(',', ':'), ensure_ascii=False)
        text, n = BUNDLED_LEVEL_PATTERN.subn(lambda m: m.group(1) + new_bl + ';', text, count=1)
        if n == 0:
            raise ValueError('BUNDLED_LEVEL not found in index.html')
        INDEX.write_text(text, encoding='utf-8')

    def _patch_gameplay_params(self, data):
        text = INDEX.read_text(encoding='utf-8')
        pathfind = data.get('pathfind')
        smelter  = data.get('smelter')
        worker   = data.get('worker')
        money    = data.get('money')
        if pathfind is None or smelter is None or worker is None:
            raise ValueError("Expected {pathfind: {...}, smelter: {...}, worker: {...}}")
        if not PATHFIND_PATTERN.search(text):
            raise RuntimeError('PATHFIND_PARAMS block not found in index.html')
        if not SMELTER_PARAMS_PATTERN.search(text):
            raise RuntimeError('SMELTER_PARAMS block not found in index.html')
        if not WORKER_TIMINGS_PATTERN.search(text):
            raise RuntimeError('WORKER_TIMINGS block not found in index.html')
        text = PATHFIND_PATTERN.sub(
            lambda m: 'const PATHFIND_PARAMS = ' + js_serialize(pathfind) + ';', text, count=1)
        text = SMELTER_PARAMS_PATTERN.sub(
            lambda m: 'const SMELTER_PARAMS = ' + js_serialize(smelter) + ';', text, count=1)
        text = WORKER_TIMINGS_PATTERN.sub(
            lambda m: 'const WORKER_TIMINGS = ' + js_serialize(worker) + ';', text, count=1)
        if money is not None and MONEY_PARAMS_PATTERN.search(text):
            text = MONEY_PARAMS_PATTERN.sub(
                lambda m: 'const MONEY_PARAMS = ' + js_serialize(money) + ';', text, count=1)
        INDEX.write_text(text, encoding='utf-8')

    def _patch_thirst_params(self, data):
        thirst = data.get('thirst')
        if thirst is None:
            raise ValueError("Expected {thirst: {...}}")
        text = INDEX.read_text(encoding='utf-8')
        if not THIRST_PARAMS_PATTERN.search(text):
            raise RuntimeError('THIRST_PARAMS block not found in index.html')
        text = THIRST_PARAMS_PATTERN.sub(
            lambda m: 'const THIRST_PARAMS = ' + js_serialize(thirst) + ';', text, count=1)
        INDEX.write_text(text, encoding='utf-8')

    def _patch_talking(self, data):
        chatter         = data.get('chatter')
        chill_phrases   = data.get('chill_phrases')
        chill_chance    = data.get('chill_chance')
        bubble_duration = data.get('bubble_duration')
        workers_data    = data.get('workers')
        if any(v is None for v in [chatter, chill_phrases, chill_chance, bubble_duration]):
            raise ValueError('Expected {chatter, chill_phrases, chill_chance, bubble_duration}')
        text = INDEX.read_text(encoding='utf-8')
        if not WORKER_CHATTER_PATTERN.search(text):
            raise RuntimeError('WORKER_STATE_CHATTER block not found')
        if not CHILL_PHRASES_PATTERN.search(text):
            raise RuntimeError('CHILL_PHRASES block not found')
        if not CHILL_CHANCE_PATTERN.search(text):
            raise RuntimeError('_chillChatterChance declaration not found')
        text = WORKER_CHATTER_PATTERN.sub(
            lambda m: 'const WORKER_STATE_CHATTER = ' + js_serialize(chatter) + ';', text, count=1)
        text = CHILL_PHRASES_PATTERN.sub(
            lambda m: 'const CHILL_PHRASES = ' + js_serialize(chill_phrases) + ';', text, count=1)
        text = CHILL_CHANCE_PATTERN.sub(
            lambda m: f'let _chillChatterChance = {round(chill_chance, 4)};', text, count=1)
        text = DURATION_MS_PATTERN.sub(
            lambda m: m.group(1) + str(int(bubble_duration)), text, count=1)
        if workers_data is not None and _find_workers_array(text) is not None:
            text = _replace_workers_array(text, js_serialize(workers_data))
            # Sync BUNDLED_LEVEL palette.workers so page reload doesn't revert phrase changes.
            bl_match = BUNDLED_LEVEL_PATTERN.search(text)
            if bl_match:
                try:
                    bl = json.loads(bl_match.group(2))
                    keep_fields = {'id', 'kind', 'color', 'capacity', 'name', 'chipCount'}
                    bl.setdefault('palette', {})['workers'] = [
                        {k: v for k, v in w.items() if k in keep_fields}
                        for w in workers_data
                    ]
                    new_bl = json.dumps(bl, separators=(',', ':'), ensure_ascii=False)
                    text = BUNDLED_LEVEL_PATTERN.sub(
                        lambda m: m.group(1) + new_bl + ';', text, count=1)
                except Exception as e:
                    raise RuntimeError(f'BUNDLED_LEVEL patch failed: {e}')
        INDEX.write_text(text, encoding='utf-8')

    def _json_response(self, code, body):
        payload = json.dumps(body).encode('utf-8')
        self.send_response(code)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Content-Length', str(len(payload)))
        self.end_headers()
        self.wfile.write(payload)

    def log_message(self, fmt, *args):
        sys.stderr.write('[%s] %s\n' % (self.log_date_time_string(), fmt % args))


def main():
    server = http.server.ThreadingHTTPServer(('', PORT), Handler)
    print(f'Serving {ROOT} on http://localhost:{PORT}')
    print('  POST /save-visual-styles   -> writes index.html (VISUAL_STYLES_DEFAULT)')
    print('  POST /save-gameplay-params -> writes index.html (PATHFIND_PARAMS + SMELTER_PARAMS + WORKER_TIMINGS)')
    print('  POST /save-worker-palette  -> writes index.html (palette.workers)')
    print('  POST /save-worker-props    -> writes index.html (palette.workers + gameplay params in one shot)')
    print('  POST /save-talking         -> writes index.html (WORKER_STATE_CHATTER + CHILL_PHRASES + chance + bubble duration)')
    print('  POST /save-notes           -> writes notes.json')
    print('  POST /save-bundled-level   -> writes index.html (BUNDLED_LEVEL)')
    print('Ctrl+C to stop.')
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print('\nStopped.')


if __name__ == '__main__':
    main()
