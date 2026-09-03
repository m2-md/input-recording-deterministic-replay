# Kara Kutu: Girdi Kaydı ve Deterministik Replay ile "Bazen Oluyor" Bug'ını Teste Çevirmek

*Simülasyon deterministikse oyunun durumunu kaydetmeye gerek yok. Tohumu ve kare başına girdiyi saklamak, otuz saniyelik bir oynanışı 11 KB'a ve 0.39 milisaniyelik bir teste indiriyor.*

*Tahmini okuma süresi: 15 dakika*

---

Elimde bir hata raporu var: "Bazen gemi kayaya değmeden hasar alıyor."

Bu cümlenin içinde tek bir kullanılabilir bilgi yok. Ne zaman? Hangi kayada? Kaçıncı saniyede? Oyuncu ne yapıyordu? Raporu yazan kişi kötü niyetli değil, sadece elinde benden fazlası yok. Ekranda bir şey oldu, geçti, gitti. Geriye "bazen" kaldı.

Uçak kazalarında da böyleydi. 1950'lerde bir uçak düştüğünde soruşturmacıların elinde tanık ifadeleri ve enkaz vardı; olayın kendisi kaybolmuştu. David Warren'ın kara kutuyu icat etmesiyle değişen şey, kazanın *sonucunu* değil, ona giden **girdileri** kaydetmek oldu. Kokpitte hangi kolun ne zaman çekildiği, hangi düğmeye basıldığı. Sonra bu kayıt bir simülatöre yükleniyor ve aynı uçuş yeniden uçuruluyor. Enkazın fotoğrafı değil, uçuşun kendisi geri geliyor.

Bugün oyunumuza kara kutu takacağız. Uçağın konumunu değil, pilotun tuşlarını kaydedeceğiz.

Bu yazı, [test edilebilir mimari yazısının](../testable-canvas-game-vitest/article.md) faturasını kesip ödülünü topluyor. Orada simülasyonu bir temiz odaya kapatmıştık: saf `step(state, input, dt, rng)`, tohumlu PRNG, enjekte edilen saat, tek sayıya inen `hashState`. O disiplini burada baştan anlatmayacağım; sadece şunu hatırlatıp üstüne kuracağım: `step` saf olduğu için bir tick'in sonucunu belirleyen tek şey ona verdiğiniz dörtlü. Aynı dörtlüyü aynı sırayla verirseniz aynı dünyayı alırsınız. Kayıt özelliğinin bütün hikâyesi bu cümlenin içinde saklı.

Şunu da baştan ayıralım, çünkü seride benzer bir mekanizmayı zaten gördük. [Rollback netcode yazısında](../rollback-netcode-lockstep/article.md) save-state alıp yeniden oynatıyorduk, evet. Ama orada amaç ağ gecikmesini gizlemekti: rakibin gerçek girdisi gelince birkaç kare geri sarıp o kısacık aralığı yeniden koşuyorduk. Burada geri sarma yok. Sıfırıncı tick'ten başlayıp bütün oturumu yeniden oynatıyoruz. Rollback bir kurtarma manevrası; replay bir soruşturma aracı.

### "Bazen Oluyor" — Yeniden Üretilemeyen Bug

Bir bug'ın maliyeti, onu tekrar üretme maliyetidir.

Elinizde net bir tekrar reçetesi varsa iş bitmiş sayılır: debugger'ı (hata ayıklayıcı) açar, breakpoint koyar, on dakikada bulursunuz. Reçete yoksa bambaşka bir işe girmişsinizdir. Yarım saat oynayıp yakalamaya çalışırsınız, yakalayamazsınız, `console.log` serpip yeniden oynarsınız, yine olmaz, sonra "belki de düzeldi" der geçersiniz. Üç hafta sonra aynı rapor tekrar gelir.

Oyunlarda bu durum kural, istisna değil. Sebebi de belli: bir oyunun durumu binlerce tick'lik bir birikimdir. 400. tick'teki bug, 1. tick'ten beri yapılan her şeyin sonucudur. Ekran görüntüsü size sonucu gösterir, yolu göstermez.

Klasik çözüm save-state almaktır: bug anındaki bütün dünyayı serileştirip dosyaya yazmak. Çalışır, ama iki derdi var. Birincisi, dosya büyür; binlerce nesneli bir sahnede tek kare bile megabaytlara çıkabilir. İkincisi, daha canımı sıkanı: size *anı* verir, *yolu* vermez. Bug'ın nasıl oluştuğunu değil, oluştuktan sonraki halini görürsünüz. Hâlbuki suç mahalline değil, suça giden yola bakmak istiyorsunuz.

Kara kutu tam da bunu yapıyor. Enkazı değil, uçuşu kaydediyor.

### Determinizmin Bedeli Zaten Ödendi

Girdi kaydının çalışması için tek bir ön koşul var: simülasyon deterministik olacak. Aynı başlangıç + aynı girdi dizisi = aynı sonuç, her koşuda, tek bitine kadar.

Bu koşulu seride üç yazıda parça parça ödedik. [Sabit adımlı döngü](../fixed-timestep-render-interpolation/article.md) `dt`'yi makineye bırakmayı bıraktı. Test edilebilir mimari yazısı rastgeleliği tohuma, zamanı enjekte edilen bir saate bağladı. Rollback yazısı da determinizmi bit düzeyinde zorlamanın ne demek olduğunu gösterdi.

İşin ilginç kısmı şu: bu üç şeyi zaten yaptıysanız, replay özelliği size neredeyse **bedava** geliyor. Yeni bir mimari kurmuyorsunuz. Sadece zaten var olan girdi akışını bir diziye yazıyorsunuz.

Devraldığım iki dosyayı tam olarak devraldığım halleriyle bırakayım, çünkü kaydın anlamı bunlara bağlı. Rastgeleliğin tek kaynağı:

```ts
// src/rng.ts
/** 0..1 arası sayı üreten deterministik kaynak. */
export type Rng = () => number;

/** mulberry32: küçük, hızlı, tohumlu PRNG. Aynı tohum → aynı dizi. */
export function mulberry32(seed: number): Rng {
  let s = seed | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
```

Ve bütün dünyayı tek sayıya indiren parmak izi. Replay'in "tuttu mu" sorusunun cevabı hep bu fonksiyondan çıkacak:

