"""Revealed Comparative Advantage (Balassa index).

    RCA(c,p) = (X(c,p) / X(c)) / (X(w,p) / X(w))

World aggregates are computed over the SAME set of reporters that provided a total-exports
figure for the year, so numerator and denominator are consistent. RCA is not computed when
the inputs are incomplete (no total for the country, too few reporters, zero world flows).
"""

MIN_REPORTERS = 30  # below this, "world" totals are not representative


def compute_rca(product_exports, total_exports, min_reporters=MIN_REPORTERS):
    """product_exports / total_exports: dict iso3 -> export value (USD).

    Returns {"status", "world": {...}, "rows": [...], "excluded": [...]}.
    """
    reporters = {c for c, v in total_exports.items() if v and v > 0}
    excluded = sorted(c for c in product_exports if c not in reporters)
    world_total = sum(total_exports[c] for c in reporters)
    world_product = sum(v for c, v in product_exports.items() if c in reporters and v and v > 0)
    product_reporters = [c for c in reporters if product_exports.get(c, 0) > 0]

    world = {
        "world_total_exports": world_total,
        "world_product_exports": world_product,
        "reporters_with_totals": len(reporters),
        "reporters_with_product": len(product_reporters),
    }
    if len(reporters) < min_reporters or world_total <= 0 or world_product <= 0:
        return {"status": "insufficient_data", "world": world, "rows": [], "excluded": excluded}

    world_share_of_product = world_product / world_total
    rows = []
    for c in product_reporters:
        x_cp, x_c = product_exports[c], total_exports[c]
        rca = (x_cp / x_c) / world_share_of_product
        rows.append({
            "iso3": c,
            "export_value": x_cp,
            "total_exports": x_c,
            "share_of_world": x_cp / world_product,
            "share_of_country_exports": x_cp / x_c,
            "rca": rca,
            "specialized": rca > 1,
        })
    rows.sort(key=lambda r: r["export_value"], reverse=True)
    for i, r in enumerate(rows, start=1):
        r["rank_by_value"] = i
    return {"status": "ok", "world": world, "rows": rows, "excluded": excluded}
