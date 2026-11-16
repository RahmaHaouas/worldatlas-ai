"""Thin data-access layer over a single DynamoDB table and the S3 data bucket.

Single-table design (PK / SK):
  COUNTRY#<ISO3>  PROFILE              country profile         GSI2: COUNTRIES / <name>
  COUNTRY#<ISO3>  SPEC#<specialty_id>  country-specialty link  GSI1: SPEC#<id> / COUNTRY#<ISO3>
  COUNTRY#<ISO3>  RCA#<hs>#<year>      RCA of a country for a product
  SPEC#<id>       META                 specialty definition    GSI2: SPECIALTIES / <id>
  CATEGORY        CAT#<id>             category
  SOURCE          SRC#<id>             data source
  RAW#<hs>#<year> COUNTRY#<ISO3>       raw UN Comtrade export value (hs may be TOTAL)
  TRADE#<hs>#<year> COUNTRY#<ISO3>     computed trade row (value, share, RCA)
  TRADE#<hs>#<year> WORLD              world totals + coverage
  META            SYNC | TRADE         pipeline status / available trade years
"""
import json
import os

_table = None
_s3 = None


def set_table(table):
    """Inject a table (used by unit tests with an in-memory fake)."""
    global _table
    _table = table


def set_s3(client):
    global _s3
    _s3 = client


def table():
    global _table
    if _table is None:
        import boto3
        _table = boto3.resource("dynamodb").Table(os.environ["TABLE_NAME"])
    return _table


def s3():
    global _s3
    if _s3 is None:
        import boto3
        _s3 = boto3.client("s3")
    return _s3


def _key_cond(name, value, sk_name=None, sk_prefix=None):
    try:
        from boto3.dynamodb.conditions import Key
    except ImportError:  # local unit tests without boto3: the fake table reads this dict
        return {"pk": (name, value), "sk": (sk_name, sk_prefix) if sk_prefix else None}
    cond = Key(name).eq(value)
    if sk_name and sk_prefix:
        cond = cond & Key(sk_name).begins_with(sk_prefix)
    return cond


def get(pk, sk):
    return table().get_item(Key={"PK": pk, "SK": sk}).get("Item")


def query(pk, sk_prefix=None):
    return _paginate(KeyConditionExpression=_key_cond("PK", pk, "SK", sk_prefix))


def query_index(index, pk_value, sk_prefix=None):
    pk_name, sk_name = f"{index}PK", f"{index}SK"
    return _paginate(IndexName=index, KeyConditionExpression=_key_cond(pk_name, pk_value, sk_name, sk_prefix))


def _paginate(**kwargs):
    items, start = [], None
    while True:
        if start:
            kwargs["ExclusiveStartKey"] = start
        page = table().query(**kwargs)
        items.extend(page.get("Items", []))
        start = page.get("LastEvaluatedKey")
        if not start:
            return items


def put(item):
    table().put_item(Item=item)


def put_many(items):
    with table().batch_writer(overwrite_by_pkeys=["PK", "SK"]) as batch:
        for item in items:
            batch.put_item(Item=item)


def update_attrs(pk, sk, attrs):
    names = {f"#a{i}": k for i, k in enumerate(attrs)}
    values = {f":v{i}": v for i, v in enumerate(attrs.values())}
    expr = "SET " + ", ".join(f"#a{i} = :v{i}" for i in range(len(attrs)))
    table().update_item(Key={"PK": pk, "SK": sk}, UpdateExpression=expr,
                        ExpressionAttributeNames=names, ExpressionAttributeValues=values)


def s3_put_json(bucket, key, data, cache_control=None):
    extra = {"CacheControl": cache_control} if cache_control else {}
    s3().put_object(Bucket=bucket, Key=key, Body=json.dumps(data, ensure_ascii=False).encode("utf-8"),
                    ContentType="application/json", **extra)


def s3_get_json(bucket, key):
    obj = s3().get_object(Bucket=bucket, Key=key)
    return json.loads(obj["Body"].read())


def s3_exists(bucket, key):
    try:
        s3().head_object(Bucket=bucket, Key=key)
        return True
    except Exception:  # noqa: BLE001
        return False
