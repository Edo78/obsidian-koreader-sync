import {
  buildNotePayloadFromBookmark,
  buildNotePayloadFromFrontmatter,
  buildFrontmatterFromPayload,
  DEFAULT_NOTE_TEMPLATE,
  renderNoteContent,
} from '../src/note-model';

describe('note-model', () => {
  it('builds a consistent payload from bookmark and frontmatter', async () => {
    const book = {
      title: 'Book A',
      authors: 'Author',
      percent_finished: 100,
      bookmarks: {},
      highlight: {},
    };

    const bookmark = {
      chapter: 'Ch 1',
      text: 'Pagina 12 Quote @ 2024-01-01 10:00:00 note',
      datetime: '2024-01-01 10:00:00',
      notes: 'Quote',
      highlighted: true,
      pos0: '1',
      pos1: '2',
      page: '12',
    };

    const payload = buildNotePayloadFromBookmark({
      path: 'koreader',
      uniqueId: 'uid-1',
      book,
      bookmark,
      managedBookTitle: '(book) Book A-Author',
      keepInSync: true,
      noteTitleOptions: { maxWords: 5, maxLength: 25 },
    });

    expect(payload.page).toBe(12);
    expect(payload.noteItself).toBe('note');
    expect(payload.noteTitle).toBe('note');

    const content = await renderNoteContent(DEFAULT_NOTE_TEMPLATE, payload);
    const frontmatter = buildFrontmatterFromPayload(payload, content);

    expect(frontmatter['koreader-sync'].metadata.managed_book_title).toBe(
      '(book) Book A-Author'
    );
    expect(frontmatter['koreader-sync'].data.page).toBe(12);
    expect(frontmatter['koreader-sync'].data.text).toBe('note');

    const payloadFromFrontmatter = buildNotePayloadFromFrontmatter({
      path: 'koreader',
      frontmatter: frontmatter['koreader-sync'],
      noteTitleOptions: { maxWords: 5, maxLength: 25 },
    });

    expect(payloadFromFrontmatter.page).toBe(payload.page);
    expect(payloadFromFrontmatter.noteItself).toBe(payload.noteItself);
    expect(payloadFromFrontmatter.noteTitle).toBe(payload.noteTitle);
  });

  it('uses bookmark.page when text has no page number', () => {
    const book = {
      title: 'Book B',
      authors: 'Author',
      percent_finished: 100,
      bookmarks: {},
      highlight: {},
    };

    const bookmark = {
      chapter: 'Ch 2',
      text: 'No page in note text',
      datetime: '2024-01-01 10:00:00',
      notes: 'Quote',
      highlighted: true,
      pos0: '1',
      pos1: '2',
      page: '14',
    };

    const payload = buildNotePayloadFromBookmark({
      path: 'koreader',
      uniqueId: 'uid-2',
      book,
      bookmark,
      managedBookTitle: '(book) Book B-Author',
      keepInSync: true,
      noteTitleOptions: { maxWords: 5, maxLength: 25 },
    });

    expect(payload.page).toBe(14);
  });

  it('returns null when page is not derivable', () => {
    const book = {
      title: 'Book C',
      authors: 'Author',
      percent_finished: 100,
      bookmarks: {},
      highlight: {},
    };

    const bookmark = {
      chapter: 'Ch 3',
      text: 'Custom note without numbers @ 2024-01-01 10:00:00',
      datetime: '2024-01-01 10:00:00',
      notes: 'Quote',
      highlighted: true,
      pos0: '1',
      pos1: '2',
      page: '/body/DocFragment/body/p[1]/span/text().13',
    };

    const payload = buildNotePayloadFromBookmark({
      path: 'koreader',
      uniqueId: 'uid-3',
      book,
      bookmark,
      managedBookTitle: '(book) Book C-Author',
      keepInSync: true,
      noteTitleOptions: { maxWords: 5, maxLength: 25 },
    });

    expect(payload.page).toBeNull();
  });

  it('sanitizes authors in note title', () => {
    const book = {
      title: 'Book D',
      authors: 'Author One\nAuthor Two',
      percent_finished: 100,
      bookmarks: {},
      highlight: {},
    };

    const bookmark = {
      chapter: 'Ch 4',
      text: '',
      datetime: '2024-01-01 10:00:00',
      notes: 'Some highlight',
      highlighted: true,
      pos0: '1',
      pos1: '2',
      page: '10',
    };

    const payload = buildNotePayloadFromBookmark({
      path: 'koreader',
      uniqueId: 'uid-4',
      book,
      bookmark,
      managedBookTitle: '(book) Book D-Author One Author Two',
      keepInSync: true,
      noteTitleOptions: { maxWords: 5, maxLength: 25 },
    });

    expect(payload.noteTitle).toContain('Author One Author Two');
    expect(payload.noteTitle).not.toContain('\n');
  });
});