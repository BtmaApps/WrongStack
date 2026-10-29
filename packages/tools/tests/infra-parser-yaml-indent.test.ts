import { describe, expect, it } from 'vitest';
import { parseInfraArtifact } from '../src/codebase-index/infra-parser.js';

// The YAML sections read services/jobs/metadata at a hard-coded 2-space
// indent; a 4-space file indexed nothing (F902).
describe('infra parser YAML indent units (F902)', () => {
  const names = (content: string, file: string) =>
    parseInfraArtifact({ file, content })
      .symbols.map((symbol) => symbol.name)
      .sort();

  it.each(['  ', '    '])('reads compose, workflow and k8s files indented by %j', (u) => {
    expect(
      names(
        ['services:', `${u}web:`, `${u}${u}depends_on:`, `${u}${u}${u}- db`, `${u}db:`, ''].join(
          '\n',
        ),
        'docker-compose.yml',
      ),
    ).toEqual(['db', 'web']);
    expect(
      names(
        ['jobs:', `${u}build:`, `${u}test:`, `${u}${u}needs: build`, ''].join('\n'),
        '.github/workflows/ci.yml',
      ),
    ).toEqual(['build', 'test']);
    expect(
      names(
        ['apiVersion: v1', 'kind: Service', 'metadata:', `${u}name: api`, ''].join('\n'),
        'k8s/svc.yaml',
      ),
    ).toEqual(['Service:api']);
  });
});
