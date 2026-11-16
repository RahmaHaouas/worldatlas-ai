"""Offline tests: knowledge integrity, RCA maths, API parsers, retrieval, and a full pipeline
run (Step Functions tasks in order) followed by every API route, using in-memory fakes.

NOTE: numbers below are synthetic TEST FIXTURES, never shipped as data.
Run:  python -m pytest backend/tests -q     (or: python backend/tests/test_backend.py)
"""
import json
import os
import sys
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "src"))
sys.path.insert(0, HERE)

os.environ.update({"TABLE_NAME": "test", "SITE_BUCKET": "site", "DATA_BUCKET": "data",
                   "TRADE_YEARS": "2022,2023", "COMTRADE_PAUSE_SECONDS": "0"})

from fakes import FakeS3, FakeTable  # noqa: E402
from common import catalog, db, rca, retrieval, sources_api  # noqa: E402
from pipeline import build_index, seed_knowledge, sync_countries, sync_geo, trade as trade_pipeline  # noqa: E402
from handlers import assistant, compare, countries, specialties, trade  # noqa: E402

WB_COUNTRIES = [{"page": 1}, [
    {"id": "TUN", "iso2Code": "TN", "name": "Tunisia", "region": {"id": "MEA", "value": "Middle East & North Africa"},
     "incomeLevel": {"value": "Lower middle income"}, "capitalCity": "Tunis", "longitude": "10.21", "latitude": "36.79"},
    {"id": "ESP", "iso2Code": "ES", "name": "Spain", "region": {"id": "ECS", "value": "Europe & Central Asia"},
     "incomeLevel": {"value": "High income"}, "capitalCity": "Madrid", "longitude": "-3.70", "latitude": "40.41"},
    {"id": "EGY", "iso2Code": "EG", "name": "Egypt, Arab Rep.", "region": {"id": "MEA", "value": "Middle East & North Africa"},
     "incomeLevel": {"value": "Lower middle income"}, "capitalCity": "Cairo", "longitude": "31.2", "latitude": "30.0"},
    {"id": "WLD", "iso2Code": "1W", "name": "World", "region": {"id": "NA", "value": "Aggregates"}},
]]
WB_POP = [{}, [{"countryiso3code": "TUN", "value": 12000000, "date": "2023"},
               {"countryiso3code": "ESP", "value": 48000000, "date": "2022"}]]
REPORTERS = {"results": [{"id": 788, "text": "Tunisia", "reporterCodeIsoAlpha3": "TUN", "isGroup": False},
                         {"id": 724, "text": "Spain", "reporterCodeIsoAlpha3": "ESP", "isGroup": False},
                         {"id": 97, "text": "EU", "reporterCodeIsoAlpha3": "EUR", "isGroup": True}]}


def fake_exports(cmd, year, reporters, subscription_key=None):
    # 40 synthetic reporters so world aggregates pass the MIN_REPORTERS threshold
    totals = {f"X{i:02d}"[:3]: 1000.0 for i in range(40)}
    totals.update({"TUN": 100.0, "ESP": 4000.0})
    if cmd == "TOTAL":
        return totals, len(totals)
    if cmd == "1509":
        return {"TUN": 10.0, "ESP": 40.0, "X01": 1.0}, 3
    return {}, 0


