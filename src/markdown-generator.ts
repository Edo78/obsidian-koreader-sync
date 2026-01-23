import * as crypto from 'crypto';
import * as eta from 'eta';
import matter from 'gray-matter';
import { Book } from './types';

const KOREADERKEY = 'koreader-sync';
const NOTE_TYPE_SINGLE = 'koreader-sync-note';
const NOTE_TYPE_BOOK = 'koreader-sync-dataview';

export const DEFAULT_DATAVIEW_TEMPLATE = `# Title: <%= it.data.title %>

<progress value="<%= it.metadata.percent_finished %>" max="100"> </progress>
\`\`\`dataviewjs
const title = dv.current()['koreader-sync'].metadata.managed_title
dv.pages().where(n => {
return n['koreader-sync'] && n['koreader-sync'].type == '${NOTE_TYPE_SINGLE}' && n['koreader-sync'].metadata.managed_book_title == title
}).sort(p => p['koreader-sync'].data.page).forEach(p => dv.paragraph(dv.fileLink(p.file.name, true), {style: 'test-css'}))
\`\`\`
    `;

type BookDataviewFrontMatter = {
  cssclass: string;
  'koreader-sync': {
    uniqueId: string;
    type: string;
    data: {
      title: string;
      authors: string;
    };
    metadata: {
      percent_finished: number;
      managed_title: string;
      keep_in_sync: boolean;
      yet_to_be_edited: boolean;
    };
  };
};

export function buildBookDataviewFrontMatter(options: {
  book: Book;
  managedBookTitle: string;
  keepInSync: boolean;
  percentFinishedOverride?: number;
}): BookDataviewFrontMatter {
  const { book, managedBookTitle, keepInSync, percentFinishedOverride } =
    options;
  const percent_finished =
    percentFinishedOverride ?? (book.percent_finished ?? 100);

  return {
    cssclass: NOTE_TYPE_BOOK,
    [KOREADERKEY]: {
      uniqueId: crypto
        .createHash('md5')
        .update(`${book.title} - ${book.authors}`)
        .digest('hex'),
      type: NOTE_TYPE_BOOK,
      data: {
        title: book.title,
        authors: book.authors,
      },
      metadata: {
        percent_finished,
        managed_title: managedBookTitle,
        keep_in_sync: keepInSync,
        yet_to_be_edited: true,
      },
    },
  };
}

export async function renderBookDataviewContent(
  template: string,
  data: BookDataviewFrontMatter['koreader-sync']
): Promise<string> {
  eta.configure({ autoEscape: false });
  return (await eta.render(template, data)) as string;
}

export async function generateBookDataviewMarkdown(
  book: Book,
  options?: {
    managedBookTitle?: string;
    keepInSync?: boolean;
    percentFinishedOverride?: number;
  }
) {
  const managedBookTitle = options?.managedBookTitle ?? `(book) ${book.title}-`;
  const keepInSync = options?.keepInSync ?? true;
  const frontMatter = buildBookDataviewFrontMatter({
    book,
    managedBookTitle,
    keepInSync,
    percentFinishedOverride: options?.percentFinishedOverride,
  });
  const content = await renderBookDataviewContent(
    DEFAULT_DATAVIEW_TEMPLATE,
    frontMatter[KOREADERKEY]
  );
  return matter.stringify(content, frontMatter);
}
