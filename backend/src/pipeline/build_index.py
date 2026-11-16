"""Step Functions task: build the RAG knowledge index (JSON in S3) from DynamoDB and record sync status."""
import os

from common import catalog, db
from common.util import now_iso, to_dynamo, to_native


def latest_trade(products, years):
    trade = {}
    for p in products:
        hs = p["hs_code"]
        for year in sorted(years, reverse=True):
            items = to_native(db.query(f"TRADE#{hs}#{year}"))
            world = next((i for i in items if i["SK"] == "WORLD"), None)
            if not world or world.get("status") != "ok":
                continue
            rows = sorted((i for i in items if i["SK"].startswith("COUNTRY#")),
                          key=lambda r: r["export_value"], reverse=True)
            slim = [{k: r[k] for k in ("iso3", "export_value", "share_of_world", "rca", "rank_by_value")} for r in rows]
            trade[hs] = {"year": year, "name": p["name"], "specialty_id": p.get("specialty_id"),
                         "world_product_exports": world.get("world_product_exports"),
                         "reporters_with_product": world.get("reporters_with_product"),
                         "top": slim[:15], "by_country": {r["iso3"]: r for r in slim}}
            break
    return trade


def build(countries, specialties, links, trade):
    return {
        "generated_at": now_iso(),
        "categories": {c["category_id"]: c for c in catalog.categories()},
        "countries": {c["iso3"]: {k: c.get(k) for k in ("name", "region", "capital", "population",
                                                          "population_year", "aliases")} for c in countries},
        "specialties": {s["id"]: {k: s.get(k) for k in ("name", "category", "keywords", "description", "hs_code")}
                        for s in specialties},
        "links": [{k: l.get(k) for k in ("iso3", "specialty_id", "specialty_type", "importance", "note",
                                           "source_org", "source_url", "reference_year",
                                           "verification_status", "rca_check")} for l in links],
        "trade": trade,
    }


def handler(event, context):
    countries = to_native(db.query_index("GSI2", "COUNTRIES"))
    specialties = to_native(db.query_index("GSI2", "SPECIALTIES"))
    links = []
    for s in specialties:
        links += to_native(db.query_index("GSI1", f"SPEC#{s['id']}"))
    meta = to_native(db.get("META", "TRADE") or {})
    trade = latest_trade(catalog.trade_products(), meta.get("years", []))

    index = build(countries, specialties, links, trade)
    db.s3_put_json(os.environ["DATA_BUCKET"], "knowledge/index.json", index)

    status = {"PK": "META", "SK": "SYNC", "last_sync": index["generated_at"],
              "countries": len(countries), "specialties": len(specialties), "links": len(links),
              "trade_products_with_data": len(trade),
              "steps": (event or {}).get("results")}
    db.put(to_dynamo(status))
    return {"step": "BuildIndex", "countries": len(countries), "links": len(links), "trade_products": len(trade)}
