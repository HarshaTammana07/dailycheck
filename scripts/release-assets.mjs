export function releaseAssets(repository, release) {
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository) || /OWNER|REPO/.test(repository)) throw new Error('Configure a real owner/repository');
  const result = { repository, version: null, releaseUrl: `https://github.com/${repository}/releases`, mode: null, artifacts: {} };
  if (!release || release.draft || release.prerelease) return result;
  const version = release.tag_name?.match(/^v?(\d+\.\d+\.\d+)$/)?.[1];
  if (!version) throw new Error('Published release has an invalid version');
  result.version = version;
  result.releaseUrl = `https://github.com/${repository}/releases/tag/${encodeURIComponent(release.tag_name)}`;
  result.mode = /Release type: production/.test(release.body ?? '') ? 'production' : 'development';
  const patterns = {
    'windows-x64': new RegExp(`^DailyCheck-${version.replaceAll('.', '\\.')}-(?:win|windows)-x64\\.exe$`),
    'mac-arm64': new RegExp(`^DailyCheck-${version.replaceAll('.', '\\.')}-mac-arm64\\.dmg$`),
    'mac-x64': new RegExp(`^DailyCheck-${version.replaceAll('.', '\\.')}-mac-x64\\.dmg$`)
  };
  for (const [platform, pattern] of Object.entries(patterns)) {
    const asset = release.assets?.find(item => pattern.test(item.name) && item.size > 0);
    if (!asset) continue;
    const expected = `https://github.com/${repository}/releases/download/${encodeURIComponent(release.tag_name)}/${encodeURIComponent(asset.name)}`;
    if (asset.browser_download_url !== expected) throw new Error('Release asset URL is outside the expected repository/tag');
    result.artifacts[platform] = expected;
  }
  return result;
}