```ts
// src/hash.ts — (dosyanın sonundaki hex() yardımcısı burada gösterilmedi)
import type { State } from "./sim";

// Bir float'ın 64 bitini iki 32-bit parçaya bakmak için tek tampon.
const buf = new ArrayBuffer(8);
const f64 = new Float64Array(buf);
const u32 = new Uint32Array(buf);

const FNV_OFFSET = 0x811c9dc5;
const FNV_PRIME = 0x01000193;

function mixU32(h: number, v: number): number {
  for (let i = 0; i < 4; i++) {
    h ^= (v >>> (i * 8)) & 0xff;
    h = Math.imul(h, FNV_PRIME);
  }
  return h >>> 0;
}

/** Sayıyı bit bit karıştır: 0.1 ile 0.100000001 farklı hash verir. */
export function mixNumber(h: number, x: number): number {
  f64[0] = x + 0; // -0'ı +0'a çevirir; duvar kırpması -0 üretebiliyor
  return mixU32(mixU32(h, u32[0]), u32[1]);
}

/** Bütün simülasyon durumunu tek 32-bit sayıya indirger (FNV-1a). */
export function hashState(s: State): number {
  let h = FNV_OFFSET >>> 0;
  h = mixNumber(h, s.tick);
  h = mixNumber(h, s.time);
  h = mixNumber(h, s.dodged);
  h = mixNumber(h, s.hits);
  h = mixNumber(h, s.spawnTimer);
  h = mixNumber(h, s.nextId);
  h = mixNumber(h, s.ship.x);
  h = mixNumber(h, s.ship.y);
  h = mixNumber(h, s.ship.vx);
  h = mixNumber(h, s.ship.vy);
  h = mixNumber(h, s.rocks.length);
  for (const rock of s.rocks) {
    h = mixNumber(h, rock.id);
    h = mixNumber(h, rock.x);
    h = mixNumber(h, rock.y);
    h = mixNumber(h, rock.r);
    h = mixNumber(h, rock.vx);
  }
  return h >>> 0;
}
```

Alan sırası burada bir sözleşme: değiştirirseniz eski kayıtların hash'i tutmaz. `x + 0` da öyle; duvar kırpması `-0` üretebiliyor ve iki sıfırın aynı hash'i vermesi gerekiyor.

Bu yazı için yeni bir oyun yazdım, adı Kanyon. 640×480'lik bir alanda yerçekimine karşı itki veren bir gemi, sağdan sola akan rastgele boyutta kayalar, ekranı geçen her kaya için "atlatma", değen her kaya için "çarpma". Beş dakikada anlaşılır ama içinde bir oyunun bütün belaları var: ivme, sürtünme, duvar sınırlaması, çarpışma, rastgele doğum.

Durumun şekli bildiğiniz gibi, düz veri:

```ts
// src/sim.ts
import { has, LEFT, NONE, RIGHT, THRUST, type InputBits } from "./input";
import type { Rng } from "./rng";

export interface Ship {
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
}

export interface Rock {
  id: number;
  x: number;
  y: number;
  r: number;
  vx: number;
}

export interface State {
  tick: number;
  time: number;
  ship: Ship;
  rocks: Rock[];
  dodged: number;
  hits: number;
  spawnTimer: number;
  nextId: number;
}
```

Girdide ise bir değişiklik yaptım ve bu değişiklik yazının geri kalanını taşıyacak. Önceki oyunlarda girdi `{ left: boolean, right: boolean, ... }` gibi bir nesneydi. Burada girdi tek bir tamsayı, her tuş bir bit:

```ts
// src/input.ts
/**
 * Girdi tek bir tamsayıdır: her tuş bir bit.
 * Kayıt formatının bu kadar ucuz olmasının sebebi bu.
 */
export type InputBits = number;

export const NONE = 0;
export const THRUST = 1 << 0;
export const LEFT = 1 << 1;
export const RIGHT = 1 << 2;

export const ALL_BITS = THRUST | LEFT | RIGHT;

export function has(input: InputBits, bit: number): boolean {
  return (input & bit) !== 0;
}

/** HUD ve hata mesajları için okunur biçim: "THRUST|LEFT" */
export function formatInput(input: InputBits): string {
  if (input === NONE) return "-";
  const parts: string[] = [];
  if (has(input, THRUST)) parts.push("THRUST");
  if (has(input, LEFT)) parts.push("LEFT");
  if (has(input, RIGHT)) parts.push("RIGHT");
  return parts.join("|");
}
```

Neden bit maskesi? Çünkü bir tick'in girdisi tek bir sayı olduğunda, iki tick'in girdisini karşılaştırmak `===` kadar ucuza geliyor. Nesne olsaydı alan alan karşılaştırmak ya da JSON'a çevirmek gerekirdi. Sıkıştırma bölümünde bu seçim kendini fazlasıyla ödeyecek.

`step`'in kalbi tanıdık. Girdiyi ivmeye çevirir, hızı ve konumu ilerletir, duvarları kırpar, kayaları akıtır, sırası gelmişse yenisini doğurur:

```ts
// src/sim.ts (devamı)
export const WORLD = { w: 640, h: 480 };

const GRAVITY = 900; // px/s²
const THRUST_ACC = 1750; // px/s²
const SIDE_ACC = 1100; // px/s²
const DRAG_X = 2.4; // 1/s
const DRAG_Y = 0.8; // 1/s
const SHIP_R = 12;
const SPAWN_EVERY = 0.32; // saniye
const ROCK_MIN_R = 10;
const ROCK_MAX_R = 26;
const ROCK_MIN_VX = 170; // px/s (sola doğru)
const ROCK_MAX_VX = 320;
const KNOCKBACK = 260; // px/s

/** Her oturumun başladığı yer. Kaydın örtük başlangıç durumu budur. */
export function createState(): State {
  return {
    tick: 0,
    time: 0,
    ship: { x: 140, y: 240, vx: 0, vy: 0, r: SHIP_R },
    rocks: [],
    dodged: 0,
    hits: 0,
    spawnTimer: 0,
    nextId: 1,
  };
}

/**
 * Oyunun tek gerçeği. DOM yok, Math.random yok, Date.now yok.
 * (state, input, dt, rng) dörtlüsü sonucu tam belirler.
 */
export function step(
  state: State,
  input: InputBits,
  dt: number,
  rng: Rng,
): State {
  // 1) Girdi → ivme
  const s = state.ship;
  let ax = 0;
  if (has(input, LEFT)) ax -= SIDE_ACC;
  if (has(input, RIGHT)) ax += SIDE_ACC;
  const ay = GRAVITY - (has(input, THRUST) ? THRUST_ACC : 0);

  let vx = (s.vx + ax * dt) * Math.max(0, 1 - DRAG_X * dt);
  let vy = (s.vy + ay * dt) * Math.max(0, 1 - DRAG_Y * dt);

  let x = s.x + vx * dt;
  let y = s.y + vy * dt;

  // 2) Duvarlar
  if (x < s.r) {
    x = s.r;
    vx = 0;
  } else if (x > WORLD.w - s.r) {
    x = WORLD.w - s.r;
    vx = 0;
  }
  if (y < s.r) {
    y = s.r;
    vy = 0;
  } else if (y > WORLD.h - s.r) {
    y = WORLD.h - s.r;
    vy = 0;
  }

  // 3) Kayalar: sola akar, ekranı geçen atlatılmış sayılır, değen vurur.
  const rocks: Rock[] = [];
  let dodged = state.dodged;
  let hits = state.hits;
  for (const rock of state.rocks) {
    const rx = rock.x - rock.vx * dt;
    if (rx + rock.r < 0) {
      dodged += 1;
      continue;
    }
    const dx = rx - x;
    const dy = rock.y - y;
    const reach = rock.r + s.r;
    if (dx * dx + dy * dy <= reach * reach) {
      hits += 1;
      const d = Math.max(1e-6, Math.sqrt(dx * dx + dy * dy));
      vx += (-dx / d) * KNOCKBACK;
      vy += (-dy / d) * KNOCKBACK;
      continue;
    }
    rocks.push({ id: rock.id, x: rx, y: rock.y, r: rock.r, vx: rock.vx });
  }

  // 4) Doğurma: rastgelelik SADECE parametreden gelen rng'den.
  let spawnTimer = state.spawnTimer + dt;
  let nextId = state.nextId;
  while (spawnTimer >= SPAWN_EVERY) {
    spawnTimer -= SPAWN_EVERY;
    const r = ROCK_MIN_R + rng() * (ROCK_MAX_R - ROCK_MIN_R);
    rocks.push({
      id: nextId++,
      x: WORLD.w + r,
      y: r + rng() * (WORLD.h - 2 * r),
      r,
      vx: ROCK_MIN_VX + rng() * (ROCK_MAX_VX - ROCK_MIN_VX),
    });
  }

  return {
    tick: state.tick + 1,
    time: state.time + dt,
    ship: { x, y, vx, vy, r: s.r },
    rocks,
    dodged,
    hits,
    spawnTimer,
    nextId,
  };
}
```

