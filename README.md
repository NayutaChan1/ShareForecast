# 📈 Market Sentiment & Asset Tracker

![License](https://img.shields.io/badge/license-MIT-blue.svg)
![Version](https://img.shields.io/badge/version-0.1.0-orange.svg)
![Status](https://img.shields.io/badge/status-alpha-yellow.svg)
![Docker](https://img.shields.io/badge/docker--compose-2496ED.svg?logo=docker&logoColor=white)

Platform intelijen pasar terpusat yang menggabungkan pergerakan harga aset (Saham & Kripto) dengan analisis sentimen berita secara *real-time*. Dirancang menggunakan arsitektur *microservices* yang ramping dan dioptimalkan untuk berjalan pada *mini server* mandiri menggunakan Docker Compose.

> **Status: alpha.** Seluruh pipeline sudah berjalan end-to-end, tetapi belum ada autentikasi, rate limiting, maupun test suite. Jangan diekspos ke internet publik apa adanya — lihat [Catatan Keamanan](#-catatan-keamanan).

---

## ✨ Fitur Utama

* **Market Data Aggregator** — Penarikan data harga historis (*candlestick*) dan *real-time* untuk aset Kripto (via Binance API) dan Saham (via yfinance).
* **Real-time News Scraper** — Pemantauan dan ekstraksi otomatis berita finansial terbaru dari 10 sumber RSS (global + Indonesia).
* **AI Sentiment Analysis** — Inferensi NLP menggunakan model **FinBERT** untuk mengklasifikasikan sentimen berita menjadi *Bullish*, *Bearish*, atau *Neutral*.
* **Sentiment Overlay Chart** — Visualisasi UI interaktif yang menumpuk (*overlay*) indikator sentimen berita langsung di atas grafik harga, dengan *bucket* waktu yang selaras dengan interval *candle*.

---

## 🏗️ Arsitektur & Alur Data

```
                    ┌──────────────┐
   RSS feeds ──────▶│ news-scraper │──┐
                    └──────────────┘  │  sentiment.analyze
                                      ▼
                              ┌───────────────┐
                              │   RabbitMQ    │
                              └───────────────┘
                                ▲           │
             sentiment.results  │           │  sentiment.analyze
                                │           ▼
                          ┌─────┴──────┐  ┌────────────┐
                          │api-gateway │  │ nlp-worker │
                          │  (NestJS)  │  │  (FinBERT) │
                          └─────┬──────┘  └─────┬──────┘
                    WebSocket   │               │
                       + REST   │               ▼
                                │        ┌─────────────┐
                                ├───────▶│ PostgreSQL  │
                                │        └─────────────┘
                                │
                                ├───────▶ Redis (quote cache)
                                │
                                ├───────▶ Binance API (crypto)
                                │
                                └───────▶ nlp-engine ──▶ yfinance (saham)
                                              ▲
                                              └── /analyze (FinBERT on-demand)
                                     ┌──────────────┐
                                     │   frontend   │◀── browser
                                     │   (Vue 3)    │
                                     └──────────────┘
```

**Alurnya:**

1. `news-scraper` menarik RSS setiap *N* menit, menyimpan artikel baru ke Postgres, mencocokkan artikel dengan aset lewat *keyword matching*, lalu mengirim `{article_id}` ke antrean `sentiment.analyze`.
2. `nlp-worker` mengonsumsi antrean, menjalankan FinBERT pada judul + ringkasan, menyimpan skor ke `sentiment_scores`, lalu menerbitkan hasil ke `sentiment.results`.
3. `api-gateway` berlangganan `sentiment.results` dan meneruskannya ke browser lewat WebSocket. Gateway juga mem-*polling* harga (Binance untuk kripto, `nlp-engine`/yfinance untuk saham), meng-*cache* di Redis, dan mengarsipkan *candle* ke Postgres.
4. `frontend` menggambar *candlestick* + garis sentimen pada satu chart, dan memperbarui harga serta berita secara langsung dari WebSocket.

> **Kenapa yfinance ada di service Python?** yfinance hanya tersedia untuk Python dan tidak punya padanan Node yang layak. Jadi `nlp-engine` yang memanggil yfinance, sementara `api-gateway` bertindak sebagai *typed HTTP client* di depannya — Binance tetap dipanggil langsung dari NestJS.

---

## 🛠️ Tech Stack

**Frontend**
* Vue 3 (Composition API, `<script setup>`) + TypeScript
* TradingView Lightweight Charts v4
* TailwindCSS 3
* Socket.IO client
* Vite 6 → build statis, disajikan oleh nginx

**Backend & AI Pipeline**
* NestJS 10 (Market Data Gateway, WebSocket & REST API)
* Python 3.11 / FastAPI (AI Sentiment Inference & News Scraper Service)
* Hugging Face `transformers` (FinBERT — `ProsusAI/finbert`)
* PyTorch (wheel CPU-only)
* `yfinance` 1.x + `curl_cffi` (data saham), `feedparser` + APScheduler (scraper)

**Infrastruktur & Database**
* PostgreSQL 16 — data historis harga & *log* sentimen
* Redis 7 — *cache* harga *real-time*
* RabbitMQ 3.13 — *message broker* distribusi *task* scraper → AI engine
* Docker & Docker Compose

---

## 🖥️ System Requirements

Aplikasi dirancang tanpa *overhead* orkestrasi berat, ideal untuk *bare-metal* Linux atau *single VM*:

| Resource     | Minimum      | Catatan                                                       |
|--------------|--------------|---------------------------------------------------------------|
| **CPU**      | 4 cores      | Inferensi FinBERT berjalan di CPU                             |
| **RAM**      | 4 GB         | Stack idle di ~1.6 GB dengan batas default                    |
| **RAM**      | 8 GB         | Direkomendasikan, memberi ruang untuk build image             |
| **Storage**  | 20+ GB SSD   | ~3 GB image + ~450 MB bobot model + histori harga             |
| **OS**       | Linux        | Ubuntu Server / Debian. Windows via Docker Desktop juga jalan  |

### Pemakaian memori aktual

Hanya `nlp-worker` yang menahan bobot FinBERT secara permanen (~1 GB). `nlp-engine` memuatnya secara *lazy* — hanya jika `/analyze` dipanggil — karena tugas utamanya menyajikan data saham.

| Container      | Batas   | Idle    |
|----------------|---------|---------|
| `nlp-worker`   | 2 GB    | ~1 GB   |
| `nlp-engine`   | 2 GB    | ~250 MB |
| `postgres`     | 512 MB  | ~50 MB  |
| `rabbitmq`     | 512 MB  | ~130 MB |
| `api-gateway`  | 512 MB  | ~90 MB  |
| `news-scraper` | 256 MB  | ~80 MB  |
| `redis`        | 192 MB  | ~10 MB  |
| `frontend`     | 128 MB  | ~5 MB   |

Semua batas bisa diubah lewat `.env` (`NLP_WORKER_MEM_LIMIT`, `API_MEM_LIMIT`, dst.).

### ⚠️ Pengguna Windows / Docker Desktop — penting

Docker Desktop berjalan di atas WSL2. **Secara default WSL2 mengambil 50% RAM host dan seluruh core CPU**, lalu menahan memorinya sampai WSL dimatikan — ini penyebab umum Windows nge-hang saat build. Batasi lewat `%USERPROFILE%\.wslconfig`:

```ini
[wsl2]
memory=10GB
processors=8
swap=4GB
autoMemoryReclaim=gradual
sparseVhd=true
```

Terapkan dengan `wsl --shutdown`, lalu nyalakan ulang Docker Desktop. Turunkan `memory` bila RAM Anda lebih kecil — 6 GB sudah cukup untuk menjalankan stack ini (build butuh sedikit lebih banyak).

---

## 🚀 Quick Start

### Prasyarat

* Docker Engine 24+ dan Docker Compose v2
* Koneksi internet (Binance, Yahoo Finance, RSS, dan unduhan bobot HuggingFace)

### Menjalankan

```bash
git clone <repo-url>
cd ShareForecast

# 1. Siapkan konfigurasi
cp .env.example .env
#    Wajib: ganti POSTGRES_PASSWORD dan RABBITMQ_PASSWORD

# 2. Build & jalankan seluruh stack
docker compose up -d --build

# 3. Pantau proses (unduhan model ~450 MB terjadi di sini)
docker compose logs -f nlp-worker
```

**Boot pertama memakan waktu 5–15 menit** — sebagian besar untuk mengunduh bobot FinBERT dan meng-*install* PyTorch. Bobotnya disimpan di volume `model_cache`, jadi restart berikutnya berlangsung cepat.

### Akses

| Layanan             | URL                          |
|---------------------|------------------------------|
| Dashboard           | http://localhost:8080        |
| REST API            | http://localhost:3000/api    |
| Health check        | http://localhost:3000/api/health |
| RabbitMQ Management | http://localhost:15672       |

Watchlist awal (4 kripto + 6 saham, termasuk BBCA & BBRI) sudah di-*seed* otomatis oleh [`infra/postgres/init.sql`](infra/postgres/init.sql).

### Mode Pengembangan

```bash
# Hanya infrastruktur
docker compose up -d postgres redis rabbitmq

# api-gateway (hot reload)
cd api-gateway && npm install && npm run start:dev

# nlp-engine
cd nlp-engine && pip install -r requirements.txt
uvicorn app.main:app --reload

# frontend
cd frontend && npm install && npm run dev   # http://localhost:5173
```

---

## 📡 API Reference

Semua *endpoint* diawali `/api`.

### Assets

| Method | Path                   | Keterangan                              |
|--------|------------------------|-----------------------------------------|
| `GET`  | `/api/assets`          | Daftar watchlist. Query: `?type=crypto\|stock` |
| `GET`  | `/api/assets/:symbol`  | Detail satu aset                        |

### Market

| Method | Path                          | Keterangan                                          |
|--------|-------------------------------|-----------------------------------------------------|
| `GET`  | `/api/market/quotes`          | Harga terkini seluruh watchlist                     |
| `GET`  | `/api/market/:symbol/quote`   | Harga terkini satu aset (Redis-cached)              |
| `GET`  | `/api/market/:symbol/candles` | OHLCV. Query: `interval` (`1m,5m,15m,30m,1h,1d,1w`), `limit` (1–1000) |

### Sentiment

| Method | Path                             | Keterangan                                             |
|--------|----------------------------------|--------------------------------------------------------|
| `GET`  | `/api/sentiment/news`            | Feed berita terskor. Query: `symbol`, `limit` (1–200)  |
| `GET`  | `/api/sentiment/summary`         | Distribusi bullish/bearish/neutral. Query: `symbol`, `hours` |
| `GET`  | `/api/sentiment/:symbol/overlay` | Deret sentimen selaras *candle*. Query: `interval`, `limit` |

### WebSocket (Socket.IO — `ws://localhost:3000`)

| Arah              | Event            | Payload                              |
|-------------------|------------------|--------------------------------------|
| client → server   | `subscribe`      | `{ symbol: "BTCUSDT" }`              |
| client → server   | `unsubscribe`    | `{ symbol: "BTCUSDT" }`              |
| server → client   | `quote`          | Harga untuk simbol yang di-*subscribe* |
| server → client   | `ticker`         | Harga untuk semua simbol             |
| server → client   | `sentiment`      | Artikel terskor untuk simbol tsb.    |
| server → client   | `sentiment:all`  | Semua artikel terskor                |

### Internal — nlp-engine (`http://nlp-engine:8000`, tidak diekspos)

`GET /health` · `POST /analyze` · `POST /analyze/batch` · `GET /market/stocks/{symbol}/candles` · `GET /market/stocks/{symbol}/quote`

---

## ⚙️ Environment Variables

Salin [`.env.example`](.env.example) ke `.env`. Yang paling sering diubah:

| Variable                  | Default            | Keterangan                                        |
|---------------------------|--------------------|---------------------------------------------------|
| `POSTGRES_PASSWORD`       | —                  | **Wajib diganti**                                 |
| `RABBITMQ_PASSWORD`       | —                  | **Wajib diganti**                                 |
| `FINBERT_MODEL`           | `ProsusAI/finbert` | Model HuggingFace untuk inferensi                 |
| `FINBERT_DEVICE`          | `cpu`              | `cpu` atau `cuda`                                 |
| `SCRAPE_INTERVAL_MINUTES` | `10`               | Jeda antar-*pass* scraping RSS                    |
| `SCRAPE_MAX_ITEMS`        | `25`               | Batas artikel per feed per *pass*                 |
| `PRICE_POLL_INTERVAL_MS`  | `5000`             | Frekuensi *polling* harga oleh gateway            |
| `PRICE_CACHE_TTL`         | `30`               | TTL cache harga di Redis (detik)                  |
| `CORS_ORIGINS`            | localhost          | Origin yang boleh mengakses API/WebSocket         |
| `BINANCE_API_URL`         | `data-api.binance.vision/api/v3` | Host market data Binance — lihat [Troubleshooting](#-troubleshooting) |

---

## 📂 Struktur Repositori

```text
.
├── frontend/                # Aplikasi Vue 3 (UI & Visualisasi)
│   ├── src/
│   │   ├── components/      # PriceChart, AssetSidebar, NewsFeed, SentimentGauge
│   │   ├── composables/     # useSocket — koneksi Socket.IO bersama
│   │   ├── api/             # Typed REST client
│   │   └── lib/             # Formatter harga, persen, waktu relatif
│   ├── nginx.conf           # Konfigurasi SPA untuk image produksi
│   └── Dockerfile
├── api-gateway/             # Service NestJS (Data & REST/WebSocket)
│   ├── src/
│   │   ├── assets/          # Watchlist
│   │   ├── market/          # Binance + proxy saham + cache + arsip candle
│   │   ├── sentiment/       # Query feed, summary, overlay
│   │   ├── realtime/        # WebSocket gateway, price poller, konsumer AMQP
│   │   ├── database/        # Pool pg
│   │   └── redis/           # Klien Redis
│   └── Dockerfile
├── nlp-engine/              # Service Python/FastAPI (FinBERT & Scraper)
│   ├── app/
│   │   ├── main.py          # FastAPI: /analyze, /market/stocks/*
│   │   ├── worker.py        # Konsumer RabbitMQ → FinBERT → Postgres
│   │   ├── scraper.py       # Penjadwal RSS → RabbitMQ
│   │   ├── sentiment.py     # Wrapper FinBERT
│   │   ├── market.py        # yfinance
│   │   └── feeds.py         # Daftar sumber RSS
│   └── Dockerfile
├── infra/postgres/init.sql  # Skema DB + seed watchlist
├── docker-compose.yml       # Orkestrasi microservices (Services + DB + Broker)
├── .env.example
└── README.md
```

---

## 🩺 Troubleshooting

**`binance request failed: ETIMEDOUT`**
Host `api.binance.com` diblokir di sebagian jaringan/region (dan pada beberapa setup Docker Desktop, tidak terjangkau dari dalam container meski host bisa). Default proyek ini sudah memakai `https://data-api.binance.vision/api/v3` — host *market data* publik resmi Binance yang menyajikan endpoint `/api/v3` yang sama tanpa API key. Bila ingin memaksa host lain, ubah `BINANCE_API_URL` di `.env`.

**Data saham kosong / `no market data for this symbol`**
Yahoo Finance menolak *traffic* `requests` biasa dan mengembalikan halaman HTML, sehingga yfinance gagal mem-parsing JSON. Proyek ini mem-*pin* `yfinance==1.6.0` yang menyamar sebagai browser lewat `curl_cffi`. Jangan turunkan ke seri `0.2.x` — versi tersebut sudah tidak berfungsi.

**`no entries from <feed>` di log scraper**
Sebagian sumber RSS sesekali menyajikan XML yang cacat. Scraper sengaja melewati feed bermasalah dan melanjutkan sisanya — ini perilaku normal, bukan kegagalan.

**Boot pertama terasa lama / `nlp-worker` belum memproses apa pun**
Worker mengunduh bobot FinBERT (~450 MB) sebelum mengambil pesan pertama. Pantau dengan `docker compose logs -f nlp-worker`; setelah muncul `FinBERT ready`, antrean akan diproses dengan cepat.

---

## 🔒 Catatan Keamanan

Konfigurasi *default* ditujukan untuk jaringan lokal tepercaya. Sebelum dipublikasikan:

* Ganti seluruh *password default* di `.env`.
* Jangan ekspos port RabbitMQ Management (15672) ke publik.
* Tempatkan `api-gateway` di belakang *reverse proxy* dengan TLS dan rate limiting.
* `nlp-engine` sengaja tidak punya autentikasi — biarkan ia hanya terjangkau dari dalam jaringan Compose.
* Persempit `CORS_ORIGINS` ke domain frontend yang sebenarnya.

---

## 🗺️ Roadmap

- [ ] Test suite (Vitest untuk frontend, pytest untuk nlp-engine, Jest untuk gateway)
- [ ] Autentikasi + rate limiting di gateway
- [ ] Binance WebSocket stream menggantikan *polling* untuk kripto
- [ ] Named Entity Recognition agar pemetaan artikel→aset lebih akurat dari *keyword matching*
- [ ] Retensi & agregasi data historis (kandidat: TimescaleDB)
- [ ] Watchlist yang bisa diatur pengguna dari UI

---

## ⚠️ Disclaimer

Proyek ini dibuat untuk keperluan edukasi dan riset. Skor sentimen yang dihasilkan **bukan nasihat keuangan**. FinBERT dilatih pada teks finansial berbahasa Inggris, sehingga akurasinya pada berita berbahasa Indonesia lebih rendah.

---

## 📄 License

[MIT](LICENSE) © 2026 Rafael Febrian
