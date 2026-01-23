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
});