Doğurma bloğundaki üç `rng()` çağrısına dikkat edin: yarıçap, yükseklik ve hız. Sıraları önemli, sayıları da. Bir gün oraya dördüncü bir `rng()` eklerseniz, o günden önce alınmış bütün kayıtlar geçersiz olur. Kara kutunun kaydettiği şey pilotun hareketleriyse, simülatörün de aynı simülatör olması gerekiyor.

### Kaydedilecek Şey Durum Değil, Girdi

Şimdi asıl fikre gelelim. Bir oturumu geri getirmek için neyi saklamak gerekiyor?

İlk akla gelen cevap "her karedeki durumu" oluyor. 60 FPS'te otuz saniye, 1800 kare; her kare için gemi, kayalar, sayaçlar. Kabaca birkaç megabayt. Hem büyük hem de yolun kendisini değil, fotoğraflarını saklıyor.

Doğru cevap çok daha küçük. Deterministik bir simülasyonda durum, girdinin bir **fonksiyonudur**. `state[n]`'i saklamaya gerek yok, çünkü `state[n]` zaten `step`'in `state[n-1]` ve `input[n]`'den hesapladığı şey. Zinciri baştan kurabiliyorsanız halkaları saklamanıza gerek yok. Elinizde tohum ve girdi dizisi varsa, gerisi hesaplanabilir.

Kaydın tamamı bu:

```ts
// src/recording.ts
import { hashState } from "./hash";
import type { InputBits } from "./input";
import { mulberry32, type Rng } from "./rng";
import { createState, step, type State } from "./sim";

/** Aynı girdinin arka arkaya kaç tick sürdüğü. Kayıt formatının tamamı bu. */
export interface InputRun {
  input: InputBits;
  count: number;
}

/** Belirli bir tick'teki durum parmak izi. */
export interface HashSample {
  tick: number;
  hash: number;
}

export interface Recording {
  version: 1;
  seed: number;
  tickRate: number; // tick/saniye
  ticks: number; // toplam tick sayısı
  runs: InputRun[]; // run-length kodlanmış girdi
  trailEvery: number; // hash izinin örnekleme aralığı
  trail: HashSample[];
  finalHash: number;
}
```

Sekiz alan. `seed` dünyanın hangi rastgelelikle kurulduğunu, `tickRate` `dt`'nin ne olduğunu, `runs` pilotun ne yaptığını söylüyor. `trail` ve `finalHash` ise kaydın kendi doğruluk beyanı; birazdan onlara geleceğiz.

Kaydediciyi de buna göre yazalım. Tek işi var: her tick'te kendisine verilen girdiyi biriktirmek.

```ts
// src/recording.ts (devamı)
export class Recorder {
  private readonly runs: InputRun[] = [];
  private readonly trail: HashSample[] = [];
  private ticks = 0;

  constructor(
    readonly seed: number,
    readonly tickRate: number,
    readonly trailEvery = 30,
  ) {}

  /** Bir tick'i kaydet: o tick'e verilen girdi ve tick sonrası durum. */
  capture(input: InputBits, after: State): void {
    const last = this.runs[this.runs.length - 1];
    if (last && last.input === input) last.count += 1;
    else this.runs.push({ input, count: 1 });
    this.ticks += 1;
    if (after.tick % this.trailEvery === 0) {
      this.trail.push({ tick: after.tick, hash: hashState(after) });
    }
  }

  get length(): number {
    return this.ticks;
  }

  get runCount(): number {
    return this.runs.length;
  }

  finish(final: State): Recording {
    return {
      version: 1,
      seed: this.seed,
      tickRate: this.tickRate,
      ticks: this.ticks,
      runs: this.runs.map((r) => ({ ...r })),
      trailEvery: this.trailEvery,
      trail: this.trail.map((s) => ({ ...s })),
      finalHash: hashState(final),
    };
  }
}
```

`capture` içindeki `if (last && last.input === input) last.count += 1` satırı sıkıştırmanın ta kendisi. Sonradan eklenen bir katman değil; kayıt zaten sıkıştırılmış doğuyor.

Canlı oturumun headless (tarayıcısız) karşılığı da şöyle. Tarayıcıdaki döngü de birebir bunu yapıyor, sadece girdiyi bottan değil klavyeden alıyor:

```ts
// src/session.ts
import { Recorder, type Recording } from "./recording";
import { mulberry32 } from "./rng";
import { createState, step, type Pilot, type State } from "./sim";

export const TICK_RATE = 60;

export interface Session {
  recording: Recording;
  final: State;
}

export function recordSession(
  seed: number,
  pilot: Pilot,
  ticks: number,
  trailEvery = 30,
): Session {
  const rng = mulberry32(seed);
  const recorder = new Recorder(seed, TICK_RATE, trailEvery);
  const dt = 1 / TICK_RATE;
  let state = createState();
  for (let i = 0; i < ticks; i++) {
    const input = pilot(state);
    state = step(state, input, dt, rng);
    recorder.capture(input, state);
  }
  return { recording: recorder.finish(state), final: state };
}
```

Buradaki `pilot` testlerin oyuncusu: duruma bakıp girdi üreten saf bir bot. Yükseklik korur, önündeki kayadan kaçar, hizadaysa frene basar. Elle tuş dizisi yazmak yerine bot kullanmamın sebebi, senaryonun uzun ve tekrarlanabilir olması.

