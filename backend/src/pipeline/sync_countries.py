"""Step Functions task: sync the country registry from the World Bank API into DynamoDB.

Covers every economy returned by the World Bank (~217) plus supplementary map territories.
Population (SP.POP.TOTL) and surface area (AG.SRF.TOTL.K2) keep their own reference year.
"""
from common import catalog, db, sources_api
from common.util import logger, now_iso, to_dynamo


def build_profiles(wb_countries, population, area, overrides):
    names, aliases = overrides["display_names"], overrides["aliases"]
    collected = now_iso()
    profiles = []
    for c in wb_countries:
        iso3 = c["iso3"]
        name = names.get(iso3, c["official_name"])
        pop = population.get(iso3)
        ar = area.get(iso3)
        profiles.append({
            **c,
            "name": name,
            "aliases": sorted(set([a.lower() for a in aliases.get(iso3, [])] + [name.lower()])),
            "population": pop[0] if pop else None,
            "population_year": pop[1] if pop else None,
            "area_km2": ar[0] if ar else None,
            "area_year": ar[1] if ar else None,
            "flag_url": f"https://flagcdn.com/w160/{c['iso2'].lower()}.png" if c.get("iso2") else None,
            "data_source": "worldbank",
            "collected_at": collected,
        })
    known = {p["iso3"] for p in profiles}
    for s in overrides.get("supplementary", []):
        if s["iso3"] not in known:
            profiles.append({**s, "official_name": s["name"], "aliases": aliases.get(s["iso3"], [s["name"].lower()]),
                             "flag_url": f"https://flagcdn.com/w160/{s['iso2'].lower()}.png",
                             "data_source": "supplementary", "collected_at": collected})
    return profiles


def to_item(p, specialty_counts=None):
    return to_dynamo({
        "PK": f"COUNTRY#{p['iso3']}", "SK": "PROFILE",
        "GSI2PK": "COUNTRIES", "GSI2SK": p["name"],
        **p,
        "specialty_counts": specialty_counts or {},
    })


def handler(event, context):
    wb = sources_api.fetch_wb_countries()
    population = sources_api.fetch_wb_indicator("SP.POP.TOTL")
    area = sources_api.fetch_wb_indicator("AG.SRF.TOTL.K2")
    profiles = build_profiles(wb, population, area, catalog.overrides())

    # keep specialty counts already computed by the seed step
    existing = {i["iso3"]: i.get("specialty_counts", {}) for i in db.query_index("GSI2", "COUNTRIES")}
    db.put_many(to_item(p, existing.get(p["iso3"])) for p in profiles)
    logger.info("synced %d countries", len(profiles))
    return {"step": "SyncCountries", "countries": len(profiles),
            "with_population": sum(1 for p in profiles if p.get("population"))}
