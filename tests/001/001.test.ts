import * as fs from 'fs';
import * as path from 'path';
import luaJson = require('lua-json');
import { generateBookDataviewMarkdown } from '../../src/markdown-generator';

function luaToBook(luaData: any) {
  // Adatta la struttura del file lua a Book (src/types.d.ts)
  return {
    title: luaData.doc_props?.title || 'Unknown',
    authors: luaData.doc_props?.authors || '',
    bookmarks: luaData.bookmarks || {},
    highlight: luaData.highlight || {},
    percent_finished: (luaData.percent_finished || 1) * 100,
  };
}

describe('KOReader Sync - Test 001', () => {
  const testDir = __dirname;
  const luaPath = path.join(testDir, 'metadata.epub.lua');
  const mdPath = path.join(testDir, '(book) test-.md');
  const configPath = path.join(testDir, 'config.json');

  it('converte correttamente il file lua in markdown', async () => {
    const luaRaw = fs.readFileSync(luaPath, 'utf8');
    const luaData = luaJson.parse(luaRaw);
    const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    const expectedMd = fs.readFileSync(mdPath, 'utf8').replace(/\r\n/g, '\n');
    const book = luaToBook(luaData);
    const actualMd = (await generateBookDataviewMarkdown(book)).replace(
      /\r\n/g,
      '\n'
    );

    expect(config).toMatchObject({ template: 'default' });
    expect(actualMd.trim()).toBe(expectedMd.trim());
  });
});