import fs from 'node:fs';
import path from 'node:path';

const html = fs.readFileSync(path.join(process.cwd(), 'website', 'index.html'), 'utf8');
const fakeAssetUrl = /DailyCheck-.*\.(exe|dmg)/i.test(html);

if (fakeAssetUrl) {
  throw new Error('The website must not contain invented installer artifact URLs.');
}

console.log('Website check passed: no invented installer artifact URLs found.');
