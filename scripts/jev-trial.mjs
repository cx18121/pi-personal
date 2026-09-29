#!/usr/bin/env node
import { existsSync, readFileSync, realpathSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs, parseEnv } from 'node:util';
import { spawnSync } from 'node:child_process';
import {
  DefaultPackageManager, getAgentDir, hasTrustRequiringProjectResources,
  ProjectTrustStore, SettingsManager,
} from '@earendil-works/pi-coding-agent';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const jev = resolve(root, '../jev-search/vendor/pi-fff/src/index.ts');
const rememberModel = resolve(root, 'extensions/remember-last-model.ts');

export function trialExtensions(resources, replacement = jev, remember = rememberModel) {
  const enabled = resources.filter(resource => resource.enabled);
  const stock = enabled.filter(resource => /^npm:@ff-labs\/pi-fff(?:@|$)/.test(resource.metadata.source));
  if (stock.length !== 1) throw new Error(`Expected one installed FFF extension; found ${stock.length}.`);
  const stockPath = realpathSync(stock[0].path);
  const rememberPath = existsSync(remember) ? realpathSync(remember) : undefined;
  return [...new Set(enabled.map(resource => realpathSync(resource.path))
    .filter(path => path !== rememberPath)
    .map(path => path === stockPath ? realpathSync(replacement) : path))];
}

export async function trialPlan(cwd = process.cwd(), agentDir = getAgentDir()) {
  const global = SettingsManager.create(cwd, agentDir, { projectTrusted: false });
  let trusted = new ProjectTrustStore(agentDir).get(cwd);
  if (trusted === null) {
    const policy = global.getGlobalSettings().defaultProjectTrust ?? 'ask';
    if (policy === 'ask' && hasTrustRequiringProjectResources(cwd)) {
      throw new Error('Open this project in normal Pi and settle project trust before using the trial.');
    }
    trusted = policy === 'always';
  }
  const settingsManager = SettingsManager.create(cwd, agentDir, { projectTrusted: trusted });
  const resources = await new DefaultPackageManager({ cwd, agentDir, settingsManager })
    .resolve(async () => 'error');
  const errors = [...global.drainErrors(), ...settingsManager.drainErrors()];
  if (errors.length) throw new Error(`Cannot read Pi settings: ${errors[0].error.message}`);
  const extensions = trialExtensions(resources.extensions);
  return {
    cwd, extensions,
    args: [
      '--offline', trusted ? '--approve' : '--no-approve', '--no-extensions',
      ...extensions.flatMap(path => ['-e', path]),
      '--model', 'openai-codex/gpt-5.6-sol', '--thinking', 'medium',
    ],
  };
}

function trialKey(envFile) {
  const key = process.env.TYPESAFE_API_KEY ||
    (envFile ? parseEnv(readFileSync(envFile, 'utf8')).TYPESAFE_API_KEY : undefined);
  if (!key) throw new Error('Set TYPESAFE_API_KEY or pass --env-file /path/to/.env. Only that key is loaded.');
  return key;
}

async function main() {
  const { values, positionals } = parseArgs({
    options: { check: { type: 'boolean' }, 'env-file': { type: 'string' }, help: { type: 'boolean' } },
    allowPositionals: true,
  });
  if (values.help) {
    console.log('node scripts/jev-trial.mjs [--check] [--env-file PATH] [-- PI_ARGUMENTS]\nRun from the project you want to work on. --check prints the launch plan without loading extensions or calling APIs.');
    return;
  }
  const plan = await trialPlan();
  if (values.check) {
    console.log(JSON.stringify(plan, null, 2));
    return;
  }
  const key = trialKey(values['env-file']);
  console.error('Jev trial: Sol medium, Jev-backed FFF, other extensions retained. Global model remembering is disabled for this session.');
  const child = spawnSync('pi', [...plan.args, ...positionals], {
    cwd: plan.cwd, stdio: 'inherit',
    env: { ...process.env, TYPESAFE_API_KEY: key, JEV_SEARCH_ORDER: 'jev' },
  });
  if (child.error) throw child.error;
  process.exitCode = child.status ?? 1;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => { console.error(error.message); process.exitCode = 1; });
}
