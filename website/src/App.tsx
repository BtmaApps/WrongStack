import { motion, useReducedMotion, useScroll, useSpring } from 'framer-motion';
import { lazy, Suspense, useEffect } from 'react';
import { Footer } from '@/components/layout/Footer';
import { Header } from '@/components/layout/Header';
import { SiteDecor } from '@/components/site/primitives';
import { commandFromSlug, featureFromSlug, pageMeta, type SiteRoute } from '@/data/content';
import { agentFromSlug, modeFromSlug } from '@/data/product-catalog';
import { pluginFromSlug, toolFromSlug } from '@/data/runtime-catalog';
import { useRouter } from '@/lib/router';

const HomePage = lazy(async () => ({ default: (await import('@/pages/HomePage')).HomePage }));
const FeaturesPage = lazy(async () => ({
  default: (await import('@/pages/FeaturesPage')).FeaturesPage,
}));
const HowItWorksPage = lazy(async () => ({
  default: (await import('@/pages/HowItWorksPage')).HowItWorksPage,
}));
const ComparePage = lazy(async () => ({
  default: (await import('@/pages/ComparePage')).ComparePage,
}));
const InterfacesPage = lazy(async () => ({
  default: (await import('@/pages/InterfacesPage')).InterfacesPage,
}));
const CommandsPage = lazy(async () => ({
  default: (await import('@/pages/CommandsPage')).CommandsPage,
}));
const SettingsPage = lazy(async () => ({
  default: (await import('@/pages/SettingsPage')).SettingsPage,
}));
const ArchitecturePage = lazy(async () => ({
  default: (await import('@/pages/ArchitecturePage')).ArchitecturePage,
}));
const EcosystemPage = lazy(async () => ({
  default: (await import('@/pages/EcosystemPage')).EcosystemPage,
}));
const SecurityPage = lazy(async () => ({
  default: (await import('@/pages/SecurityPage')).SecurityPage,
}));
const GettingStartedPage = lazy(async () => ({
  default: (await import('@/pages/GettingStartedPage')).GettingStartedPage,
}));
const WorkflowsPage = lazy(async () => ({
  default: (await import('@/pages/WorkflowsPage')).WorkflowsPage,
}));
const FleetPage = lazy(async () => ({ default: (await import('@/pages/FleetPage')).FleetPage }));
const ModesPage = lazy(async () => ({ default: (await import('@/pages/ModesPage')).ModesPage }));
const AgentRosterPage = lazy(async () => ({
  default: (await import('@/pages/AgentRosterPage')).AgentRosterPage,
}));
const MailboxPage = lazy(async () => ({
  default: (await import('@/pages/MailboxPage')).MailboxPage,
}));
const MemoryPage = lazy(async () => ({ default: (await import('@/pages/MemoryPage')).MemoryPage }));
const SagePage = lazy(async () => ({
  default: (await import('@/pages/SagePage')).SagePage,
}));
const DesignStudioPage = lazy(async () => ({
  default: (await import('@/pages/DesignStudioPage')).DesignStudioPage,
}));
const SkillsPage = lazy(async () => ({
  default: (await import('@/pages/SkillsPage')).SkillsPage,
}));
const PromptsPage = lazy(async () => ({
  default: (await import('@/pages/PromptsPage')).PromptsPage,
}));
const SddPage = lazy(async () => ({ default: (await import('@/pages/SddPage')).SddPage }));
const ShadowAgentPage = lazy(async () => ({
  default: (await import('@/pages/ShadowAgentPage')).ShadowAgentPage,
}));
const AcpPage = lazy(async () => ({ default: (await import('@/pages/AcpPage')).AcpPage }));
const SupervisorPage = lazy(async () => ({
  default: (await import('@/pages/SupervisorPage')).SupervisorPage,
}));
const GoalPage = lazy(async () => ({
  default: (await import('@/pages/GoalPage')).GoalPage,
}));
const EnsemblePage = lazy(async () => ({
  default: (await import('@/pages/EnsemblePage')).EnsemblePage,
}));
const HqPage = lazy(async () => ({ default: (await import('@/pages/HqPage')).HqPage }));
const TelegramPage = lazy(async () => ({
  default: (await import('@/pages/TelegramPage')).TelegramPage,
}));
const CollabPage = lazy(async () => ({
  default: (await import('@/pages/CollabPage')).CollabPage,
}));
const SyncPage = lazy(async () => ({ default: (await import('@/pages/SyncPage')).SyncPage }));
const CheckpointsPage = lazy(async () => ({
  default: (await import('@/pages/CheckpointsPage')).CheckpointsPage,
}));
const CommitWorkflowPage = lazy(async () => ({
  default: (await import('@/pages/CommitWorkflowPage')).CommitWorkflowPage,
}));
const ProvidersPage = lazy(async () => ({
  default: (await import('@/pages/ProvidersPage')).ProvidersPage,
}));
const CodingPlansPage = lazy(async () => ({
  default: (await import('@/pages/CodingPlansPage')).CodingPlansPage,
}));
const McpPage = lazy(async () => ({ default: (await import('@/pages/McpPage')).McpPage }));
const ToolsPage = lazy(async () => ({ default: (await import('@/pages/ToolsPage')).ToolsPage }));
const PluginsPage = lazy(async () => ({
  default: (await import('@/pages/PluginsPage')).PluginsPage,
}));
const TroubleshootingPage = lazy(async () => ({
  default: (await import('@/pages/TroubleshootingPage')).TroubleshootingPage,
}));
const CreatedByPage = lazy(async () => ({
  default: (await import('@/pages/CreatedByPage')).CreatedByPage,
}));
const BrandPage = lazy(async () => ({ default: (await import('@/pages/BrandPage')).BrandPage }));
const CommandDetailPage = lazy(async () => ({
  default: (await import('@/pages/CommandDetailPage')).CommandDetailPage,
}));
const FeatureDetailPage = lazy(async () => ({
  default: (await import('@/pages/FeatureDetailPage')).FeatureDetailPage,
}));
const PluginDetailPage = lazy(async () => ({
  default: (await import('@/pages/PluginDetailPage')).PluginDetailPage,
}));
const ToolDetailPage = lazy(async () => ({
  default: (await import('@/pages/ToolDetailPage')).ToolDetailPage,
}));
const ModeDetailPage = lazy(async () => ({
  default: (await import('@/pages/ModeDetailPage')).ModeDetailPage,
}));
const AgentDetailPage = lazy(async () => ({
  default: (await import('@/pages/AgentDetailPage')).AgentDetailPage,
}));

