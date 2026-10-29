/**
 * Deterministic Louvain modularity community detection over the file / symbol
 * dependency graph.
 *
 * Used to discover cohesive architectural clusters (subsystems / layers) when
 * directory structure or workspace package boundaries are flat or coarse.
 *
 * Determinism is guaranteed: nodes and edges are canonically ordered by
 * UTF-16 code units before optimization, and modularity-gain ties are broken
 * by lowest community index.
 */

import * as path from 'node:path';
import type { IndexStore } from './writer.js';

export interface WeightedGraphEdge {
  from: string;
  to: string;
  weight?: number | undefined;
}

export interface LouvainOptions {
  /** Modularity resolution parameter gamma (default 1.0). Higher = more, smaller clusters. */
  resolution?: number | undefined;
  /** Maximum modularity optimization passes (default 12). */
  maxPasses?: number | undefined;
  /** Minimum members required for a standalone community (default 2). */
  minCommunitySize?: number | undefined;
  /** Optional node importance rank (`file -> rank`) used to pick each cluster's hub. */
  nodeRanks?: ReadonlyMap<string, number> | undefined;
}

export interface FileCommunity {
  /** Stable deterministic identifier, e.g. `cluster:src/auth` or `cluster:kernel`. */
  id: string;
  /** Human-readable cluster label derived from directory prefix + hub stem. */
  label: string;
  /** Highest-ranked (or most connected) file in the community. */
  hub: string;
  /** Member files in deterministic order (highest rank / degree first, then lexical). */
  files: string[];
  /** Aggregate rank / centrality score across member files. */
  rank: number;
  /** Internal edge weight / total incident edge weight in `[0, 1]`. */
  cohesion: number;
}

function compareText(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

function deriveCommunityLabel(
  files: readonly string[],
  hub: string,
): { id: string; label: string } {
  const dirs = files
    .map((f) => {
      const idx = f.lastIndexOf('/');
      return idx > 0 ? f.slice(0, idx) : '';
    })
    .filter((d) => d.length > 0);

  let dominantDir = '';
  if (dirs.length > 0) {
    const counts = new Map<string, number>();
    for (const d of dirs) counts.set(d, (counts.get(d) ?? 0) + 1);
    dominantDir =
      [...counts.entries()].sort((a, b) => b[1] - a[1] || compareText(a[0], b[0]))[0]?.[0] ?? '';
  }

  const hubBase = path.posix.basename(hub).replace(/\.[^.]+$/, '');
  const rawLabel =
    dominantDir && dominantDir !== '.' ? `${dominantDir}/${hubBase}` : hubBase || 'root';
  return {
    id: `cluster:${rawLabel}`,
    label: rawLabel,
  };
}

/**
 * Run deterministic Louvain modularity clustering over a set of file nodes and
 * weighted edges.
 */
export function detectFileCommunities(
  nodes: readonly string[],
  edges: readonly WeightedGraphEdge[],
  options: LouvainOptions = {},
): FileCommunity[] {
  const resolution = options.resolution ?? 1.0;
  const maxPasses = options.maxPasses ?? 12;
  const minCommunitySize = options.minCommunitySize ?? 2;
  const nodeRanks = options.nodeRanks;

  // A Set, not `includes()` per endpoint: that was O(edges × files) and most
  // of the pass on a large index.
  const nodeSet = new Set(nodes);
  for (const edge of edges) {
    nodeSet.add(edge.from);
    nodeSet.add(edge.to);
  }
  const uniqueNodes = [...nodeSet].sort(compareText);

  const n = uniqueNodes.length;
  if (n === 0) return [];

  const nodeIndex = new Map<string, number>();
  for (let i = 0; i < n; i++) {
    nodeIndex.set(uniqueNodes[i] as string, i);
  }

  // Symmetric adjacency map: adj[u] = Map<v, weight>
  const adj: Array<Map<number, number>> = Array.from(
    { length: n },
    () => new Map<number, number>(),
  );
  const degree = new Float64Array(n);
  let totalDoubleWeight = 0;

  for (const edge of edges) {
    const u = nodeIndex.get(edge.from);
    const v = nodeIndex.get(edge.to);
    if (u === undefined || v === undefined || u === v) continue;
    const w =
      edge.weight !== undefined && Number.isFinite(edge.weight) && edge.weight > 0
        ? edge.weight
        : 1;
    adj[u]?.set(v, (adj[u]?.get(v) ?? 0) + w);
    adj[v]?.set(u, (adj[v]?.get(u) ?? 0) + w);
    degree[u] = (degree[u] ?? 0) + w;
    degree[v] = (degree[v] ?? 0) + w;
    totalDoubleWeight += 2 * w;
  }

  const communityOf = new Int32Array(n);
  const sigmaTot = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    communityOf[i] = i;
    sigmaTot[i] = degree[i] ?? 0;
  }

  if (totalDoubleWeight > 0) {
    for (let pass = 0; pass < maxPasses; pass++) {
      let moved = false;
      for (let i = 0; i < n; i++) {
        const ki = degree[i] ?? 0;
        if (ki === 0) continue;
        const currentComm = communityOf[i] as number;
        const neighbours = adj[i];
        if (!neighbours || neighbours.size === 0) continue;

        // Remove node i from its current community
        sigmaTot[currentComm] = (sigmaTot[currentComm] ?? 0) - ki;

        // Aggregate edge weights from i to neighbouring communities
        const commWeights = new Map<number, number>();
        commWeights.set(currentComm, 0);
        for (const [nbr, w] of neighbours) {
          const c = communityOf[nbr] as number;
          commWeights.set(c, (commWeights.get(c) ?? 0) + w);
        }

        let bestComm = currentComm;
        const currentInWeight = commWeights.get(currentComm) ?? 0;
        let bestGain =
          currentInWeight - (resolution * (sigmaTot[currentComm] ?? 0) * ki) / totalDoubleWeight;

        const candidateComms = [...commWeights.keys()].sort((a, b) => a - b);
        for (const candidate of candidateComms) {
          const inWeight = commWeights.get(candidate) ?? 0;
          const gain =
            inWeight - (resolution * (sigmaTot[candidate] ?? 0) * ki) / totalDoubleWeight;
          if (gain > bestGain + 1e-12) {
            bestGain = gain;
            bestComm = candidate;
          }
        }

        sigmaTot[bestComm] = (sigmaTot[bestComm] ?? 0) + ki;
        if (bestComm !== currentComm) {
          communityOf[i] = bestComm;
          moved = true;
        }
      }
      if (!moved) break;
    }
  }

  // Group nodes by final community id
  const groups = new Map<number, number[]>();
  for (let i = 0; i < n; i++) {
    const c = communityOf[i] as number;
    const list = groups.get(c);
    if (list) list.push(i);
    else groups.set(c, [i]);
  }

  const communities: FileCommunity[] = [];
  const usedIds = new Set<string>();

  for (const [, memberIndices] of [...groups.entries()].sort((a, b) => a[0] - b[0])) {
    if (memberIndices.length < minCommunitySize) continue;

    const memberSet = new Set(memberIndices);
    let internalWeight = 0;
    let totalIncidentWeight = 0;
    for (const u of memberIndices) {
      totalIncidentWeight += degree[u] ?? 0;
      const nbrs = adj[u];
      if (!nbrs) continue;
      for (const [v, w] of nbrs) {
        if (memberSet.has(v)) internalWeight += w;
      }
    }

    const sortedIndices = [...memberIndices].sort((a, b) => {
      const fileA = uniqueNodes[a] as string;
      const fileB = uniqueNodes[b] as string;
      const rankDiff = (nodeRanks?.get(fileB) ?? 0) - (nodeRanks?.get(fileA) ?? 0);
      if (rankDiff !== 0) return rankDiff;
      const degDiff = (degree[b] ?? 0) - (degree[a] ?? 0);
      if (degDiff !== 0) return degDiff;
      return compareText(fileA, fileB);
    });

    const files = sortedIndices.map((idx) => uniqueNodes[idx] as string);
    const hub = files[0] as string;
    const { id: baseId, label: baseLabel } = deriveCommunityLabel(files, hub);

    let id = baseId;
    let label = baseLabel;
    let suffix = 2;
    while (usedIds.has(id)) {
      id = `${baseId}-${suffix}`;
      label = `${baseLabel}-${suffix}`;
      suffix++;
    }
    usedIds.add(id);

    const rank = Number(files.reduce((acc, f) => acc + (nodeRanks?.get(f) ?? 0), 0).toFixed(4));
    const cohesion =
      totalIncidentWeight > 0 ? Number((internalWeight / totalIncidentWeight).toFixed(4)) : 0;

    communities.push({
      id,
      label,
      hub,
      files,
      rank,
      cohesion,
    });
  }

  return communities.sort(
    (a, b) => b.rank - a.rank || b.files.length - a.files.length || compareText(a.id, b.id),
  );
}

