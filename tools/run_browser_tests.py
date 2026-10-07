#!/usr/bin/env python3
"""Run the repo's Node-style check() test files in headless Firefox.

The project's tests (test_*.js) are plain scripts that ``require`` the
model-layer files and print "<N> checks, <M> failures". On machines without
Node (this one), the same scripts run unchanged in a browser: a small harness
page shims require/module/process, loads the libraries and the test, and
collects console output. Drives geckodriver over raw WebDriver (no selenium).

Usage: tools/run_browser_tests.py [test_progression.js [more.js ...]]
       (defaults to test_progression.js)
"""
import json
import os
import subprocess
import sys
import time
import urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PORT = 4445

# test file -> library files it requires (load order matters)
LIBS = {
    'test_progression.js': ['chords.js', 'sequences.js', 'progression.js'],
    'test_chords.js': ['chords.js'],
    'test_sequences.js': ['sequences.js'],
    'test_intervals.js': ['intervals.js', 'sequences.js'],
    'test_mnemonics.js': ['mnemonics.js'],
    'test_handbook.js': ['chords.js', 'sequences.js', 'intervals.js', 'mnemonics.js', 'handbook.js'],
}

HARNESS = """<!doctype html><meta charset="utf-8"><title>t</title><body>
<script>
window.__out = [];
window.__mods = {};
window.process = { exit: function (c) { window.__exit = c; } };
window.__dirname = '.';
window.path = { join: function () { return arguments[arguments.length - 1]; } };
window.require = function (n) {
    if (n === 'path') return window.path; // the only node builtin the tests use
    var key = String(n).replace(/^.*\\//, '');
    if (window.__mods[key]) return window.__mods[key];
    throw new Error('module not loaded: ' + key);
};
(function () {
    var log = console.log;
    console.log = function () {
        var parts = [];
        for (var i = 0; i < arguments.length; i++) parts.push(String(arguments[i]));
        window.__out.push(parts.join(' '));
        log.apply(console, arguments);
    };
})();
window.addEventListener('error', function (e) {
    window.__out.push('PAGE ERROR: ' + e.message + ' (@' + e.lineno + ')');
    window.__done = true;
});
</script>
%(libs)s
"""

LIB_BLOCK = """<script>window.module = { exports: {} };</script>
<script src="%(name)s?v=%(stamp)d"></script>
<script>window.__mods['%(name)s'] = window.module.exports; window.module = undefined;</script>"""


def drive(urls):
    proc = subprocess.Popen(['geckodriver', '--port', str(PORT)],
                            stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    time.sleep(1.5)

    def req(method, path, body=None):
        data = json.dumps(body).encode() if body is not None else None
        r = urllib.request.urlopen(urllib.request.Request(
            'http://127.0.0.1:%d%s' % (PORT, path), data=data, method=method,
            headers={'Content-Type': 'application/json'}), timeout=60)
        return json.loads(r.read() or b'{}')

    failed = False
    try:
        cap = {'capabilities': {'alwaysMatch': {'moz:firefoxOptions': {'args': ['--headless']}}}}
        sid = req('POST', '/session', cap)['value']['sessionId']
        for url in urls:
            req('POST', '/session/%s/url' % sid, {'url': url})
            for _ in range(600):  # 30 s per test file
                done = req('POST', '/session/%s/execute/sync' % sid,
                           {'script': 'return window.__done === true;', 'args': []})['value']
                if done:
                    break
                time.sleep(0.05)
            out = req('POST', '/session/%s/execute/sync' % sid,
                      {'script': 'return window.__out.join("\\n");', 'args': []})['value']
            print(out)
            failed = failed or ('failures' in out and not out.endswith('0 failures'))
            # reset for the next file
            req('POST', '/session/%s/execute/sync' % sid,
                {'script': 'window.__out = []; window.__done = false;', 'args': []})
        req('DELETE', '/session/%s' % sid)
    finally:
        proc.terminate()
    return 1 if failed else 0


def main():
    tests = sys.argv[1:] or ['test_progression.js']
    urls = []
    for t in tests:
        libs = LIBS.get(os.path.basename(t), [])
        import time as _t
        stamp = int(_t.time())
        html = HARNESS % {'libs': '\n'.join(LIB_BLOCK % {'name': l, 'stamp': stamp} for l in libs)}
        # the harness loads libraries by relative path — sit it in the repo root
        # .harness_*.html matches the repo's existing gitignore convention for
        # generated headless-verification pages
        page = os.path.join(ROOT, '.harness_%s.html' % os.path.basename(t))
        with open(page, 'w') as f:
            f.write(html + '\n<script src="%s"></script>\n' % t +
                    '<script>window.__done = true;</script>\n')
        urls.append('file://' + page)
    code = drive(urls)
    for u in urls:
        try:
            os.unlink(u[7:])
        except OSError:
            pass
    sys.exit(code)


if __name__ == '__main__':
    main()
