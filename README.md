# Kanyon — Girdi Kaydı ve Deterministik Replay (Kara Kutu)

"Kara Kutu: Girdi Kaydı ve Deterministik Replay ile 'Bazen Oluyor' Bug'ını Teste
Çevirmek" makalesinin çalışan kodu. Küçük ama tam bir canvas oyunu (**Kanyon**),
tohum + kare başına girdiden ibaret bir kayıt formatı ve 21 test.

Fikir tek cümle: simülasyon deterministikse durumu kaydetmeye gerek yok. Tohumu ve
tick başına girdiyi saklarsanız, `step`'i baştan koşturarak bütün oturumu geri
getirebilirsiniz. Otuz saniyelik bir oynanış 11 KB'lık bir JSON ve 0.39 ms'lik bir
regresyon testine iniyor.

## İçerik

- `src/sim.ts` — oyunun tek gerçeği: `State`, `createState`, saf `step(state, input, dt, rng)`,
  ve test pilotu `panicPilot`. DOM yok, `Math.random` yok, `Date` yok.
- `src/input.ts` — girdi tek bir tamsayı: `THRUST | LEFT | RIGHT` bit maskesi. Kayıt
  formatının ucuzluğu buradan geliyor.
- `src/rng.ts` — `mulberry32(seed)`: tohumlu PRNG.
- `src/hash.ts` — `hashState`: bütün durumu tek 32-bit sayıya indiren FNV-1a (`-0` tuzağı kapalı).
- `src/recording.ts` — kayıt formatı ve araçları: `encodeRuns`/`decodeRuns` (RLE),
  `Recorder`, `replayWithTrail` (enjekte edilebilir `stepFn`), `findDivergence`,
  `verifyRecording`, `serialize`/`parseRecording`.
- `src/session.ts` — `recordSession(seed, pilot, ticks, trailEvery)`: headless oturum kaydı.
- `src/render.ts` — SADECE çizer; replay modunda paleti değiştirir.
- `src/main.ts` + `index.html` — tarayıcı yüzü: klavye → `InputBits`, sabit adımlı döngü,
  `R`/Kaydet ve `P`/Replay düğmeleri, HUD'da tohum · tick · hash · kaydın boyutu.
- `scripts/make-fixture.ts` — fixture üretir ve istatistik basar.
- `scripts/bench.ts` — kayıt boyutu (ham vs RLE) ve replay hızı ölçümü.
- `test/` — 21 test: kayıt→replay, RLE round-trip, bozuk kayıt, `findDivergence`,
  desync avı, ve diskteki fixture'ın regresyon testi.

## Kurulum

```bash
npm install
```

## Çalıştırma

### Demo

```bash
npm run dev
```

`http://localhost:5173/` → **Kaydet (R)** ile kayda başlayın (oyun baştan başlar),
uçun, tekrar **Kaydet (R)** ile bitirin, **Replay (P)** ile geri oynatın. Replay
bitince HUD'da `REPLAY BİTTİ · hash eşleşti` yazmalı.

Tuşlar: `↑`/`W`/boşluk itki, `←`/`→` yan itki, `R` kayıt aç-kapa, `P` replay.

> `file://` ile açmayın; modüller yüklenmez, ekran boş kalır. Vite şart.

### Testler

```bash
npm test
```

Beklenen çıktı:

```
 ✓ test/divergence.test.ts (4 tests) 1ms
 ✓ test/traps.test.ts (1 test) 6ms
 ✓ test/regression.test.ts (2 tests) 11ms
 ✓ test/corruption.test.ts (4 tests) 16ms
 ✓ test/desync.test.ts (1 test) 17ms
 ✓ test/recording.test.ts (9 tests) 27ms

 Test Files  6 passed (6)
      Tests  21 passed (21)
```

Testler `node` ortamında koşar — `document` YOK, canvas YOK. `environment: "jsdom"`
ayarlamayın; testlerin tamamı saf mantığa dayanıyor.

### Fixture üretimi

```bash
npm run fixture
```

```
kayıt yazıldı: <repo>/test/fixtures/canyon-session.json
  tohum        : 20260723
  tick         : 1800 (30 sn)
  run bloğu    : 417
  sıkıştırma   : 7200 B ham → 1668 B run (4.3x)
  JSON boyutu  : 11213 B
  hash örneği  : 60
  final hash   : 0x4aad1b72
  atlatılan    : 82 · çarpma: 4
```

Fixture repoya commit edilir; `test/regression.test.ts` onu okuyup oynatır. Çıktı
değiştiyse önce `findDivergence` ile nerede ayrıldığına bakın, hash'i körlemesine
yenilemeyin.

### Bench — kayıt boyutu + replay hızı

```bash
npm run bench
```

Beklenen çıktı (süreler makineye göre değişir; blok/bayt sayıları sabittir):

```
Kanyon — kayıt boyutu + replay hızı
sahne: tohum=20260723 · 1800 tick (30.0 sn sim) · 50 koşu, 20 ısınma

replay hızı
  replay (hashsiz)   : 0.39 ms · 4622 kare/ms · gerçek zamanın 77,030x'i
  replay + her tick hash: 4.24 ms · 424 kare/ms

kayıt boyutu
  bot pilot          : 1800 tick → 417 blok · 7200 B ham → 1668 B run (4.3x)
  insan benzeri girdi: 3600 tick → 123 blok · 14400 B ham → 492 B run (29.3x)
  JSON kayıt dosyası : 11213 B

desync görünürlüğü (spawnTimer += 1e-6 @ tick 300)
  kaba iz (30 tick)  : tick 330
  ince iz (1 tick)   : tick 301
  gözle görülür fark : tick 384
  hash'in avantajı   : 83 tick (1.4 sn)
  final hash         : 0x4aad1b72
```

### Production build

```bash
npm run build   # tsc && vite build
npm run preview
```

## Dosya yapısı

```
index.html
src/
  input.ts        # InputBits bit maskesi
  rng.ts          # mulberry32
  sim.ts          # State, createState, step, panicPilot
  hash.ts         # hashState (FNV-1a), hex
  recording.ts    # RLE + Recorder + replay + findDivergence + verify + parse
  session.ts      # recordSession (headless oturum)
  render.ts       # sadece çizim
  main.ts         # demo: klavye, düğmeler, sabit adımlı döngü, HUD
scripts/
  make-fixture.ts # test/fixtures/canyon-session.json üretir
  bench.ts        # boyut + hız ölçümü
test/
  recording.test.ts   # kayıt→replay + RLE (9)
  corruption.test.ts  # bozuk kayıt (4)
  divergence.test.ts  # findDivergence (4)
  desync.test.ts      # aynı kayıt, iki farklı build (1)
  traps.test.ts       # Math.random tuzağı (1)
  regression.test.ts  # diskteki fixture (2)
  fixtures/canyon-session.json
```

## Alınan dersler (makalede de anlatılır)

- Hash izinin çözünürlüğü örnekleme aralığı kadardır: 30 tick aralıkla ayrılma
  330'da görünüyor, gerçek ayrılma 301'de. Önce kaba izle pencereyi bulun, sonra
  `trailEvery: 1` ile tam tick'i.
- Kaymayı `ship.vy`'ye vermek işe yaramaz: duvar kırpması `vy = 0` yazıp kaymayı siler.
  `spawnTimer` gibi sürekli biriken bir alan seçin.
- Kayıt, alındığı `step` sürümüne aittir. `Recording.version` bunun için var.

## Lisans

MIT
