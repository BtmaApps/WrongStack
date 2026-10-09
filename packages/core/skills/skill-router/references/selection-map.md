# Bundled selection map

Use one relevant group at a time. These are stable ids, not package versions.
The entrypoint owns detailed steps and acceptance checks. Hidden audiences stay
restricted even when their ids are documented here.

## Frontend

| Requested result / İstenen iş | Load |
|---|---|
| Next.js App Router routes, actions and caching / Next.js App Router rotaları, action ve cache | `nextjs-modern` |
| React component state, forms and hooks / React bileşen durumu, form ve hook | `react-modern` |
| TypeScript contracts and narrowing without any / any kullanmadan TypeScript sözleşmeleri ve daraltma | `typescript-strict` |
| Node runtime APIs, ESM and async cancellation / Node çalışma zamanı API, ESM ve async iptal | `node-modern` |
| Astro content sites and islands / Astro içerik siteleri ve island bileşenleri | `astro-modern` |
| Vue components and Nuxt server routes / Vue bileşenleri ve Nuxt sunucu rotaları | `vue-nuxt` |
| Svelte runes and SvelteKit actions / Svelte runes ve SvelteKit action | `sveltekit-modern` |
| Angular signals and standalone components / Angular signals ve standalone bileşenler | `angular-modern` |
| Measure and improve browser loading and interaction / Tarayıcı yüklenmesini ve etkileşimini ölçüp iyileştir | `web-performance` |
| Choose compatible HTML, CSS and browser APIs / Uyumlu HTML, CSS ve tarayıcı API seç | `web-platform-baseline` |

## Backend

| Requested result / İstenen iş | Load |
|---|---|
| Define HTTP contracts, pagination and error schemas / HTTP sözleşmesi, sayfalama ve hata şeması tanımla | `api-design` |
| Implement Node server endpoints and shutdown / Node sunucu endpoint ve kapanış uygula | `node-backend` |
| Implement Python APIs and typed validation / Python API ve tipli doğrulama uygula | `python-backend` |
| Build Go handlers, concurrency and cancellation / Go handler, eşzamanlılık ve iptal kur | `go-services` |
| Implement Rust ownership, error and async boundaries / Rust sahiplik, hata ve async sınırları uygula | `rust-systems` |
| Build ASP.NET services and dependency injection / ASP.NET servis ve dependency injection kur | `dotnet-backend` |
| Implement Spring Boot validation and transactions / Spring Boot doğrulama ve transaction uygula | `java-spring` |
| Implement Laravel policies, requests and Eloquent / Laravel policy, request ve Eloquent uygula | `php-laravel` |
| Implement GraphQL schema and resolver contracts / GraphQL şema ve resolver sözleşmeleri uygula | `graphql-development` |
| Build login, session rotation and revocation / Giriş, oturum yenileme ve iptal kur | `authentication-sessions` |
| Implement signed, idempotent payment callbacks / İmzalı, idempotent ödeme callback uygula | `payments-webhooks` |

## Design

| Requested result / İstenen iş | Load |
|---|---|
| Build or restyle a concrete product interface / Somut ürün arayüzü kur veya yeniden biçimlendir | `design-craft` |
| Critique an existing interface with visual evidence / Mevcut arayüzü görsel kanıtla değerlendir | `design-critique` |
| Define shared colors, typography and component tokens / Paylaşılan renk, tipografi ve bileşen tokenı tanımla | `design-system` |
| Implement a supplied design or Figma reference / Verilen tasarım veya Figma referansını uygula | `design-to-code` |
| Design user journeys, feedback and recovery / Kullanıcı yolculuğu, geri bildirim ve kurtarma tasarla | `interaction-design` |
| Create consistent icons and exportable visual assets / Tutarlı ikon ve dışa aktarılabilir görsel varlık oluştur | `design-assets` |
| Fix keyboard, focus and assistive technology behavior / Klavye, odak ve yardımcı teknoloji davranışını düzelt | `accessibility` |
| Compare rendered UI states against screenshot baselines / Render edilmiş arayüzü ekran görüntüsü baseline ile karşılaştır | `visual-regression` |
| Implement translation, plurals and bidirectional layout / Çeviri, çoğul ve çift yönlü yerleşim uygula | `i18n-localization` |

## Media

