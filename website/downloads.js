async function loadDownloads() {
  const response = await fetch('./release.json', { cache: 'no-cache' });
  if (!response.ok) throw new Error('Download information is unavailable.');
  const release = await response.json();
  for (const link of document.querySelectorAll('[data-artifact]')) {
    const url = release.artifacts?.[link.dataset.artifact];
    if (!url) continue;
    const expectedPrefix = `https://github.com/${release.repository}/releases/download/`;
    if (!url.startsWith(expectedPrefix)) continue;
    link.href = url;
    link.classList.remove('disabled');
    link.removeAttribute('aria-disabled');
  }
  for (const link of document.querySelectorAll('[data-release-link]')) link.href = release.releaseUrl;
  document.querySelector('[data-version]').textContent = release.version || 'Coming soon';
  document.querySelector('[data-download-note]').textContent = !release.version
    ? 'Installers will appear here after the first release is published.'
    : release.mode === 'development'
      ? 'Unsigned development release for learning and testing. macOS signing and notarization are still pending.'
      : 'Choose the installer matching your computer.';
}
loadDownloads().catch(() => {
  document.querySelector('[data-download-note]').textContent = 'Downloads are temporarily unavailable. Please check GitHub Releases.';
});
