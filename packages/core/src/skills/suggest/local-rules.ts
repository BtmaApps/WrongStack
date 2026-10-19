import type { LocalSkillRule } from './local-rule.js';
import { OPERATIONS_AND_QUALITY_RULES } from './local-rules-ops-quality.js';

export type { LocalSkillRule } from './local-rule.js';

/** Curated bilingual intent aliases for bundled skills. Scores are priorities, not probabilities. */
export const LOCAL_SKILL_RULES: readonly LocalSkillRule[] = [
  {
    name: 'algorithmic-art',
    domain: 'media',
    match:
      /\b(?:algorithmic art|generative art|p5\.js|fractal art|algoritmik sanat|uretimsel sanat)\b/i,
    priority: 100,
  },
  {
    name: 'brand-guidelines',
    domain: 'frontend',
    match: /\b(?:brand guidelines|brand-guidelines|brand identity|marka kimligi|marka kilavuzu)\b/i,
    priority: 100,
  },
  {
    name: 'canvas-design',
    domain: 'media',
    match: /\b(?:canvas design|canvas-design|poster|afis|static artwork|print design)\b/i,
    priority: 100,
  },
  {
    name: 'discernment-nudge',
    domain: 'quality',
    match:
      /\b(?:discernment|epistemic|assumption checks?|critical assumptions|varsayim denetimi)\b/i,
    priority: 100,
  },
  {
    name: 'doc-coauthoring',
    domain: 'workflow',
    match:
      /\b(?:doc-coauthoring|coauthor(?:ing|ed)?|co-author(?:ing|ed)?|document collaboration|ortak belge)\b/i,
    priority: 95,
  },
  {
    name: 'docx',
    domain: 'media',
    match: /\b(?:docx|word document|word report|word belgesi|word raporu)\b/i,
    priority: 100,
  },
  {
    name: 'internal-comms',
    domain: 'workflow',
    match:
      /\b(?:internal-comms|internal communications|stakeholder update|ic iletisim|paydas guncellemesi)\b/i,
    priority: 100,
  },
  {
    name: 'llm-runtime',
    domain: 'integration',
    match:
      /\b(?:llm-runtime|llm runtime|ai agent runtime|streaming sse endpoint|prompt caching|tool.calling loop|llm calisma zamani)\b/i,
    priority: 100,
  },
  {
    name: 'micro-animation-gif',
    domain: 'media',
    match:
      /\b(?:micro-animation-gif|animated gif|gif animation|animated emoji|animasyonlu gif|hareketli gif)\b/i,
    priority: 100,
  },
  {
    name: 'pdf',
    domain: 'media',
    match: /\b(?:pdf|portable document format)\b/i,
    priority: 100,
  },
  {
    name: 'pptx',
    domain: 'media',
    match: /\b(?:pptx|powerpoint|presentation deck|sunum)\b/i,
    priority: 100,
  },
  {
    name: 'theme-factory',
    domain: 'frontend',
    match: /\b(?:theme-factory|theme factory|theme pack|tema paketi|tema seti)\b/i,
    priority: 100,
  },
  {
    name: 'web-artifacts',
    domain: 'frontend',
    match:
      /\b(?:web-artifacts|web artifacts?|html artifact|interactive artifact|interaktif artifact)\b/i,
    priority: 100,
  },
  {
    name: 'webapp-testing',
    domain: 'quality',
    match:
      /\b(?:webapp-testing|webapp testing|browser e2e|playwright ui|tarayici[^\n]{0,60}test)\b/i,
    priority: 100,
  },
  {
    name: 'xlsx',
    domain: 'media',
    match: /\b(?:xlsx|excel|spreadsheet|hesap tablosu)\b/i,
    priority: 100,
  },
  {
    name: 'nextjs-modern',
    domain: 'frontend',
    match: /\b(?:next(?:[ .-]?js)|next\s+\d+|app router|server action|revalidatetag|updatetag)\b/i,
    priority: 100,
  },
  {
    name: 'react-modern',
    domain: 'frontend',
    match: /\b(?:react|useeffect|usestate|useactionstate|react hook)\b/i,
    priority: 65,
  },
  {
    name: 'typescript-strict',
    domain: 'frontend',
    match: /\b(?:typescript|type narrowing|tip guven|tip daralt|\bany\b)\b/i,
    priority: 90,
  },
  {
    name: 'node-modern',
    domain: 'frontend',
    match: /\b(?:node[ .-]?js|node runtime|esm|abortsignal|abortcontroller|event loop)\b/i,
    priority: 65,
  },
  {
    name: 'astro-modern',
    domain: 'frontend',
    match: /\b(?:astro|islands architecture)\b/i,
    priority: 90,
  },
  { name: 'vue-nuxt', domain: 'frontend', match: /\b(?:vue|nuxt|composable)\b/i, priority: 90 },
  {
    name: 'sveltekit-modern',
    domain: 'frontend',
    match: /\b(?:svelte|sveltekit|runes)\b/i,
    priority: 90,
  },
  {
    name: 'angular-modern',
    domain: 'frontend',
    match: /\b(?:angular|standalone component|reactive form)\b/i,
    priority: 90,
  },
  {
    name: 'web-performance',
    domain: 'frontend',
    match:
      /\b(?:core web vitals|lighthouse|web performance|browser performance|sayfa hiz|web performans)\b/i,
    priority: 90,
  },
  {
    name: 'web-platform-baseline',
    domain: 'frontend',
    match: /\b(?:browser compat|tarayici uyum|css support|html semantics|web platform)\b/i,
    priority: 90,
  },
  {
    name: 'api-design',
    domain: 'backend',
    match:
      /\b(?:api design|rest endpoints|http contract|api tasar|endpoint tasar|openapi|pagination contract)\b/i,
    priority: 90,
  },
  {
    name: 'node-backend',
    domain: 'backend',
    match: /\b(?:fastify|express|node (?:http|api|server|service)|node backend)\b/i,
    priority: 100,
  },
  {
    name: 'python-backend',
    domain: 'backend',
    match: /\b(?:fastapi|django|flask|python api|python backend|pydantic)\b/i,
    priority: 90,
  },
  {
    name: 'go-services',
    domain: 'backend',
    match: /\b(?:golang|go (?:http|service|handler|servis)|go dili)\b/i,
    priority: 90,
  },
  { name: 'rust-systems', domain: 'backend', match: /\b(?:rust|tokio|cargo)\b/i, priority: 90 },
  {
    name: 'dotnet-backend',
    domain: 'backend',
    match: /\b(?:asp\.?net|dotnet|\.net|c#|csharp)\b/i,
    priority: 90,
  },
  {
    name: 'java-spring',
    domain: 'backend',
    match: /\b(?:spring boot|spring (?:framework|security|mvc|data)|java api|java backend|jvm)\b/i,
    priority: 90,
  },
  { name: 'php-laravel', domain: 'backend', match: /\b(?:laravel|php|eloquent)\b/i, priority: 90 },
  {
    name: 'graphql-development',
    domain: 'backend',
    match: /\b(?:graphql|resolver)\b/i,
    priority: 90,
  },
  {
    name: 'authentication-sessions',
    domain: 'backend',
    match:
      /\b(?:authentication|login flow|session rotation|session revocation|oturum|giris akis|secure cookie)\b/i,
    priority: 90,
  },
  {
    name: 'payments-webhooks',
    domain: 'backend',
    match: /\b(?:payment|payments|stripe|odeme|signed webhook|imzali webhook)\b/i,
    priority: 90,
  },
  {
    name: 'design-craft',
    domain: 'design',
    match:
      /\b(?:restyle|landing page|visual design|gorsel tasar|ui design|arayuz tasar|hero bolg|product interface)\b/i,
    priority: 65,
  },
  {
    name: 'design-critique',
    domain: 'design',
    match:
      /\b(?:design critique|critique [^\n]{0,120}(?:ui|interface|dashboard)|tasarim elestir|arayuz[^\n]{0,120}(?:elestir|degerlendir))\b/i,
    priority: 110,
  },
  {
    name: 'design-system',
    domain: 'design',
    match:
      /\b(?:design system|design token|oklch|typography token|tasarim sistem|tema token|renk token)\b/i,
    priority: 90,
  },
  {
    name: 'design-to-code',
    domain: 'design',
    match:
      /\b(?:figma|design to code|tasarimi koda|screenshot[^\n]{0,120}(?:implement|uygula)|pixel.perfect|birebir (?:ayni|uygula))\b/i,
    priority: 110,
  },
  {
    name: 'design-reference-read',
    domain: 'design',
    match:
      /\b(?:reference (?:site|website|url)|referans (?:site|al)\w*|inspired by|design dna|extract (?:the )?design|look(?:s)? like (?:https?:|www\.|[a-z0-9-]+\.(?:com|io|app|dev))|sitesinin tasarim\w*|tasarimini (?:analiz|incele|cikar)\w*|ilham al\w*)\b/i,
    priority: 110,
  },
  {
    name: 'design-patterns',
    domain: 'design',
    match:
      /\b(?:which (?:layout|pattern)|layout pattern|ui pattern|design pattern|bento grid|pricing (?:page|table)|empty state|command palette|tasarim desen\w*|hangi (?:layout|duzen|desen))\b/i,
    priority: 85,
  },
  {
    name: 'interaction-design',
    domain: 'design',
    match:
      /\b(?:user journey|onboarding|interaction flow|multi.step checkout|checkout states|klavye odag\w*|etkilesim akis|kullanici yolcul|recovery states|kurtarma durum)\b/i,
    priority: 110,
  },
  {
    name: 'design-assets',
    domain: 'design',
    match: /\b(?:svg (?:icon|ikon)\w*|icon set|ikon set|logo asset|visual asset|gorsel varlik)\b/i,
    priority: 90,
  },
  {
    name: 'accessibility',
    domain: 'design',
    match:
      /\b(?:accessibility|a11y|wcag|screen.?reader|aria|erisilebilir|ekran okuyucu|keyboard navigation|klavye gezin)\b/i,
    priority: 90,
  },
  {
    name: 'visual-regression',
    domain: 'design',
    match:
      /\b(?:visual regression|screenshot baselines?|gorsel regresyon|ekran goruntusu baseline)\b/i,
    priority: 90,
  },
  {
    name: 'i18n-localization',
    domain: 'design',
    match:
      /\b(?:i18n|localization|localisation|yerellestir|plural|rtl|translation string|ceviri metin)\b/i,
    priority: 90,
  },
  {
    name: 'media-production',
    domain: 'media',
    match: /\b(?:remotion|ffmpeg|video|subtitle|altyazi|transcod|mux|render[^\n]{0,120}clip)\b/i,
    priority: 65,
  },
  {
    name: 'motion-canvas-video',
    domain: 'media',
    match: /\b(?:motion canvas|motion-canvas|generator scene)\b/i,
    priority: 100,
  },
  {
    name: 'manim-video',
    domain: 'media',
    match: /\b(?:manim|mathtex|mathematical animation|matematik animasyon)\b/i,
    priority: 100,
  },
  {
    name: 'motion-design',
    domain: 'media',
    match:
      /\b(?:motion\/react|gsap|spring transition|scroll animation|ui animation|web animasyon|sayfa animasyon|reduced.motion)\b/i,
    priority: 90,
  },
  {
    name: 'threejs-3d',
    domain: 'media',
    match:
      /\b(?:three[ .-]?js|webgpu|webgl|shader|3d scene|3d sahne|react three fiber|tsl material)\b/i,
    priority: 90,
  },
  {
    name: 'audio-studio',
    domain: 'media',
    match:
      /\b(?:voiceover|narration|seslendirme|suno|udio|audio track|music generation|muzik uret|elevenlabs)\b/i,
    priority: 90,
  },
  {
    name: 'office-documents',
    domain: 'media',
    match:
      /\b(?:docx|xlsx|pptx|word document|excel|powerpoint|pdf|presentation deck|sunum|spreadsheet)\b/i,
    priority: 90,
  },
  {
    name: 'mobile-design',
    domain: 'mobile',
    match:
      /\b(?:mobile design|mobil tasar|safe areas?|thumb reach|virtual keyboard|sanal klavye)\b/i,
    priority: 90,
  },
  {
    name: 'react-native-expo',
    domain: 'mobile',
    match: /\b(?:react native|expo|expo router)\b/i,
    priority: 100,
  },
  {
    name: 'flutter-mobile',
    domain: 'mobile',
    match: /\b(?:flutter|dart|widget test)\b/i,
    priority: 90,
  },
  {
    name: 'swift-ios',
    domain: 'mobile',
    match: /\b(?:swiftui|swift|widgetkit|ios|apple native)\b/i,
    priority: 90,
  },
  {
    name: 'kotlin-android',
    domain: 'mobile',
    match: /\b(?:kotlin|jetpack compose|android)\b/i,
    priority: 65,
  },
  {
    name: 'mobile-performance',
    domain: 'mobile',
    match:
      /\b(?:mobile performance|mobil performans|scrolling jank|startup latency|physical phone|fiziksel telefon\w*|kaydirma takil\w*)\b/i,
    priority: 100,
  },
  {
    name: 'mobile-release',
    domain: 'mobile',
    match:
      /\b(?:app store|play store|store submission|magaza|mobile signing|mobil imzala|mobile release)\b/i,
    priority: 100,
  },
  ...OPERATIONS_AND_QUALITY_RULES,
];
