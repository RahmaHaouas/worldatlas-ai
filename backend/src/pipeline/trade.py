"""Step Functions tasks for the Trade Intelligence pipeline.

plan_handler     -> builds the list of (cmdCode, year) jobs consumed by a Map state
sync_handler     -> fetches one UN Comtrade query and stores raw export values
compute_handler  -> computes RCA for every product/year and confirms specialty links
"""
import os
import time

from common import catalog, db, sources_api
from common.rca import compute_rca
from common.util import logger, now_iso, to_dynamo, to_native

_reporters = None


def trade_years():
    raw = os.environ.get("TRADE_YEARS", "2022,2023")
    return sorted({int(y) for y in raw.split(",") if y.strip()})


def plan_handler(event, context):
    jobs = []
    for year in trade_years():
        jobs.append({"cmd": "TOTAL", "year": year})
        jobs += [{"cmd": p["hs_code"], "year": year} for p in catalog.trade_products()]
    return {"jobs": jobs, "years": trade_years()}


def sync_handler(event, context):
    global _reporters
    if _reporters is None:
        _reporters = sources_api.fetch_reporters()
    cmd, year = event["cmd"], int(event["year"])
    values, n_records = sources_api.fetch_comtrade_exports(
        cmd, year, _reporters, subscription_key=os.environ.get("COMTRADE_API_KEY") or None)
    collected = now_iso()
    db.put_many(to_dynamo({"PK": f"RAW#{cmd}#{year}", "SK": f"COUNTRY#{iso3}", "iso3": iso3,
                           "value": v, "collected_at": collected}) for iso3, v in values.items())
    if n_records >= 500 and not os.environ.get("COMTRADE_API_KEY"):
        logger.warning("preview endpoint capped at 500 records for %s/%s", cmd, year)
    time.sleep(float(os.environ.get("COMTRADE_PAUSE_SECONDS", "1.5")))  # be polite to the public API
    return {"cmd": cmd, "year": year, "reporters": len(values), "records": n_records}


def _raw(cmd, year):
    return {i["iso3"]: float(i["value"]) for i in to_native(db.query(f"RAW#{cmd}#{year}"))}


def compute_handler(event, context):
    products = catalog.trade_products()
    summary, latest_ok = [], {}
    for year in trade_years():
        totals = _raw("TOTAL", year)
        for p in products:
            hs = p["hs_code"]
            result = compute_rca(_raw(hs, year), totals)
            world = {**result["world"], "status": result["status"], "hs_code": hs, "name": p["name"],
                     "year": year, "excluded_no_total": result["excluded"], "computed_at": now_iso()}
            items = [{"PK": f"TRADE#{hs}#{year}", "SK": "WORLD", **world}]
            for r in result["rows"]:
                row = {**r, "hs_code": hs, "year": year}
                items.append({"PK": f"TRADE#{hs}#{year}", "SK": f"COUNTRY#{r['iso3']}", **row})
                items.append({"PK": f"COUNTRY#{r['iso3']}", "SK": f"RCA#{hs}#{year}", **row, "product_name": p["name"]})
            db.put_many(to_dynamo(i) for i in items)
            summary.append({"hs": hs, "year": year, "status": result["status"], "rows": len(result["rows"])})
            if result["status"] == "ok":
                latest_ok[hs] = (year, {r["iso3"]: r for r in result["rows"]})

    # Confirm (or not) curated export claims with the latest RCA available.
    confirmed = 0
    for link in catalog.links():
        spec = catalog.specialties()[link["specialty_id"]]
        hs = spec.get("hs_code")
        if not hs or hs not in latest_ok:
            continue
        year, rows = latest_ok[hs]
        r = rows.get(link["iso3"])
        check = {"hs_code": hs, "year": year, "source": "UN Comtrade",
                 "rca": r["rca"] if r else None, "confirmed": bool(r and r["rca"] > 1)}
        confirmed += int(check["confirmed"])
        db.update_attrs(f"COUNTRY#{link['iso3']}", f"SPEC#{link['specialty_id']}", {"rca_check": to_dynamo(check)})

    db.put(to_dynamo({"PK": "META", "SK": "TRADE", "years": trade_years(), "computed_at": now_iso(),
                      "products": [{"hs_code": p["hs_code"], "name": p["name"], "specialty_id": p.get("specialty_id")}
                                   for p in products],
                      "summary": summary}))
    return {"step": "ComputeRCA", "products": len(products), "years": trade_years(),
            "ok": sum(1 for s in summary if s["status"] == "ok"), "links_confirmed": confirmed}