/**
 * Extract cross-file edges from an {@link IndexStore} and run deterministic
 * Louvain community detection over the project's files.
 */
export function detectStoreFileCommunities(
  store: IndexStore,
  relativeOf: (file: string) => string,
  options: LouvainOptions = {},
): FileCommunity[] {
  const symbols = store.getAllSymbols();
  const fileBySymbolId = new Map<number, string>();
  const allFiles = new Set<string>();

  for (const sym of symbols) {
    const rel = relativeOf(sym.file);
    fileBySymbolId.set(sym.id, rel);
    allFiles.add(rel);
  }
  for (const meta of store.getAllFileMetas()) {
    allFiles.add(relativeOf(meta.file));
  }

  const edgeWeights = new Map<string, number>();
  for (const ref of store.getAllResolvedRefs()) {
    const fromFile = fileBySymbolId.get(ref.fromId);
    const toFile = fileBySymbolId.get(ref.toId);
    if (!fromFile || !toFile || fromFile === toFile) continue;
    const key = fromFile < toFile ? `${fromFile}\u0000${toFile}` : `${toFile}\u0000${fromFile}`;
    edgeWeights.set(key, (edgeWeights.get(key) ?? 0) + 1);
  }

  const edges: WeightedGraphEdge[] = [];
  for (const [key, weight] of edgeWeights) {
    const sep = key.indexOf('\u0000');
    const from = key.slice(0, sep);
    const to = key.slice(sep + 1);
    edges.push({ from, to, weight });
  }

  const rankMap = new Map<string, number>();
  if (options.nodeRanks) {
    for (const [k, v] of options.nodeRanks) rankMap.set(k, v);
  } else {
    for (const [file, rank] of store.getFileRankMap()) {
      rankMap.set(relativeOf(file), rank);
    }
  }

  return detectFileCommunities([...allFiles], edges, {
    ...options,
    nodeRanks: rankMap,
  });
}
