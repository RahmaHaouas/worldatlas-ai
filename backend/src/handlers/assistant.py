"""AI Assistant Service: POST /assistant {"question": "..."}

Retrieval-augmented generation:
  1. Load the knowledge index built by the pipeline (S3, cached in the warm Lambda).
  2. Retrieve numbered, sourced records for the question (deterministic, see common/retrieval.py).
  3. Ask Amazon Bedrock (Converse API) to answer ONLY from those records, citing [n].
  4. Return answer + cited sources + countries to highlight on the map + related questions.
If Bedrock is unavailable the service degrades to an extractive answer built from the records.
"""
import os
import re
import time

from common import db
from common.retrieval import related_questions, retrieve
from common.util import ApiError, api_handler, json_body, logger, respond

INDEX_TTL = 600
_index, _loaded_at = None, 0.0
_bedrock = None

SYSTEM_PROMPT = """You are WorldAtlas AI, an assistant for a global atlas of country specialties.
Rules:
- Answer ONLY with facts contained in the numbered CONTEXT records. Cite every factual sentence with its record number like [2].
- Never invent facts, statistics, rankings or sources. Never compute new numbers except restating those in the records.
- If the records do not answer the question, say clearly that WorldAtlas has no verified data for it yet.
- Distinguish cultural specialties, production specializations, export specializations (RCA > 1) and general characteristics. Cultural fame is not proof of economic dominance.
- Mention the reference year when quoting a statistic.
- Answer in the same language as the question. Be concise: at most 180 words, short paragraphs or bullet points."""


def load_index():
    global _index, _loaded_at
    if _index is None or time.time() - _loaded_at > INDEX_TTL:
        try:
            _index = db.s3_get_json(os.environ["DATA_BUCKET"], "knowledge/index.json")
            _loaded_at = time.time()
        except Exception as e:  # noqa: BLE001
            logger.error("index load failed: %s", e)
            raise ApiError(503, "The knowledge index is not built yet. Run the WorldAtlas data pipeline first.")
    return _index


def bedrock():
    global _bedrock
    if _bedrock is None:
        import boto3
        _bedrock = boto3.client("bedrock-runtime", region_name=os.environ.get("BEDROCK_REGION") or None)
    return _bedrock


def build_prompt(question, records):
    ctx = "\n".join(f"[{r['id']}] {r['text']}" for r in records)
    return f"CONTEXT:\n{ctx}\n\nQUESTION: {question}"


def generate(question, records):
    resp = bedrock().converse(
        modelId=os.environ.get("BEDROCK_MODEL_ID", "amazon.nova-lite-v1:0"),
        system=[{"text": SYSTEM_PROMPT}],
        messages=[{"role": "user", "content": [{"text": build_prompt(question, records)}]}],
        inferenceConfig={"maxTokens": 600, "temperature": 0.1, "topP": 0.9},
    )
    parts = resp["output"]["message"]["content"]
    return "".join(p.get("text", "") for p in parts).strip()


def extractive_answer(records):
    if not records:
        return "WorldAtlas has no verified record matching this question yet."
    return "Here is what WorldAtlas has verified records for:\n" + "\n".join(
        f"- {r['text']} [{r['id']}]" for r in records[:6])


def cited_sources(answer, records):
    cited = {int(n) for n in re.findall(r"\[(\d+)\]", answer)}
    out = []
    for r in records:
        if r["id"] in cited:
            out.append({"id": r["id"], "organization": r["source_org"], "url": r["source_url"],
                        "excerpt": r["text"][:240]})
    return out


def answer(question):
    index = load_index()
    found = retrieve(question, index)
    records = found["records"]
    mode = "rag"
    if not records:
        text = ("WorldAtlas has no verified data matching this question yet. Try naming a country "
                "(e.g. Tunisia) or a product (e.g. olive oil, cocoa, phosphate).")
        mode = "no-context"
    else:
        try:
            text = generate(question, records)
        except Exception as e:  # noqa: BLE001
            logger.error("bedrock failed: %s", e)
            text, mode = extractive_answer(records), "extractive-fallback"
    return {
        "question": question,
        "answer": text,
        "mode": mode,
        "sources": cited_sources(text, records),
        "records": [{"id": r["id"], "kind": r["kind"], "text": r["text"], "source_org": r["source_org"],
                     "source_url": r["source_url"]} for r in records],
        "highlight_countries": found["highlight"],
        "detected": found["detected"],
        "related_questions": related_questions(found["detected"], index),
        "index_generated_at": index.get("generated_at"),
    }


@api_handler
def handler(event, context):
    body = json_body(event)
    question = (body.get("question") or "").strip()
    if not question:
        raise ApiError(400, "Field 'question' is required")
    if len(question) > 500:
        raise ApiError(400, "Question is too long (max 500 characters)")
    return respond(200, answer(question))
