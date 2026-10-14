import { mkdir, writeFile } from 'node:fs/promises';
const mode = process.env.RELEASE_MODE;
const version = process.env.RELEASE_VERSION;
await mkdir('work', { recursive: true });
const warning = mode === 'development' ? 'Unsigned development release for learning and testing. Windows updates use HTTPS and SHA-512 integrity checks; this is not publisher signature verification. Unsigned macOS automatic updates are disabled.\n' : 'Production release built with required operating-system signing credentials.\n';
await writeFile('work/release-notes.md', `# DailyCheck ${version}\n\nRelease type: ${mode}\n\n${warning}\n- Real Supabase login and device authorization.\n- Tasks and completion history remain on your computer.\n- Update discovery, download progress, and Restart and Install on supported builds.\n\nInstall the Windows .exe or the DMG matching your Mac architecture.\n`, 'utf8');
