# SAT Prep — Telegram Mini App

O'quv markaz uchun **Digital SAT** tayyorlov ilovasi. Operator bitta savol **shablonini** kiritadi — tizim undagi sonlarni
tasodifiy almashtirib **cheksiz variant** yasaydi. Har bir o'quvchi bir xil savolning o'z variantini oladi, ko'chirib bo'lmaydi.

**Stek:** React + Vite + TS + Tailwind + KaTeX (Vercel) · Node.js + Express + TS + Prisma (Railway) · PostgreSQL (Neon) · telegraf bot · Socket.IO

**Repolar:** backend (API, bot, generator, baza) — [sat-backend](https://github.com/Mustafouchiha/sat-backend) ·
Mini App (frontend) — [sat-frotend](https://github.com/Mustafouchiha/sat-frotend) · Bot — [@SATlyBot](https://t.me/SATlyBot)

---

## Imkoniyatlar

| Bo'lim | Nima bor |
|---|---|
| **Variant generator** | `int`/`decimal`/`fraction`/`choice` o'zgaruvchilar, hosilaviy formulalar (mathjs, `eval` yo'q), cheklovlar (200 urinishgacha), MCQ (chalg'ituvchi formulalar) / MCQ_TEXT / SPR, seed → har doim bir xil variant, 500-variantli avto-tekshiruv, chiroyli formatlash (`1x→x`, `+ -3 → - 3`, kasr qisqartirish, ildiz soddalashtirish), SVG chizmalar |
| **SPR javoblar** | `3/4` = `0.75` = `.75`, takrorlanuvchi kasr uchun SAT qoidasi (`.6666`, `.6667`), musbat 5 / manfiy 6 belgi |
| **Testlar** | Real SAT tuzilishi (R&W 2×27/32 daq, 10 daq tanaffus, Math 2×22/35 daq), **adaptiv 2-modul**, 200–800 / 400–1600 ball (shkala admin panelda), server taymeri, modulga qaytib bo'lmaydi, offline javob navbati |
| **Test interfeysi** | Bluebook kabi: taymer (yashirish), Mark for Review, Answer Eliminator, savollar navigatori, kalkulyator (Desmos yoki ilmiy), formulalar varag'i, nusxa olishni cheklash, ilovadan chiqishni qayd qilish |
| **Moslashuv** | Ko'nikma bo'yicha mastery (0–100%), spaced repetition (1/3/7/14 kun), avto-test 60/25/15 (zaif/o'rtacha/kuchli), "Men uchun" (reyting ±150, ~65% to'g'ri) |
| **Reyting** | Chess kabi Elo: umumiy/Math/R&W, provisional (`?`), savolning ham reytingi, `+12`/`−8` animatsiya, unvonlar, taxminiy SAT, haftalik/oylik jadvallar |
| **O'yin** | Kunlik test (00:00 Toshkent, umumiy + shaxsiy qism), streak + freeze, Puzzle Rush (3/5 daq, 3 jon), Duel 1v1 (WebSocket), 21 ta yutuq, XP/daraja |
| **O'qituvchi** | Guruhlar, taklif kodi, topshiriq (muddat, urinishlar, natija vaqti), o'quvchi profili, guruh tahlili (eng zaif ko'nikmalar), Excel eksport, izohlar, savol taklif qilish |
| **Operator/Admin** | Shablon muharriri (forma + JSON), tayyor savoldan shablon, **Claude AI yordamchi**, preview (10 variant), avto/qo'lda test, rollar, ball shkalasi, sozlamalar, statistika, shikoyatlar, e'lonlar, audit, CSV/JSON import |
| **Bot** | `/start` + Mini App tugmasi, guruh/duel havolalari, yangi topshiriq, muddat eslatmasi (24 va 2 soat), natija tayyor, kunlik test eslatmasi, ota-onaga haftalik hisobot, adminga kunlik statistika |

---

## Tuzilma

```
sat 2/
├── packages/
│   ├── generator/      # Variant generatori (seed, formatlash, SPR, avto-tekshiruv) + 32 unit test
│   └── shared/         # Elo, mastery, SRS, avto-test, ball, streak, yutuqlar, taksonomiya + 29 unit test
├── apps/
│   ├── api/            # Express + Prisma + telegraf + Socket.IO  → Railway
│   │   ├── prisma/     # schema.prisma, migratsiya, seed (36 namunaviy shablon, mock test)
│   │   └── src/        # routes/, lib/ (testEngine, sessions, effects, duels, ai, ...), bot.ts, cron.ts
│   └── miniapp/        # React Mini App → Vercel (alohida repo: sat-frotend, lokal shu papkaga klonlanadi)
├── railway.json        # Railway build/start sozlamasi
└── docker-compose.yml  # (ixtiyoriy) lokal Postgres
```

```
 Telegram ──► Mini App (Vercel) ──HTTPS/WSS──► API (Railway) ──► Neon Postgres
     ▲                                             │
     └────────────── bot (webhook) ◄───────────────┘   cron: kunlik test, eslatmalar, hisobotlar
```

**Muhim tamoyil:** o'quvchi test topshirganda faqat `template_id + versiya + seed + javob` saqlanadi. Variant istalgan
vaqtda aynan qayta tiklanadi (natija, shikoyatni tekshirish). Shablon tahrirlansa yangi versiya yaratiladi — eski
urinishlar buzilmaydi. To'g'ri javoblar test tugamaguncha frontendga yuborilmaydi, tekshirish faqat serverda.

---

## Lokal ishga tushirish

Talab: Node.js 20+, PostgreSQL (Docker yoki Neon'dagi bepul baza).

```bash
git clone https://github.com/Mustafouchiha/sat-backend.git sat
```

```bash
git clone https://github.com/Mustafouchiha/sat-frotend.git sat/apps/miniapp
```

`sat` papkasida:

```bash
npm install
```

```bash
npm --prefix apps/miniapp install
```

```bash
docker compose up -d
```

`apps/api/.env` yarating (`apps/api/.env.example` asosida). Lokal uchun minimal:

```env
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/sat
DIRECT_URL=postgresql://postgres:postgres@localhost:5432/sat
JWT_SECRET=local-dev-secret-change-me-please-32chars
MINI_APP_URL=http://localhost:5173
ALLOW_DEV_LOGIN=true
BOT_MODE=off
CRON_ENABLED=false
```

```bash
npm run db:migrate
```

```bash
npm run db:seed
```

```bash
npm run dev:api
```

`apps/miniapp/.env.local`:

```env
VITE_API_URL=http://localhost:4000
VITE_DEV_LOGIN=true
```

```bash
npm run dev:web
```

http://localhost:5173 — "Test foydalanuvchi sifatida kirish" tugmalari (O'quvchi / O'qituvchi / Operator / Super admin).
Seed foydalanuvchilari: tgId `100000001` (admin) … `100000006` (ota-ona), guruh taklif kodi **SAT1EV**.

Testlar:

```bash
npm test
```

```bash
npm run typecheck
```

---

## Deploy: Neon + Railway + Vercel + Telegram

Railway `sat-backend` repo'sidan, Vercel `sat-frotend` repo'sidan deploy qiladi. Tartib: Neon → Railway (domen olish) →
Vercel (`VITE_API_URL` = Railway domeni) → Railway'da `MINI_APP_URL` = Vercel domeni → qayta deploy.

### 1. Neon (ma'lumotlar bazasi)

1. https://console.neon.tech → **New Project** (region: Frankfurt `eu-central-1` — O'zbekistonga yaqin).
2. **Connection Details** dan ikkita satr oling:
   - **Pooled connection** (host'da `-pooler`) → `DATABASE_URL`
   - **Direct connection** → `DIRECT_URL` (migratsiyalar uchun)
3. Ikkalasining oxirida `?sslmode=require` bo'lsin. Agar `prepared statement already exists` xatosi chiqsa, `DATABASE_URL` ga `&pgbouncer=true` qo'shing.

### 2. Telegram bot

1. [@BotFather](https://t.me/BotFather) → `/newbot` → token (`BOT_TOKEN`) va username (`BOT_USERNAME`).
2. O'z Telegram ID'ingizni [@userinfobot](https://t.me/userinfobot) dan oling → `SUPER_ADMIN_TG_IDS`.
3. Menyu tugmasi server ishga tushganda avtomatik o'rnatiladi (`MINI_APP_URL` https bo'lsa).

### 3. Railway (API + bot)

1. https://railway.app → **New Project → Deploy from GitHub repo** → `sat-backend`. Region sifatida Neon bazasiga yaqinini tanlang (masalan US East).
2. Service → **Settings**: Root Directory — bo'sh (repo ildizi). `railway.json` build/start buyruqlarini o'zi beradi:
   build `npm run build -w @sat/api` (prisma generate + bundle), start `npm run start -w @sat/api` (migratsiya + server).
3. **Settings → Networking → Generate Domain** (masalan `sat-api.up.railway.app`). Bot shu domen orqali **webhook** rejimida ishlaydi.
4. **Variables** (`apps/api/.env.example` ga qarang):

   | O'zgaruvchi | Qiymat |
   |---|---|
   | `DATABASE_URL`, `DIRECT_URL` | Neon satrlari |
   | `JWT_SECRET` | 64 belgili tasodifiy satr |
   | `BOT_TOKEN`, `BOT_USERNAME` | BotFather'dan |
   | `WEBHOOK_SECRET` | tasodifiy satr (A-Z, a-z, 0-9, `_`, `-`) |
   | `MINI_APP_URL` | Vercel manzili (4-bosqichdan keyin) |
   | `SUPER_ADMIN_TG_IDS` | sizning Telegram ID |
   | `NODE_ENV` | `production` |
   | `ANTHROPIC_API_KEY` | ixtiyoriy — AI yordamchi |
   | `DESMOS_API_KEY` | ixtiyoriy — Desmos kalkulyator |

5. Deploydan keyin bir marta seed (taksonomiya, ball shkalasi, namunaviy savollar, mock test). Eng oson yo'li — o'z
   kompyuteringizdan: `apps/api/.env` ga Neon'ning `DATABASE_URL` va `DIRECT_URL` satrlarini yozing va:

```bash
npm run db:seed
```

   (yoki [Railway CLI](https://docs.railway.com/guides/cli) bilan: `railway run npm run db:seed` — Railway o'zgaruvchilari bilan lokal ishga tushadi).
   Seed qayta ishga tushirilsa mavjud yozuvlarni o'tkazib yuboradi. Productionda seed'dagi test foydalanuvchilarni
   (tgId `100000001…6`) admin paneldan bloklab qo'yish mumkin.

   Tekshirish: `https://<railway-domen>/api/health` → `{"ok":true,"db":true}`.

> Bir nechta replika ishlatsangiz, cron faqat bittasida ishlashi uchun qolganlarida `CRON_ENABLED=false` qiling.

### 4. Vercel (Mini App)

1. https://vercel.com → **Add New → Project** → `sat-frotend`.
2. Root Directory — bo'sh (repo ildizi), Framework: **Vite** (build `npm run build`, output `dist` — `vercel.json` da).
3. **Environment Variables:** `VITE_API_URL=https://<railway-domen>`, `VITE_BOT_USERNAME=<bot username>`.
4. Deploy → manzilni (masalan `https://sat-prep.vercel.app`) Railway'dagi `MINI_APP_URL` ga yozing va Railway'ni qayta deploy qiling (CORS va bot tugmasi uchun).

### 5. Telegram'ga ulash

- BotFather → `/mybots` → bot → **Bot Settings → Menu Button** — server o'zi o'rnatadi; qo'lda ham `MINI_APP_URL` ni berish mumkin.
- To'g'ridan-to'g'ri havola (`t.me/bot/app`) kerak bo'lsa: `/newapp` → URL = Vercel manzili.
- Desktop brauzerdan admin panelga kirish (Telegram Login Widget): `/setdomain` → Vercel domeni.
- Botda `/start` → **"SAT Mini App'ni ochish"**. Super admin avtomatik `ACTIVE`; o'quvchilar guruh taklif kodi bilan qo'shiladi
  (o'qituvchi "Ulashish" tugmasi bilan `t.me/<bot>?start=join_KOD` havolasini yuboradi).

---

## Shablon yozish qo'llanmasi

```json
{
  "stem": "If ${a}x + {b} = {c}$, what is the value of $x$?",
  "variables": [
    { "name": "a", "type": "int", "min": 2, "max": 9 },
    { "name": "b", "type": "int", "min": 1, "max": 20 },
    { "name": "x0", "type": "int", "min": -10, "max": 10, "exclude": [0] }
  ],
  "derived": [{ "name": "c", "expr": "a*x0 + b" }],
  "constraints": ["a != b", "isInt(answer)"],
  "answer": { "kind": "MCQ", "correct": "x0", "distractors": ["(c + b) / a", "c - b", "-x0"] },
  "explanation": "Subtract {b}: ${a}x = {=c-b}$, so $x = {x0}$."
}
```

| Yozuv | Ma'nosi |
|---|---|
| `{a}` | o'zgaruvchi qiymati (faqat e'lon qilingan nomlar; `\frac{1}{2}` kabi LaTeX qavslariga tegilmaydi) |
| `{a\|coef}` | koeffitsient: 1 → "", −1 → "−" |
| `{b\|signed}` / `{b\|signedcoef}` | "+ 3" / "− 3" (operator sifatida) |
| `{c\|frac}`, `{c\|slash}`, `{c\|sqrt}` | qisqartirilgan kasr, `p/q`, soddalashtirilgan ildiz |
| `{p\|d2}`, `{p\|r1}`, `{n\|comma}` | 2 xona (pul), yaxlitlash, minglik ajratgich |
| `{=a*b+1\|frac}` | matn ichida ifoda |
| `{name.1}` | choice qismi: `"Maria\|she"` → `she`; formulada `name_1`, indeks `name_i` |
| `$...$`, `$$...$$`, `\$` | KaTeX formula, display formula, dollar belgisi |

- **Turlar:** `int` (min, max, step, exclude), `decimal` (min, max, places), `fraction` (numMin…denMax; formulada `f_n`, `f_d`), `choice` (options).
- **Funksiyalar:** `sqrt abs round floor ceil mod gcd lcm min max`, `isInt(x)`, gradusda `sind cosd tand`, `hyp(a,b)`. Band nomlar: `answer v e i pi` va mathjs funksiyalari.
- **Javob:** `MCQ` (formula + 3+ chalg'ituvchi, ixtiyoriy `format`, `choiceTemplate` masalan `"${v}\\pi$"`), `MCQ_TEXT` (4 matn, birinchisi to'g'ri), `SPR` (formula).
- Saqlashda sxema + 200 variant tekshiriladi; "🧪 500 test" — to'liq hisobot (nolga bo'lish, takroriy variantlar, javob taqsimoti).

### CSV import ustunlari

`title, section, domainId, skillId, difficulty, stem, answerKind, correct, distractor1..5, format, variables (JSON), derived (JSON), constraints (JSON yoki "&&" bilan), explanation, passage, status`.
Excel'da "CSV UTF-8" sifatida saqlang. Namuna admin panelda (Import → "Namuna CSV").

---

## Prompt'dagi talablardan ongli farqlar

| Talab | Amalga oshirilgani | Sabab |
|---|---|---|
| NestJS/Fastify | Express + TS | zip'dagi mavjud kod Express'da edi; marshrutlar yengil va to'g'ridan-to'g'ri |
| Redis + BullMQ | Postgres (taymer `deadlineAt`), `node-cron`, bot navbati | Railway + Neon stekida qo'shimcha xizmatsiz ishlaydi |
| S3/MinIO | Rasmlar Neon'da (`media`, 2 MB gacha) | qo'shimcha xizmat kerak emas; keyin S3'ga o'tkazish oson |
| `@telegram-apps/sdk-react` | rasmiy `telegram-web-app.js` + typed qobiq | barqaror API, versiya o'zgarishlariga bog'liq emas |
| Glicko-2 | Elo (provisional K=40, keyin 20) | prompt ruxsat bergan soddaroq variant; parametrlar admin panelda |
| `template_variables` jadvallari | shablon `spec` JSON + `template_revisions` | generator spec'i bitta obyekt, har tahrir — yangi versiya |
| Docker + Nginx | Railway (HTTPS avtomatik) + Vercel | foydalanuvchi tanlagan hosting; `docker-compose.yml` faqat lokal Postgres |

## Xavfsizlik

- `initData` HMAC-SHA256 (`WebAppData` kalit) va `auth_date` (24 soat) tekshiriladi → 7 kunlik JWT; Login Widget alohida tekshiriladi.
- Har bir endpoint RBAC (`SUPER_ADMIN`, `OPERATOR`, `TEACHER`, `STUDENT`, `PARENT`); admin/operator rolini faqat SUPER_ADMIN beradi.
- zod validatsiya, rate limit, helmet, CORS faqat `MINI_APP_URL`/`CORS_ORIGINS`; maxfiy kalitlar faqat env'da.
- Fayl yuklab olish 5 daqiqalik alohida token bilan; webhook `WEBHOOK_SECRET` bilan.
- Savollar markaz o'zi tuzgan yoki litsenziyaga ega bo'lishi kerak — rasmiy College Board savollarini so'zma-so'z kiritmang.