```ts
// src/sim.ts (devamı)
/** Duruma bakıp girdi üreten deterministik senaryo (test "pilotu"). */
export type Pilot = (state: State) => InputBits;

export function panicPilot(state: State): InputBits {
  const { ship } = state;
  let input: InputBits = NONE;
  if (ship.vy > 0 || ship.y > WORLD.h * 0.55) input |= THRUST;

  let threat: Rock | undefined;
  let best = Infinity;
  for (const rock of state.rocks) {
    const dx = rock.x - ship.x;
    if (dx < -rock.r) continue;
    if (dx < best) {
      best = dx;
      threat = rock;
    }
  }
  if (threat && best < 180) {
    const dy = threat.y - ship.y;
    // Kaya altımdaysa yukarı kaç, üstümdeyse gazı kes.
    if (dy > 0) input |= THRUST;
    else input &= ~THRUST;
    // Hizadaysam frene bas, değilse ileri devam.
    input |= Math.abs(dy) < threat.r + ship.r + 20 ? LEFT : RIGHT;
  }
  return input;
}
```

### Replay: Aynı Tohum + Aynı Girdi = Aynı Uçuş

Replay tarafı, kayıt tarafından daha da kısa. Kaydı açıyorsunuz, tohumdan yeni bir üreteç kuruyorsunuz, girdileri sırayla `step`'e veriyorsunuz. Hepsi bu.

```ts
// src/recording.ts (devamı)
export interface ReplayResult {
  state: State;
  trail: HashSample[];
}

/** `step` ile aynı imzayı taşıyan her şey replay edilebilir. */
export type StepFn = (
  state: State,
  input: InputBits,
  dt: number,
  rng: Rng,
) => State;

export interface ReplayOptions {
  /** Kaç tick'te bir hash örneği alınsın. 1 = her tick. */
  trailEvery?: number;
  /** Hangi simülasyonla oynatılsın. Varsayılan: projenin `step`'i. */
  stepFn?: StepFn;
}

/** Kaydı baştan sona yeniden oynatır ve hash izini toplar. */
export function replayWithTrail(
  rec: Recording,
  options: ReplayOptions = {},
): ReplayResult {
  const { trailEvery = rec.trailEvery, stepFn = step } = options;
  const inputs = decodeRuns(rec.runs);
  const dt = 1 / rec.tickRate;
  const rng = mulberry32(rec.seed);
  const trail: HashSample[] = [];
  let state = createState();
  for (const input of inputs) {
    state = stepFn(state, input, dt, rng);
    if (state.tick % trailEvery === 0) {
      trail.push({ tick: state.tick, hash: hashState(state) });
    }
  }
  return { state, trail };
}

/** Sadece son durumu isteyenler için kısayol. */
export function replay(rec: Recording): State {
  return replayWithTrail(rec).state;
}
```

O `stepFn` parametresi ilk yazdığımda yoktu, sonradan ekledim ve yazının en faydalı yirmi satırı o oldu. Sebebini desync bölümünde göreceksiniz: aynı kaydı iki farklı simülasyonla oynatabilmek, "hangi değişiklik bunu bozdu" sorusunu doğrudan cevaplanabilir hale getiriyor.

Replay'in hızına da bakmak lazım, çünkü burada bir ölçek meselesi var. Kanyon'un 30 saniyelik bir oturumunu diskten okuyup baştan sona yeniden oynatmak bende **0.39 milisaniye** sürüyor. Gerçek zamanın yaklaşık 77 bin katı hızında. Her tick'te hash alarak oynatınca 4.2 ms'ye çıkıyor.

Bu sayı, replay'in neden sadece bir "izleme" özelliği olmadığını anlatıyor. Otuz saniyelik oynanışı dört milisaniyede tekrar üretebiliyorsanız, o oynanış artık bir kayıt değil, bir birim testtir.

Demoda mod değiştirme kısmı da tam olarak bu iki fonksiyona bağlı. `R` ile kayıt açılıp kapanıyor, `P` ile kayıt geri oynatılıyor:

```ts
// src/main.ts — demo, klavye modları
function toggleRecording(): void {
  if (playback) return;
  if (recorder) {
    recording = recorder.finish(state);
    recorder = null;
    const check = verifyRecording(recording);
    status = check.ok
      ? `kayıt kapandı · ${recording.ticks} tick · doğrulandı`
      : `kayıt kapandı · AYRILMA @ tick ${check.divergedAt}`;
  } else {
    resetLive();
    recorder = new Recorder(seed, TICK_RATE, 30);
    status = "KAYIT";
  }
}

function startReplay(): void {
  if (!recording) {
    status = "önce R ile bir oturum kaydet";
    return;
  }
  recorder = null;
  rng = mulberry32(recording.seed);
  state = createState();
  playback = { inputs: decodeRuns(recording.runs), index: 0 };
  status = "REPLAY";
}
```

Kayıt başlarken `resetLive()` çağırmam bir tercih değil, zorunluluk. Oyunun ortasında kayıt açarsanız kaydın başlangıç durumu `createState()` olmaz ve replay bambaşka bir yerden başlar. Ya oturumu baştan başlatırsınız ya da o andaki durumu kaydın içine gömersiniz. Ben birincisini seçtim; ikincisi kaydı büyütür ama uzun oturumlarda tek makul yol odur.

Döngünün içi de iki moddan ibaret. Canlı modda girdi klavyeden gelir ve kaydediciye yazılır, replay modunda diziden okunur:

```ts
// src/main.ts (devamı)
function stepOnce(): void {
  if (playback) {
    if (playback.index >= playback.inputs.length) {
      const ok = recording && hashState(state) === recording.finalHash;
      status = ok
        ? "REPLAY BİTTİ · hash eşleşti"
        : "REPLAY BİTTİ · hash TUTMADI";
      playback = null;
      return;
    }
    state = step(state, playback.inputs[playback.index++], DT, rng);
  } else {
    const input = held;
    state = step(state, input, DT, rng);
    recorder?.capture(input, state);
  }
}
```

Sabit adımlı döngü bu fonksiyonu `while (acc >= DT)` içinde çağırıyor; girdi örneklemesi kare başına değil tick başına oluyor. Determinizmin sessiz şartı bu.

Bu yirmi satır, "girdi kaydı ve replay" başlıklı özelliğin tarayıcıdaki tamamı. Geri kalan her şey zaten mimaride hazır bekliyordu.

### Kayıt Formatı: Tekrarları Sıkıştırmak

Girdi dizisine bakınca insanın gözüne çarpan ilk şey şu: aynı sayı, arka arkaya, uzun uzun.

Sebebi basit. İnsan eli 60 Hz'de karar vermiyor. Gaza basarsınız ve yarım saniye basılı tutarsınız; bu, otuz tick boyunca değişmeyen bir girdi demek. Kaydı ham tutarsanız aynı sayıyı otuz kez yazarsınız. Run-length encoding (RLE, tekrar uzunluğu kodlaması) tam olarak bu israfı ortadan kaldırıyor: değeri ve kaç kez tekrarlandığını yaz, gerisini at.

İki fonksiyon, ikisi de saf ve birbirinin tersi:

