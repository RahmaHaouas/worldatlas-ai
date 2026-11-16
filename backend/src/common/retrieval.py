"""Lexical retrieval over the WorldAtlas knowledge index (the "R" in RAG).

The knowledge index is a JSON document built by the pipeline (BuildIndex Lambda) from DynamoDB
and stored in S3. Retrieval is deterministic: it detects countries, specialties and categories
mentioned in the question, then selects the matching verified records. The LLM only phrases
an answer from these numbered records; it never chooses which countries to highlight.
"""
import re
import unicodedata

IMPORTANCE_WEIGHT = {"signature": 3.0, "major": 2.0, "notable": 1.0}
TYPE_LABEL = {
    "cultural": "cultural specialty",
    "production": "production specialization",
    "export": "export specialization",
    "characteristic": "national characteristic",
}
CATEGORY_HINTS = {
    "agriculture": ["agricultur", "food", "farm", "crop", "aliment", "cuisine", "dish"],
    "industry": ["industr", "manufactur", "factory", "usine"],
    "culture": ["cultur", "heritage", "unesco", "patrimoine", "tradition", "music", "musique", "monument", "unique"],
    "technology": ["technolog", "tech ", "innovation", "digital", "numerique"],
    "resources": ["resource", "ressource", "energy", "energie", "mineral", "mining", "renewable", "renouvelable"],
    "tourism": ["touris", "service", "travel", "voyage", "visit"],
}
RANKING_HINTS = ["most", "top", "largest", "biggest", "leading", "plus", "premier", "export", "rank", "classement"]
MAX_RECORDS = 28
STOPWORDS = {"the", "and", "for", "des", "les", "une", "est", "pour", "top", "most"}


def normalize(text):
    text = unicodedata.normalize("NFKD", text.lower())
    text = "".join(ch for ch in text if not unicodedata.combining(ch))
    return " " + re.sub(r"[^a-z0-9&'\- ]+", " ", text).replace("-", " ") + " "


def _contains(norm_text, phrase):
    p = normalize(phrase).strip()
    return bool(p) and re.search(r"(?<![a-z0-9])" + re.escape(p) + r"(?![a-z0-9])", norm_text) is not None


def fmt_usd(v):
    if v is None:
        return "n/a"
    for unit, div in (("trillion", 1e12), ("billion", 1e9), ("million", 1e6)):
        if abs(v) >= div:
            return f"US${v / div:,.2f} {unit}"
    return f"US${v:,.0f}"


def detect(question, index):
    q = normalize(question)
    countries = []
    for iso3, c in index["countries"].items():
        names = [c["name"]] + (c.get("aliases") or [])
        if any(_contains(q, n) for n in names if len(n) >= 3):
            countries.append(iso3)

    spec_scores = {}
    for sid, s in index["specialties"].items():
        score = 0.0
        if _contains(q, s["name"]):
            score += 3 + len(s["name"]) / 10
        for kw in s.get("keywords", []):
            nk = normalize(kw).strip()
            if len(nk) >= 3 and nk not in STOPWORDS and _contains(q, kw):
                score += 1 + len(kw) / 10
        if score:
            spec_scores[sid] = score
    specialties = []
    if spec_scores:
        top = max(spec_scores.values())
        specialties = sorted((s for s, v in spec_scores.items() if v >= 0.5 * top),
                             key=lambda s: -spec_scores[s])[:6]

    categories = [cat for cat, hints in CATEGORY_HINTS.items() if any(h in q for h in hints)]
    wants_ranking = any(f" {h}" in q for h in RANKING_HINTS)
    return {"countries": countries, "specialties": specialties, "categories": categories,
            "wants_ranking": wants_ranking}


def _link_score(link):
    s = IMPORTANCE_WEIGHT.get(link.get("importance"), 1.0)
    if link.get("verification_status") == "verified":
        s += 0.5
    if (link.get("rca_check") or {}).get("confirmed"):
        s += 0.75
    return s


def _link_text(link, index):
    c = index["countries"].get(link["iso3"], {"name": link["iso3"]})
    s = index["specialties"].get(link["specialty_id"], {"name": link["specialty_id"], "category": ""})
    cat = index.get("categories", {}).get(s.get("category"), {}).get("category_name", s.get("category"))
    parts = [f"[{c['name']}] {s['name']} ({cat}) — {TYPE_LABEL.get(link['specialty_type'], link['specialty_type'])}, "
             f"importance: {link.get('importance')}."]
    if link.get("note"):
        parts.append(link["note"])
    parts.append(f"Source: {link.get('source_org')} (reference year {link.get('reference_year')}, "
                 f"status: {link.get('verification_status')}).")
    rc = link.get("rca_check")
    if rc and rc.get("rca") is not None:
        verdict = "confirms" if rc.get("confirmed") else "does not confirm"
        parts.append(f"UN Comtrade {rc.get('year')} RCA = {rc['rca']:.2f}, which {verdict} an export specialization.")
    return " ".join(parts)


