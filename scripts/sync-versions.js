#!/usr/bin/env node

/**
 * Syncs all fork package (@cwilson613/*) inter-dependency versions to lockstep.
 * Must be run AFTER all package.json files have been stamped with the same version.
 */

import { readFileSync, writeFileSync, readdirSync } from 'fs';
import { join } from 'path';

const packagesDir = join(process.cwd(), 'packages');
const packageDirs = readdirSync(packagesDir, { withFileTypes: true })
	.filter(dirent => dirent.isDirectory())
	.map(dirent => dirent.name);

// Read all package.json files and build version map
const packages = {};
const versionMap = {};

for (const dir of packageDirs) {
	const pkgPath = join(packagesDir, dir, 'package.json');
	try {
		const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
		packages[dir] = { path: pkgPath, data: pkg };
		versionMap[pkg.name] = pkg.version;
	} catch (e) {
		console.error(`Failed to read ${pkgPath}:`, e.message);
	}
}

console.log('Current versions:');
for (const [name, version] of Object.entries(versionMap).sort()) {
	console.log(`  ${name}: ${version}`);
}

// Verify all versions are the same (lockstep)
const versions = new Set(Object.values(versionMap));
if (versions.size > 1) {
	console.error('\n❌ ERROR: Not all packages have the same version!');
	console.error('Divergent packages:');
	for (const [name, version] of Object.entries(versionMap).sort()) {
		console.error(`  ${name}: ${version}`);
	}
	console.error('\nRun the stamp-version step before sync-versions, or use auto-publish-on-sync.yml.');
	process.exit(1);
}

console.log('\n✅ All packages at same version (lockstep)');

// Update all inter-package dependencies (@mariozechner/* upstream names AND @cwilson613/* fork names)
let totalUpdates = 0;
for (const [dir, pkg] of Object.entries(packages)) {
	let updated = false;

	for (const depField of ['dependencies', 'devDependencies', 'peerDependencies']) {
		if (!pkg.data[depField]) continue;
		for (const [depName, currentVersion] of Object.entries(pkg.data[depField])) {
			if (versionMap[depName]) {
				const newVersion = `^${versionMap[depName]}`;
				if (currentVersion !== newVersion) {
					console.log(`\n${pkg.data.name} [${depField}]:`);
					console.log(`  ${depName}: ${currentVersion} → ${newVersion}`);
					pkg.data[depField][depName] = newVersion;
					updated = true;
					totalUpdates++;
				}
			}
		}
	}

	if (updated) {
		writeFileSync(pkg.path, JSON.stringify(pkg.data, null, '\t') + '\n');
	}
}

if (totalUpdates === 0) {
	console.log('\nAll inter-package dependencies already in sync.');
} else {
	console.log(`\n✅ Updated ${totalUpdates} dependency version(s)`);
}