```ts
// src/recording.ts (devamı)
/** Tick başına girdi dizisini tekrar bloklarına indirger. Saf. */
export function encodeRuns(inputs: readonly InputBits[]): InputRun[] {
  const runs: InputRun[] = [];
  for (const input of inputs) {
    const last = runs[runs.length - 1];
    if (last && last.input === input) last.count += 1;
    else runs.push({ input, count: 1 });
  }
  return runs;
}

/** encodeRuns'ın tam tersi. decode(encode(x)) === x. */
export function decodeRuns(runs: readonly InputRun[]): InputBits[] {
  const inputs: InputBits[] = [];
  for (const run of runs) {
    for (let i = 0; i < run.count; i++) inputs.push(run.input);
  }
  return inputs;
}

/** Blokları açmadan toplam tick sayısı. */
export function runsLength(runs: readonly InputRun[]): number {
  let n = 0;
  for (const run of runs) n += run.count;
  return n;
}
```

Girdiyi bit maskesi yapmanın karşılığını burada alıyoruz. `last.input === input` karşılaştırması tek bir sayı karşılaştırması. Girdi nesne olsaydı ya dört alanı tek tek kontrol edecektik ya da her tick'te bir `JSON.stringify` çağıracaktık. İkisi de çirkin, ikincisi ayrıca yavaş.

Şimdi gerçek sayılar. Bot pilotun 30 saniyelik oturumu:

```
kayıt yazıldı: test/fixtures/canyon-session.json
  tohum        : 20260723
  tick         : 1800 (30 sn)
  run bloğu    : 417
  sıkıştırma   : 7200 B ham → 1668 B run (4.3x)
  JSON boyutu  : 11213 B
  hash örneği  : 60
  final hash   : 0x4aad1b72
  atlatılan    : 82 · çarpma: 4
```

1800 tick, 417 blok. 4.3 kat.

Burada dürüst olmam lazım: bu oran beklediğimden düşüktü ve sebebi botun kendisi. `panicPilot` her tick'te duruma bakıp karar veriyor, kaya sınırın etrafında salındığında da girdi tick başına titriyor. İnsan öyle oynamıyor. Aynı ölçümü, tuşları 6–45 tick arası basılı tutan insan benzeri bir girdi akışıyla tekrarladım: 3600 tick, 123 blok, **29.3 kat**. Yani kaydın boyutu oyuncunun ne kadar tembel olduğuyla doğru orantılı, ki gerçek oyuncular epey tembel.

Bir de üst sınıra bakalım. Hiç değişmeyen bir girdi tek bloğa iner:

```ts
// test/recording.test.ts (parça)
  it("hiç değişmeyen girdi tek bloğa iner", () => {
    const runs = encodeRuns(new Array<InputBits>(600).fill(THRUST));
    expect(runs).toEqual([{ input: THRUST, count: 600 }]);
  });
```

Altı yüz tick tek satıra iniyor. Kara kutunun teypi çoğu zaman sessizliği kaydediyor.

RLE'nin bir de bilmeniz gereken kötü günü var: girdi her tick'te değişirse blok sayısı tick sayısına eşit olur ve `{input, count}` nesneleri yüzünden dosya ham halden **büyür**. Analog stick (analog çubuk) okuyan bir oyunda bu senaryo teorik değil, varsayılan. O durumda ya girdiyi kuantalarsınız (mesela 8 yöne yuvarlamak) ya da delta encoding (fark kodlaması) gibi başka bir şemaya geçersiniz. RLE, dijital tuşların oyunu.

Kaydı diske yazarken bir de basit bir bütünlük kontrolü koyuyorum:

```ts
// src/recording.ts (devamı)
export function serialize(rec: Recording): string {
  return JSON.stringify(rec);
}

export function parseRecording(json: string): Recording {
  const rec = JSON.parse(json) as Recording;
  if (rec.version !== 1)
    throw new Error(`bilinmeyen kayıt sürümü: ${rec.version}`);
  if (runsLength(rec.runs) !== rec.ticks) {
    throw new Error(
      `bozuk kayıt: runs ${runsLength(rec.runs)} tick, başlıkta ${rec.ticks}`,
    );
  }
  return rec;
}
```

`version` alanı bugün gereksiz görünüyor. Altı ay sonra `step`'e dördüncü bir `rng()` çağrısı eklediğinizde ise eski kayıtları sessizce yanlış oynatmak yerine yüzünüze "bu kayıt bu motora ait değil" diyecek olan tek şey o alan.

### Desync Avı: Hash İzi

Elimizde kayıt var, replay var. Peki replay *tutmazsa* ne yapacağız?

Bu soru göründüğünden önemli, çünkü replay'in bozulduğunu fark etmek kolay değil. Ekrana bakarsınız, gemi uçar, kayalar geçer, her şey normal görünür. Ama 900. tick'te oyuncunun aldığı hasarı almaz. Bir yerlerde ayrılmıştır (desync) ve nerede ayrıldığını gözle bulmanız imkânsızdır.

Çözüm, kaydın içine serpilmiş hash örnekleri. Kara kutu sadece kolların hareketini değil, belirli aralıklarla irtifayı ve hızı da yazıyor. Uçuş yeniden uçurulduğunda bu işaretler tutuyor mu, ona bakılıyor.

`Recorder` bunu zaten yapıyordu: `trailEvery` tick'te bir `hashState` alıp `trail` dizisine koyuyor. 30 tick aralıkla 30 saniyelik oturumda 60 örnek ediyor. Karşılaştırma da tek fonksiyon:

```ts
// src/recording.ts (devamı)
/**
 * İki hash izini karşılaştırır, ilk ayrıldıkları örneğin tick'ini döndürür.
 * Aynıysa null. Çözünürlük, izin örnekleme aralığı kadardır.
 */
export function findDivergence(
  a: readonly HashSample[],
  b: readonly HashSample[],
): number | null {
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) {
    if (a[i].tick !== b[i].tick) return Math.min(a[i].tick, b[i].tick);
    if (a[i].hash !== b[i].hash) return a[i].tick;
  }
  if (a.length !== b.length) return (a.length > n ? a : b)[n].tick;
  return null;
}

export interface VerifyResult {
  ok: boolean;
  divergedAt: number | null;
  finalHash: number;
  expectedHash: number;
}

/** Kayıt kendi hash izini tutuyor mu? Tutmuyorsa nerede koptu? */
export function verifyRecording(rec: Recording): VerifyResult {
  const { state, trail } = replayWithTrail(rec);
  const divergedAt = findDivergence(rec.trail, trail);
  const finalHash = hashState(state);
  return {
    ok: divergedAt === null && finalHash === rec.finalHash,
    divergedAt,
    finalHash,
    expectedHash: rec.finalHash,
  };
}
```

Gelelim gerçek senaryoya. Diyelim `step`'e masum bir değişiklik yaptınız ve eski kayıtlar tutmuyor. Aynı kaydı iki farklı simülasyonla oynatıp izleri karşılaştırıyoruz. Testteki "bozuk build", 300. tick'te spawn sayacına milyonda birlik bir kayma sokuyor:

