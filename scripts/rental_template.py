"""Compile the supplied rental screen markup without a browser template runtime.

Only named values, dotted fields, loops and conditions are supported. Values are
escaped, and event handlers are registered by the screen, never evaluated from
HTML. Keeping the reference markup intact avoids rounding its layout values.
"""
from html import escape
from html.parser import HTMLParser
import json
import re

VOID = {'input', 'img', 'br', 'hr', 'meta', 'link', 'source'}
BINDING = re.compile(r'{{\s*([\w.]+)\s*}}')


class Template(HTMLParser):
    def __init__(self, namespace='rental'):
        super().__init__(convert_charrefs=True)
        self.namespace = namespace
        self.tree = []
        self.stack = [self.tree]
        self.hover = {}

    def handle_starttag(self, tag, attrs):
        node = [tag, dict(attrs), []]
        self.stack[-1].append(node)
        if tag not in VOID:
            self.stack.append(node[2])

    def handle_endtag(self, tag):
        if tag not in VOID:
            self.stack.pop()

    def handle_data(self, text):
        self.stack[-1].append(text)

    @staticmethod
    def value(path, names):
        assert re.fullmatch(r'[A-Za-z_]\w*(?:\.\w+)*|true|false', path), path
        return path if path.split('.')[0] in names or path in ('true', 'false') else 'v.' + path

    def interpolate(self, text, names, spans=False):
        parts, offset = [], 0
        for match in BINDING.finditer(text):
            parts.append(json.dumps(escape(text[offset:match.start()], quote=not spans), ensure_ascii=False))
            value = 'esc(' + self.value(match[1], names) + ')'
            parts.append(('"<span>"+' + value + '+"</span>"') if spans else value)
            offset = match.end()
        parts.append(json.dumps(escape(text[offset:], quote=not spans), ensure_ascii=False))
        return '+'.join(parts)

    def children(self, nodes, names):
        return '+'.join(self.node(node, names) for node in nodes) or '""'

    def node(self, node, names):
        if isinstance(node, str):
            return '(' + self.interpolate(node, names, spans=True) + ')'
        tag, attrs, nodes = node
        if tag == 'sc-if':
            value = self.value(BINDING.fullmatch(attrs['value'])[1], names)
            return '(' + value + '?(' + self.children(nodes, names) + '):"")'
        if tag == 'sc-for':
            value = self.value(BINDING.fullmatch(attrs['list'])[1], names)
            name = attrs['as']
            return '(' + value + '||[]).map(' + name + '=>' + self.children(nodes, names | {name}) + ').join("")'
        if 'style-hover' in attrs:
            css = attrs.pop('style-hover')
            key = self.hover.setdefault(css, self.namespace + '-hover-' + str(len(self.hover)))
            attrs['class'] = (attrs.get('class', '') + ' ' + key).strip()
        # The application's global icon sizing must not replace source SVG sizes.
        if tag == 'svg':
            attrs['style'] = attrs.get('style', '') + ';' + ';'.join(k + ':' + attrs[k] + 'px' for k in ('width', 'height') if k in attrs)
        out = [json.dumps('<' + tag)]
        for key, value in attrs.items():
            if key.startswith('hint-'):
                continue
            if key.startswith('on'):
                path = BINDING.fullmatch(value)[1]
                out += [json.dumps(' data-' + self.namespace + '-' + key[2:] + '="'), 'bind(' + self.value(path, names) + ',' + json.dumps(path) + ')', "'\"'"]
            elif key in ('disabled', 'readonly', 'checked') and BINDING.fullmatch(value or ''):
                expr = self.value(BINDING.fullmatch(value)[1], names)
                out.append('(' + expr + '?' + json.dumps(' ' + key) + ':"")')
            else:
                key = 'value' if key == 'defaultvalue' else key
                out += [json.dumps(' ' + key + '="'), self.interpolate(value or '', names), "'\"'"]
        out += [json.dumps('>'), self.children(nodes, names)]
        if tag not in VOID:
            out.append(json.dumps('</' + tag + '>'))
        return '(' + '+'.join(out) + ')'


def compile_rental_template(path, namespace='rental', view='SkiRentalView'):
    template = Template(namespace)
    template.feed(path.read_text())
    source = 'window.' + view + '=(v,bind,esc)=>' + template.children(template.tree, set()) + ';'
    css = '\n'.join('#ski-ops .' + name + ':hover:not(:disabled){' + rule + ' !important}' for rule, name in template.hover.items())
    return source, css
