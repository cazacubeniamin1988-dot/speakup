# Benglish – serverul de voce (ElevenLabs prin Cloudflare Workers)

Aplicația Benglish este o pagină statică pe GitHub Pages, fără server propriu.
Cheia ElevenLabs nu are voie să stea în aplicație, așa că folosim un mic server gratuit,
un **Cloudflare Worker**. Cheia ElevenLabs stă doar acolo, ca secret.

```
iPhone (Benglish)  →  Cloudflare Worker (cheia ElevenLabs, secret)  →  ElevenLabs
                   ←        fișier audio MP3 (păstrat și în cache)   ←
```

## 1. Cheia ElevenLabs
1. Intră pe elevenlabs.io și fă-ți cont.
2. Deschide **Developers** (sau profilul) → **API Keys** → **Create API Key**.
3. Dă-i permisiunea **Text to Speech**. Poți pune și o limită de caractere pe cheie.
4. Copiaz-o. O folosești doar la pasul 3 și n-o trimiți nimănui.

## 2. Worker-ul pe Cloudflare (gratuit)
1. Fă-ți cont pe dash.cloudflare.com.
2. **Workers & Pages** → **Create** → **Create Worker** → nume `benglish-tts` → **Deploy**.
3. **Edit code** → șterge tot → lipește conținutul fișierului `benglish-tts-worker.js` → **Deploy**.
4. **Storage & Databases → KV** → **Create namespace** cu numele `benglish-tts-cache`.
5. Înapoi la worker → **Settings → Bindings → Add → KV namespace**: nume variabilă `TTS_CACHE`, namespace `benglish-tts-cache`.

## 3. Secretele
Worker → **Settings → Variables and Secrets → Add**:

| Nume | Tip | Valoare |
|---|---|---|
| `ELEVENLABS_API_KEY` | Secret | cheia de la pasul 1 |
| `APP_KEY` | Secret | un cod lung inventat de tine (îl scrii o dată în aplicație) |
| `DAILY_CHAR_LIMIT` | Text (opțional) | ex. `20000`, câte caractere noi se pot genera pe zi |

## 4. În aplicație
Copiază adresa worker-ului (de forma `https://benglish-tts.NUME.workers.dev`).
În Benglish: **Eu → Microfon și voce → Profesorul AI** → lipește adresa și codul `APP_KEY` →
alege vocea → **Salvează și testează**.

## Siguranță și costuri
- Cheia ElevenLabs nu ajunge niciodată pe telefon și nu e în codul aplicației.
- Worker-ul răspunde doar cererilor care au codul aplicației (`APP_KEY`) și doar de pe adresa aplicației.
- Fiecare text se generează o singură dată: se păstrează în KV pe server și în memoria telefonului.
  Aceeași propoziție ascultată de 100 de ori costă o singură dată.
- `DAILY_CHAR_LIMIT` oprește consumul dacă ceva merge greșit.