```ts
// test/desync.test.ts
import { describe, expect, it } from "vitest";
import type { InputBits } from "../src/input";
import { findDivergence, replayWithTrail } from "../src/recording";
import type { Rng } from "../src/rng";
import { recordSession } from "../src/session";
import { panicPilot, step, type State } from "../src/sim";

describe("desync avı: aynı kayıt, iki farklı build", () => {
  // "Yeni build": 300. tick'te spawn sayacına milyonda bir kayma giriyor.
  // Ekranda hiçbir şey görünmez; hash anında görür.
  const driftedStep = (
    state: State,
    input: InputBits,
    dt: number,
    rng: Rng,
  ): State => {
    const next = step(state, input, dt, rng);
    if (state.tick === 300) next.spawnTimer += 1e-6;
    return next;
  };

  it("kaba iz ayrılmayı bulur, ince iz tam kareyi verir", () => {
    const { recording } = recordSession(20260723, panicPilot, 900, 30);
    const coarse = replayWithTrail(recording, { stepFn: driftedStep });
    expect(findDivergence(recording.trail, coarse.trail)).toBe(330);

    const fineOld = replayWithTrail(recording, { trailEvery: 1 }).trail;
    const fineNew = replayWithTrail(recording, {
      trailEvery: 1,
      stepFn: driftedStep,
    }).trail;
    expect(findDivergence(fineOld, fineNew)).toBe(301);
  });
});
```

Bu testin öğrettiği iki şey var ve ikisi de bana pahalıya patladı.

Birincisi: kaba iz size pencereyi verir, tick'i vermez. 30 tick aralıkla örnekleme yaptığımda `findDivergence` "330" dedi. Gerçek ayrılma 301'de olmuştu. Bir süre 330 civarındaki kodu inceledim, orada bir şey yoktu, olmadığı için de yoktu. Örnekleme çözünürlüğü kadar yalan söylüyor. Pencereyi bulduktan sonra `trailEvery: 1` ile ikinci bir tur atmak tam kareyi veriyor.

İkincisi daha ilginç. O `1e-6`'lık kayma, hash'e 301. tick'te yansıdı. Peki ekranda ne zaman görünür oldu? Gemi konumu bir pikselden fazla kaydığında, ya da bir kaya sayısı değiştiğinde. Ölçtüm: **384. tick**. Aradaki fark 83 tick, yani 1.4 saniye. Bu 1.4 saniye, "gözle bakıp bulurum" ile "hash'e bakıp bulurum" arasındaki mesafenin somut hali. Hash 83 tick önce haber veriyor ve haberi verdiği yer, hatanın gerçekten doğduğu yer.

Bu arada `spawnTimer`'ı seçmem tesadüf değildi. İlk denememde gemiye `vy += 0.001` diye bir kayma vermiştim ve hiçbir şey olmadı; test yeşil kaldı, `findDivergence` inatla `null` döndürdü. Yarım saat sonra anladım: gemi o sırada tavana yapışıktı ve duvar kırpması her tick'te `vy = 0` yazıyordu. Kayma, oluştuğu tick'te siliniyordu. `spawnTimer` ise hiçbir zaman sabitlenmeyen, sürekli biriken bir sayaç; oraya bir kez giren kayma sonsuza kadar taşınıyor ve bir noktada bir kayanın doğum tick'ini kaydırıyor. Determinizm testlerinde neyi bozduğunuz, ne kadar bozduğunuzdan önemli.

### Bir Oynanışı Regresyon Testine Çevirmek

Buraya kadar araçlar tamam. Sıra asıl vaatte: hata raporunu teste çevirmek.

Akış şöyle işliyor. Oyuncu (ya da tester, ya da bot) oynar, kayıt dosyası çıkar. Dosya repoya `test/fixtures/` altına girer. Test dosyası onu okur, oynatır ve beklenen sonucu doğrular. Bug'ı üreten oynanış artık CI'da her commit'te tekrar tekrar oynanıyor.

Fixture'ı üreten script, yukarıdaki `recordSession`'ın on satırlık bir sarmalayıcısı:

```ts
// scripts/make-fixture.ts
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { hex } from "../src/hash";
import { serialize } from "../src/recording";
import { recordSession } from "../src/session";
import { panicPilot } from "../src/sim";

const SEED = 20260723;
const TICKS = 1800; // 30 saniye
const OUT = resolve(process.cwd(), "test/fixtures/canyon-session.json");

const { recording, final } = recordSession(SEED, panicPilot, TICKS, 30);
const json = serialize(recording);

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, json + "\n", "utf8");

const raw = recording.ticks * 4; // tick başına 4 bayt ham girdi
console.log(`kayıt yazıldı: ${OUT}`);
console.log(`  tohum        : ${recording.seed}`);
console.log(`  tick         : ${recording.ticks} (${TICKS / 60} sn)`);
console.log(`  run bloğu    : ${recording.runs.length}`);
console.log(
  `  sıkıştırma   : ${raw} B ham → ${recording.runs.length * 4} B run (${(raw / (recording.runs.length * 4)).toFixed(1)}x)`,
);
console.log(`  JSON boyutu  : ${json.length} B`);
console.log(`  hash örneği  : ${recording.trail.length}`);
console.log(`  final hash   : 0x${hex(recording.finalHash)}`);
console.log(`  atlatılan    : ${final.dodged} · çarpma: ${final.hits}`);
```

Testin tarafı ise sıradan bir unit test'ten farksız:

```ts
// test/regression.test.ts
import { describe, expect, it } from "vitest";
import fixture from "./fixtures/canyon-session.json";
import { hashState } from "../src/hash";
import { parseRecording, replay, verifyRecording } from "../src/recording";

describe("regresyon: diskteki kayıt", () => {
  const recording = parseRecording(JSON.stringify(fixture));

  it("fixture kendi hash izini tutuyor", () => {
    expect(verifyRecording(recording).ok).toBe(true);
  });

  it("30 saniyelik oynanış aynı sonucu veriyor", () => {
    const state = replay(recording);
    expect(state.tick).toBe(1800);
    expect(state.dodged).toBe(82);
    expect(state.hits).toBe(4);
    expect(hashState(state)).toBe(recording.finalHash);
  });
});
```

Bu testin ne kadar geniş bir yüzeyi koruduğuna dikkat edin. `dodged` ve `hits` iddiaları oyunun kurallarını kilitliyor; `hashState` karşılaştırması ise geri kalan her şeyi. Fizik sabitlerinden birine dokunursanız, çarpışma yarıçapını değiştirirseniz, doğurma sırasını oynatırsanız, hatta `hashState`'in alan sırasını karıştırırsanız bu test kırmızıya döner. 1800 tick'lik bir davranış sözleşmesi, dört `expect` satırı.

Kayıt tarafının kendi testleri de var; bunlar formatın ve replay'in sözünü tuttuğunu doğruluyor:

