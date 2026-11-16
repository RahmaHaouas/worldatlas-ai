"""Comparison Service: GET /compare?countries=TUN,ESP[,ITA...]

Only actual stored values are compared. Indicators carry their own reference year and
the response flags when years differ between countries (not strictly comparable).
"""
from common import catalog, db
from common.util import ApiError, api_handler, query_params, respond, strip_keys, to_native

MAX_COUNTRIES = 5


def load(iso3):
    items = to_native(db.query(f"COUNTRY#{iso3}"))
    profile = next((i for i in items if i["SK"] == "PROFILE"), None)
    if not profile:
        raise ApiError(404, f"Country {iso3} not found")
    links = [strip_keys(i) for i in items if i["SK"].startswith("SPEC#")]
    rca = {}
    for i in items:
        if i["SK"].startswith("RCA#") and (i["hs_code"] not in rca or i["year"] > rca[i["hs_code"]]["year"]):
            rca[i["hs_code"]] = strip_keys(i)
    return strip_keys(profile), links, rca


def indicator(profiles, field, year_field, label, unit):
    values = [{"iso3": p["iso3"], "value": p.get(field), "year": p.get(year_field)} for p in profiles]
    years = {v["year"] for v in values if v["value"] is not None}
    return {"id": field, "label": label, "unit": unit, "values": values,
            "comparable": len(years) <= 1,
            "note": None if len(years) <= 1 else "Reference years differ between countries."}


def compare(codes):
    data = [load(c) for c in codes]
    profiles = [d[0] for d in data]
    cats = catalog.categories()

    dimensions = []
    for c in cats:
        dimensions.append({"category_id": c["category_id"], "category_name": c["category_name"],
                           "values": [{"iso3": p["iso3"],
                                       "count": sum(1 for l in links if l["category"] == c["category_id"]),
                                       "items": [l["specialty_name"] for l in links if l["category"] == c["category_id"]]}
                                      for p, links, _ in data]})

    spec_sets = [{l["specialty_id"]: l["specialty_name"] for l in links} for _, links, _ in data]
    shared_ids = set.intersection(*(set(s) for s in spec_sets)) if spec_sets else set()
    shared = [{"specialty_id": i, "name": spec_sets[0][i]} for i in sorted(shared_ids)]
    unique = {p["iso3"]: [{"specialty_id": i, "name": n} for i, n in s.items() if i not in shared_ids]
              for p, s in zip(profiles, spec_sets)}

    products = {}
    for p, _, rca in data:
        for hs, r in rca.items():
            products.setdefault(hs, {"hs_code": hs, "product_name": r.get("product_name"), "values": []})
    for prod in products.values():
        for p, _, rca in data:
            r = rca.get(prod["hs_code"])
            prod["values"].append({"iso3": p["iso3"], "year": r["year"] if r else None,
                                   "export_value": r["export_value"] if r else None,
                                   "share_of_world": r["share_of_world"] if r else None,
                                   "rca": r["rca"] if r else None})
        years = {v["year"] for v in prod["values"] if v["year"]}
        prod["comparable"] = len(years) <= 1
    trade = sorted(products.values(),
                   key=lambda t: -max((v["export_value"] or 0) for v in t["values"]))

    return {
        "countries": [{k: p.get(k) for k in ("iso3", "name", "flag_url", "region", "capital")} for p in profiles],
        "indicators": [indicator(profiles, "population", "population_year", "Population", "people"),
                       indicator(profiles, "area_km2", "area_year", "Surface area", "km²")],
        "dimensions": dimensions,
        "shared_specialties": shared,
        "unique_specialties": unique,
        "trade": trade,
    }


@api_handler
def handler(event, context):
    raw = query_params(event).get("countries", "")
    codes = list(dict.fromkeys(c.strip().upper() for c in raw.split(",") if c.strip()))
    if len(codes) < 2:
        raise ApiError(400, "Provide at least two ISO3 codes, e.g. ?countries=TUN,ESP")
    if len(codes) > MAX_COUNTRIES:
        raise ApiError(400, f"Compare at most {MAX_COUNTRIES} countries at once")
    return respond(200, compare(codes), cache_seconds=300)
