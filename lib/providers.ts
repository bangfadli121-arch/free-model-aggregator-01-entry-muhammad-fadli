import { readFileSync } from 'node:fs';

export function readBrief(path = process.env.MAKEFUN_PROMPT_FILE) {
  if (!path) return null;
  const s = readFileSync(path, 'utf8');
  const docs = [...s.matchAll(/\{\"schema\":\"free-model-aggregator-01\/[\s\S]*?\n(?=\n|$)/g)].map(x => x[0]);
  const parse = (prefix: string) => {
    const at = s.indexOf(prefix); if (at < 0) return null;
    const start = s.lastIndexOf('{', at), end = s.indexOf('\n', at);
    return JSON.parse(s.slice(start, end));
  };
  const directory = parse('"schema":"free-model-aggregator-01/providers/v1"');
  const quality = parse('"schema":"free-model-aggregator-01/ratings/v1"');
  const workload = parse('"schema":"free-model-aggregator-01/workload/v1"');
  if (!directory || !quality || !workload) throw new Error('brief sections missing');
  return { directory: directory.providers, ratings: quality.ratings, manifest: workload.manifest };
}

export function authHeaders(p: any) {
  if (!p.auth || p.auth === 'none') return {};
  if (p.auth === 'bearer') return { authorization: `Bearer ${p.key}` };
  return { [p.auth]: p.key };
}
