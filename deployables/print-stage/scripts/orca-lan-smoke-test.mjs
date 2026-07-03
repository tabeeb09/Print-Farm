import { spawn } from 'node:child_process';

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: 'inherit', shell: false });
    child.on('error', reject);
    child.on('exit', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${command} exited with code ${code}`));
    });
  });
}

async function main() {
  const wrapper = process.env.ORCA_LAN_WRAPPER;
  if (!wrapper) {
    throw new Error('ORCA_LAN_WRAPPER is not configured');
  }

  const args = [
    '--job', process.env.ORCA_LAN_TEST_JOB || 'C:\\temp\\test.gcode.3mf',
    '--ip', process.env.ORCA_LAN_TEST_IP || '192.168.1.123',
    '--serial', process.env.ORCA_LAN_TEST_SERIAL || 'TESTSERIAL',
    '--access-code', process.env.ORCA_LAN_TEST_ACCESS_CODE || 'TESTCODE',
    '--project-name', process.env.ORCA_LAN_TEST_PROJECT || 'test',
    '--plate-index', process.env.ORCA_LAN_TEST_PLATE_INDEX || '1',
    '--dry-run',
  ];

  await run(wrapper, args);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
