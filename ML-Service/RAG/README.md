# VerifyHub policy assistant (experimental)

The optional `RAG/` module answers questions from local sample policy documents. `ML-Service/app.py` already mounts its `POST /rag/query` route. It uses a local Chroma index, Hugging Face `all-MiniLM-L6-v2` embeddings, and an Ollama `llama3.2:3b` model—not OpenAI API calls.

From `ML-Service/`, install the dependencies in `requirements.txt`, make the `llama3.2:3b` model available through Ollama, and build the ignored local vector index:

```bash
python -m RAG.ingest
uvicorn app:app --reload --port 8000
```

Then send a JSON `{"question":"What documents are accepted for PAN verification?"}` body to `POST http://localhost:8000/rag/query`. The response contains an answer and retrieved source paths.

The tracked `sample_docs/` files are illustrative, not legal or compliance policy. `chroma_store/` is generated locally and intentionally not committed. This extension is not part of the first end-to-end verification journey and has not yet been evaluated for retrieval quality or hallucination rate.
