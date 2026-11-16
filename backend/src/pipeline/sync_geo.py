"""Step Functions task: publish simplified world boundaries (Natural Earth) to the site bucket."""
import os

from common import db, sources_api
from common.util import logger

KEY = "data/countries.geojson"


def handler(event, context):
    bucket = os.environ["SITE_BUCKET"]
    force = bool((event or {}).get("forceGeo"))
    if not force and db.s3_exists(bucket, KEY):
        return {"step": "SyncGeo", "skipped": True}
    fc = sources_api.simplify_geojson(sources_api.fetch_geojson())
    db.s3_put_json(bucket, KEY, fc, cache_control="public, max-age=86400")
    logger.info("published %d features", len(fc["features"]))
    return {"step": "SyncGeo", "features": len(fc["features"])}