```ts
// test/recording.test.ts
import { describe, expect, it } from "vitest";
import { hashState } from "../src/hash";
import { ALL_BITS, THRUST, type InputBits } from "../src/input";
import {
  decodeRuns,
  encodeRuns,
  replay,
  replayWithTrail,
  runsLength,
  serialize,
  type Recording,
} from "../src/recording";
import { mulberry32, type Rng } from "../src/rng";
import { recordSession } from "../src/session";
import { panicPilot } from "../src/sim";

const SEED = 20260723;

describe("kayıt → replay", () => {
  it("replay, canlı oturumun son hash'ini birebir geri getirir", () => {
    const { recording, final } = recordSession(SEED, panicPilot, 900);
    expect(hashState(replay(recording))).toBe(hashState(final));
    expect(recording.finalHash).toBe(hashState(final));
  });

  it("aynı kayıt iki kez oynatılınca aynı sonucu verir", () => {
    const { recording } = recordSession(SEED, panicPilot, 900);
    expect(hashState(replay(recording))).toBe(hashState(replay(recording)));
  });

  it("kayıt tohuma bağlıdır: tohum değişince final hash değişir", () => {
    const a = recordSession(SEED, panicPilot, 900).recording;
    const b: Recording = { ...a, seed: SEED + 1 };
    expect(hashState(replay(b))).not.toBe(a.finalHash);
  });

  it("replay kaydı mutasyona uğratmaz", () => {
    const { recording } = recordSession(SEED, panicPilot, 600);
    const before = serialize(recording);
    replayWithTrail(recording, { trailEvery: 1 });
    expect(serialize(recording)).toBe(before);
  });
});

describe("run-length kodlama", () => {
  // Tohumlu girdi dizisi: rastgele ama her koşuda aynı.
  const makeInputs = (rng: Rng, n: number): InputBits[] => {
    const out: InputBits[] = [];
    let current = 0;
    for (let i = 0; i < n; i++) {
      if (rng() < 0.12) current = Math.floor(rng() * (ALL_BITS + 1));
      out.push(current);
    }
    return out;
  };

  it("decode(encode(x)) === x", () => {
    const inputs = makeInputs(mulberry32(7), 5000);
    expect(decodeRuns(encodeRuns(inputs))).toEqual(inputs);
  });

  it("blok sayısı girdi sayısından küçüktür ve uzunluk korunur", () => {
    const inputs = makeInputs(mulberry32(7), 5000);
    const runs = encodeRuns(inputs);
    expect(runsLength(runs)).toBe(inputs.length);
    expect(runs.length).toBeLessThan(inputs.length / 4);
  });

  it("hiç değişmeyen girdi tek bloğa iner", () => {
    const runs = encodeRuns(new Array<InputBits>(600).fill(THRUST));
    expect(runs).toEqual([{ input: THRUST, count: 600 }]);
  });

  it("boş dizi boş blok listesi verir", () => {
    expect(encodeRuns([])).toEqual([]);
    expect(decodeRuns([])).toEqual([]);
    expect(runsLength([])).toBe(0);
  });

  it("gerçek oturumda run sayısı tick sayısının çeyreğinden az", () => {
    const { recording } = recordSession(SEED, panicPilot, 1800);
    expect(runsLength(recording.runs)).toBe(1800);
    expect(recording.runs.length).toBeLessThan(450);
  });
});
```

Round-trip testinde girdiyi `Math.random` ile üretmediğime dikkat edin. `mulberry32(7)` ile ürettim, çünkü rastgele girdiyle koşan bir test bir gün kırılırsa hangi diziyle kırıldığını asla öğrenemezsiniz. Determinizm yazısı yazıp testlerini rastgele beslemek olmazdı.

Kaydı kasten bozup doğrulamanın gerçekten kırıldığını da görmek gerekiyor. İki tür bozulma var: yapısal ve anlamsal.

```ts
// test/corruption.test.ts
import { describe, expect, it } from "vitest";
import { THRUST } from "../src/input";
import {
  parseRecording,
  serialize,
  verifyRecording,
  type Recording,
} from "../src/recording";
import { recordSession } from "../src/session";
import { panicPilot } from "../src/sim";

describe("bozuk kayıt tespiti", () => {
  it("başlıktaki tick sayısı bloklarla uyuşmazsa parse patlar", () => {
    const { recording } = recordSession(20260723, panicPilot, 600);
    const broken = JSON.parse(serialize(recording)) as Recording;
    broken.runs[3].count += 1;
    expect(() => parseRecording(serialize(broken))).toThrow(/bozuk kayıt/);
  });

  it("bilinmeyen sürüm reddedilir", () => {
    const { recording } = recordSession(20260723, panicPilot, 600);
    const broken = JSON.parse(serialize(recording)) as Recording;
    (broken as { version: number }).version = 2;
    expect(() => parseRecording(serialize(broken))).toThrow(/sürüm/);
  });

  it("sağlam kayıt doğrulamayı geçer", () => {
    const { recording } = recordSession(20260723, panicPilot, 900, 30);
    const result = verifyRecording(parseRecording(serialize(recording)));
    expect(result.ok).toBe(true);
    expect(result.divergedAt).toBe(null);
  });

  it("tek bir tick'in girdisi değişirse doğrulama düşer", () => {
    const { recording } = recordSession(20260723, panicPilot, 900, 30);
    const broken = JSON.parse(serialize(recording)) as Recording;

    // 40. bloğun başladığı tick'i bul, o bloğun girdisini boz.
    let corruptedTick = 0;
    for (let i = 0; i < 40; i++) corruptedTick += broken.runs[i].count;
    broken.runs[40].input ^= THRUST;

    const result = verifyRecording(broken);
    expect(result.ok).toBe(false);
    // İz 30 tick'te bir örneklendiği için ayrılma bir sonraki örnekte görünür.
    expect(result.divergedAt).toBe(Math.ceil((corruptedTick + 1) / 30) * 30);
  });
});
```

İkinci testin son satırı, bir bölüm önce bahsettiğim çözünürlük meselesinin teste dökülmüş hali. Tek bir tick'in `THRUST` biti tersine dönüyor ve doğrulama, bozulmanın olduğu tick'te değil, o tick'ten sonraki ilk örnekte kırılıyor. Test bunu gizlemek yerine formülüyle beyan ediyor. Bu tür testleri seviyorum çünkü sistemin gerçek davranışını anlatıyorlar, ideal davranışını değil.

Bütün paket bende şu şekilde koşuyor:

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

Yirmi bir test, toplam 400 milisaniyenin altında. Tek bir tarayıcı sekmesi açılmadan.

### Kaydın Kırıldığı An

Bu bölümü yazmasam olurdu ve yazı daha parlak görünürdü. Ama kayıt/replay sistemlerinin gerçeği şu: bir gün mutlaka bozulurlar, ve bozulduklarında sessizce bozulurlar.

Determinizmi kıran kaynakları, en sık gördüğüm sıraya göre yazayım.

