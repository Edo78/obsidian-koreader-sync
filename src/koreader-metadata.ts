import * as fs from 'fs';
import * as path from 'path';

import finder from 'node-find-files';
import { parse } from 'lua-json';
import { Books } from './types';

export class KOReaderMetadata {
  koreaderBasePath: string;

  constructor(koreaderBasePath: string) {
    this.koreaderBasePath = koreaderBasePath;
  }

  public async scan(): Promise<Books> {
    const metadatas: any = {};
    return new Promise((resolve, reject) => {
      const find = new finder({
        rootFolder: this.koreaderBasePath,
      });
      find.on('match', (file: string) => {
        const filename = path.parse(file).base;
        if (filename.match(/metadata\..*\.lua$/)) {
          const content = fs.readFileSync(file, 'utf8');
          const jsonMetadata: any = parse(content);
          const {
            highlight,
            bookmarks,
            doc_props: { title },
            doc_props: { authors },
            percent_finished,
          } = jsonMetadata;
          if (Object.keys(highlight).length && Object.keys(bookmarks).length) {
            metadatas[`${title} - ${authors}`] = {
              title,
              authors,
              // highlight,
              bookmarks,
              percent_finished: percent_finished * 100,
            };
          }
        }
      });
      find.on('error', (err: any) => {
        console.log(err);
        reject(err);
      });
      find.on('complete', () => {
        resolve(metadatas);
      });
      find.startSearch();
    });
  }
}
