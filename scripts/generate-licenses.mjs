/**
 * Generate THIRD-PARTY-NOTICES for the bundled open-source dependencies.
 *
 * Walks the *production* dependency tree (direct + transitive), reads each
 * package's license id and bundled LICENSE text, and writes a single notices
 * file to the client's public/ dir so it ships as a static asset (served at
 * /third-party-notices.txt and linked from the footer). Satisfies the
 * attribution terms of the permissive licenses (MIT / ISC / Apache-2.0 / …).
 *
 * Re-run after changing dependencies:  npm run licenses
 */

import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const outPath = path.join(root, 'src', 'client', 'public', 'third-party-notices.txt');

const readJSON = (p) => {
  try {
    return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch {
    return null;
  }
};

/** Resolve a package dir by walking up node_modules from `fromDir` (handles nested + hoisted). */
function resolvePkgDir(name, fromDir) {
  let dir = fromDir;
  while (true) {
    const cand = path.join(dir, 'node_modules', name);
    if (fs.existsSync(path.join(cand, 'package.json'))) return cand;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  const r = path.join(root, 'node_modules', name);
  return fs.existsSync(path.join(r, 'package.json')) ? r : null;
}

function findLicenseText(dir) {
  for (const f of fs.readdirSync(dir)) {
    if (/^licen[sc]e/i.test(f)) {
      const full = path.join(dir, f);
      try {
        if (fs.statSync(full).isFile()) return fs.readFileSync(full, 'utf8').trim();
      } catch {
        /* ignore */
      }
    }
  }
  return null;
}

function licenseOf(pkg) {
  if (typeof pkg.license === 'string') return pkg.license;
  if (pkg.license && pkg.license.type) return pkg.license.type;
  if (Array.isArray(pkg.licenses)) return pkg.licenses.map((l) => l.type || l).join(' OR ');
  return 'UNKNOWN';
}

const rootPkg = readJSON(path.join(root, 'package.json'));
const queue = Object.keys(rootPkg.dependencies || {}).map((name) => ({ name, from: root }));

const seen = new Map();
while (queue.length) {
  const { name, from } = queue.shift();
  const dir = resolvePkgDir(name, from);
  if (!dir) continue;
  const pkg = readJSON(path.join(dir, 'package.json'));
  if (!pkg) continue;
  const key = `${pkg.name}@${pkg.version}`;
  if (seen.has(key)) continue;
  const repo = pkg.homepage || (pkg.repository && (pkg.repository.url || pkg.repository)) || '';
  seen.set(key, {
    name: pkg.name,
    version: pkg.version,
    license: licenseOf(pkg),
    homepage: String(repo).replace(/^git\+/, '').replace(/\.git$/, ''),
    text: findLicenseText(dir),
  });
  for (const dep of Object.keys(pkg.dependencies || {})) queue.push({ name: dep, from: dir });
}

const pkgs = [...seen.values()].sort((a, b) => a.name.localeCompare(b.name));

let out = '';
out += 'THIRD-PARTY SOFTWARE NOTICES AND LICENSES\n' + '='.repeat(80) + '\n\n';
out += 'mustr bundles the open-source packages listed below. Each is distributed under\n';
out += "its own license, reproduced here to satisfy that license's attribution terms.\n";
out += 'mustr itself is not open source; this notice covers third-party components only.\n\n';
out += `Generated ${new Date().toISOString().slice(0, 10)} from the production dependency tree.\n`;
out += `Packages: ${pkgs.length}\n\n`;

const tally = {};
for (const p of pkgs) tally[p.license] = (tally[p.license] || 0) + 1;
out += 'License summary:\n';
for (const [l, c] of Object.entries(tally).sort((a, b) => b[1] - a[1])) {
  out += `  ${String(c).padStart(3)}  ${l}\n`;
}
out += '\n';

for (const p of pkgs) {
  out += '='.repeat(80) + '\n';
  out += `${p.name}@${p.version}  —  ${p.license}\n`;
  if (p.homepage) out += `${p.homepage}\n`;
  out += '-'.repeat(80) + '\n';
  out += (p.text || `License: ${p.license}. (No license file was bundled with this package.)`) + '\n\n';
}

fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, out, 'utf8');
console.log(`Wrote ${path.relative(root, outPath)} — ${pkgs.length} packages, ${(out.length / 1024).toFixed(0)}KB`);
