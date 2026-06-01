import streamlit as st
import json
import os
import sys
import pandas as pd
from datetime import datetime

sys.path.append(os.path.join(os.path.dirname(__file__), "..", "ai-engine"))
from rag_engine import RAGEngine

st.set_page_config(page_title="Satellite Control Center", layout="wide")
st.title("🛰️ Satellite Control Center")

JSON_PATH = os.path.join(os.path.dirname(__file__), "..", "logs", "telemetri.json")

@st.cache_resource
def get_rag():
    return RAGEngine()

rag = get_rag()

# Sidebar untuk diagnosis
with st.sidebar:
    st.header("Diagnosis AI")
    question = st.text_input("Pertanyaan (kosongkan untuk diagnosis otomatis)", 
                             placeholder="Contoh: Apakah ada satelit yang overheating?")
    if st.button("Jalankan Diagnosis"):
        if not question:
            question = "Analisis semua data telemetri terbaru, identifikasi anomali atau masalah pada satelit."
        with st.spinner("Sedang menganalisis..."):
            diagnosis = rag.diagnose(question)
        st.subheader("Hasil Diagnosis")
        st.write(diagnosis)

# Panel utama
st.subheader("📡 Data Telemetri Real‑time")
placeholder_data = st.empty()
placeholder_chart = st.empty()

def load_data():
    if not os.path.exists(JSON_PATH):
        return None
    with open(JSON_PATH, "r") as f:
        try:
            return json.load(f)
        except:
            return None

# Tombol refresh manual
if st.button("Refresh Data"):
    pass  # Streamlit akan rerun secara otomatis setelah interaksi

data = load_data()
if data:
    df = pd.DataFrame(data)
    df["timestamp"] = pd.to_datetime(df["timestamp"])
    df = df.sort_values("timestamp")
    
    with placeholder_data.container():
        st.dataframe(df.tail(10), use_container_width=True)
    
    metric = st.selectbox("Pilih metrik", ["temperature", "power", "altitude", "signal_strength"])
    chart_df = df.pivot(index="timestamp", columns="satellite_id", values=metric)
    with placeholder_chart.container():
        st.line_chart(chart_df, use_container_width=True)
else:
    st.warning("Belum ada data telemetri. Pastikan simulator IoT berjalan.")