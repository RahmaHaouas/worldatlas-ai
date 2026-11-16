"""Parsers for the public data APIs used by the sync pipeline.

World Bank API v2 (no key):  https://api.worldbank.org/v2/
UN Comtrade (preview, no key; or full API with a free subscription key): https://comtradeapi.un.org/
Natural Earth 1:110m admin-0 countries (public domain).
"""
import os

from . import httpclient

WB_BASE = "https://api.worldbank.org/v2"
COMTRADE_PREVIEW = "https://comtradeapi.un.org/public/v1/preview/C/A/HS"
COMTRADE_FULL = "https://comtradeapi.un.org/data/v1/get/C/A/HS"
COMTRADE_REPORTERS = "https://comtradeapi.un.org/files/v1/app/reference/Reporters.json"
NATURAL_EARTH_URL = os.environ.get(
    "GEOJSON_URL",
    "https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_110m_admin_0_countries.geojson",
)

# ---------------------------------------------------------------- World Bank


def parse_wb_countries(payload):
    """payload = [meta, [country,...]] -> list of dicts, aggregates removed."""
    rows = payload[1] if isinstance(payload, list) and len(payload) > 1 and payload[1] else []
    out = []
    for c in rows:
        region = (c.get("region") or {}).get("value", "").strip()
        if not region or region == "Aggregates":
            continue
        out.append({
            "iso3": c["id"],
            "iso2": c.get("iso2Code"),
            "official_name": c.get("name"),
            "region": region,
            "income_level": (c.get("incomeLevel") or {}).get("value"),
            "capital": c.get("capitalCity") or None,
            "latitude": _to_float(c.get("latitude")),
            "longitude": _to_float(c.get("longitude")),
        })
    return out


def parse_wb_indicator(payload):
    """Most-recent-value indicator payload -> {iso3: (value, year)}."""
    rows = payload[1] if isinstance(payload, list) and len(payload) > 1 and payload[1] else []
    out = {}
    for r in rows:
        iso3, value = r.get("countryiso3code"), r.get("value")
        if iso3 and value is not None:
            out[iso3] = (float(value), int(r["date"]))
    return out


def fetch_wb_countries():
    return parse_wb_countries(httpclient.get_json(f"{WB_BASE}/country", {"format": "json", "per_page": 400}))


def fetch_wb_indicator(indicator):
    payload = httpclient.get_json(f"{WB_BASE}/country/all/indicator/{indicator}",
                                  {"format": "json", "per_page": 20000, "mrnev": 1})
    return parse_wb_indicator(payload)


def _to_float(v):
    try:
        return float(v) if v not in (None, "") else None
    except ValueError:
        return None

# ---------------------------------------------------------------- UN Comtrade


def parse_reporters(payload):
    """Reporters.json -> {reporterCode: {"iso3", "name", "is_group"}}."""
    out = {}
    for r in payload.get("results", []):
        out[int(r["id"])] = {
            "iso3": r.get("reporterCodeIsoAlpha3"),
            "name": r.get("text"),
            "is_group": bool(r.get("isGroup")),
        }
    return out


def fetch_reporters():
    return parse_reporters(httpclient.get_json(COMTRADE_REPORTERS))


def parse_comtrade_exports(payload, reporters):
    """Comtrade data payload -> {iso3: value}. Keeps world-partner totals only, drops groups."""
    best = {}
    for row in payload.get("data", []) or []:
        if int(row.get("partnerCode", 0) or 0) != 0:
            continue
        if row.get("customsCode") not in (None, "C00") or int(row.get("motCode", 0) or 0) != 0:
            continue
        if int(row.get("partner2Code", 0) or 0) != 0:
            continue
        info = reporters.get(int(row.get("reporterCode", -1)), {})
        iso3 = row.get("reporterISO") or info.get("iso3")
        if not iso3 or info.get("is_group") or len(iso3) != 3 or not iso3.isalpha():
            continue
        value = row.get("primaryValue")
        if value is None:
            value = row.get("fobvalue")
        if value is None:
            continue
        best[iso3] = max(best.get(iso3, 0.0), float(value))
    return best


def fetch_comtrade_exports(cmd_code, year, reporters, subscription_key=None):
    params = {"period": str(year), "flowCode": "X", "partnerCode": "0", "partner2Code": "0",
              "customsCode": "C00", "motCode": "0", "cmdCode": cmd_code}
    if subscription_key:
        payload = httpclient.get_json(COMTRADE_FULL, params,
                                      headers={"Ocp-Apim-Subscription-Key": subscription_key})
    else:
        payload = httpclient.get_json(COMTRADE_PREVIEW, params)
    records = payload.get("data", []) or []
    return parse_comtrade_exports(payload, reporters), len(records)

# ---------------------------------------------------------------- Natural Earth


def simplify_geojson(fc, round_to=3):
    """Keep only iso3 + name properties and round coordinates to shrink the file."""
    def rnd(coords):
        if isinstance(coords[0], (int, float)):
            return [round(coords[0], round_to), round(coords[1], round_to)]
        return [rnd(c) for c in coords]

    features = []
    for f in fc.get("features", []):
        p = f.get("properties", {})
        iso3 = next((p.get(k) for k in ("ISO_A3_EH", "ISO_A3", "ADM0_A3")
                     if p.get(k) and p.get(k) != "-99"), None)
        if not iso3:
            continue
        geom = f.get("geometry")
        if not geom:
            continue
        features.append({
            "type": "Feature",
            "properties": {"iso3": iso3, "name": p.get("NAME") or p.get("ADMIN") or iso3},
            "geometry": {"type": geom["type"], "coordinates": rnd(geom["coordinates"])},
        })
    return {"type": "FeatureCollection", "features": features}


def fetch_geojson():
    return httpclient.get_json(NATURAL_EARTH_URL)
