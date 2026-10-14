import { mkdir, readFile, writeFile } from 'node:fs/promises';
const mode = process.env.RELEASE_MODE;
const version = process.env.RELEASE_VERSION;
const changelog = (await readFile('CHANGELOG.md', 'utf8')).replace(/\r\n/g, '\n');
const section = changelog.split(`## ${version}\n`)[1]?.split('\n## ')[0]?.trim();
if (!section) throw new Error(`Missing changelog entry for ${version}`);
await mkdir('work', { recursive: true });
const warning = mode === 'development' ? 'Unsigned development release for learning and testing. Windows updates use HTTPS and SHA-512 integrity checks; this is not publisher signature verification. Unsigned macOS automatic updates are disabled.\n' : 'Production release built with required operating-system signing credentials.\n';
await writeFile('work/release-notes.md', `# DailyCheck ${version}\n\nRelease type: ${mode}\n\n${warning}\n${section}\n\nInstall an available installer for your operating system from this release.\n`, 'utf8');
