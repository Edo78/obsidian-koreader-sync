const crypto = require('crypto');
const matter = require('gray-matter');

function generateBookDataviewMarkdown(book, options) {
  const managedBookTitle = options?.managedBookTitle ?? `(book) ${book.title}-`;
  const keepInSync = options?.keepInSync ?? true;
  const percent_finished =
    options?.percentFinishedOverride ?? (book.percent_finished ?? 100);

  const frontMatter = {
    cssclass: 'koreader-sync-dataview',
    'koreader-sync': {
      uniqueId: crypto
        .createHash('md5')
        .update(`${book.title} - ${book.authors}`)
        .digest('hex'),
      type: 'koreader-sync-dataview',
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

  const content = `# Title: ${book.title}\n<progress value=\"${percent_finished}\" max=\"100\"> </progress>\n\n\`\`\`dataviewjs\nconst title = dv.current()['koreader-sync'].metadata.managed_title\ndv.pages().where(n => {\nreturn n['koreader-sync'] && n['koreader-sync'].type == 'koreader-sync-note' && n['koreader-sync'].metadata.managed_book_title == title\n}).sort(p => p['koreader-sync'].data.page).forEach(p => dv.paragraph(dv.fileLink(p.file.name, true), {style: 'test-css'}))\n\`\`\``;
  return matter.stringify(content, frontMatter);
}

module.exports = { generateBookDataviewMarkdown };
