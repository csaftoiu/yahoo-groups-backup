import re

import yaml


class Redaction:
    def __init__(self, src, redaction, ignorecase=False):
        self.src = src
        self.redaction = redaction
        self.ignorecase = ignorecase

        self._srcre = re.compile(re.escape(src), flags=re.IGNORECASE if self.ignorecase else 0)

    @classmethod
    def from_spec(cls, spec):
        """Load the redaction from a spec loaded from the redactions .yaml file."""
        ignorecase = False
        if 'ignorecase' in spec:
            ignorecase = True
            spec = spec['ignorecase']

        assert isinstance(spec, dict) and len(spec) == 1
        src, redaction = list(spec.items())[0]
        return Redaction(src, redaction, ignorecase=ignorecase)

    def apply(self, text):
        if not text:
            return text

        return re.sub(self._srcre, self.redaction, text)


class Redactions:
    def __init__(self, redactions):
        self.redactions = redactions

    @classmethod
    def from_spec(cls, specs):
        return Redactions([Redaction.from_spec(spec) for spec in specs])

    def apply(self, text):
        for r in self.redactions:
            text = r.apply(text)
        return text


def load_redactions(f):
    """Load redactions from a file object."""
    return Redactions.from_spec(yaml.load(f))
