import type TurndownServiceCtor from 'turndown';

/**
 * Shared, lazily-created Turndown instance for HTML→Markdown conversion.
 *
 * `turndown` costs ~33 ms to import and both `fetch` and `read_url_content`
 * used to build their own instance at module scope. Those tools are re-exported
 * from the `@wrongstack/tools` barrel, so every process that loaded tools paid
 * for an HTML converter it usually never ran — and paid twice, since the two
 * modules kept identical copies of the same configuration.
 *
 * The configuration below is that shared copy, unchanged; only the moment it is
 * built moves, to the first actual conversion.
 */
// `turndown`'s declaration gives the exported name both a value and a type
// meaning, and a default *type* import resolves to the type one — which is
// already the instance interface, so there is no constructor to unwrap here.
type Turndown = TurndownServiceCtor;

/**
 * Boilerplate chrome pruned before conversion: navigation menus, page
 * headers/footers, sidebars, inline SVG markup, and iframes carry almost no
 * information for the agent but routinely dominate the converted markdown of
 * real-world pages. Removing the elements (not just their tags) is the single
 * biggest token win for the fetch tool. A filter function (rather than a tag
 * list) keeps the match case-insensitive — SVG elements keep lowercase
 * nodeNames while HTML elements report uppercase.
 */
const PRUNED_BOILERPLATE_TAGS = new Set(['nav', 'header', 'footer', 'aside', 'svg', 'iframe']);

let instance: Turndown | undefined;
let pending: Promise<Turndown> | undefined;

async function build(): Promise<Turndown> {
  const { default: TurndownService } = await import('turndown');
  const service = new TurndownService({
    // Use `# Title` for headings, not setext underline style (`Title\n=====`).
    headingStyle: 'atx',
    // Don't wrap code blocks in <pre> — render them as triple-backtick blocks.
    codeBlockStyle: 'fenced',
  });
  // Strip <script>/<style>/<noscript> before turndown sees them. A regex-based
  // converter did this by hand; turndown's DOM-based approach may keep their
  // text content unless the elements are removed first. Using turndown's own
  // addRule mechanism keeps the logic co-located.
  service.addRule('stripDangerousElements', {
    filter: ['script', 'style', 'noscript'],
    replacement: () => '',
  });
  service.remove((node) => PRUNED_BOILERPLATE_TAGS.has(node.nodeName.toLowerCase()));
  return service;
}

/** The shared converter, built on first use and reused afterwards. */
export async function getTurndown(): Promise<Turndown> {
  if (instance) return instance;
  pending ??= build();
  instance = await pending;
  return instance;
}
