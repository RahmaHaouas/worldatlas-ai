"""Loads the curated, version-controlled knowledge files bundled with the Lambda code."""
import json
import os
from functools import lru_cache

DATA_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "data")


def _load(name):
    with open(os.path.join(DATA_DIR, name), encoding="utf-8") as f:
        return json.load(f)


@lru_cache(maxsize=None)
def categories():
    return _load("categories.json")


@lru_cache(maxsize=None)
def sources():
    return {s["source_id"]: s for s in _load("sources.json")}


@lru_cache(maxsize=None)
def specialties_file():
    return _load("specialties.json")


@lru_cache(maxsize=None)
def specialties():
    return {s["id"]: s for s in specialties_file()["specialties"]}


LINK_FIELDS = ["iso3", "specialty_id", "specialty_type", "importance", "source_id",
               "reference_year", "verification_status", "note"]


@lru_cache(maxsize=None)
def links():
    return [dict(zip(LINK_FIELDS, row)) for row in specialties_file()["links"]]


@lru_cache(maxsize=None)
def trade_products():
    return _load("trade_products.json")


@lru_cache(maxsize=None)
def overrides():
    return _load("country_overrides.json")


def category_ids():
    return [c["category_id"] for c in categories()]


EVIDENCE_BY_SOURCE = {
    "unesco-ich": "unesco-inscription",
    "unesco-whc": "unesco-inscription",
    "comtrade": "trade-statistics",
}


def evidence_type(source_id):
    return EVIDENCE_BY_SOURCE.get(source_id, "organization-reference")


def validate():
    """Integrity checks run by unit tests and by the seed job."""
    errors = []
    specs, srcs, cats = specialties(), sources(), set(category_ids())
    for s in specs.values():
        if s["category"] not in cats:
            errors.append(f"specialty {s['id']} has unknown category {s['category']}")
    seen = set()
    for link in links():
        key = (link["iso3"], link["specialty_id"])
        if key in seen:
            errors.append(f"duplicate link {key}")
        seen.add(key)
        if link["specialty_id"] not in specs:
            errors.append(f"link {key} references unknown specialty")
        if link["source_id"] not in srcs:
            errors.append(f"link {key} references unknown source {link['source_id']}")
        if link["specialty_type"] not in ("cultural", "production", "export", "characteristic"):
            errors.append(f"link {key} has invalid type")
        if len(link["iso3"]) != 3:
            errors.append(f"link {key} has invalid iso3")
    for p in trade_products():
        if p.get("specialty_id") and p["specialty_id"] not in specs:
            errors.append(f"trade product {p['hs_code']} references unknown specialty")
    return errors