def _trade_text(hs, t, index, focus=None):
    rows = t.get("top", [])
    names = index["countries"]
    lines = [f"UN Comtrade {t['year']} — {t['name']} (HS {hs}) exports. Reporting countries: "
             f"{t.get('reporters_with_product')}. World exports (reporting countries): {fmt_usd(t.get('world_product_exports'))}."]
    if rows:
        top = "; ".join(
            f"{i}. {names.get(r['iso3'], {}).get('name', r['iso3'])}: {fmt_usd(r['export_value'])} "
            f"({r['share_of_world'] * 100:.1f}% of world, RCA {r['rca']:.2f})"
            for i, r in enumerate(rows[:8], start=1))
        lines.append("Top exporters by value: " + top + ".")
    for iso3 in focus or []:
        r = (t.get("by_country") or {}).get(iso3)
        cname = names.get(iso3, {}).get("name", iso3)
        if r:
            lines.append(f"{cname}: {fmt_usd(r['export_value'])}, {r['share_of_world'] * 100:.2f}% of world, "
                         f"rank {r['rank_by_value']} by value, RCA {r['rca']:.2f}.")
        else:
            lines.append(f"{cname}: no comparable {t['year']} export record for this product.")
    return " ".join(lines)


def retrieve(question, index):
    d = detect(question, index)
    C, S, K = set(d["countries"]), set(d["specialties"]), set(d["categories"])
    links = index["links"]
    spec_cat = {sid: s["category"] for sid, s in index["specialties"].items()}

    if C and S:
        chosen = [l for l in links if l["iso3"] in C and l["specialty_id"] in S]
    elif C:
        chosen = [l for l in links if l["iso3"] in C and (not K or spec_cat.get(l["specialty_id"]) in K)]
        if not chosen and K:
            chosen = [l for l in links if l["iso3"] in C]
    elif S:
        chosen = [l for l in links if l["specialty_id"] in S]
    elif K:
        chosen = [l for l in links if spec_cat.get(l["specialty_id"]) in K]
    else:
        chosen = []
    chosen.sort(key=_link_score, reverse=True)

    records = []
    # 1) trade statistics first when the question is about a product with trade data
    for sid in d["specialties"]:
        hs = index["specialties"][sid].get("hs_code")
        t = index.get("trade", {}).get(hs) if hs else None
        if t:
            records.append({"kind": "trade", "text": _trade_text(hs, t, index, focus=d["countries"]),
                            "source_org": "UN Comtrade", "source_url": "https://comtradeplus.un.org/",
                            "countries": [r["iso3"] for r in t.get("top", [])[:8]] + d["countries"]})
    # 2) country profile facts (World Bank)
    for iso3 in d["countries"]:
        c = index["countries"][iso3]
        facts = [f"[{c['name']}] Region: {c.get('region') or 'n/a'}. Capital: {c.get('capital') or 'n/a'}."]
        if c.get("population"):
            facts.append(f"Population: {c['population']:,.0f} ({c.get('population_year')}, World Bank).")
        records.append({"kind": "profile", "text": " ".join(facts), "source_org": "World Bank Open Data",
                        "source_url": "https://data.worldbank.org/", "countries": [iso3]})
    # 3) curated specialty links
    for link in chosen[: MAX_RECORDS - len(records)]:
        records.append({"kind": "specialty", "text": _link_text(link, index),
                        "source_org": link.get("source_org"), "source_url": link.get("source_url"),
                        "countries": [link["iso3"]]})

    for i, r in enumerate(records, start=1):
        r["id"] = i

    highlight = list(dict.fromkeys(
        [iso for r in records for iso in r["countries"]] + d["countries"]))
    return {"detected": d, "records": records, "highlight": highlight}


def related_questions(detected, index, limit=4):
    names = {k: v["name"] for k, v in index["countries"].items()}
    out = []
    for sid in detected["specialties"][:2]:
        s = index["specialties"][sid]
        if s.get("hs_code"):
            out.append(f"Which countries export the most {s['name'].lower()}?")
        out.append(f"Which countries are associated with {s['name'].lower()}?")
    for iso3 in detected["countries"][:2]:
        n = names.get(iso3, iso3)
        out += [f"What makes {n} culturally unique?", f"What are {n}'s natural resources?"]
    if len(detected["countries"]) >= 2 and detected["specialties"]:
        a, b = (names.get(x, x) for x in detected["countries"][:2])
        out.append(f"Compare {a} and {b} in {index['specialties'][detected['specialties'][0]]['name'].lower()}.")
    if not out:
        out = ["What is Tunisia famous for?", "Which countries export the most cocoa?",
               "What are Japan's technological specialties?", "Which countries have significant phosphate resources?"]
    return list(dict.fromkeys(out))[:limit]
