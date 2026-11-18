#!/usr/bin/env python3
"""Check the shared presentation contract for the site's note pages.

Uses only the Python standard library. It deliberately does not validate
ordinary article hyperlinks or reinterpret mathematical content.
"""

import argparse
from collections import Counter
import hashlib
from html.parser import HTMLParser
import json
from pathlib import Path
import sys
from urllib.parse import unquote, urlsplit, parse_qs


VOID_ELEMENTS = {
    'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link',
    'meta', 'param', 'source', 'track', 'wbr',
}
STYLESHEET_PATHS = [
    '../assets/katex/katex.min.css',
    '../assets/css/note.css',
]
SCRIPT_PATHS = [
    '../assets/katex/katex.min.js',
    '../assets/js/note.js',
    '../assets/js/celebration.js',
    '../assets/js/tiger-celebration.js',
]


class NotePage(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.in_head = False
        self.head_style_count = 0
        self.h1_count = 0
        self.back_to_top_count = 0
        self.back_to_top_tags = []
        self.stylesheets = []
        self.scripts = []
        self.resources = []
        self.inline_scripts = []
        self.navigations = []
        self._nav_depth = 0
        self._nav_tokens = []
        self._inline_script = None

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        classes = attrs.get('class', '').split()
        if tag == 'head':
            self.in_head = True
        if tag == 'style' and self.in_head:
            self.head_style_count += 1
        if tag == 'h1':
            self.h1_count += 1
        if 'back-to-top' in classes:
            self.back_to_top_count += 1
            self.back_to_top_tags.append(tag)

        if 'topnav' in classes and not self._nav_depth:
            self._nav_depth = 1
            self._nav_tokens = [('start', tag, sorted(attrs.items()))]
        elif self._nav_depth:
            self._nav_tokens.append(('start', tag, sorted(attrs.items())))
            if tag not in VOID_ELEMENTS:
                self._nav_depth += 1

        if tag == 'link' and 'stylesheet' in attrs.get('rel', '').lower().split():
            self.stylesheets.append(attrs.get('href', ''))
            self.resources.append(('stylesheet', attrs.get('href', '')))
        if tag == 'script':
            if attrs.get('src'):
                self.scripts.append(attrs['src'])
                self.resources.append(('script', attrs['src']))
            else:
                self._inline_script = []
        if tag in {'img', 'source', 'audio', 'video', 'track'} and attrs.get('src'):
            self.resources.append((tag, attrs['src']))
        if tag == 'video' and attrs.get('poster'):
            self.resources.append(('poster', attrs['poster']))
        if tag == 'image':
            reference = attrs.get('href') or attrs.get('xlink:href')
            if reference:
                self.resources.append(('svg image', reference))

    def handle_startendtag(self, tag, attrs):
        self.handle_starttag(tag, attrs)
        if tag not in VOID_ELEMENTS:
            self.handle_endtag(tag)

    def handle_endtag(self, tag):
        if self._nav_depth:
            self._nav_tokens.append(('end', tag))
            self._nav_depth -= 1
            if not self._nav_depth:
                self.navigations.append(self._nav_tokens)
                self._nav_tokens = []
        if tag == 'script' and self._inline_script is not None:
            source = ''.join(self._inline_script).strip()
            if source:
                self.inline_scripts.append(source)
            self._inline_script = None
        if tag == 'head':
            self.in_head = False

    def handle_data(self, data):
        if self._inline_script is not None:
            self._inline_script.append(data)
        if self._nav_depth:
            text = ' '.join(data.split())
            if text:
                self._nav_tokens.append(('text', text))


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()[:12]


def resource_path(page, site, reference):
    """Resolve local display resources, not article or theorem hyperlinks."""
    parsed = urlsplit(reference)
    if parsed.scheme or parsed.netloc or not parsed.path:
        return None
    relative = unquote(parsed.path)
    if relative.startswith('/'):
        return site / relative.lstrip('/')
    return page.parent / relative


def check(root):
    site = root / 'site'
    notes = sorted((site / 'notes').glob('*.html'))
    shared = {
        'css': site / 'assets/css/note.css',
        'js': site / 'assets/js/note.js',
    }
    errors = []
    versions = {}
    for kind, path in shared.items():
        if path.is_file():
            versions[kind] = digest(path)
        else:
            errors.append('Missing shared resource: ' + path.relative_to(root).as_posix())
    if not notes:
        errors.append('No note pages found under site/notes.')

    expected_styles = [STYLESHEET_PATHS[0],
                       STYLESHEET_PATHS[1] + '?v=' + versions.get('css', '<missing>')]
    reference_nav = None
    reference_scripts = None
    reference_page = None
    pages = []
    for page in notes:
        parsed = NotePage()
        parsed.feed(page.read_text(encoding='utf-8'))
        parsed.close()
        problems = []
        if parsed.head_style_count:
            problems.append('Remove head <style> blocks; use the shared note.css.')
        if parsed.h1_count != 1:
            problems.append('Expected exactly one h1; found ' + str(parsed.h1_count) + '.')
        if parsed.back_to_top_count != 1:
            problems.append('Expected one back-to-top control; found '
                            + str(parsed.back_to_top_count) + '.')
        elif parsed.back_to_top_tags != ['button']:
            problems.append('The back-to-top control must be a button.')
        if parsed.stylesheets != expected_styles:
            problems.append('Stylesheets must be KaTeX CSS followed by '
                            + '../assets/css/note.css?v=' + versions.get('css', '<missing>') + '.')

        script_paths = [urlsplit(source).path for source in parsed.scripts]
        if Counter(script_paths) != Counter(SCRIPT_PATHS):
            problems.append('Expected exactly the shared KaTeX, note, celebration and tiger scripts.')
        else:
            if script_paths.index(SCRIPT_PATHS[0]) > script_paths.index(SCRIPT_PATHS[1]):
                problems.append('KaTeX must load before note.js.')
            note_source = parsed.scripts[script_paths.index(SCRIPT_PATHS[1])]
            if note_source != SCRIPT_PATHS[1] + '?v=' + versions.get('js', '<missing>'):
                problems.append('note.js version must match its SHA-256 prefix: '
                                + versions.get('js', '<missing>') + '.')
        if parsed.inline_scripts:
            problems.append('Move inline scripts into the shared note.js.')

        if len(parsed.navigations) != 1:
            problems.append('Expected exactly one .topnav navigation.')
        else:
            if reference_nav is None:
                reference_nav = parsed.navigations[0]
                reference_scripts = parsed.scripts
                reference_page = page.name
            else:
                if parsed.navigations[0] != reference_nav:
                    problems.append('Navigation markup differs from ' + reference_page + '.')
                if parsed.scripts != reference_scripts:
                    problems.append('Script order or versions differ from ' + reference_page + '.')

        for kind, reference in parsed.resources:
            target = resource_path(page, site, reference)
            if target is not None and not target.is_file():
                problems.append('Missing local ' + kind + ' resource: ' + reference)
        # Keep duplicate resource failures concise when a missing include repeats.
        problems = list(dict.fromkeys(problems))
        pages.append({'page': page.relative_to(root).as_posix(), 'errors': problems})
    return {'ok': not errors and all(not page['errors'] for page in pages),
            'note_count': len(notes), 'versions': versions,
            'errors': errors, 'pages': pages}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--root', type=Path,
                        default=Path(__file__).resolve().parents[1],
                        help='Repository root (defaults to the parent of tools).')
    parser.add_argument('--json', action='store_true', help='Print the check receipt as JSON.')
    args = parser.parse_args()
    result = check(args.root.resolve())
    if args.json:
        print(json.dumps(result, ensure_ascii=True, indent=2))
    elif result['ok']:
        print('PASS: ' + str(result['note_count']) + ' notes use the shared layout, navigation and resources.')
        print('CSS version: ' + result['versions']['css'] + '; JS version: ' + result['versions']['js'])
    else:
        print('FAIL: note presentation checks found issues.')
        for error in result['errors']:
            print('  ' + error)
        for page in result['pages']:
            for error in page['errors']:
                print('  ' + page['page'] + ': ' + error)
    return 0 if result['ok'] else 1


if __name__ == '__main__':
    sys.exit(main())
