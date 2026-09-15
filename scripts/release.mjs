import { execSync } from 'child_process';
import { readFileSync, writeFileSync } from 'fs';
import { resolve, join } from 'path';
import readline from 'readline';

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

const prompt = (query) => new Promise(resolve => rl.question(query, resolve));

// Paths
const ROOT_DIR = resolve(process.cwd(), '..');
const FRONTEND_DIR = resolve(process.cwd());
const VERSION_FILE = join(ROOT_DIR, 'version.json');
const PACKAGE_FILE = join(FRONTEND_DIR, 'package.json');
const ENV_FILE = join(ROOT_DIR, '.env');

function runCommand(command, cwd = ROOT_DIR) {
  try {
    console.log(`\n> ${command}`);
    return execSync(command, { cwd, stdio: 'pipe' }).toString().trim();
  } catch (error) {
    console.error(`Error executing command: ${command}`);
    console.error(error.stderr?.toString() || error.message);
    process.exit(1);
  }
}

async function checkAuth() {
  console.log('Checking GitHub authentication...');
  let hasToken = false;
  
  try {
    const envContent = readFileSync(ENV_FILE, 'utf-8');
    if (envContent.includes('GITHUB_TOKEN=')) {
      hasToken = true;
    }
  } catch (e) {
    // .env might not exist
  }

  if (!hasToken) {
    console.log('No GITHUB_TOKEN found in .env, checking gh CLI status...');
    try {
      runCommand('gh auth status');
      console.log('✅ GitHub CLI is authenticated.');
    } catch (e) {
      console.error('❌ You are not authenticated with GitHub.');
      console.error('Please either add GITHUB_TOKEN to .env or run "gh auth login".');
      process.exit(1);
    }
  } else {
    console.log('✅ GITHUB_TOKEN found in .env.');
  }
}

async function main() {
  console.log('🚀 Starting ChronoTrack Release Wizard...\n');
  
  await checkAuth();

  // Read current configs
  const versionData = JSON.parse(readFileSync(VERSION_FILE, 'utf-8'));
  const packageData = JSON.parse(readFileSync(PACKAGE_FILE, 'utf-8'));

  console.log(`\nCurrent App Version: ${packageData.version}`);
  console.log(`Current Build Number: ${packageData.buildNumber || 1}`);
  console.log(`\nRemote Config:`);
  console.log(`- Current Version: ${versionData.current_version}`);
  console.log(`- Minimum Version: ${versionData.minimum_version}`);
  console.log(`- Build Number: ${versionData.build_number}`);
  console.log(`- Minimum Build Number: ${versionData.minimum_build_number}`);

  console.log('\n--- Configuration ---');
  
  const newVersion = await prompt(`New App Version (Press enter to keep ${packageData.version}): `) || packageData.version;
  const currentBuild = packageData.buildNumber || 1;
  const newBuildStr = await prompt(`New Build Number (Press enter to keep ${currentBuild + 1}): `);
  const newBuild = newBuildStr ? parseInt(newBuildStr) : currentBuild + 1;

  const isHardUpdate = (await prompt('Is this a mandatory/hard update? (y/N): ')).toLowerCase() === 'y';
  
  let newMinVersion = versionData.minimum_version;
  let newMinBuild = versionData.minimum_build_number;

  if (isHardUpdate) {
    const hardType = await prompt('Is this a hard VERSION update or hard BUILD update? (v/b): ');
    if (hardType.toLowerCase() === 'v') {
      newMinVersion = newVersion;
      newMinBuild = 1; // Reset minimum build for a new major version
    } else {
      newMinBuild = newBuild;
    }
  }

  console.log('\n--- Release Notes ---');
  console.log('Enter comma-separated lists (e.g. "Added dark mode, Fixed login bug")');
  const featuresInput = await prompt('New Features (Press enter to skip): ');
  const bugsInput = await prompt('Bug Fixes (Press enter to skip): ');

  const features = featuresInput ? featuresInput.split(',').map(s => s.trim()).filter(Boolean) : [];
  const bug_fixes = bugsInput ? bugsInput.split(',').map(s => s.trim()).filter(Boolean) : [];

  // Update Files
  console.log('\nUpdating configuration files...');
  
  packageData.version = newVersion;
  packageData.buildNumber = newBuild;
  writeFileSync(PACKAGE_FILE, JSON.stringify(packageData, null, 2));

  versionData.current_version = newVersion;
  versionData.minimum_version = newMinVersion;
  versionData.build_number = newBuild;
  versionData.minimum_build_number = newMinBuild;
  versionData.features = features;
  versionData.bug_fixes = bug_fixes;
  writeFileSync(VERSION_FILE, JSON.stringify(versionData, null, 2));

  console.log('✅ Config files updated.');

  // Auto Commit and Push
  const doCommit = (await prompt('\nAutomatically commit and push config changes to GitHub? (Y/n): ')).toLowerCase() !== 'n';
  if (doCommit) {
    console.log('Committing changes...');
    runCommand('git add version.json Frontend/package.json');
    runCommand(`git commit -m "chore: bump version to ${newVersion} (Build ${newBuild})"`);
    console.log('Pushing changes...');
    runCommand('git push origin main');
  }

  // Build
  console.log('\nBuilding the Electron app. This may take a moment...');
  execSync('npm run electron:build', { cwd: FRONTEND_DIR, stdio: 'inherit' });
  console.log('✅ Build complete.');

  // Publish Release
  console.log('\nPublishing GitHub Release...');
  const tagName = `v${newVersion}-build${newBuild}`;
  const releaseTitle = `ChronoTrack ${newVersion} (Build ${newBuild})`;
  const exeFile = `release/ChronoTrack Setup ${newVersion}.exe`;
  
  let notes = "";
  if (features.length > 0) notes += `### New Features\n- ${features.join('\n- ')}\n\n`;
  if (bug_fixes.length > 0) notes += `### Bug Fixes\n- ${bug_fixes.join('\n- ')}\n`;
  if (!notes) notes = "Minor updates and improvements.";

  const ghCommand = `gh release create "${tagName}" "${exeFile}" --title "${releaseTitle}" --notes "${notes}"`;
  
  // Note: we run the gh command in the FRONTEND_DIR where the release/ folder is generated.
  try {
    execSync(ghCommand, { cwd: FRONTEND_DIR, stdio: 'inherit' });
    console.log(`\n🎉 Successfully published release: ${tagName}`);
  } catch (e) {
    console.error('❌ Failed to publish GitHub Release.');
    console.error('You may need to manually upload the .exe using the GitHub CLI or website.');
  }

  rl.close();
}

main().catch(console.error);
