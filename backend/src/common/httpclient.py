"""Dependency-free HTTP JSON client with retries (stdlib urllib only)."""
import json
import time
import urllib.error
import urllib.parse
import urllib.request

USER_AGENT = "WorldAtlasAI/1.0 (+https://github.com/; serverless data sync)"


def get_bytes(url, params=None, headers=None, retries=3, timeout=45, backoff=2.0):
    if params:
        url = f"{url}?{urllib.parse.urlencode(params)}"
    last = None
    for attempt in range(retries):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT, **(headers or {})})
            with urllib.request.urlopen(req, timeout=timeout) as resp:
                return resp.read()
        except urllib.error.HTTPError as e:
            last = e
            if e.code not in (429, 500, 502, 503, 504):
                raise
        except (urllib.error.URLError, TimeoutError) as e:
            last = e
        time.sleep(backoff * (attempt + 1))
    raise RuntimeError(f"GET {url} failed after {retries} attempts: {last}")


def get_json(url, params=None, headers=None, **kwargs):
    return json.loads(get_bytes(url, params=params, headers=headers, **kwargs))
