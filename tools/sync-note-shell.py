"""Apply the shared note shell without rewriting any article content."""
import hashlib
from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]
SITE = ROOT / 'site'

def version(relative):
    return hashlib.sha256((SITE / relative).read_bytes()).hexdigest()[:12]

HEADER = ('<header class="topnav"><nav aria-label="Notes navigation">'
          '<a href="../index.html#note">Notes</a>'
          '<button id="egg" type="button" title="彩蛋" aria-label="彩蛋">???</button>'
          '<button id="tiger-egg" type="button" title="老虎爆炸彩蛋" aria-label="老虎爆炸彩蛋">???</button>'
          '</nav></header>')
BACK = ('<button class="back-to-top" type="button" aria-label="Back to top" title="Back to top" hidden>'
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true">'
        '<path d="M12 19V5m-6 6 6-6 6 6"/></svg><span>TOP</span></button>')

def sync(source):
    original_main = re.search(r'<main\b[\s\S]*?</main>', source).group()
    css_version = version('assets/css/note.css')
    js_version = version('assets/js/note.js')
    def head(match):
        content = re.sub(r'<style\b[^>]*>[\s\S]*?</style>', '', match[1], flags=re.I)
        content = re.sub(r'<link\b[^>]*>', lambda m: '' if re.search(r'\brel=["\']stylesheet["\']', m[0], re.I) else m[0], content, flags=re.I)
        return ('<head>' + content.rstrip() + '\n'
                '<link rel="stylesheet" href="../assets/katex/katex.min.css">\n'
                '<link rel="stylesheet" href="../assets/css/note.css?v=' + css_version + '">\n</head>')
    source, count = re.subn(r'<head\b[^>]*>([\s\S]*?)</head>', head, source, count=1, flags=re.I)
    assert count == 1
    def body_class(match):
        attrs = match[1]
        current = re.search(r'\bclass=(["\'])(.*?)\1', attrs)
        if current:
            classes = current[2].split()
            if 'note-page' not in classes: classes.append('note-page')
            attrs = attrs[:current.start()] + 'class="' + ' '.join(classes) + '"' + attrs[current.end():]
        else:
            attrs += ' class="note-page"'
        return '<body' + attrs + '>'
    source = re.sub(r'<body\b([^>]*)>', body_class, source, count=1, flags=re.I)
    source, count = re.subn(r'<header\b[^>]*class=["\'][^"\']*\btopnav\b[^"\']*["\'][^>]*>[\s\S]*?</header>', HEADER, source, count=1, flags=re.I)
    assert count == 1
    source = re.sub(r'<button\b[^>]*class=["\'][^"\']*\bback-to-top\b[^"\']*["\'][^>]*>[\s\S]*?</button>', '', source, flags=re.I)
    assert not re.search(r'<script\b(?![^>]*\bsrc=)[^>]*>', source, re.I), 'Inspect inline scripts before normalization.'
    source = re.sub(r'<script\b[^>]*>[\s\S]*?</script>', '', source, flags=re.I)
    ending = source.lower().rfind('</body>')
    assert ending >= 0
    additions = []
    if not re.search(r'\bid=["\']fx["\']', source): additions.append('<canvas id="fx" aria-hidden="true"></canvas>')
    if not re.search(r'\bid=["\']fx-flash["\']', source): additions.append('<div id="fx-flash" aria-hidden="true"></div>')
    additions.append(BACK)
    scripts = [('assets/katex/katex.min.js', None), ('assets/js/note.js', js_version),
               ('assets/js/celebration.js', version('assets/js/celebration.js')),
               ('assets/js/tiger-celebration.js', version('assets/js/tiger-celebration.js'))]
    additions.extend('<script src="../' + name + ('?v=' + token if token else '') + '" defer></script>' for name, token in scripts)
    source = source[:ending].rstrip() + '\n' + '\n'.join(additions) + '\n' + source[ending:]
    assert re.search(r'<main\b[\s\S]*?</main>', source).group() == original_main, 'Article content changed.'
    return source

def main():
    changed = []
    for file in sorted((SITE / 'notes').glob('*.html')):
        raw = file.read_bytes()
        before = raw.decode('utf-8')
        after = sync(before)
        assert sync(after) == after, 'Shell synchronization must be idempotent.'
        if before != after:
            file.write_bytes(after.encode('utf-8'))
            changed.append(file.name)
    print('Synchronized ' + str(len(changed)) + ' note shells: ' + ', '.join(changed))

if __name__ == '__main__': main()
