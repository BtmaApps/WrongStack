/** One curated intent alias for a bundled skill. `priority` orders hits; it is not a probability. */
export interface LocalSkillRule {
  name: string;
  domain: string;
  match: RegExp;
  priority: number;
}
