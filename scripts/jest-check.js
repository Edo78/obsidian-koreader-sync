const { spawnSync } = require('child_process');

const result = spawnSync('npx', ['jest', '--config', 'jest.config.js'], {
  stdio: 'inherit',
  shell: false,
});

process.exit(result.status ?? 1);
