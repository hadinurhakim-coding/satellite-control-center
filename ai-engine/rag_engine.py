import os
from typing import List
from langchain_community.vectorstores import Chroma
from langchain_community.embeddings import SentenceTransformerEmbeddings
from langchain_community.llms import Ollama

class RAGEngine:
    """Mesin RAG diagnosis satelit – versi ringan tanpa langchain.chains."""

    def __init__(self, model_name: str = "llama3:8b-instruct-q4_K_M"):
        # Embedding lokal (CPU, ringan)
        self.embeddings = SentenceTransformerEmbeddings(
            model_name="all-MiniLM-L6-v2",
            model_kwargs={"device": "cpu"}
        )

        # Persistent ChromaDB
        self.vectorstore = Chroma(
            persist_directory="../chroma_data",
            embedding_function=self.embeddings,
            collection_name="satellite_telemetry"
        )

        # LLM lokal via Ollama
        self.llm = Ollama(
            model=model_name,
            temperature=0.0,
            num_predict=256
        )

    def add_log_entry(self, log_line: str, metadata: dict = None):
        """Tambahkan satu baris log ke vectorstore."""
        self.vectorstore.add_texts(
            texts=[log_line],
            metadatas=[metadata] if metadata else None
        )
        self.vectorstore.persist()

    def add_log_entries(self, log_lines: List[str], metadatas: List[dict] = None):
        """Batch menambahkan log."""
        self.vectorstore.add_texts(texts=log_lines, metadatas=metadatas)
        self.vectorstore.persist()

    def diagnose(self, question: str) -> str:
        """Lakukan diagnosis dengan RAG: ambil 3 dokumen teratas, susun prompt, panggil LLM."""
        # Cek apakah ada data
        try:
            count = self.vectorstore._collection.count()
        except Exception:
            count = 0
        if count == 0:
            return "Belum ada data telemetri. Jalankan simulator dan muat log (ingest_logs.py)."

        # Ambil 3 dokumen paling relevan
        retriever = self.vectorstore.as_retriever(search_kwargs={"k": 3})
        docs = retriever.invoke(question)  # LangChain 0.2+ gunakan .invoke()
        context = "\n".join([doc.page_content for doc in docs])

        # Susun prompt manual
        prompt = f"""Kamu adalah insinyur sistem satelit yang ahli. Gunakan HANYA data telemetri di bawah ini untuk menjawab pertanyaan. Jika data tidak cukup, katakan "Data tidak mencukupi untuk diagnosis".

Data Telemetri (3 sampel terbaru yang relevan):
{context}

Pertanyaan: {question}

Jawaban diagnosis (rinci, mencantumkan satelit mana yang bermasalah jika ada):"""

        # Panggil LLM
        response = self.llm.invoke(prompt)
        return response.strip()