function detailSlug(path: string, prefix: string): string | undefined {
  return path.startsWith(prefix) && path.length > prefix.length
    ? path.slice(prefix.length)
    : undefined;
}

const pages = {
  '/': HomePage,
  '/features': FeaturesPage,
  '/how-it-works': HowItWorksPage,
  '/compare': ComparePage,
  '/interfaces': InterfacesPage,
  '/commands': CommandsPage,
  '/settings': SettingsPage,
  '/architecture': ArchitecturePage,
  '/ecosystem': EcosystemPage,
  '/security': SecurityPage,
  '/getting-started': GettingStartedPage,
  '/workflows': WorkflowsPage,
  '/fleet': FleetPage,
  '/modes': ModesPage,
  '/agent-roster': AgentRosterPage,
  '/mailbox': MailboxPage,
  '/memory': MemoryPage,
  '/sage': SagePage,
  '/design-studio': DesignStudioPage,
  '/skills': SkillsPage,
  '/prompts': PromptsPage,
  '/sdd': SddPage,
  '/shadow-agent': ShadowAgentPage,
  '/acp': AcpPage,
  '/supervisor': SupervisorPage,
  '/goal': GoalPage,
  '/ensemble': EnsemblePage,
  '/hq': HqPage,
  '/telegram': TelegramPage,
  '/collab': CollabPage,
  '/sync': SyncPage,
  '/checkpoints': CheckpointsPage,
  '/commit-workflow': CommitWorkflowPage,
  '/providers': ProvidersPage,
  '/coding-plans': CodingPlansPage,
  '/mcp': McpPage,
  '/tools': ToolsPage,
  '/plugins': PluginsPage,
  '/troubleshooting': TroubleshootingPage,
  '/brand': BrandPage,
  '/created-by': CreatedByPage,
} satisfies Record<SiteRoute, typeof HomePage>;

function ScrollProgress() {
  const reducedMotion = useReducedMotion();
  const { scrollYProgress } = useScroll();
  const scaleX = useSpring(scrollYProgress, { stiffness: 140, damping: 32, mass: 0.22 });
  if (reducedMotion) return null;
  return (
    <motion.div
      style={{ scaleX }}
      className="fixed inset-x-0 top-0 z-[70] h-[2px] origin-left bg-brand"
      aria-hidden="true"
    />
  );
}

function NotFound() {
  const { navigate } = useRouter();
  return (
    <div className="site-foreground grid min-h-[80vh] place-items-center px-4 pt-24">
      <div className="max-w-xl text-center">
        <span className="font-mono text-xs font-black uppercase tracking-[0.2em] text-brand">
          404 / route not found
        </span>
        <h1 className="mt-6 text-6xl font-black tracking-[-0.07em] text-fg sm:text-8xl">
          Wrong turn.
        </h1>
        <p className="mt-5 text-lg leading-8 text-muted">
          This page is not part of the current operator manual.
        </p>
        <button
          type="button"
          onClick={() => navigate('/')}
          className="mt-8 rounded-full bg-fg px-6 py-3 text-sm font-bold text-bg"
        >
          Return home
        </button>
      </div>
    </div>
  );
}

