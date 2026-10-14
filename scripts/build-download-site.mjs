import { cp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { releaseAssets } from './release-assets.mjs';
const pkg = JSON.parse(await readFile('package.json', 'utf8'));
const destination = pkg.build.publish[0];
const repository = process.env.GITHUB_REPOSITORY || `${destination.owner}/${destination.repo}`;
const response = await fetch(`https://api.github.com/repos/${repository}/releases/latest`, {
  headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'DailyCheck-Pages', ...(process.env.GH_TOKEN ? { Authorization: `Bearer ${process.env.GH_TOKEN}` } : {}) }
});
let release = null;
if (response.status !== 404) {
  if (!response.ok) throw new Error(`Release lookup failed: HTTP ${response.status}`);
  release = await response.json();
}
const data = releaseAssets(repository, release);
await mkdir('work/site', { recursive: true });
await cp('website', 'work/site', { recursive: true });
await writeFile('work/site/release.json', JSON.stringify(data, null, 2) + '\n');
console.log(`Built Pages site for ${repository}: ${data.version ?? 'awaiting first release'}, ${Object.keys(data.artifacts).length} actual installer links.`);