| Requested result / İstenen iş | Load |
|---|---|
| Produce Remotion videos or assemble and encode media / Remotion videosu üret veya medyayı birleştirip kodla | `media-production` |
| Animate a scripted 2D scene with Motion Canvas / Motion Canvas ile kodlu 2D sahne canlandır | `motion-canvas-video` |
| Render mathematical animation with Manim Community / Manim Community ile matematik animasyonu render et | `manim-video` |
| Animate live web UI transitions and gestures / Canlı web arayüzü geçişlerini ve hareketlerini canlandır | `motion-design` |
| Build interactive Three.js 3D rendering and shaders / Etkileşimli Three.js 3D render ve shader kur | `threejs-3d` |
| Prepare music, narration and audio delivery / Müzik, seslendirme ve ses teslimi hazırla | `audio-studio` |
| Create and verify Word, spreadsheet, slide or PDF artifacts / Word, tablo, sunum veya PDF üret ve doğrula | `office-documents` |

## Mobile

| Requested result / İstenen iş | Load |
|---|---|
| Design native touch layouts and safe-area behavior / Native dokunmatik yerleşim ve safe area tasarla | `mobile-design` |
| Build React Native and Expo app screens / React Native ve Expo uygulama ekranı kur | `react-native-expo` |
| Build Flutter widgets, state and platform integration / Flutter widget, durum ve platform entegrasyonu kur | `flutter-mobile` |
| Build SwiftUI and Apple platform features / SwiftUI ve Apple platform özellikleri kur | `swift-ios` |
| Build Kotlin Android and Jetpack Compose features / Kotlin Android ve Jetpack Compose özellikleri kur | `kotlin-android` |
| Profile device startup, scrolling and memory / Cihaz açılışını, kaydırmayı ve belleği ölç | `mobile-performance` |
| Prepare mobile signing and app-store releases / Mobil imzalama ve uygulama mağazası sürümü hazırla | `mobile-release` |

## Operations

| Requested result / İstenen iş | Load |
|---|---|
| Establish verified SSH identities, sessions and transfers / Doğrulanmış SSH kimliği, oturumu ve aktarımı kur | `ssh-operations` |
| Operate Linux services, journals and resource limits / Linux servis, journal ve kaynak sınırlarını yönet | `linux-service-ops` |
| Diagnose remote processes and networking over SSH / SSH üzerinden uzak süreç ve ağı teşhis et | `remote-debugging` |
| Release an application on an existing VPS / Mevcut VPS üzerinde uygulama sürümü yayınla | `vps-deploy` |
| Configure proxy routing, certificates and TLS renewal / Proxy yönlendirme, sertifika ve TLS yenileme yapılandır | `reverse-proxy-tls` |
| Build and deploy a reproducible container image / Tekrarlanabilir container imajı kur ve deploy et | `docker-deploy` |
| Operate multi-service Docker Compose dependencies / Çok servisli Docker Compose bağımlılıklarını yönet | `compose-operations` |
| Diagnose a running container failure / Çalışan container hatasını teşhis et | `container-debugging` |
| Reduce container privilege and secret exposure / Container ayrıcalığını ve secret maruziyetini azalt | `container-hardening` |
| Build automated CI checks and delivery pipelines / Otomatik CI kontrolleri ve teslim pipeline kur | `ci-cd` |
| Verify release promotion and rollback paths / Sürüm yükseltme ve rollback yollarını doğrula | `release-rollback` |
| Prove backup restore and recovery objectives / Yedek geri yükleme ve kurtarma hedefini kanıtla | `backup-recovery` |
| Operate Kubernetes workloads and autoscaling / Kubernetes workload ve otomatik ölçekleme yönet | `kubernetes-operations` |
| Plan versioned Terraform or infrastructure changes / Sürümlü Terraform veya altyapı değişikliği planla | `infrastructure-as-code` |
| Choose cloud topology, failure domains and services / Bulut topolojisi, hata alanı ve servis seç | `cloud-architecture` |
| Implement Cloudflare Workers bindings and deployment / Cloudflare Workers binding ve deploy uygula | `cloudflare-workers` |
| Coordinate production outage triage and recovery / Üretim kesintisi teşhisi ve kurtarmayı koordine et | `incident-response` |

## Data

| Requested result / İstenen iş | Load |
|---|---|
| Design database queries, indexes and transactions / Veritabanı sorgu, indeks ve transaction tasarla | `database-development` |
| Deploy compatible schema changes and backfills / Uyumlu şema değişikliği ve backfill yayınla | `database-migrations` |
| Define data ownership, retention and PII boundaries / Veri sahipliği, saklama ve kişisel veri sınırı tanımla | `data-governance` |
| Build bounded retries, background jobs and deduplication / Sınırlı retry, arka plan işi ve tekilleştirme kur | `queues-jobs` |
| Build ordered live updates and reconnection / Sıralı canlı güncelleme ve yeniden bağlantı kur | `realtime-systems` |
| Reconcile offline edits, outboxes and conflicts / Çevrimdışı değişiklik, outbox ve çakışmaları uzlaştır | `offline-sync` |
| Implement owned object storage and upload lifecycle / Sahipliği tanımlı nesne deposu ve yükleme yaşam döngüsü uygula | `storage-uploads` |
| Instrument logs, traces, metrics and service signals / Log, trace, metrik ve servis sinyallerini ekle | `observability` |

