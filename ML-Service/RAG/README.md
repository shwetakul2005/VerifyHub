# VerifyHub Policy Assistant (RAG extension)

A retrieval-augmented generation feature that lets verifiers/org admins ask
natural-language questions about VerifyHub's verification policies
("what documents are needed for PAN verification?", "what's the liveness
threshold?") instead of searching through docs manually.

## 1. Where this goes in your repo

Drop the `rag/` folder into `ML-Service/`, alongside your existing face
detection/matching code:

```
VerifyHub/
  ML-Service/
    main.py              <- your existing FastAPI app
    face_detection/
    face_matching/
    rag/                 <- this folder
      __init__.py
      ingest.py
      retriever.py
      qa_chain.py
      router.py
      sample_docs/
      requirements.txt
```

## 2. Setup

```bash
cd ML-Service
pip install -r rag/requirements.txt

# add to your .env
echo "OPENAI_API_KEY=sk-..." >> .env
```

Build the vector index once (re-run whenever policy docs change):

```bash
python -m rag.ingest
```

## 3. Wire it into your existing FastAPI app

In your existing `main.py`, add two lines:

```python
from rag.router import router as rag_router

app.include_router(rag_router)
```

That's it — `POST /rag/query` is now live alongside your face-detection
endpoints.

## 4. Try it

```bash
curl -X POST http://localhost:8000/rag/query \
  -H "Content-Type: application/json" \
  -d '{"question": "What documents are accepted for Aadhaar verification?"}'
```

Response:
```json
{
  "answer": "For Aadhaar verification... [Aadhaar policy area]",
  "sources": ["sample_docs/aadhaar_verification_policy.md"]
}
```

## 5. Replacing the sample docs with your real ones

The three markdown files in `sample_docs/` are placeholders modeled on your
actual Aadhaar/PAN/liveness verification flows. Swap them for your real
internal policy docs (or auto-generate them from your workflow-template
configs) and re-run `python -m rag.ingest`.

---

## Architecture — know this cold before the interview

```
question
   |
   v
Retriever (Chroma similarity search, top-k=4)
   |
   v
format_docs()  -->  context string, tagged with [Source: filename]
   |
   v
Prompt template  -->  "answer ONLY from this context, else say you don't know"
   |
   v
ChatOpenAI (gpt-4o-mini, temperature=0)
   |
   v
StrOutputParser  -->  plain string answer
```

**Be ready to explain, unprompted:**

- **Why chunk_size=500 / overlap=80?** Policy docs are organized in short
  sections (SLA, Rejection Reasons, etc.) — a 500-char chunk usually holds
  one full section. The 80-char overlap prevents a sentence from being cut
  in half at a chunk boundary, which would otherwise lose meaning right at
  the retrieval edge.
- **Why `temperature=0`?** This is a compliance-adjacent assistant — you
  want consistent, literal answers grounded in the policy text, not
  creative variation.
- **Why explicitly instruct the model to say "I don't know"?** Without
  this, LLMs tend to hallucinate plausible-sounding but wrong compliance
  details when retrieval returns weak matches — a real risk in a
  verification/KYC context.
- **Why return `sources` separately from `answer`?** Traceability — an org
  admin should be able to verify which policy document backed a given
  answer, not just trust the LLM's prose.
- **Known limitation to mention proactively:** this is a "naive" RAG setup
  (single retrieval pass, no re-ranking, no query rewriting). A natural
  extension would be adding a re-ranking step (e.g., cross-encoder) or
  query expansion for cases where the user's phrasing doesn't lexically
  match the policy doc's wording.

## Resume line

> **VerifyHub — Policy Assistant (RAG)**: Extended the verification
> platform's ML-service with a retrieval-augmented Q&A feature (LangChain,
> ChromaDB, OpenAI embeddings + GPT-4o-mini) letting verifiers query
> policy documents in natural language; implemented chunking, similarity
> retrieval, and source-grounded response generation via FastAPI.
