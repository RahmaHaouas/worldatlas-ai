"""Step Functions task: load the curated knowledge base (categories, sources, specialties,
country-specialty links) into DynamoDB and refresh per-country specialty counts."""
from collections import defaultdict

from common import catalog, db
from common.util import logger, now_iso, to_dynamo


def build_items(country_names):
    collected = now_iso()
    srcs, specs = catalog.sources(), catalog.specialties()
    items = []
    for c in catalog.categories():
        items.append({"PK": "CATEGORY", "SK": f"CAT#{c['category_id']}", **c})
    for s in srcs.values():
        items.append({"PK": "SOURCE", "SK": f"SRC#{s['source_id']}", **s, "collection_date": collected})

    per_spec = defaultdict(int)
    counts = defaultdict(lambda: defaultdict(int))
    for link in catalog.links():
        spec, src = specs[link["specialty_id"]], srcs[link["source_id"]]
        iso3 = link["iso3"]
        per_spec[spec["id"]] += 1
        counts[iso3][spec["category"]] += 1
        items.append({
            "PK": f"COUNTRY#{iso3}", "SK": f"SPEC#{spec['id']}",
            "GSI1PK": f"SPEC#{spec['id']}", "GSI1SK": f"COUNTRY#{iso3}",
            **link,
            "country_name": country_names.get(iso3, iso3),
            "specialty_name": spec["name"],
            "category": spec["category"],
            "hs_code": spec.get("hs_code"),
            "evidence_type": catalog.evidence_type(link["source_id"]),
            "source_org": src["organization"],
            "source_url": src["source_url"],
            "collected_at": collected,
        })
    for spec in specs.values():
        items.append({"PK": f"SPEC#{spec['id']}", "SK": "META", "GSI2PK": "SPECIALTIES", "GSI2SK": spec["id"],
                      **spec, "country_count": per_spec[spec["id"]]})
    return [to_dynamo(i) for i in items], counts


def handler(event, context):
    errors = catalog.validate()
    if errors:
        raise ValueError("Knowledge base validation failed: " + "; ".join(errors[:10]))
    profiles = {i["iso3"]: i for i in db.query_index("GSI2", "COUNTRIES")}
    items, counts = build_items({k: v["name"] for k, v in profiles.items()})
    db.put_many(items)

    supplementary = {s["iso3"]: s for s in catalog.overrides().get("supplementary", [])}
    for iso3, c in counts.items():
        if iso3 in profiles:
            db.update_attrs(f"COUNTRY#{iso3}", "PROFILE", {"specialty_counts": dict(c)})
        else:  # country referenced by knowledge but missing from the registry
            base = supplementary.get(iso3, {"iso3": iso3, "name": iso3})
            base = {**base, "aliases": catalog.overrides()["aliases"].get(iso3, [base["name"].lower()])}
            db.put(to_dynamo({"PK": f"COUNTRY#{iso3}", "SK": "PROFILE", "GSI2PK": "COUNTRIES",
                              "GSI2SK": base["name"], **base, "data_source": "supplementary",
                              "specialty_counts": dict(c)}))
    logger.info("seeded %d items", len(items))
    return {"step": "SeedKnowledge", "items": len(items), "links": len(catalog.links()),
            "specialties": len(catalog.specialties()), "countries_with_specialties": len(counts)}
