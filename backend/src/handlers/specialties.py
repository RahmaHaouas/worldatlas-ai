"""Specialty + Product Search Service: GET /specialties?q=&category=, GET /specialties/{id}"""
from common import db
from common.retrieval import normalize
from common.util import ApiError, api_handler, path_params, query_params, respond, route_key, strip_keys, to_native


def score(spec, q):
    """Simple relevance score of a specialty for a free-text query."""
    if not q:
        return 1.0
    nq = normalize(q).strip()
    name = normalize(spec["name"]).strip()
    s = 0.0
    if nq == name:
        s += 10
    elif nq in name:
        s += 6
    for kw in spec.get("keywords", []):
        nk = normalize(kw).strip()
        if nq == nk:
            s += 5
        elif nq in nk or (len(nk) >= 4 and nk in nq):
            s += 2
    if nq in normalize(spec.get("description", "")):
        s += 1
    return s


def search(q, category=None):
    specs = [strip_keys(s) for s in to_native(db.query_index("GSI2", "SPECIALTIES"))]
    if category:
        specs = [s for s in specs if s["category"] == category]
    ranked = sorted(((score(s, q), s) for s in specs), key=lambda t: (-t[0], t[1]["name"]))
    return [s for sc, s in ranked if sc > 0]


def latest_trade(hs):
    meta = to_native(db.get("META", "TRADE") or {})
    for year in sorted(meta.get("years", []), reverse=True):
        items = to_native(db.query(f"TRADE#{hs}#{year}"))
        world = next((i for i in items if i["SK"] == "WORLD"), None)
        if world and world.get("status") == "ok":
            rows = sorted((strip_keys(i) for i in items if i["SK"].startswith("COUNTRY#")),
                          key=lambda r: -r["export_value"])
            return {"year": year, "world": strip_keys(world), "rows": rows}
    return None


def get_specialty(spec_id):
    spec = db.get(f"SPEC#{spec_id}", "META")
    if not spec:
        raise ApiError(404, f"Specialty '{spec_id}' not found")
    spec = strip_keys(to_native(spec))
    links = [strip_keys(l) for l in to_native(db.query_index("GSI1", f"SPEC#{spec_id}"))]
    links.sort(key=lambda l: ({"signature": 0, "major": 1}.get(l.get("importance"), 2), l["country_name"]))
    return {"specialty": spec, "countries": links,
            "trade": latest_trade(spec["hs_code"]) if spec.get("hs_code") else None}


@api_handler
def handler(event, context):
    method, path = route_key(event)
    if path == "/specialties":
        qp = query_params(event)
        results = search(qp.get("q", "").strip(), qp.get("category"))
        return respond(200, {"query": qp.get("q", ""), "results": results}, cache_seconds=300)
    if path.startswith("/specialties/"):
        return respond(200, get_specialty(path_params(event).get("id") or path.rsplit("/", 1)[-1]), cache_seconds=300)
    raise ApiError(404, "Route not found")
