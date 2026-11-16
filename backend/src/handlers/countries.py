"""Country Service: GET /countries, /countries/{iso3}, /categories, /meta"""
from collections import Counter

from common import catalog, db
from common.util import ApiError, api_handler, path_params, respond, route_key, strip_keys, to_native

LIST_FIELDS = ("iso3", "iso2", "name", "region", "capital", "latitude", "longitude", "flag_url",
               "population", "population_year", "specialty_counts", "income_level")


def list_countries():
    items = to_native(db.query_index("GSI2", "COUNTRIES"))
    return [{k: i.get(k) for k in LIST_FIELDS} for i in items]


def latest_rca(iso3):
    rows = to_native(db.query(f"COUNTRY#{iso3}", "RCA#"))
    latest = {}
    for r in rows:
        if r["hs_code"] not in latest or r["year"] > latest[r["hs_code"]]["year"]:
            latest[r["hs_code"]] = r
    return sorted((strip_keys(r) for r in latest.values()), key=lambda r: -r["rca"])


def related_countries(iso3, links, limit=6):
    """Countries sharing the most specialties with this one."""
    counter = Counter()
    for link in links:
        for other in db.query_index("GSI1", f"SPEC#{link['specialty_id']}"):
            if other["iso3"] != iso3:
                counter[(other["iso3"], other.get("country_name", other["iso3"]))] += 1
    return [{"iso3": k[0], "name": k[1], "shared_specialties": n} for k, n in counter.most_common(limit)]


def get_country(iso3):
    iso3 = iso3.upper()
    profile = db.get(f"COUNTRY#{iso3}", "PROFILE")
    if not profile:
        raise ApiError(404, f"Country {iso3} not found. Run the data sync pipeline if the table is empty.")
    links = [strip_keys(l) for l in to_native(db.query(f"COUNTRY#{iso3}", "SPEC#"))]
    by_category = {c["category_id"]: [] for c in catalog.categories()}
    for link in sorted(links, key=lambda l: {"signature": 0, "major": 1}.get(l.get("importance"), 2)):
        by_category.setdefault(link["category"], []).append(link)
    return {
        "profile": strip_keys(to_native(profile)),
        "specialties": by_category,
        "specialty_total": len(links),
        "trade": latest_rca(iso3),
        "related": related_countries(iso3, links) if links else [],
    }


@api_handler
def handler(event, context):
    method, path = route_key(event)
    if path == "/countries":
        return respond(200, {"countries": list_countries()}, cache_seconds=300)
    if path.startswith("/countries/"):
        return respond(200, get_country(path_params(event).get("iso3") or path.rsplit("/", 1)[-1]), cache_seconds=300)
    if path == "/categories":
        return respond(200, {"categories": catalog.categories()}, cache_seconds=3600)
    if path == "/meta":
        meta = to_native(db.get("META", "SYNC") or {})
        return respond(200, {"sync": strip_keys(meta) if meta else None,
                             "sources": list(catalog.sources().values())}, cache_seconds=60)
    raise ApiError(404, "Route not found")
