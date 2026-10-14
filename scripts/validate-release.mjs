import { readFile } from 'node:fs/promises';
const version = process.env.RELEASE_VERSION;
if (!version || !/^\d+\.\d+\.\d+$/.test(version)) throw new Error('Release version must be a stable semver such as 1.0.0');
const pkg = JSON.parse(await readFile('package.json', 'utf8'));
if (pkg.version !== version) throw new Error(`Commit package.json version ${version} before releasing; current version is ${pkg.version}`);
const destination = pkg.build.publish[0];
if (`${destination.owner}/${destination.repo}` !== process.env.GITHUB_REPOSITORY) throw new Error('Update provider must match this GitHub repository');
if (!['development', 'production'].includes(process.env.RELEASE_MODE)) throw new Error('Unknown release mode');
console.log(`Validated release ${version} (${process.env.RELEASE_MODE})`);
