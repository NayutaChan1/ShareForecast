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
* **AI Sentiment Analysis** — Inferensi NLP dengan **FinBERT** untuk berita berbahasa Inggris, dan **leksikon finansial Indonesia** untuk berita berbahasa Indonesia. Pemilihan model otomatis berdasarkan bahasa sumber feed.
* **Sentiment Overlay Chart** — Visualisasi UI interaktif yang menumpuk (*overlay*) indikator sentimen berita langsung di atas grafik harga, dengan *bucket* waktu yang selaras dengan interval *candle*.
* **Kartu Kondisi Aset** — Ringkasan teknis terukur (tren, RSI, volatilitas, posisi rentang, volume) di bawah grafik. Menyajikan bukti, bukan rekomendasi beli/jual.

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

> **Kenapa berita Indonesia tidak pakai FinBERT?** Diukur pada 60 judul asli CNBC Indonesia, FinBERT mengembalikan `neutral` untuk **59 di antaranya** — praktis nol sinyal. Model sentimen Indonesia siap pakai (IndoBERT, indonesian-roberta) gagal juga, dengan sebab berbeda: keduanya dilatih untuk sentimen umum, di mana *"IHSG naik 0,75%"* adalah pernyataan fakta yang netral secara emosi, bukan sinyal bullish. Detail lengkapnya di [Catatan Sentimen Indonesia](#-catatan-sentimen-indonesia).

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

## 🚢 Deployment Produksi

Stack ini sudah *compose-native*, jadi deployment-nya satu VPS tanpa rearsitektur. Overlay [`docker-compose.prod.yml`](docker-compose.prod.yml) menambahkan Caddy sebagai satu-satunya pintu masuk dan menutup seluruh port lain.

### Yang berubah di produksi

| | Development | Produksi |
|---|---|---|
| Port terbuka | 3000, 8080, 15672 | **hanya 80 & 443** (Caddy) |
| RabbitMQ Management | terbuka | terkunci di `127.0.0.1`, akses via SSH tunnel |
| TLS | tidak ada | otomatis via Let's Encrypt |
| Frontend → API | cross-origin (CORS) | **same-origin**, tanpa CORS |

### Prasyarat

- VPS **4 GB RAM** (idle ~1.2 GB, puncak ~2.3 GB). 8 GB lebih lega bila build di server.
- Docker Engine 24+ & Compose v2.24+ (tag `!reset` butuh versi ini).
- Domain dengan **A record sudah mengarah ke IP server** — Caddy memverifikasi lewat HTTP sebelum menerbitkan sertifikat, jadi DNS harus siap lebih dulu.
- Port 80 & 443 tidak diblokir firewall.

### Langkah

```bash
git clone <repo-url> && cd ShareForecast

# 1. Siapkan konfigurasi
cp .env.production.example .env

# 2. Buat password acak, jangan diketik manual
openssl rand -base64 24   # -> POSTGRES_PASSWORD
openssl rand -base64 24   # -> RABBITMQ_PASSWORD

# 3. Edit .env, isi setiap baris bertanda [GANTI]
nano .env

# 4. Jalankan — overlay produksi WAJIB disertakan
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build
```

> ⚠️ Kalau `-f docker-compose.prod.yml` lupa disertakan, stack jalan dengan konfigurasi development — **port 15672 terbuka ke internet dengan password RabbitMQ Anda**. Simpan perintahnya sebagai alias agar tidak terlewat.

Build pertama 10–20 menit (unduh PyTorch + bobot FinBERT ~450 MB). Di VPS 4 GB, build image torch bisa kehabisan memori — kalau itu terjadi, build di lokal lalu push ke registry, atau tambah swap:

```bash
sudo fallocate -l 4G /swapfile && sudo chmod 600 /swapfile
sudo mkswap /swapfile && sudo swapon /swapfile
```

### Verifikasi setelah deploy

```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml ps      # semua healthy
curl -s https://$DOMAIN/api/health                                       # {"status":"ok",...}
docker compose logs caddy | grep -i "certificate obtained"               # TLS terbit
docker compose logs -f nlp-worker                                        # FinBERT mulai menskor
ss -tlnp | grep -E ':(3000|8080)'                                        # harus KOSONG
```

Baris terakhir yang paling penting — kalau ada isinya, overlay produksi tidak terpakai.

### Operasional

```bash
# Alias supaya tidak lupa overlay
alias dcp='docker compose -f docker-compose.yml -f docker-compose.prod.yml'

dcp logs -f api-gateway          # pantau log
dcp pull && dcp up -d --build    # update setelah git pull
dcp down                         # matikan (volume data tetap aman)

# Backup database — jadwalkan lewat cron
dcp exec -T postgres pg_dump -U market market_sentiment | gzip > backup-$(date +%F).sql.gz

# Buka RabbitMQ Management dari mesin Anda
ssh -L 15672:localhost:15672 user@server   # lalu buka http://localhost:15672
```

Volume yang **wajib** ikut backup: `postgres_data` (histori harga & sentimen) dan `caddy_data` (sertifikat — Let's Encrypt punya rate limit penerbitan ulang).

---

## 📡 API Reference

Semua *endpoint* diawali `/api`.

### Assets

| Method   | Path                            | Keterangan                              |
|----------|---------------------------------|-----------------------------------------|
| `GET`    | `/api/assets`                   | Daftar watchlist. Query: `?type=crypto\|stock` |
| `GET`    | `/api/assets/:symbol`           | Detail satu aset, termasuk kata kuncinya |
| `POST`   | `/api/assets`                   | Tambah aset. Simbol diverifikasi ke Binance/Yahoo sebelum disimpan |
| `PUT`    | `/api/assets/:symbol/keywords`  | Ganti daftar kata kunci, lalu tandai ulang arsip berita |
| `DELETE` | `/api/assets/:symbol`           | Hapus aset beserta candle & tag beritanya |

Semuanya bisa dilakukan dari UI — tombol **+** di header sidebar untuk menambah, lalu saat hover pada baris aset muncul **✎** (editor kata kunci) dan **✕** (hapus).

```bash
# Tambah aset
curl -X POST http://localhost:3000/api/assets \
  -H 'content-type: application/json' \
  -d '{"symbol":"ADAUSDT","name":"Cardano","type":"crypto","keywords":["cardano"]}'

# Ganti kata kunci (kirim daftar lengkap, bukan selisihnya)
curl -X PUT http://localhost:3000/api/assets/ADAUSDT/keywords \
  -H 'content-type: application/json' \
  -d '{"keywords":["cardano","ada coin"]}'

# Hapus aset
curl -X DELETE http://localhost:3000/api/assets/ADAUSDT
```

**Penandaan ulang otomatis.** `POST` dan `PUT` sama-sama memindai arsip berita dan mengembalikan `taggedArticles` — jumlah artikel yang cocok setelah operasi. `PUT` menghitung ulang dari nol, bukan menambal, sehingga kata kunci yang dihapus juga **melepas** artikel yang hanya cocok karenanya:

| Kata kunci BTCUSDT | Artikel ter-tag |
|---|---|
| `bitcoin`, `btc` | 72 |
| hapus `bitcoin`, sisa `btc` | 12 |
| kembalikan keduanya | 72 |

> ⚠️ Endpoint tulis ini **tidak berautentikasi**, sama seperti seluruh API lainnya. Siapa pun yang bisa menjangkau gateway dapat mengubah watchlist. Ini alasan tambahan untuk tidak mengekspos API langsung ke publik — lihat [Catatan Keamanan](#-catatan-keamanan).

### Market

| Method | Path                          | Keterangan                                          |
|--------|-------------------------------|-----------------------------------------------------|
| `GET`  | `/api/market/quotes`          | Harga terkini seluruh watchlist                     |
| `GET`  | `/api/market/:symbol/quote`   | Harga terkini satu aset (Redis-cached)              |
| `GET`  | `/api/market/:symbol/candles` | OHLCV. Query: `interval` (`1m,5m,15m,30m,1h,1d,1w`), `limit` (1–1000) |
| `GET`  | `/api/market/:symbol/condition` | Ringkasan kondisi teknis dari 200 candle harian |

**Kartu Kondisi Aset.** Endpoint `condition` menghitung lima indikator dari harga saja — tren (SMA 20/50), momentum (RSI-14 Wilder), volatilitas (deviasi baku return harian, disetahunkan), posisi dalam rentang periode, dan tren volume. Tiap indikator dikembalikan sebagai `{ value, reading }`, dengan `reading` berupa kalimat bahasa Indonesia.

Dua keputusan desain yang disengaja:

* **Tidak ada skor gabungan.** Tidak ada angka "layak beli 78/100". Kartu ini menyajikan bukti terukur; kesimpulannya milik Anda, karena sistem tidak tahu horizon waktu, toleransi risiko, maupun isi portofolio Anda.
* **Ambang batas menyesuaikan kelas aset.** Volatilitas 23% dibaca *"tenang untuk kripto"*, sementara 40% dibaca *"tinggi untuk saham"*. Penyetahunan juga berbeda — 365 hari untuk kripto, 252 hari bursa untuk saham; memakai yang salah meleset sekitar 20%.

Field `basis` selalu menyertakan jumlah candle yang dipakai dan flag `sufficient`. Bila di bawah 50 candle, sebagian indikator dikembalikan `null` dan UI menandainya — indikator dari 20 candle tidak pantas ditampilkan sepercaya diri indikator dari 200.

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

## 🇮🇩 Catatan Sentimen Indonesia

Berita berbahasa Indonesia tidak diskor oleh FinBERT, melainkan oleh leksikon finansial di [`nlp-engine/app/lexicon_id.py`](nlp-engine/app/lexicon_id.py). Keputusan itu diambil dari pengukuran, bukan asumsi.

### Yang diuji

Pada 60 judul asli dari feed CNBC Indonesia:

| Pendekatan | bullish | bearish | neutral | Biaya RAM |
|---|---|---|---|---|
| FinBERT | 0 | 1 | **59** | — |
| Leksikon finansial ID | 14 | 6 | 40 | **0 MB** |

Pada 7 kasus uji berlabel manual:

| Pendekatan | Skor | Biaya |
|---|---|---|
| FinBERT | 1/7 | — |
| IndoBERT (`mdhugol/...`) | 1/7 | +500 MB |
| `indonesian-roberta-...` | 1/7 | +500 MB |
| Terjemah id→en lalu FinBERT | 5/7 | +300 MB, +latensi |
| **Leksikon finansial ID** | **5/7** | **0 MB** |

Leksikon menang karena akurasinya setara pendekatan terjemahan tetapi tanpa biaya memori maupun latensi inferensi — dan judul pasar Indonesia sangat formulaik, hanya segelintir kata kerja yang membawa arah maknanya.

### Keterbatasannya — baca ini

- **Buta konteks.** Kata "rekor" bullish untuk laba, tetapi tidak untuk yield obligasi. Bobotnya sengaja direndahkan, namun kasus semacam ini tetap bisa lolos.
- **Confidence dibatasi 0.85.** Sebuah heuristik kata kunci tidak berhak mengklaim kepastian setara model terkalibrasi, dan kedua angka itu tampil berdampingan di UI.
- **Perlu perawatan manual.** Slang pasar baru harus ditambahkan ke leksikon; ia tidak belajar sendiri.
- **Hanya untuk gaya judul berita.** Teks panjang dan analitis kurang cocok.

Kolom `sentiment_scores.model` mencatat model mana yang dipakai (`ProsusAI/finbert` atau `id-financial-lexicon-v1`), jadi asal setiap skor selalu bisa ditelusuri.

### Kenapa saham Indonesia dapat sedikit berita?

Bukan karena pasokan berita kurang — sumber Indonesia menyumbang ~150 artikel. Penyebabnya **siklus liputan**: dari 151 judul Indonesia, `BBCA` disebut **0 kali** dan `BBRI` **1 kali**, sementara `BYAN` 8 kali karena sedang ramai rumor akuisisi. Media memberitakan emiten yang sedang bergerak, bukan blue chip yang tenang.

Kalau ingin overlay sentimen yang ramai, pantau emiten yang sedang jadi sorotan — bukan yang paling besar.

> 💡 **Memilih kata kunci itu murah untuk dicoba.** Tombol **✎** pada baris aset membuka editor kata kunci, dan menyimpan langsung menandai ulang seluruh arsip lalu melaporkan berapa artikel yang cocok. Jadi Anda bisa menguji kata kunci berisiko — misalnya `bumi`, yang juga berarti "earth" — lalu menghapusnya lagi kalau ternyata menarik berita non-pasar.

---

## 🩺 Troubleshooting

**`binance request failed: ETIMEDOUT`**
Host `api.binance.com` diblokir di sebagian jaringan/region (dan pada beberapa setup Docker Desktop, tidak terjangkau dari dalam container meski host bisa). Default proyek ini sudah memakai `https://data-api.binance.vision/api/v3` — host *market data* publik resmi Binance yang menyajikan endpoint `/api/v3` yang sama tanpa API key. Bila ingin memaksa host lain, ubah `BINANCE_API_URL` di `.env`.

**Data saham kosong / `no market data for this symbol`**
Yahoo Finance menolak *traffic* `requests` biasa dan mengembalikan halaman HTML, sehingga yfinance gagal mem-parsing JSON. Proyek ini mem-*pin* `yfinance==1.6.0` yang menyamar sebagai browser lewat `curl_cffi`. Jangan turunkan ke seri `0.2.x` — versi tersebut sudah tidak berfungsi.

**Berita berhenti bertambah, log scraper penuh `Run time of job ... was missed`**

APScheduler membuang job yang terlambat melewati `misfire_grace_time`, dan **default-nya hanya 1 detik**. Di bawah Docker Desktop, proses kerap bangun ~50 detik terlambat, sehingga *setiap* tick dibuang dan scraping berhenti total setelah pass pertama. Proyek ini menyetelnya ke satu interval penuh — run yang telat tetap dijalankan. Kalau gejalanya muncul lagi, periksa `misfire_grace_time` di [`scraper.py`](nlp-engine/app/scraper.py), bukan jam sistem: jam host dan container biasanya sudah sinkron.

Koneksi RabbitMQ scraper juga sengaja dibuka **per pass** lalu ditutup. Menahannya menganggur selama interval akan melewatkan heartbeat (60 detik) dan broker memutusnya, sehingga publish berikutnya gagal.

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

Proyek ini dibuat untuk keperluan edukasi dan riset. Skor sentimen yang dihasilkan **bukan nasihat keuangan**. Berita Inggris diskor FinBERT; berita Indonesia diskor leksikon berbasis kata kunci yang buta konteks dan perlu perawatan manual — lihat [Catatan Sentimen Indonesia](#-catatan-sentimen-indonesia) untuk keterbatasannya.

---

## 📄 License

[MIT](LICENSE) © 2026 Rafael Febrian
