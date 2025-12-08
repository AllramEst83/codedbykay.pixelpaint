import { readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const packageJsonPath = join(__dirname, '..', 'package.json');

try {
  // Read package.json
  const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf8'));
  
  // Parse current version
  const currentVersion = packageJson.version;
  const versionParts = currentVersion.split('.');
  
  // Increment patch version
  let major = parseInt(versionParts[0]) || 0;
  let minor = parseInt(versionParts[1]) || 1;
  let patch = parseInt(versionParts[2]) || 0;
  
  // Increment patch
  patch++;
  
  // Update version
  const newVersion = `${major}.${minor}.${patch}`;
  packageJson.version = newVersion;
  
  // Write back to package.json
  writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2) + '\n');
  
  console.log(`✅ Version incremented: ${currentVersion} → ${newVersion}`);
} catch (error) {
  console.error('❌ Error incrementing version:', error.message);
  process.exit(1);
}
