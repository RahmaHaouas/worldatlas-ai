"""HTTP helpers shared by every API Lambda (API Gateway HTTP API, payload v2)."""
import json
import logging
import os
import traceback
from datetime import datetime, timezone
from decimal import Decimal

logger = logging.getLogger()
logger.setLevel(os.environ.get("LOG_LEVEL", "INFO"))

CORS_HEADERS = {
    "Access-Control-Allow-Origin": os.environ.get("ALLOWED_ORIGIN", "*"),
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
}


class ApiError(Exception):
    def __init__(self, status, message):
        super().__init__(message)
        self.status = status
        self.message = message


def now_iso():
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


def to_native(value):
    """DynamoDB Decimal -> int/float, recursively."""
    if isinstance(value, list):
        return [to_native(v) for v in value]
    if isinstance(value, dict):
        return {k: to_native(v) for k, v in value.items()}
    if isinstance(value, Decimal):
        return int(value) if value == value.to_integral_value() else float(value)
    return value


def to_dynamo(value):
    """float -> Decimal, recursively; drops None values in dicts."""
    if isinstance(value, list):
        return [to_dynamo(v) for v in value]
    if isinstance(value, dict):
        return {k: to_dynamo(v) for k, v in value.items() if v is not None}
    if isinstance(value, float):
        return Decimal(str(value))
    return value


def respond(status, body, cache_seconds=0):
    headers = {"Content-Type": "application/json", **CORS_HEADERS}
    if cache_seconds:
        headers["Cache-Control"] = f"public, max-age={cache_seconds}"
    return {"statusCode": status, "headers": headers, "body": json.dumps(to_native(body), ensure_ascii=False)}


def strip_keys(item):
    """Remove storage keys before returning an item to clients."""
    return {k: v for k, v in item.items() if k not in ("PK", "SK", "GSI1PK", "GSI1SK", "GSI2PK", "GSI2SK")}


def route_key(event):
    ctx = event.get("requestContext", {}).get("http", {})
    return ctx.get("method", "GET"), event.get("rawPath", "/")


def query_params(event):
    return event.get("queryStringParameters") or {}


def path_params(event):
    return event.get("pathParameters") or {}


def json_body(event):
    raw = event.get("body") or "{}"
    if event.get("isBase64Encoded"):
        import base64
        raw = base64.b64decode(raw).decode("utf-8")
    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        raise ApiError(400, "Request body must be valid JSON")


def api_handler(fn):
    """Decorator: uniform error handling + CORS for every API Lambda."""
    def wrapper(event, context):
        try:
            if event.get("requestContext", {}).get("http", {}).get("method") == "OPTIONS":
                return respond(204, {})
            return fn(event, context)
        except ApiError as e:
            return respond(e.status, {"error": e.message})
        except Exception:  # noqa: BLE001
            logger.error(traceback.format_exc())
            return respond(500, {"error": "Internal error. Please retry."})
    return wrapper
