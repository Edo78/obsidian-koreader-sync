import {
  App,
  Plugin,
  PluginSettingTab,
  Setting,
  normalizePath,
  TAbstractFile,
} from 'obsidian';
import * as matter from 'gray-matter';
import * as crypto from 'crypto';
import { Book, Bookmark, Books, FrontMatter } from './types';
import { KOReaderMetadata } from './koreader-metadata';

interface KOReaderSettings {
  koreaderBasePath: string;
  obsidianNoteFolder: string;
  noteTitleOptions: TitleOptions;
  bookTitleOptions: TitleOptions;
  keepInSync: boolean;
  aFolderForEachBook: boolean;
}

const DEFAULT_SETTINGS: KOReaderSettings = {
  keepInSync: false,
  aFolderForEachBook: false,
  koreaderBasePath: '/media/user/KOBOeReader',
  obsidianNoteFolder: '/',
  noteTitleOptions: {
    maxWords: 5,
    maxLength: 25,
  },
  bookTitleOptions: {
    maxWords: 5,
    maxLength: 25,
    prefix: '(book) ',
  },
};

interface TitleOptions {
  prefix?: string;
  suffix?: string;
  maxLength?: number;
  maxWords?: number;
}

const KOREADERKEY = 'koreader-sync';

export default class KOReader extends Plugin {
  settings: KOReaderSettings;

  private manageTitle(title: string, options: TitleOptions = {}): string {
    // replace \ / and : with _
    title = title.replace(/\\|\/|:/g, '_');
    // replace multiple underscores with one underscore
    title = title.replace(/_+/g, '_');
    // remove leading and trailing whitespace
    title = title.trim();
    // remove leading and trailing underscores
    title = title.replace(/^_+|_+$/g, '');
    // replace multiple spaces with one space
    title = title.replace(/\s+/g, ' ');
    // if options.maxLength is set, trim the title to that length and add '...'
    if (options.maxLength && title.length > options.maxLength) {
      title = `${title.substring(0, options.maxLength)}...`;
    }
    // if options.maxWords is set, trim the title to that number of words and add '...'
    if (options.maxWords && title.split(' ').length > options.maxWords) {
      title = `${title.split(' ').slice(0, options.maxWords).join(' ')}...`;
    }

    return `${options.prefix || ''}${title}${options.suffix || ''}`;
  }

  async onload() {
    await this.loadSettings();

    const ribbonIconEl = this.addRibbonIcon(
      'documents',
      'KOReader Plugin',
      this.importNotes.bind(this)
    );

    this.addSettingTab(new KoreaderSettingTab(this.app, this));
  }

  onunload() { }

  async loadSettings() {
    this.settings = { ...DEFAULT_SETTINGS, ...(await this.loadData()) };
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }

  private createNote(note: {
    path: string;
    uniqueId: string;
    bookmark: Bookmark;
    managedBookTitle: string;
    book: Book;
    keepInSync?: boolean;
  }) {
    const { path, uniqueId, bookmark, managedBookTitle, book, keepInSync } =
      note;
    const noteItself = bookmark.text
      ? bookmark.text.split(bookmark.datetime)[1].replace(/^\s+|\s+$/g, '')
      : '';
    const noteTitle = noteItself
      ? this.manageTitle(noteItself, this.settings.noteTitleOptions)
      : `${this.manageTitle(
        bookmark.notes,
        this.settings.noteTitleOptions
      )} - ${book.authors}`;
    const notePath = normalizePath(`${path}/${noteTitle}`);

    const content = `# Title: [[${normalizePath(
      `${path}/${managedBookTitle}`
    )}|${book.title}]]
by: [[${book.authors}]]
## Chapter: ${bookmark.chapter}
**==${bookmark.notes}==**

${noteItself}
`;

    const frontmatterData: { [key: string]: FrontMatter } = {
      [KOREADERKEY]: {
        uniqueId,
        data: {
          title: book.title,
          authors: book.authors,
          chapter: bookmark.chapter,
          highlight: bookmark.notes,
          datetime: bookmark.datetime,
        },
        metadata: {
          body_hash: crypto.createHash('md5').update(content).digest('hex'),
          keep_in_sync: keepInSync || this.settings.keepInSync,
          yet_to_be_edited: true,
        },
      },
    };

    return { content, frontmatterData, notePath };
  }

