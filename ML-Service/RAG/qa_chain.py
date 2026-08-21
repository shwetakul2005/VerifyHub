"""
Assembles the retrieval + generation chain and exposes a single
`answer_question()` function used by the FastAPI router.

Chain shape (LCEL):

    question
        |
        v
  retriever.invoke(question)  --> list[Document]
        |
        v
  format_docs()                --> single context string, source-tagged
        |
        v
  prompt.format(context, question)
        |
        v
  llm.invoke(prompt)
        |
        v
  StrOutputParser()            --> plain string answer
"""

from langchain_ollama import ChatOllama
from langchain_core.prompts import ChatPromptTemplate
from langchain_core.output_parsers import StrOutputParser
from langchain_core.runnables import RunnablePassthrough

from .retriever import get_retriever

PROMPT_TEMPLATE = """You are the VerifyHub Policy Assistant. Answer the \
question using ONLY the context below, which is drawn from VerifyHub's own \
verification policy documents.

Rules:
- If the answer is not contained in the context, say you don't have that \
information on file — do not guess about compliance, thresholds, or \
verification requirements.
- Keep answers concise and cite which policy area (Aadhaar / PAN / \
Liveness) the answer relates to.

Context:
{context}

Question: {question}

Answer:"""


def format_docs(docs) -> str:
    return "\n\n".join(
        f"[Source: {doc.metadata.get('source', 'unknown')}]\n{doc.page_content}"
        for doc in docs
    )


def build_chain():
    retriever = get_retriever()
    prompt = ChatPromptTemplate.from_template(PROMPT_TEMPLATE)
    llm = ChatOllama(
    model="llama3.2:3b",
    temperature=0
)

    chain = (
        {"context": retriever | format_docs, "question": RunnablePassthrough()}
        | prompt
        | llm
        | StrOutputParser()
    )
    return chain, retriever


def answer_question(question: str) -> dict:
    chain, retriever = build_chain()

    # Run retrieval twice (once inside the chain, once here) so we can
    # report *which* source documents backed the answer -- useful both for
    # the UI and for demonstrating retrieval grounding in an interview.
    retrieved_docs = retriever.invoke(question)
    answer = chain.invoke(question)

    return {
        "answer": answer,
        "sources": sorted({doc.metadata.get("source", "unknown") for doc in retrieved_docs}),
    }
