"""
Ingestion pipeline for the VerifyHub Policy Assistant.

Run this once (and again whenever policy docs change) to build/refresh
the vector index:

    python -m rag.ingest

Stage breakdown (each stage matters for interview explainability):
1. Load    - read raw policy documents from disk
2. Split   - break documents into overlapping chunks so retrieval
             returns focused context instead of whole documents
3. Embed   - convert each chunk into a vector using OpenAI's embedding model
4. Store   - persist vectors + text in a local Chroma database for retrieval
"""

from pathlib import Path

from langchain_community.document_loaders import DirectoryLoader, TextLoader
from langchain_text_splitters import RecursiveCharacterTextSplitter
from langchain_huggingface import HuggingFaceEmbeddings
from langchain_chroma import Chroma

BASE_DIR = Path(__file__).parent
DOCS_DIR = BASE_DIR / "sample_docs"
CHROMA_DIR = BASE_DIR / "chroma_store"

# Chunk size / overlap chosen for policy-doc-style content: small enough that
# each chunk stays topically focused (e.g. "SLA" or "Rejection Reasons"
# section), large enough to keep a full thought intact.
CHUNK_SIZE = 500
CHUNK_OVERLAP = 80


def load_documents():
    loader = DirectoryLoader(str(DOCS_DIR), glob="**/*.md", loader_cls=TextLoader)
    return loader.load()


def split_documents(documents):
    splitter = RecursiveCharacterTextSplitter(
        chunk_size=CHUNK_SIZE,
        chunk_overlap=CHUNK_OVERLAP,
        separators=["\n## ", "\n### ", "\n\n", "\n", " ", ""],
    )
    return splitter.split_documents(documents)


def build_index() -> Chroma:
    documents = load_documents()
    chunks = split_documents(documents)

    embeddings = HuggingFaceEmbeddings(
    model_name="sentence-transformers/all-MiniLM-L6-v2"
)
    db = Chroma.from_documents(
        chunks,
        embeddings,
        persist_directory=str(CHROMA_DIR),
    )
    print(f"Indexed {len(documents)} document(s) into {len(chunks)} chunk(s).")
    print(f"Vector store persisted at: {CHROMA_DIR}")
    return db


if __name__ == "__main__":
    build_index()
