#!/usr/bin/env python3
"""Script untuk memuat log telemetri ke dalam vector database (ChromaDB)."""
import os
import sys
from datetime import datetime
from pathlib import Path

# Pastikan kita bisa import rag_engine dari folder yang sama
sys.path.append(os.path.dirname(__file__))
from rag_engine import RAGEngine

LOG_PATH = "../logs/telemetri.log"
LAST_POSITION_FILE = "../chroma_data/last_position.txt"

def main():
    engine = RAGEngine()

    if not os.path.exists(LOG_PATH):
        print(f"File log {LOG_PATH} tidak ditemukan. Jalankan simulator terlebih dahulu.")
        return

    # Baca posisi terakhir yang sudah diproses (untuk incremental)
    last_pos = 0
    if os.path.exists(LAST_POSITION_FILE):
        with open(LAST_POSITION_FILE, "r") as f:
            last_pos = int(f.read().strip())

    with open(LOG_PATH, "r") as f:
        f.seek(last_pos)
        new_lines = f.readlines()
        if not new_lines:
            print("Tidak ada baris baru untuk diproses.")
            return

        log_entries = []
        metadatas = []
        for line in new_lines:
            line = line.strip()
            if not line:
                continue
            # Parsing sederhana: ambil timestamp dan satelit ID (jika ada)
            # Format tipikal: "2026/06/01 15:10:23 SAT1 | Temp=32.50°C ..."
            parts = line.split(" ", 2)  # ["2026/06/01", "15:10:23", "SAT1 | ..."]
            timestamp = " ".join(parts[:2]) if len(parts) >= 2 else datetime.now().isoformat()
            sat_id = "unknown"
            if "SAT" in line:
                sat_start = line.find("SAT")
                sat_end = line.find(" ", sat_start) if " " in line[sat_start:] else len(line)
                sat_id = line[sat_start:sat_end].strip()

            log_entries.append(line)
            metadatas.append({
                "timestamp": timestamp,
                "satellite": sat_id,
                "type": "telemetry"
            })

        engine.add_log_entries(log_entries, metadatas)
        print(f"Berhasil menambahkan {len(log_entries)} baris log ke ChromaDB.")

        # Simpan posisi akhir
        new_pos = f.tell()
        os.makedirs(os.path.dirname(LAST_POSITION_FILE), exist_ok=True)
        with open(LAST_POSITION_FILE, "w") as fpos:
            fpos.write(str(new_pos))

if __name__ == "__main__":
    main()