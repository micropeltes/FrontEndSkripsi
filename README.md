# GOD - Garbage Odor Detection (Frontend)

Frontend React + Vite untuk dashboard monitoring IoT.

## Arsitektur API Saat Ini

Production menggunakan reverse proxy Nginx:

- Frontend: `http://SERVER_IP:5000`
- FastAPI upstream: `127.0.0.1:8000`
- Nginx route: `location ^~ /api/ { proxy_pass http://127.0.0.1:8000; }`

Konsekuensi di frontend:

- Selalu panggil API dengan relative path `/api/*`
- Contoh: `/api/v1/sensors/latest?device_id=ESP-00`
- Jangan hardcode host/IP backend di kode frontend

Konfigurasi env frontend:

```env
VITE_API_BASE=/api
```

Gunakan `.env.example` sebagai template.

Nilai ini dipakai langsung oleh dashboard untuk membentuk endpoint:

- `/api/v1/sensors/latest?device_id=ESP-00`
- `/api/v1/sensors/{sensor}/latest?device_id=ESP-00`

## Menjalankan Development

1. Install dependency

```bash
npm install
```

2. Jalankan frontend Vite

```bash
npm run dev
```

3. Frontend dev berjalan di:

- `http://localhost:5173`

Catatan:

- Vite dev proxy untuk `/api` default ke `http://127.0.0.1:8000`
- Bisa diubah lewat env shell `VITE_DEV_API_TARGET`

Contoh (PowerShell):

```powershell
$env:VITE_DEV_API_TARGET="http://127.0.0.1:8000"; npm run dev
```

## Build Production

```bash
npm run build
npm run preview
```

Pastikan file hasil build (`dist`) disajikan Nginx pada port `5000` dan route `/api/*` diproxy ke FastAPI.

## Legacy Proxy (Opsional)

Repo masih menyimpan proxy Hono lama untuk kompatibilitas:

```bash
npm run dev:legacy-proxy
```

Wajib set environment variable `SOURCE_API` terlebih dulu, contoh:

```powershell
$env:SOURCE_API="http://127.0.0.1:8000/api/v1/sensors/latest"; npm run dev:legacy-proxy
```
