import fs from 'fs';
import os from 'os';
import path from 'path';
import { KOReaderMetadata } from '../src/koreader-metadata';

describe('KOReaderMetadata', () => {
  it('rejects when base path does not exist', async () => {
    const metadata = new KOReaderMetadata('/path/does/not/exist');
    await expect(metadata.scan()).rejects.toThrow('KOReader path not found');
  });

  it('returns empty when no metadata files are found', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'koreader-test-'));
    const metadata = new KOReaderMetadata(tmpDir);
    const data = await metadata.scan();
    expect(Object.keys(data)).toHaveLength(0);
  });
});