  async importNotes(evt: MouseEvent) {
    const metadata = new KOReaderMetadata(this.settings.koreaderBasePath);
    const data: Books = await metadata.scan();

    // create a list of notes already imported in obsidian
    const existingNotes: {
      [key: string]: {
        keep_in_sync: boolean;
        yet_to_be_edited: boolean;
        note: TAbstractFile;
      };
    } = {};
    this.app.vault.getMarkdownFiles().forEach((f) => {
      const fm = this.app.metadataCache.getFileCache(f)?.frontmatter;
      if (fm?.[KOREADERKEY]?.uniqueId) {
        existingNotes[fm[KOREADERKEY].uniqueId] = {
          keep_in_sync: fm[KOREADERKEY].metadata.keep_in_sync,
          yet_to_be_edited: fm[KOREADERKEY].metadata.yet_to_be_edited,
          note: f,
        };
      }
    });

    for (const book in data) {
      const managedBookTitle = `${this.manageTitle(
        data[book].title,
        this.settings.bookTitleOptions
      )}-${data[book].authors}`;
      // if aFolderForEachBook is set, create a folder for each book
      if (this.settings.aFolderForEachBook) {
        const bookPath = normalizePath(
          `${this.settings.obsidianNoteFolder}/${managedBookTitle}`
        );
        if (!this.app.vault.getAbstractFileByPath(bookPath)) {
          this.app.vault.createFolder(bookPath);
        }
      }
      for (const bookmark in data[book].bookmarks) {
        const uniqueId = crypto
          .createHash('md5')
          .update(
            `${data[book].title} - ${data[book].authors} - ${data[book].bookmarks[bookmark].pos0} - ${data[book].bookmarks[bookmark].pos1}`
          )
          .digest('hex');

        if (Object.keys(existingNotes).includes(uniqueId)) {
          // if the user wants to keep the note in sync, we delete only if the note is not yet_to_be_edited
          if (
            existingNotes[uniqueId].keep_in_sync &&
            existingNotes[uniqueId].yet_to_be_edited
          ) {
            this.app.vault.delete(existingNotes[uniqueId].note);
          } else {
            continue;
          }
        }
        // if the setting aFolderForEachBook is true, we add the managedBookTitle to the path specified in obsidianNoteFolder
        const path = this.settings.aFolderForEachBook
          ? `${this.settings.obsidianNoteFolder}/${managedBookTitle}`
          : this.settings.obsidianNoteFolder;
        const { content, frontmatterData, notePath } = this.createNote({
          path,
          uniqueId,
          bookmark: data[book].bookmarks[bookmark],
          managedBookTitle,
          book: data[book],
          keepInSync:
            existingNotes[uniqueId]?.keep_in_sync || this.settings.keepInSync,
        });

        this.app.vault.create(
          `${notePath}.md`,
          matter.stringify(content, frontmatterData)
        );
      }
    }
  }
}

class KoreaderSettingTab extends PluginSettingTab {
  plugin: KOReader;

  constructor(app: App, plugin: KOReader) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;

    containerEl.empty();

    containerEl.createEl('h2', { text: 'KOReader general settings' });

