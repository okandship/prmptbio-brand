"""Static file server for the studio, with browser caching turned off.

`python3 -m http.server` sends `Last-Modified` and nothing else, so browsers fall back to
heuristic freshness — about 10% of the file's age — and will serve an edited file straight
from cache without asking. Nothing here is content-hashed, so `no-store` is what keeps a
reload honest.
"""

import http.server
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PORT = 8123


class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *a, **kw):
        super().__init__(*a, directory=str(ROOT), **kw)   # serve the repo, whatever the cwd

    def end_headers(self):
        self.send_header('Cache-Control', 'no-store')
        super().end_headers()


if __name__ == '__main__':
    # HTTP/1.1 for keep-alive: a build fetches one OBJ per glyph, and a connection each is slow
    http.server.test(HandlerClass=Handler, protocol='HTTP/1.1', port=PORT, bind='127.0.0.1')
