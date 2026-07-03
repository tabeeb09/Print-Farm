import { spawn } from 'node:child_process';
import { promises as fs } from 'node:fs';
import path from 'node:path';

function getArg(name) {
  const index = process.argv.indexOf(name);
  if (index === -1) return '';
  return process.argv[index + 1] || '';
}

function must(value, label) {
  if (!value) throw new Error(`Missing required argument: ${label}`);
  return value;
}

function run(command, args, cwd) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd, stdio: 'inherit', shell: false });
    child.on('error', reject);
    child.on('exit', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${command} exited with code ${code}`));
    });
  });
}

async function main() {
  const job = must(getArg('--job'), '--job');
  const printerHost = must(getArg('--ip'), '--ip');
  const printerSerial = must(getArg('--serial'), '--serial');
  const accessCode = must(getArg('--access-code'), '--access-code');
  const projectName = getArg('--project-name') || path.basename(job, path.extname(job));
  const plateIndex = getArg('--plate-index') || '1';
  const wrapper = process.env.ORCA_LAN_WRAPPER;
  const wrapperArgs = process.env.ORCA_LAN_WRAPPER_ARGS || '';
  const dryRun = process.env.ORCA_LAN_DRY_RUN === '1';

  if (!wrapper) throw new Error('ORCA_LAN_WRAPPER is not configured');

  const args = [
    '--job', job,
    '--ip', printerHost,
    '--serial', printerSerial,
    '--access-code', accessCode,
    '--project-name', projectName,
    '--plate-index', plateIndex,
  ];

  if (dryRun) {
    args.push('--dry-run');
  }

  if (wrapperArgs.trim()) {
    const extra = wrapperArgs.trim().startsWith('[')
      ? JSON.parse(wrapperArgs)
      : wrapperArgs.split(/\s+/).filter(Boolean);
    args.push(...extra.map((item) => String(item)));
  }

  await run(wrapper, args, process.cwd());
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
