"""Trade Intelligence Service.

GET /trade/products                         tracked products, years, status
GET /trade/products/{hs}?year=              exporters of a product with RCA (latest year by default)
GET /trade/products/{hs}/history?countries= export value + RCA over the available years
GET /trade/countries/{iso3}?year=           RCA profile of a country across tracked products
"""
from common import db
from common.util import ApiError, api_handler, path_params, query_params, respond, route_key, strip_keys, to_native


def meta():
    m = to_native(db.get("META", "TRADE") or {})
    if not m:
        raise ApiError(503, "Trade data has not been synced yet. Start the WorldAtlas data pipeline.")
    return m


def product(hs, year=None):
    m = meta()
    years = sorted(m["years"], reverse=True) if year is None else [int(year)]
    for y in years:
        items = to_native(db.query(f"TRADE#{hs}#{y}"))
        world = next((i for i in items if i["SK"] == "WORLD"), None)
        if world and (world.get("status") == "ok" or year is not None):
            rows = sorted((strip_keys(i) for i in items if i["SK"].startswith("COUNTRY#")),
                          key=lambda r: -r["export_value"])
            return {"hs_code": hs, "year": y, "world": strip_keys(world), "rows": rows,
                    "available_years": m["years"]}
    raise ApiError(404, f"No usable trade data for HS {hs}")


def history(hs, countries):
    m = meta()
    series = []
    for y in sorted(m["years"]):
        items = {i["SK"]: i for i in to_native(db.query(f"TRADE#{hs}#{y}"))}
        world = items.get("WORLD", {})
        point = {"year": y, "status": world.get("status"),
                 "world_product_exports": world.get("world_product_exports"), "countries": {}}
        for c in countries:
            r = items.get(f"COUNTRY#{c}")
            point["countries"][c] = {"export_value": r["export_value"], "rca": r["rca"]} if r else None
        series.append(point)
    return {"hs_code": hs, "series": series}


def country(iso3, year=None):
    rows = to_native(db.query(f"COUNTRY#{iso3.upper()}", "RCA#"))
    if year:
        rows = [r for r in rows if r["year"] == int(year)]
    latest = {}
    for r in rows:
        if r["hs_code"] not in latest or r["year"] > latest[r["hs_code"]]["year"]:
            latest[r["hs_code"]] = strip_keys(r)
    return {"iso3": iso3.upper(), "products": sorted(latest.values(), key=lambda r: -r["rca"])}


@api_handler
def handler(event, context):
    _, path = route_key(event)
    qp, pp = query_params(event), path_params(event)
    if path == "/trade/products":
        m = meta()
        return respond(200, {"years": m["years"], "products": m["products"], "summary": m.get("summary", [])},
                       cache_seconds=300)
    if path.startswith("/trade/products/") and path.endswith("/history"):
        hs = pp.get("hs") or path.split("/")[3]
        codes = [c.strip().upper() for c in qp.get("countries", "").split(",") if c.strip()][:8]
        return respond(200, history(hs, codes), cache_seconds=300)
    if path.startswith("/trade/products/"):
        return respond(200, product(pp.get("hs") or path.rsplit("/", 1)[-1], qp.get("year")), cache_seconds=300)
    if path.startswith("/trade/countries/"):
        return respond(200, country(pp.get("iso3") or path.rsplit("/", 1)[-1], qp.get("year")), cache_seconds=300)
    raise ApiError(404, "Route not found")
