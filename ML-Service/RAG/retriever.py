"""
Loads the persisted Chroma index built by ingest.py and exposes it as a
LangChain retriever. Kept separate from ingest.py so the FastAPI process
only ever *reads* the index — it never rebuilds it on every request.
"""

from pathlib import Path

from langchain_huggingface import HuggingFaceEmbeddings
from langchain_chroma import Chroma

CHROMA_DIR = Path(__file__).parent / "chroma_store"

DEFAULT_K = 4  # number of chunks retrieved per query


def get_retriever(k: int = DEFAULT_K):
    if not CHROMA_DIR.exists():
        raise RuntimeError(
            "No vector index found. Run `python -m rag.ingest` first to "
            "build the index from the policy documents."
        )

    embeddings = HuggingFaceEmbeddings(
        model_name="sentence-transformers/all-MiniLM-L6-v2"
    )
    db = Chroma(persist_directory=str(CHROMA_DIR), embedding_function=embeddings)
    return db.as_retriever(search_kwargs={"k": k})