**Kayıt sırası dışından gelen girdi.** En sinsi olanı bu. Kaydediciye yazdığınız girdi ile `step`'e verdiğiniz girdi aynı olmalı; aralarına giren tek bir "pause tuşuna basılmışsa şunu yap" kontrolü kaydı kırar. Kural şu: girdi tek bir yerde toplanır, `step`'e ve `Recorder`'a *aynı değişkenden* gider. Yukarıdaki döngüde `const input = held;` satırının varlığı bu yüzden. `step(state, held, ...)` yazıp sonra `recorder.capture(held, ...)` demek arada bir olay dinleyicisi tetiklendiğinde iki farklı değer verebilir.

**Kare başına girdi, tick başına değil.** Test edilebilir mimari yazısında bunu canlı bir bug olarak yaşamıştım: 15 FPS'te bir karede dört tick atılıyor ve dördüne aynı girdiyi verirseniz sonuç 60 FPS'ten ayrılır. Kayıt açısından sonucu daha da acı: kaydın uzunluğu kare sayısına bağlı olur, replay'de tick sayısı tutmaz.

**Global rastgelelik.** `Math.random()` tek bir yerde bile geçse kayıt anlamını yitirir. Buna karşı tuzak kurmak tek test:

```ts
// test/traps.test.ts
import { expect, it } from "vitest";
import { replay } from "../src/recording";
import { recordSession } from "../src/session";
import { panicPilot } from "../src/sim";

const SEED = 20260723;

it("replay global rastgeleliğe dokunmaz", () => {
  const { recording } = recordSession(SEED, panicPilot, 600);
  const original = Math.random;
  Math.random = () => {
    throw new Error("replay Math.random kullandı");
  };
  try {
    expect(() => replay(recording)).not.toThrow();
  } finally {
    Math.random = original;
  }
});
```

**Duvar saati.** `Date.now()` ya da `performance.now()` simülasyonun içine sızarsa, replay her koşuda başka bir sonuç verir. Zamanın tek kaynağı `dt` olmalı, o da kayıttaki `tickRate`'ten geliyor.

**Sıralamayı garanti etmeyen veri yapıları.** `Set` ve `Map` ekleme sırasını korur, orası tamam. Ama `Object.keys` sıralaması sayısal anahtarlarda farklı davranır, `Array.prototype.sort` V8'de kısa dizilerde kararlıdır ama karşılaştırıcınız eşitlik döndürüyorsa sıraya güvenemezsiniz. Çarpışma listesini nesne kimliğine göre sıralayan bir kodun deterministik olduğunu sanmak, benim de bir kez düştüğüm tuzak.

**Transandantal fonksiyonlar.** `Math.sin`, `Math.cos`, `Math.pow` gibi fonksiyonların son bit doğruluğu IEEE-754'te bağlanmamıştır; motorlar arasında farklı sonuç verebilirler. Tek makinede kayıt/replay yapıyorsanız sorun değil. Kaydı başka bir kullanıcıdan alıp kendi makinenizde açacaksanız, rollback yazısındaki fixed-point yaklaşımına bakmanız gerekebilir.

**Kodun kendisi.** En temel olanı da bu. Kayıt, alındığı `step` sürümüne aittir. Sabitlerden birini değiştirdiğiniz an bütün eski kayıtlar geçersiz olur. Bu bir kusur değil, sistemin doğası; nitekim regresyon testinin işi tam olarak bunu haber vermek. Ama fixture'ı güncellerken şu disipline uyun: hash'i körlemesine yenilemeyin. Önce `findDivergence` ile nerede ayrıldığına bakın, o tick'te olan şey kasıtlı bir değişiklik mi diye sorun, ondan sonra yenileyin.

Şunu da dürüstçe söyleyeyim: kayıt/replay'in bedeli sıfır değil. Her tick'te girdiyi bir yere yazmak, hash örneği almak ve kaydın disiplinini korumak bir maliyet. Küçük bir prototipte bu tören fazla gelir. Ama oyununuz altı aydan uzun yaşayacaksa, çok oyunculuysa ya da rekabetçi bir yanı varsa, bu maliyet ilk "bazen oluyor" raporunda kendini ödüyor.

### Özetle:

1. Deterministik bir simülasyonda durum, girdinin fonksiyonudur. Kaydedilecek şey durum değil, tohum + kare başına girdi.
2. Ön koşul üç maddedir ve bu seride zaten ödendi: sabit adım, tohumlu PRNG (sözde rastgele üreteç), enjekte edilen zaman. Replay bunların üstüne neredeyse bedava geliyor.
3. Girdiyi bit maskesi (`InputBits`) olarak tutun. Karşılaştırma tek `===` olur, sıkıştırma bedavaya gelir.
4. `Recording` sekiz alandan ibaret: sürüm, tohum, tick oranı, tick sayısı, RLE bloklar, hash izi ve final hash.
5. Run-length encoding girdi kaydı için biçilmiş kaftan: bot pilotta 4.3x, insan benzeri girdide 29.3x. Analog girdide RLE ters teper; orada kuantalama ya da delta encoding gerekir.
6. Replay pahalı değil: 30 saniyelik oturum 0.39 ms'de yeniden oynanıyor. Bu yüzden bir kayıt, izleme özelliği değil, birim testtir.
7. Hash izi ayrılmayı yakalar ama çözünürlüğü örnekleme aralığı kadardır. Önce kaba izle pencereyi bulun, sonra `trailEvery: 1` ile tam tick'i.
8. Replay'e `stepFn` enjekte edilebilir olsun: aynı kaydı iki farklı build ile oynatmak, "hangi değişiklik bozdu" sorusunun en kestirme cevabı.
9. Kayıt + beklenen hash = fixture. Dört `expect` satırı 1800 tick'lik davranışı kilitliyor. Fixture'ı güncellerken önce ayrılma tick'ine bakın, hash'i körlemesine yenilemeyin.
10. Determinizmi kıranlar: kayıt dışı girdi, kare başına örnekleme, `Math.random`, duvar saati, sırasız veri yapıları, transandantal fonksiyonlar, ve kodun kendisi. Her birine tuzak testi yazılabilir.

Repoda hepsi duruyor: kaynak dosyalar, fixture'ı üreten script, demo ve testler. En hızlısı `npm run dev` deyip demoyu açmak; `R` ile kaydedin, `P` ile geri oynatın, HUD'da tohum, tick, hash ve kaydın o anki boyutu akarken izleyin. Kaydı sıfırdan üretmek isterseniz `npm run fixture`, boyut ve hız ölçümleri için `npm run bench` var.

Peki o ilk hata raporu ne oldu? Onu gönderen kişiye artık tek bir cümle yazıyorum: "Şu tuşa basınca ekrandaki kayıt dosyasını bana yollar mısın?" Gelen dosya 11 kilobayt. Açıyorum, ayrıldığı tick'i görüyorum, oradan devam ediyorum. Benim hata ayıklama becerim değişmedi; sorunun büyüklüğü değişti. "Bazen" bir tick numarasına dönüştüğü anda ortada gizem diye bir şey kalmıyor.

Kara kutunun asıl marifeti kazayı önlemesi değil. Kazayı bir kez daha, kontrollü şekilde yaşatabilmesi. 🛠️
