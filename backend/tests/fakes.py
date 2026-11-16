"""In-memory fakes for DynamoDB Table and S3 so the whole backend can be tested offline."""
import copy
import io
import json


class FakeTable:
    def __init__(self):
        self.items = {}

    def get_item(self, Key):
        item = self.items.get((Key["PK"], Key["SK"]))
        return {"Item": copy.deepcopy(item)} if item else {}

    def put_item(self, Item):
        self.items[(Item["PK"], Item["SK"])] = copy.deepcopy(Item)

    def update_item(self, Key, UpdateExpression, ExpressionAttributeNames, ExpressionAttributeValues):
        item = self.items.setdefault((Key["PK"], Key["SK"]), {"PK": Key["PK"], "SK": Key["SK"]})
        for assignment in UpdateExpression[4:].split(", "):
            n, v = assignment.split(" = ")
            item[ExpressionAttributeNames[n]] = copy.deepcopy(ExpressionAttributeValues[v])

    def query(self, KeyConditionExpression, IndexName=None, ExclusiveStartKey=None):
        cond = KeyConditionExpression
        pk_name, pk_value = cond["pk"]
        sk = cond["sk"]
        sk_name = sk[0] if sk else ("SK" if IndexName is None else f"{IndexName}SK")
        out = []
        for item in self.items.values():
            if item.get(pk_name) != pk_value:
                continue
            if sk and not str(item.get(sk[0], "")).startswith(sk[1]):
                continue
            out.append(copy.deepcopy(item))
        out.sort(key=lambda i: str(i.get(sk_name, "")))
        return {"Items": out}

    def batch_writer(self, overwrite_by_pkeys=None):
        table = self

        class _W:
            def __enter__(self):
                return self

            def __exit__(self, *a):
                return False

            def put_item(self, Item):
                table.put_item(Item)
        return _W()


class FakeS3:
    def __init__(self):
        self.objects = {}

    def put_object(self, Bucket, Key, Body, **kw):
        self.objects[(Bucket, Key)] = Body

    def get_object(self, Bucket, Key):
        return {"Body": io.BytesIO(self.objects[(Bucket, Key)])}

    def head_object(self, Bucket, Key):
        if (Bucket, Key) not in self.objects:
            raise KeyError(Key)
        return {}

    def json(self, bucket, key):
        return json.loads(self.objects[(bucket, key)])
