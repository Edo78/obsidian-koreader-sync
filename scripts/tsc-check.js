const { spawnSync } = require('child_process');

const result = spawnSync('npx', ['tsc', '-p', 'tsconfig.json', '--noEmit', '--skipLibCheck'], {
  stdio: 'inherit',
  shell: false,
});

process.exit(result.status ?? 1);