class Backend(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.table, cls.s3 = FakeTable(), FakeS3()
        db.set_table(cls.table)
        db.set_s3(cls.s3)
        sources_api.fetch_wb_countries = lambda: sources_api.parse_wb_countries(WB_COUNTRIES)
        sources_api.fetch_wb_indicator = lambda ind: sources_api.parse_wb_indicator(WB_POP if ind == "SP.POP.TOTL" else [{}, []])
        sources_api.fetch_reporters = lambda: sources_api.parse_reporters(REPORTERS)
        sources_api.fetch_comtrade_exports = fake_exports
        sources_api.fetch_geojson = lambda: {"type": "FeatureCollection", "features": [
            {"type": "Feature", "properties": {"ISO_A3": "-99", "ISO_A3_EH": "FRA", "NAME": "France"},
             "geometry": {"type": "Polygon", "coordinates": [[[2.123456, 48.1], [3.0, 48.0], [2.5, 47.0], [2.123456, 48.1]]]}}]}

        # ---- run the Step Functions workflow tasks in order
        cls.results = [sync_countries.handler({}, None), sync_geo.handler({}, None), seed_knowledge.handler({}, None)]
        plan = trade_pipeline.plan_handler({}, None)
        for job in plan["jobs"]:
            trade_pipeline.sync_handler(job, None)
        cls.results.append(trade_pipeline.compute_handler({}, None))
        cls.results.append(build_index.handler({"results": cls.results}, None))

    # ---------------- static knowledge
    def test_catalog_valid(self):
        self.assertEqual(catalog.validate(), [])
        self.assertEqual(len(catalog.categories()), 6)

    def test_every_category_has_specialties(self):
        cats = {s["category"] for s in catalog.specialties().values()}
        self.assertEqual(cats, set(catalog.category_ids()))

    # ---------------- RCA
    def test_rca_formula(self):
        totals = {f"C{i:02d}": 100.0 for i in range(30)}
        res = rca.compute_rca({"C00": 50.0, "C01": 10.0}, totals)
        self.assertEqual(res["status"], "ok")
        # world share = 60/3000 = 0.02 ; C00 share = 0.5 -> RCA 25
        self.assertAlmostEqual(res["rows"][0]["rca"], 25.0)
        self.assertAlmostEqual(res["rows"][1]["rca"], 5.0)

    def test_rca_refuses_incomplete(self):
        self.assertEqual(rca.compute_rca({"A": 1.0}, {"A": 10.0})["status"], "insufficient_data")
        res = rca.compute_rca({"ZZZ": 5.0}, {f"C{i:02d}": 100.0 for i in range(30)})
        self.assertEqual(res["status"], "insufficient_data")  # product exporter has no total
        self.assertIn("ZZZ", res["excluded"])

    # ---------------- parsers
    def test_wb_parser_drops_aggregates(self):
        rows = sources_api.parse_wb_countries(WB_COUNTRIES)
        self.assertEqual([r["iso3"] for r in rows], ["TUN", "ESP", "EGY"])

    def test_comtrade_parser(self):
        rep = sources_api.parse_reporters(REPORTERS)
        payload = {"data": [
            {"reporterCode": 788, "partnerCode": 0, "customsCode": "C00", "motCode": 0, "partner2Code": 0, "primaryValue": 5},
            {"reporterCode": 97, "partnerCode": 0, "primaryValue": 99},
            {"reporterCode": 724, "partnerCode": 251, "primaryValue": 7}]}
        self.assertEqual(sources_api.parse_comtrade_exports(payload, rep), {"TUN": 5.0})

    def test_geojson_simplify_fixes_minus99(self):
        self.assertEqual(self.s3.json("site", "data/countries.geojson")["features"][0]["properties"]["iso3"], "FRA")

    # ---------------- pipeline output
    def test_display_name_override(self):
        self.assertEqual(db.get("COUNTRY#EGY", "PROFILE")["name"], "Egypt")

    def test_supplementary_country(self):
        self.assertIsNotNone(db.get("COUNTRY#TWN", "PROFILE"))

    def test_rca_confirms_link(self):
        link = db.get("COUNTRY#TUN", "SPEC#olive-oil")
        self.assertTrue(link["rca_check"]["confirmed"])

    # ---------------- API
    def call(self, fn, path, qs=None, pp=None, method="GET", body=None):
        ev = {"rawPath": path, "requestContext": {"http": {"method": method}},
              "queryStringParameters": qs, "pathParameters": pp, "body": json.dumps(body) if body else None}
        res = fn.handler(ev, None)
        return res["statusCode"], json.loads(res["body"])

    def test_countries_list_and_detail(self):
        code, body = self.call(countries, "/countries")
        self.assertEqual(code, 200)
        self.assertIn("TUN", [c["iso3"] for c in body["countries"]])
        code, body = self.call(countries, "/countries/TUN", pp={"iso3": "TUN"})
        self.assertEqual(code, 200)
        self.assertTrue(body["specialties"]["culture"])
        self.assertEqual(body["trade"][0]["hs_code"], "1509")
        code, _ = self.call(countries, "/countries/XXX", pp={"iso3": "XXX"})
        self.assertEqual(code, 404)

    def test_specialty_search(self):
        code, body = self.call(specialties, "/specialties", qs={"q": "olive oil"})
        self.assertEqual(body["results"][0]["id"], "olive-oil")
        code, body = self.call(specialties, "/specialties/olive-oil", pp={"id": "olive-oil"})
        self.assertEqual(code, 200)
        self.assertEqual(body["trade"]["rows"][0]["iso3"], "ESP")

    def test_compare(self):
        code, body = self.call(compare, "/compare", qs={"countries": "TUN,ESP"})
        self.assertEqual(code, 200)
        self.assertIn("olive-oil", [s["specialty_id"] for s in body["shared_specialties"]])
        self.assertFalse(body["indicators"][0]["comparable"])  # 2023 vs 2022 population
        code, _ = self.call(compare, "/compare", qs={"countries": "TUN"})
        self.assertEqual(code, 400)

    def test_trade_routes(self):
        code, body = self.call(trade, "/trade/products")
        self.assertEqual(code, 200)
        code, body = self.call(trade, "/trade/products/1509", pp={"hs": "1509"})
        self.assertEqual(body["year"], 2023)
        code, body = self.call(trade, "/trade/products/1509/history", qs={"countries": "TUN"}, pp={"hs": "1509"})
        self.assertEqual(len(body["series"]), 2)
        code, body = self.call(trade, "/trade/countries/TUN", pp={"iso3": "TUN"})
        self.assertGreater(body["products"][0]["rca"], 1)

    def test_retrieval(self):
        index = self.s3.json("data", "knowledge/index.json")
        r = retrieval.retrieve("What is Tunisia famous for?", index)
        self.assertEqual(r["detected"]["countries"], ["TUN"])
        self.assertTrue(any("Harissa" in rec["text"] for rec in r["records"]))
        r = retrieval.retrieve("Compare Tunisia and Spain in olive oil exports", index)
        self.assertEqual(set(r["detected"]["countries"]), {"TUN", "ESP"})
        self.assertEqual(r["detected"]["specialties"][0], "olive-oil")
        self.assertEqual(r["records"][0]["kind"], "trade")
        r = retrieval.retrieve("Quels pays produisent du café ?", index)
        self.assertIn("coffee", r["detected"]["specialties"])

    def test_assistant_fallback_without_bedrock(self):
        class Boom:
            def converse(self, **kw):
                raise RuntimeError("no bedrock in tests")
        assistant._bedrock = Boom()
        code, body = self.call(assistant, "/assistant", method="POST", body={"question": "What is Tunisia famous for?"})
        self.assertEqual(code, 200)
        self.assertEqual(body["mode"], "extractive-fallback")
        self.assertIn("TUN", body["highlight_countries"])
        self.assertTrue(body["sources"])

    def test_assistant_with_fake_bedrock(self):
        class Fake:
            def converse(self, **kw):
                assert "CONTEXT" in kw["messages"][0]["content"][0]["text"]
                return {"output": {"message": {"content": [{"text": "Tunisia is known for harissa [3]."}]}}}
        assistant._bedrock = Fake()
        code, body = self.call(assistant, "/assistant", method="POST", body={"question": "What is Tunisia famous for?"})
        self.assertEqual(body["mode"], "rag")
        self.assertEqual([s["id"] for s in body["sources"]], [3])


if __name__ == "__main__":
    unittest.main(verbosity=2)
