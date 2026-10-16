import type { LocalSkillRule } from './local-rule.js';

/** Operations, data, quality, workflow and integration aliases — the tail of `LOCAL_SKILL_RULES`. */
export const OPERATIONS_AND_QUALITY_RULES: readonly LocalSkillRule[] = [
  {
    name: 'ssh-operations',
    domain: 'operations',
    match: /\b(?:ssh|scp|sftp|host key|identity file)\b/i,
    priority: 90,
  },
  {
    name: 'linux-service-ops',
    domain: 'operations',
    match: /\b(?:systemd|journalctl|linux service|linux servis|ulimit)\b/i,
    priority: 90,
  },
  {
    name: 'remote-debugging',
    domain: 'operations',
    match:
      /\b(?:remote debug|remote (?:process|service)|uzak[^\n]{0,120}(?:surec|teshis|servis)|over ssh[^\n]{0,120}diagnos)\b/i,
    priority: 100,
  },
  {
    name: 'vps-deploy',
    domain: 'operations',
    match: /\b(?:vps|bare metal|existing server|mevcut sunucu)\b/i,
    priority: 90,
  },
  {
    name: 'reverse-proxy-tls',
    domain: 'operations',
    match: /\b(?:nginx|caddy|traefik|reverse proxy|tls|certificate renewal|sertifika yenile)\b/i,
    priority: 110,
  },
  {
    name: 'docker-deploy',
    domain: 'operations',
    match: /\b(?:dockerfile|docker image|container image|container imaj|docker deploy|docker)\b/i,
    priority: 65,
  },
  {
    name: 'compose-operations',
    domain: 'operations',
    match: /\b(?:docker compose|docker-compose|named.volume|compose service)\b/i,
    priority: 100,
  },
  {
    name: 'container-debugging',
    domain: 'operations',
    match:
      /\b(?:container[^\n]{0,120}(?:fail|crash|dns|debug|cannot|hata|ulasam|teshis)|container debugging|container\w*[^\n]{0,120}(?:dns|ulasam|cozem))\b/i,
    priority: 100,
  },
  {
    name: 'container-hardening',
    domain: 'operations',
    match:
      /\b(?:container harden|container[^\n]{0,120}(?:non.root|read.only|privileg|capabilit)|root olmayan|salt okunur kok|container guven)\b/i,
    priority: 100,
  },
  {
    name: 'ci-cd',
    domain: 'operations',
    match: /\b(?:github actions|gitlab ci|ci\/cd|ci pipeline|build matrix|actions matrisi)\b/i,
    priority: 90,
  },
  {
    name: 'release-rollback',
    domain: 'operations',
    match: /\b(?:rollback|release promotion|health.gated|canary|blue.green|surum gecis)\b/i,
    priority: 90,
  },
  {
    name: 'backup-recovery',
    domain: 'operations',
    match: /\b(?:backup|restore|yedek|geri yukle|recovery objective)\b/i,
    priority: 90,
  },
  {
    name: 'kubernetes-operations',
    domain: 'operations',
    match: /\b(?:kubernetes|kubectl|k8s|helm|pod autoscal|hpa)\b/i,
    priority: 90,
  },
  {
    name: 'infrastructure-as-code',
    domain: 'operations',
    match: /\b(?:terraform|pulumi|infrastructure as code|iac|vpc|subnet)\b/i,
    priority: 90,
  },
  {
    name: 'cloud-architecture',
    domain: 'operations',
    match:
      /\b(?:cloud architecture|bulut[^\n]{0,80}mimari\w*|failure domains?|region selection|cloud application architecture|bolge sec|aws architecture|azure architecture)\b/i,
    priority: 90,
  },
  {
    name: 'cloudflare-workers',
    domain: 'operations',
    match: /\b(?:cloudflare|wrangler|durable object|workers binding)\b/i,
    priority: 90,
  },
  {
    name: 'incident-response',
    domain: 'operations',
    match:
      /\b(?:production outage|incident response|uretim kesinti\w*|hizmet kesinti\w*|olay mudahale)\b/i,
    priority: 110,
  },
  {
    name: 'database-development',
    domain: 'data',
    match:
      /\b(?:postgres(?:ql)?|mysql|sqlite|database query|explain analyze|sql query|veritabani sorgu|indeks)\b/i,
    priority: 90,
  },
  {
    name: 'database-migrations',
    domain: 'data',
    match:
      /\b(?:schema migration|database migration|backfill|expand.contract|sema gecis|sema degisik)\b/i,
    priority: 100,
  },
  {
    name: 'data-governance',
    domain: 'data',
    match: /\b(?:data governance|data retention|pii|veri sahip|saklama suresi)\b/i,
    priority: 90,
  },
  {
    name: 'queues-jobs',
    domain: 'data',
    match: /\b(?:background job|job queue|dead.letter|queue|arka plan isi|kuyruk|deduplication)\b/i,
    priority: 90,
  },
  {
    name: 'realtime-systems',
    domain: 'data',
    match: /\b(?:websocket|realtime|real.time|reconnection|live update|canli guncelle)\b/i,
    priority: 90,
  },
  {
    name: 'offline-sync',
    domain: 'data',
    match: /\b(?:offline|outbox|conflict resolution|cevrimdisi|cakisma coz)\b/i,
    priority: 90,
  },
  {
    name: 'storage-uploads',
    domain: 'data',
    match:
      /\b(?:object storage|signed (?:object )?uploads?|file upload|nesne depo|nesne yukleme|dosya yukle|s3 upload)\b/i,
    priority: 90,
  },
  {
    name: 'observability',
    domain: 'data',
    match:
      /\b(?:observability|tracing|structured logging|opentelemetry|loglama|gozlemlenebilir|metrics instrumentation)\b/i,
    priority: 90,
  },
  {
    name: 'debugging',
    domain: 'quality',
    match:
      /\b(?:debug|diagnos|crash|broken|fails|failing|hata ver|hata al|calismiyor|bozuk|takiliyor|teshis)\b/i,
    priority: 65,
  },
  {
    name: 'testing',
    domain: 'quality',
    match:
      /\b(?:unit tests?|regression tests?|integration tests?|test coverage|birim test|regresyon test|test yaz)\b/i,
    priority: 110,
  },
  {
    name: 'verify-before-done',
    domain: 'quality',
    match:
      /\b(?:verify[^\n]{0,120}(?:fix|done|completion)|prove[^\n]{0,120}works|calistigini kanitla|duzeltmeyi dogrula|tamamlandigini dogrula)\b/i,
    priority: 110,
  },
  {
    name: 'evidence-audit',
    domain: 'quality',
    match:
      /\b(?:evidence.audit|find[^\n]{0,120}real[^\n]{0,120}bug|unknown defects|gercek[^\n]{0,120}(?:bug|kusur|hata)[^\n]{0,120}bul|kanitla[^\n]{0,120}duzelt)\b/i,
    priority: 110,
  },
  {
    name: 'bug-hunter',
    domain: 'quality',
    match: /\b(?:bug.hunt|bughunt|bug.hunter|cascade agent)\b/i,
    priority: 90,
  },
  {
    name: 'code-review',
    domain: 'quality',
    match:
      /\b(?:code review|review[^\n]{0,120}(?:code|implementation|diff)|kod incele|kodu incele|look over the diff)\b/i,
    priority: 90,
  },
  {
    name: 'codex-adversarial-review',
    domain: 'quality',
    match: /\b(?:adversarial review|karsit[^\n]{0,120}incele|saldirgan[^\n]{0,120}incele)\b/i,
    priority: 110,
  },
  {
    name: 'chimera',
    domain: 'quality',
    match: /\b(?:chimera|post.session review|session guardian|oturum[^\n]{0,120}incele)\b/i,
    priority: 90,
  },
  {
    name: 'auto-review',
    domain: 'quality',
    match: /\b(?:auto.review plugin|automatic review plugin|otomatik review plugin)\b/i,
    priority: 90,
  },
  {
    name: 'code-quality',
    domain: 'quality',
    match:
      /\b(?:dead code|unused depend|knip|bundle bloat|olu kod|kullanilmayan bagim|code quality audit)\b/i,
    priority: 110,
  },
  {
    name: 'security-scanner',
    domain: 'quality',
    match:
      /\b(?:security audit|security review|trust boundar|guvenlik incele|guvenlik denet|secret scan)\b/i,
    priority: 90,
  },
  {
    name: 'codebase-navigation',
    domain: 'workflow',
    match:
      /\b(?:where[^\n]{0,120}(?:module|implementation|entry)|locate[^\n]{0,120}(?:file|module)|kod[^\n]{0,120}nerede|modul[^\n]{0,120}bul|repo[^\n]{0,120}navigat|codebase navigation)\b/i,
    priority: 90,
  },
  {
    name: 'sdd',
    domain: 'workflow',
    match: /\b(?:acceptance criteria|task graph|kabul kriter|gorev graf|sdd)\b/i,
    priority: 90,
  },
  {
    name: 'git-flow',
    domain: 'workflow',
    match: /\b(?:commit|pull request|release branch|git flow|branch[^\n]{0,120}release)\b/i,
    priority: 90,
  },
  {
    name: 'refactor-planner',
    domain: 'workflow',
    match:
      /\b(?:refactor plan|split[^\n]{0,120}module|break up[^\n]{0,120}module|modul[^\n]{0,120}ayir|yeniden duzenleme plan)\b/i,
    priority: 90,
  },
  {
    name: 'multi-agent',
    domain: 'workflow',
    match:
      /\b(?:multi.agent|parallel agents|several agents|paralel ajan|birden[^\n]{0,120}ajan|delegate|delegasyon)\b/i,
    priority: 90,
  },
  {
    name: 'output-standards',
    domain: 'workflow',
    match: /\b(?:output format|response format|cikti bicim|yanit bicim)\b/i,
    priority: 90,
  },
  {
    name: 'prompt-engineering',
    domain: 'workflow',
    match:
      /\b(?:prompt engineering|system prompt|output contract|prompt muhendis|sistem prompt)\b/i,
    priority: 90,
  },
  {
    name: 'research-web',
    domain: 'workflow',
    match:
      /\b(?:research[^\n]{0,120}(?:official|sources)|web research|authoritative sources|resmi[^\n]{0,120}kaynak[^\n]{0,120}arastir)\b/i,
    priority: 90,
  },
  {
    name: 'tech-stack',
    domain: 'workflow',
    match:
      /\b(?:latest[^\n]{0,120}version|latest stable|dependency upgrade|outdated depend|son[^\n]{0,120}surum|guncel[^\n]{0,120}surum|bagimlilik[^\n]{0,120}guncelle|npm latest)\b/i,
    priority: 110,
  },
  {
    name: 'skill-creator',
    domain: 'workflow',
    match:
      /\b(?:(?:create|write|author|build|yaz|olustur)[^\n]{0,120}skill|skill[^\n]{0,120}(?:yaz|olustur)|skill generator)\b/i,
    priority: 110,
  },
  {
    name: 'audit-log',
    domain: 'workflow',
    match:
      /\b(?:session journal|audit log|oturum[^\n]{0,120}journal|oturum[^\n]{0,120}gunluk|yesterday.s session)\b/i,
    priority: 90,
  },
  {
    name: 'mnemosyne',
    domain: 'workflow',
    match:
      /\b(?:mnemosyne|sage memory|sage hafiza|memory corpus|hafiza corpus|retrieval anchor)\b/i,
    priority: 90,
  },
  {
    name: 'mcp-development',
    domain: 'integration',
    match: /\b(?:mcp server|mcp sunucu\w*|model context protocol|fastmcp)\b/i,
    priority: 110,
  },
  {
    name: 'mailbox-bridge',
    domain: 'integration',
    match: /\b(?:external agent[^\n]{0,120}mailbox|dis ajan[^\n]{0,120}mailbox|mailbox bridge)\b/i,
    priority: 90,
  },
  {
    name: 'wrongstack-kanban',
    domain: 'integration',
    match: /\b(?:kanban|task board|gorev panosu|move[^\n]{0,120}card|karti[^\n]{0,120}tasi)\b/i,
    priority: 90,
  },
  {
    name: 'plugin-author',
    domain: 'integration',
    match: /\b(?:wrongstack plugin|plugin hook|pretooluse)\b/i,
    priority: 90,
  },
  {
    name: 'wrongstack-mailbox',
    domain: 'integration',
    match: /\b(?:roster mailbox|mailbox client protocol)\b/i,
    priority: 90,
  },
  {
    name: 'wrongstack-mailbox-mcp',
    domain: 'integration',
    match: /\b(?:mailbox mcp)\b/i,
    priority: 90,
  },
  {
    name: 'skill-router',
    domain: 'workflow',
    match:
      /\b(?:which skill|choose[^\n]{0,120}skills|skill[^\n]{0,120}oner|hangi skill|skill[^\n]{0,120}sec)\b/i,
    priority: 110,
  },
];
