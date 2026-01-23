import * as crypto from 'crypto';
import * as eta from 'eta';
import { Book, Bookmark, FrontMatter } from './types';

const NOTE_TYPE_SINGLE = 'koreader-sync-note';

export const DEFAULT_NOTE_TEMPLATE = `## Title: [[<%= it.bookPath %>|<%= it.title %>]]

### by: [[<%= it.authors %>]]

### Chapter: <%= it.chapter %>

<% if (it.page !== null) { %>Page: <%= it.page %>

<% } %>

**==<%= it.highlight %>==**

<%= it.text %>`;

export interface NotePayload {
  uniqueId: string;
  managedBookTitle: string;
  keepInSync: boolean;
  book: Book;
  bookmark: Bookmark;
  page: number | null;
  noteItself: string;
  noteTitle: string;
  bookPath: string;
}

interface NotePayloadOptions {
  path: string;
  uniqueId: string;
  book: Book;
  bookmark: Bookmark;
  managedBookTitle: string;
  keepInSync: boolean;
  noteTitleOptions?: TitleOptions;
  normalizePath?: (value: string) => string;
}

interface FrontmatterPayloadOptions {
  path: string;
  frontmatter: FrontMatter;
  noteTitleOptions?: TitleOptions;
  normalizePath?: (value: string) => string;
}

export interface TitleOptions {
  prefix?: string;
  suffix?: string;
  maxLength?: number;
  maxWords?: number;
}

export function sanitizeForPath(value: string): string {
  if (!value) return '';
  const normalized = value.replace(/[\r\n]+/g, ' ').replace(/\s+/g, ' ').trim();
  const cleaned = normalized.replace(/[<>:"/\\|?*]/g, '_');
  return cleaned.replace(/[.\s]+$/g, '');
}

export function manageTitle(title: string, options: TitleOptions = {}): string {
  title = title.replace(/\\|\/|:/g, '_');
  title = title.replace(/_+/g, '_');
  title = title.trim();
  title = title.replace(/^_+|_+$/g, '');
  title = title.replace(/\s+/g, ' ');
  if (options.maxLength && title.length > options.maxLength) {
    title = `${title.substring(0, options.maxLength)}...`;
  }
  if (options.maxWords && title.split(' ').length > options.maxWords) {
    title = `${title.split(' ').slice(0, options.maxWords).join(' ')}...`;
  }
  return `${options.prefix || ''}${title}${options.suffix || ''}`;
}

function normalizePathLocal(value: string) {
  return value.replace(/\\/g, '/').replace(/\/+/g, '/');
}

function extractPageFromBookmark(bookmark: Bookmark): number | null {
  if (bookmark.page && /^\d+$/.test(bookmark.page)) {
    const parsedPage = parseInt(bookmark.page, 10);
    if (!isNaN(parsedPage)) {
      return parsedPage;
    }
  }

  if (bookmark.text) {
    const textPrefix = bookmark.text.split('@')[0];
    const labeledMatch = textPrefix.match(
      /\b(?:page|pagina|seite|página|pag\.?|pg\.?)[\s:]+(\d+)/i
    );
    if (labeledMatch?.[1]) {
      const parsedPage = parseInt(labeledMatch[1], 10);
      if (!isNaN(parsedPage)) {
        return parsedPage;
      }
    }
  }

  return null;
}

function extractNoteText(bookmark: Bookmark): string {
  if (!bookmark.text) return '';
  if (bookmark.text.includes(bookmark.datetime)) {
    const parts = bookmark.text.split(bookmark.datetime);
    if (parts.length > 1) {
      return parts[1].trim();
    }
    return '';
  }
  return bookmark.text.trim();
}

function buildNoteTitle(
  noteItself: string,
  highlight: string,
  authors: string,
  options?: TitleOptions
): string {
  if (noteItself) {
    return sanitizeForPath(manageTitle(noteItself, options));
  }
  const safeAuthors = sanitizeForPath(authors);
  return sanitizeForPath(`${manageTitle(highlight, options)} - ${safeAuthors}`);
}

export function buildNotePayloadFromBookmark(
  options: NotePayloadOptions
): NotePayload {
  const {
    path,
    uniqueId,
    book,
    bookmark,
    managedBookTitle,
    keepInSync,
    noteTitleOptions,
    normalizePath,
  } = options;
  const noteItself = extractNoteText(bookmark);
  const page = extractPageFromBookmark(bookmark);
  const noteTitle = buildNoteTitle(
    noteItself,
    bookmark.notes,
    book.authors,
    noteTitleOptions
  );
  const normalizer = normalizePath ?? normalizePathLocal;
  const bookPath = normalizer(`${path}/${managedBookTitle}`);
  return {
    uniqueId,
    managedBookTitle,
    keepInSync,
    book,
    bookmark,
    page,
    noteItself,
    noteTitle,
    bookPath,
  };
}

export function buildNotePayloadFromFrontmatter(
  options: FrontmatterPayloadOptions
): NotePayload {
  const { path, frontmatter, noteTitleOptions, normalizePath } = options;
  const book: Book = {
    title: frontmatter.data.title,
    authors: frontmatter.data.authors,
    bookmarks: {},
    highlight: frontmatter.data.highlight,
    percent_finished: 100,
  };
  const bookmark: Bookmark = {
    chapter: frontmatter.data.chapter,
    text: frontmatter.data.text || '',
    datetime: frontmatter.data.datetime,
    notes: frontmatter.data.highlight,
    highlighted: true,
    pos0: '',
    pos1: '',
    page: `${frontmatter.data.page}`,
  };
  const noteItself = frontmatter.data.text || '';
  const noteTitle = buildNoteTitle(
    noteItself,
    frontmatter.data.highlight,
    frontmatter.data.authors,
    noteTitleOptions
  );
  const normalizer = normalizePath ?? normalizePathLocal;
  const bookPath = normalizer(`${path}/${frontmatter.metadata.managed_book_title}`);

  return {
    uniqueId: frontmatter.uniqueId,
    managedBookTitle: frontmatter.metadata.managed_book_title,
    keepInSync: frontmatter.metadata.keep_in_sync,
    book,
    bookmark,
    page: frontmatter.data.page,
    noteItself,
    noteTitle,
    bookPath,
  };
}

export async function renderNoteContent(
  template: string,
  payload: NotePayload
): Promise<string> {
  eta.configure({ autoEscape: false });
  return (await eta.render(template, {
    bookPath: payload.bookPath,
    title: payload.book.title,
    authors: payload.book.authors,
    chapter: payload.bookmark.chapter,
    highlight: payload.bookmark.notes,
    text: payload.noteItself,
    datetime: payload.bookmark.datetime,
    page: payload.page,
  })) as string;
}

export function buildFrontmatterFromPayload(
  payload: NotePayload,
  content: string
): { [key: string]: FrontMatter } {
  return {
    'koreader-sync': {
      type: NOTE_TYPE_SINGLE,
      uniqueId: payload.uniqueId,
      data: {
        title: payload.book.title,
        authors: payload.book.authors,
        chapter: payload.bookmark.chapter,
        page: payload.page,
        highlight: payload.bookmark.notes,
        datetime: payload.bookmark.datetime,
        text: payload.noteItself,
      },
      metadata: {
        body_hash: crypto.createHash('md5').update(content).digest('hex'),
        keep_in_sync: payload.keepInSync,
        yet_to_be_edited: true,
        managed_book_title: payload.managedBookTitle,
      },
    },
  };
}