    new Setting(containerEl)
      .setName('KOReader mounted path')
      .setDesc('/media/<user>/KOBOeReader')
      .addText((text) =>
        text
          .setPlaceholder('Enter the path wher KOReader is mounted')
          .setValue(this.plugin.settings.koreaderBasePath)
          .onChange(async (value) => {
            console.log(`Path: ${value}`);
            this.plugin.settings.koreaderBasePath = value;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName('Highlights folder location')
      .setDesc('Vault folder to use for writing book highlight notes')
      .addDropdown((dropdown) => {
        const { files } = this.app.vault.adapter as any;
        const folders = Object.keys(files).filter(
          (key) => files[key].type === 'folder'
        );
        folders.forEach((val) => {
          dropdown.addOption(val, val);
        });
        return dropdown
          .setValue(this.plugin.settings.obsidianNoteFolder)
          .onChange(async (value) => {
            this.plugin.settings.obsidianNoteFolder = value;
            await this.plugin.saveSettings();
          });
      });

    new Setting(containerEl)
      .setName('Keep in sync')
      .setDesc(
        createFragment((frag) => {
          frag.appendText('Keep notes in sync with KOReader (read the ');
          frag.createEl(
            'a',
            {
              text: 'documentation',
              href: 'https://github.com/Edo78/obsidian-koreader-sync#sync',
            },
            (a) => {
              a.setAttr('target', '_blank');
            }
          );
          frag.appendText(')');
        })
      )
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.keepInSync)
          .onChange(async (value) => {
            this.plugin.settings.keepInSync = value;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName('Create a folder for each book')
      .setDesc(
        'All the notes from a book will be saved in a folder named after the book'
      )
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.aFolderForEachBook)
          .onChange(async (value) => {
            this.plugin.settings.aFolderForEachBook = value;
            await this.plugin.saveSettings();
          })
      );

    containerEl.createEl('h2', { text: 'Note title settings' });

    new Setting(containerEl).setName('Prefix').addText((text) =>
      text
        .setPlaceholder('Enter the prefix')
        .setValue(this.plugin.settings.noteTitleOptions.prefix)
        .onChange(async (value) => {
          this.plugin.settings.noteTitleOptions.prefix = value;
          await this.plugin.saveSettings();
        })
    );
    new Setting(containerEl).setName('Suffix').addText((text) =>
      text
        .setPlaceholder('Enter the suffix')
        .setValue(this.plugin.settings.noteTitleOptions.suffix)
        .onChange(async (value) => {
          this.plugin.settings.noteTitleOptions.suffix = value;
          await this.plugin.saveSettings();
        })
    );
    new Setting(containerEl)
      .setName('Max words')
      .setDesc(
        'If is longer than this number of words, it will be truncated and "..." will be appended before the optional suffix'
      )
      .addSlider((number) =>
        number
          .setDynamicTooltip()
          .setLimits(0, 10, 1)
          .setValue(this.plugin.settings.noteTitleOptions.maxWords)
          .onChange(async (value) => {
            this.plugin.settings.noteTitleOptions.maxWords = value;
            await this.plugin.saveSettings();
          })
      );
    new Setting(containerEl)
      .setName('Max length')
      .setDesc(
        'If is longer than this number of characters, it will be truncated and "..." will be appended before the optional suffix'
      )
      .addSlider((number) =>
        number
          .setDynamicTooltip()
          .setLimits(0, 50, 1)
          .setValue(this.plugin.settings.noteTitleOptions.maxLength)
          .onChange(async (value) => {
            this.plugin.settings.noteTitleOptions.maxLength = value;
            await this.plugin.saveSettings();
          })
      );

    containerEl.createEl('h2', { text: 'Book title settings' });

    new Setting(containerEl).setName('Prefix').addText((text) =>
      text
        .setPlaceholder('Enter the prefix')
        .setValue(this.plugin.settings.bookTitleOptions.prefix)
        .onChange(async (value) => {
          this.plugin.settings.bookTitleOptions.prefix = value;
          await this.plugin.saveSettings();
        })
    );
    new Setting(containerEl).setName('Suffix').addText((text) =>
      text
        .setPlaceholder('Enter the suffix')
        .setValue(this.plugin.settings.bookTitleOptions.suffix)
        .onChange(async (value) => {
          this.plugin.settings.bookTitleOptions.suffix = value;
          await this.plugin.saveSettings();
        })
    );
    new Setting(containerEl)
      .setName('Max words')
      .setDesc(
        'If is longer than this number of words, it will be truncated and "..." will be appended before the optional suffix'
      )
      .addSlider((number) =>
        number
          .setDynamicTooltip()
          .setLimits(0, 10, 1)
          .setValue(this.plugin.settings.bookTitleOptions.maxWords)
          .onChange(async (value) => {
            this.plugin.settings.bookTitleOptions.maxWords = value;
            await this.plugin.saveSettings();
          })
      );
    new Setting(containerEl)
      .setName('Max length')
      .setDesc(
        'If is longer than this number of characters, it will be truncated and "..." will be appended before the optional suffix'
      )
      .addSlider((number) =>
        number
          .setDynamicTooltip()
          .setLimits(0, 50, 1)
          .setValue(this.plugin.settings.bookTitleOptions.maxLength)
          .onChange(async (value) => {
            this.plugin.settings.bookTitleOptions.maxLength = value;
            await this.plugin.saveSettings();
          })
      );
  }
}