## Quality

| Requested result / İstenen iş | Load |
|---|---|
| Reproduce and diagnose a reported failure / Bildirilen hatayı yeniden üret ve teşhis et | `debugging` |
| Write meaningful behavior and regression tests / Anlamlı davranış ve regresyon testleri yaz | `testing` |
| Prove a claimed fix or completion actually works / Düzeltme veya tamamlanma iddiasını çalıştırarak kanıtla | `verify-before-done` |
| Find, prove, fix and independently verify real defects / Gerçek kusuru bul, kanıtla, düzelt ve bağımsız doğrula | `evidence-audit` |
| Run the WrongStack bug-hunt and cascade workflow / WrongStack bug hunt ve cascade akışını yürüt | `bug-hunter` |
| Review implementation correctness and maintainability / Uygulama doğruluğunu ve bakım kolaylığını incele | `code-review` |
| Review adversarially and propose approval-gated fixes / Karşıt bakışla incele ve onay gerektiren düzeltme öner | `codex-adversarial-review` |
| Review session changes through the read-only guardian / Oturum değişikliklerini salt okunur guardian ile incele | `chimera` |
| Operate the built-in automatic review plugin / Yerleşik otomatik review pluginini yönet | `auto-review` |
| Measure dead code, unused dependencies and bundle waste / Ölü kod, kullanılmayan bağımlılık ve bundle israfını ölç | `code-quality` |
| Review source trust boundaries and defensive security / Kaynak güven sınırlarını ve savunma güvenliğini incele | `security-scanner` |

## Workflow

| Requested result / İstenen iş | Load |
|---|---|
| Locate repository entry points and owning modules / Depo giriş noktalarını ve sorumlu modülleri bul | `codebase-navigation` |
| Define acceptance criteria and dependent tasks / Kabul kriteri ve bağımlı görevler tanımla | `sdd` |
| Manage scoped commits, branches and pull requests / Kapsamlı commit, branch ve pull request yönet | `git-flow` |
| Plan behavior-preserving module decomposition / Davranışı koruyan modül ayrıştırması planla | `refactor-planner` |
| Plan coordinated work when delegation is authorized / Delegasyon yetkiliyse koordineli çalışma planla | `multi-agent` |
| Apply precise evidence and response formatting / Kesin kanıt ve yanıt biçimini uygula | `output-standards` |
| Design grounded instructions and output contracts / Kaynağa dayalı yönerge ve çıktı sözleşmesi tasarla | `prompt-engineering` |
| Research a question using authoritative web sources / Yetkili web kaynaklarıyla soruyu araştır | `research-web` |
| Verify latest stable versions and migration constraints / Son kararlı sürüm ve geçiş kısıtını doğrula | `tech-stack` |
| Author and validate bundled or project skills / Bundled veya proje skilli yaz ve doğrula | `skill-creator` |
| Inspect session journal evidence and provenance / Oturum journal kanıtı ve kaynağını incele | `audit-log` |
| Maintain the SAGE memory corpus and retrieval anchors / SAGE hafıza corpus ve erişim anchorlarını bakım yap | `mnemosyne` |
| Select a workflow across unclear or overlapping domains / Belirsiz veya çakışan alanlarda akış seç | `skill-router` |

## Integration

| Requested result / İstenen iş | Load |
|---|---|
| Build an MCP server and test its tool contracts / MCP sunucu kur ve araç sözleşmesini test et | `mcp-development` |
| Connect an authorized external agent to a mailbox / Yetkili dış ajanı mailbox sistemine bağla | `mailbox-bridge` |
| Operate WrongStack task-board lifecycle / WrongStack görev panosu yaşam döngüsünü yönet | `wrongstack-kanban` |
| Author WrongStack plugin hooks and registration / WrongStack plugin hook ve kayıt sistemi yaz (roster/external only) | `plugin-author` |
| Use the roster mailbox client protocol / Roster mailbox istemci protokolünü kullan (roster/external only) | `wrongstack-mailbox` |
| Use the roster mailbox MCP transport / Roster mailbox MCP taşımasını kullan (roster/external only) | `wrongstack-mailbox-mcp` |
