export function releaseEnvironment(source, mode) {
  const environment = { ...source };
  if (mode === 'development') {
    // Missing GitHub secrets become empty strings. electron-builder treats an
    // empty CSC_LINK as a certificate path pointing at the current directory.
    // Unsigned development builds must not receive signing credentials at all.
    for (const name of [
      'CSC_LINK', 'CSC_KEY_PASSWORD', 'CSC_NAME',
      'WIN_CSC_LINK', 'WIN_CSC_KEY_PASSWORD',
      'APPLE_ID', 'APPLE_APP_SPECIFIC_PASSWORD', 'APPLE_TEAM_ID',
      'APPLE_API_KEY', 'APPLE_API_KEY_ID', 'APPLE_API_ISSUER',
      'APPLE_KEYCHAIN', 'APPLE_KEYCHAIN_PROFILE'
    ]) delete environment[name];
    environment.CSC_IDENTITY_AUTO_DISCOVERY = 'false';
  }
  return environment;
}
