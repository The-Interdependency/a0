// Shared plumbing for the six preserved defect witnesses; no product imports.
import { execFileSync } from 'node:child_process';
import { mkdir, mkdtemp, realpath } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { isAbsolute, join, relative, resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';

export const auditedCommit = 'de66778dd1d9073f6a8b3d532e73514868f94e3c';
export const sourceRoot = await realpath(resolve(process.env.A0_AUDIT_ROOT || process.cwd()));
export const sourceCommit = execFileSync('git', ['-C', sourceRoot, 'rev-parse', 'HEAD'], {encoding: 'utf8'}).trim();
export const sourceDirty = Boolean(execFileSync('git', ['-C', sourceRoot, 'status', '--porcelain', '--untracked-files=no'], {encoding: 'utf8'}).trim());
console.log(JSON.stringify({kind: 'defect-witness', auditedCommit, targetCommit: sourceCommit, targetDirty: sourceDirty, polarity: 'PASS reproduces the defect; it is not product acceptance'}));

export const sourcePath = (...parts) => join(sourceRoot, ...parts);
export async function loadPlaywright() {
  const requireFromTarget = createRequire(sourcePath('package.json'));
  const imported = await import(pathToFileURL(requireFromTarget.resolve('playwright')).href);
  return imported.default || imported;
}

// Browser assets come only from this witness's loopback static server. All API
// routes are supplied by inert fixtures in the witness; service workers are off.
export async function restrictBrowserToOrigin(context, origin) {
  await context.route('**/*', route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort('blockedbyclient'));
}

let outputDirectory;
function assertOutsideTarget(directory) {
  const fromRoot = relative(sourceRoot, directory);
  if (!fromRoot || (!isAbsolute(fromRoot) && fromRoot !== '..' && !fromRoot.startsWith('..' + sep))) {
    throw new Error('A0_AUDIT_OUTPUT_DIR must be outside the target product checkout.');
  }
}
export async function outputPath(name) {
  if (!outputDirectory) {
    const requested = process.env.A0_AUDIT_OUTPUT_DIR;
    const directory = requested ? resolve(requested) : await mkdtemp(join(tmpdir(), 'a0-gui-audit-'));
    assertOutsideTarget(directory);
    await mkdir(directory, {recursive: true});
    outputDirectory = await realpath(directory);
    assertOutsideTarget(outputDirectory);
  }
  if (name !== name.split(/[\\/]/).pop()) throw new Error('Output name must be a plain filename.');
  return join(outputDirectory, name);
}

// Native Node fetch is never needed here. The source-marker counterexample
// replaces this with its own exhaustive local response map before importing it.
globalThis.fetch = async () => { throw new Error('Network fetch is disabled in these audit witnesses.'); };