export default function App() {
  const { path } = useRouter();
  const commandDetail = path.startsWith('/commands/')
    ? commandFromSlug(path.slice('/commands/'.length))
    : undefined;
  const featureDetail = path.startsWith('/features/')
    ? featureFromSlug(path.slice('/features/'.length))
    : undefined;
  const pluginSlugPart = detailSlug(path, '/plugins/');
  const pluginDetail = pluginSlugPart ? pluginFromSlug(pluginSlugPart) : undefined;
  const toolSlugPart = detailSlug(path, '/tools/');
  const toolDetail = toolSlugPart ? toolFromSlug(toolSlugPart) : undefined;
  const modeSlugPart = detailSlug(path, '/modes/');
  const modeDetail = modeSlugPart ? modeFromSlug(modeSlugPart) : undefined;
  const agentSlugPart = detailSlug(path, '/agent-roster/');
  const agentDetail = agentSlugPart ? agentFromSlug(agentSlugPart) : undefined;
  const Page = commandDetail
    ? CommandDetailPage
    : featureDetail
      ? FeatureDetailPage
      : pluginDetail
        ? PluginDetailPage
        : toolDetail
          ? ToolDetailPage
          : modeDetail
            ? ModeDetailPage
            : agentDetail
              ? AgentDetailPage
              : pages[path as SiteRoute];

  useEffect(() => {
    const dynamicCommand = path.startsWith('/commands/')
      ? commandFromSlug(path.slice('/commands/'.length))
      : undefined;
    const dynamicFeature = path.startsWith('/features/')
      ? featureFromSlug(path.slice('/features/'.length))
      : undefined;
    const dynamicPluginSlug = detailSlug(path, '/plugins/');
    const dynamicPlugin = dynamicPluginSlug ? pluginFromSlug(dynamicPluginSlug) : undefined;
    const dynamicToolSlug = detailSlug(path, '/tools/');
    const dynamicTool = dynamicToolSlug ? toolFromSlug(dynamicToolSlug) : undefined;
    const dynamicModeSlug = detailSlug(path, '/modes/');
    const dynamicMode = dynamicModeSlug ? modeFromSlug(dynamicModeSlug) : undefined;
    const dynamicAgentSlug = detailSlug(path, '/agent-roster/');
    const dynamicAgent = dynamicAgentSlug ? agentFromSlug(dynamicAgentSlug) : undefined;
    const meta = dynamicCommand
      ? {
          title: `${dynamicCommand.name} command — WrongStack`,
          description: dynamicCommand.summary,
        }
      : dynamicFeature
        ? {
            title: `${dynamicFeature.title} — WrongStack`,
            description: dynamicFeature.summary,
          }
        : dynamicPlugin
          ? {
              title: `${dynamicPlugin.name} plugin — WrongStack`,
              description: dynamicPlugin.summary,
            }
          : dynamicTool
            ? {
                title: `${dynamicTool.name} tool — WrongStack`,
                description: dynamicTool.summary,
              }
            : dynamicMode
              ? {
                  title: `${dynamicMode.name} mode — WrongStack`,
                  description: dynamicMode.description,
                }
              : dynamicAgent
                ? {
                    title: `${dynamicAgent.name} agent — WrongStack`,
                    description: dynamicAgent.summary,
                  }
                : (pageMeta[path as SiteRoute] ?? {
                    title: 'WrongStack',
                    description: 'WrongStack AI coding agent.',
                  });
    document.title = meta.title;
    document
      .querySelector<HTMLMetaElement>('meta[name="description"]')
      ?.setAttribute('content', meta.description);
    document
      .querySelector<HTMLMetaElement>('meta[property="og:title"]')
      ?.setAttribute('content', meta.title);
    document
      .querySelector<HTMLMetaElement>('meta[property="og:description"]')
      ?.setAttribute('content', meta.description);
    document
      .querySelector<HTMLMetaElement>('meta[property="og:url"]')
      ?.setAttribute('content', `https://wrongstack.com${path}`);
    document
      .querySelector<HTMLMetaElement>('meta[name="twitter:title"]')
      ?.setAttribute('content', meta.title);
    document
      .querySelector<HTMLMetaElement>('meta[name="twitter:description"]')
      ?.setAttribute('content', meta.description);
    document
      .querySelector<HTMLLinkElement>('link[rel="canonical"]')
      ?.setAttribute('href', `https://wrongstack.com${path}`);
  }, [path]);

  return (
    <div className="relative isolate min-h-screen overflow-x-clip bg-bg text-fg antialiased">
      <a
        href="#main"
        className="sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[100] focus:rounded-lg focus:bg-brand focus:px-4 focus:py-2 focus:text-on-brand"
      >
        Skip to content
      </a>
      <ScrollProgress />
      <SiteDecor />
      <div className="site-content">
        <Header />
        <main id="main" tabIndex={-1}>
          <Suspense
            fallback={
              <div
                role="status"
                className="site-foreground grid min-h-screen place-items-center pt-24"
              >
                <span className="font-mono text-xs font-black uppercase tracking-[0.2em] text-brand">
                  Loading manual…
                </span>
              </div>
            }
          >
            {Page ? <Page /> : <NotFound />}
          </Suspense>
        </main>
        <Footer />
      </div>
    </div>
  );
}
