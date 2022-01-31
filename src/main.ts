import * as crypto from 'crypto';
import * as eta from 'eta';

import {
  App,
  Editor,
  MarkdownView,
  Plugin,
  PluginSettingTab,
  Setting,
  TAbstractFile,
  TFile,
  normalizePath,
} from 'obsidian';
import matter from 'gray-matter';
import { Book, Bookmark, Books, FrontMatter } from './types';

import { KOReaderMetadata } from './koreader-metadata';

interface KOReaderSettings {
  koreaderBasePath: string;
  obsidianNoteFolder: string;
  noteTitleOptions: TitleOptions;
  bookTitleOptions: TitleOptions;
  keepInSync: boolean;
  aFolderForEachBook: boolean;
  customTemplate: boolean;
  customDataviewTemplate: boolean;
  templatePath?: string;
  dataviewTemplatePath?: string;
  createDataviewQuery: boolean;
  importedNotes: { [key: string]: boolean };
  enbleResetImportedNotes: boolean;
}

const DEFAULT_SETTINGS: KOReaderSettings = {
  importedNotes: {},
  enbleResetImportedNotes: false,
  keepInSync: false,
  aFolderForEachBook: false,
  customTemplate: false,
  customDataviewTemplate: false,
  createDataviewQuery: false,
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
    eta.configure({
      cache: true, // Make Eta cache templates
      autoEscape: false,
    });
    await this.loadSettings();

    const ribbonIconEl = this.addRibbonIcon(
      'documents',
      'Sync your KOReader highlights',
      this.importNotes.bind(this)
    );

    this.addCommand({
      id: 'obsidian-koreader-plugin-sync',
      name: 'Sync',
      callback: () => {
        this.importNotes();
      },
    });

    this.addCommand({
      id: 'obsidian-koreader-plugin-set-edit',
      name: 'Mark this note as Edited',
      editorCallback: (editor: Editor, view: MarkdownView) => {
        this.setFrontmatterProperty(
          `${[KOREADERKEY]}.metadata.yet_to_be_edited`,
          false,
          view
        );
      },
    });

    this.addCommand({
      id: 'obsidian-koreader-plugin-clear-edit',
      name: 'Mark this note as NOT Edited',
      editorCallback: (editor: Editor, view: MarkdownView) => {
        this.setFrontmatterProperty(
          `${[KOREADERKEY]}.metadata.yet_to_be_edited`,
          true,
          view
        );
      },
    });

    this.addCommand({
      id: 'obsidian-koreader-plugin-set-sync',
      name: 'Enable Sync for this note',
      editorCallback: (editor: Editor, view: MarkdownView) => {
        this.setFrontmatterProperty(
          `${[KOREADERKEY]}.metadata.keep_in_sync`,
          true,
          view
        );
      },
    });

    this.addCommand({
      id: 'obsidian-koreader-plugin-clear-sync',
      name: 'Disable Sync for this note',
      editorCallback: (editor: Editor, view: MarkdownView) => {
        this.setFrontmatterProperty(
          `${[KOREADERKEY]}.metadata.keep_in_sync`,
          false,
          view
        );
      },
    });

    this.addCommand({
      id: 'obsidian-koreader-plugin-reset-sync-list',
      name: 'Reset Sync List',
      checkCallback: (checking: boolean) => {
        if (this.settings.enbleResetImportedNotes) {
          if (!checking) {
            this.settings.importedNotes = {};
            this.settings.enbleResetImportedNotes = false;
            this.saveSettings();
          }
          return true;
        }
        return false;
      },
    });

    this.addSettingTab(new KoreaderSettingTab(this.app, this));
  }

  onunload() {}

  async loadSettings() {
    this.settings = { ...DEFAULT_SETTINGS, ...(await this.loadData()) };
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }

  private getObjectProperty(object: { [x: string]: any }, path: string) {
    if (path === undefined || path === null) {
      return object;
    }
    const parts = path.split('.');
    for (let i = 0; i < parts.length; ++i) {
      if (object === undefined || object === null) {
        return undefined;
      }
      const key = parts[i];
      object = object[key];
    }
    return object;
  }

  private setObjectProperty(
    object: { [x: string]: any },
    path: string,
    value: any
  ) {
    const parts = path.split('.');
    const limit = parts.length - 1;
    for (let i = 0; i < limit; ++i) {
      const key = parts[i];
      object = object[key] ?? (object[key] = {});
    }
    const key = parts[limit];
    object[key] = value;
  }

  async setFrontmatterProperty(
    property: string,
    value: any,
    view: MarkdownView
  ) {
    const { data, content } = matter(view.data);
    this.setObjectProperty(data, property, value);
    const val = this.getObjectProperty(data, property);
    const note = matter.stringify(content, data);
    view.setViewData(note, false);
    view.requestSave();
  }

  private async createNote(note: {
    path: string;
    uniqueId: string;
    bookmark: Bookmark;
    managedBookTitle: string;
    book: Book;
    keepInSync?: boolean;
  }) {
    const { path, uniqueId, bookmark, managedBookTitle, book, keepInSync } =
      note;
    // the page is always the first number in the bookmark's text (eg. 'Pagina 12 foo bar')
    const page = bookmark.text ? parseInt(bookmark.text.match(/\d+/g)[0]) : -1;
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

    const defaultTemplate = `## Title: [[<%= it.bookPath %>|<%= it.title %>]]

### by: [[<%= it.authors %>]]

### Chapter: <%= it.chapter %>

Page: <%= it.page %>

**==<%= it.highlight %>==**

<%= it.text %>`;

    const templateFile = this.settings.customTemplate
      ? this.app.vault.getAbstractFileByPath(this.settings.templatePath)
      : null;
    const template = templateFile
      ? await this.app.vault.read(templateFile as TFile)
      : defaultTemplate;
    const bookPath = normalizePath(`${path}/${managedBookTitle}`);
    const content = (await eta.render(template, {
      bookPath,
      title: book.title,
      authors: book.authors,
      chapter: bookmark.chapter,
      highlight: bookmark.notes,
      text: noteItself,
      datetime: bookmark.datetime,
      page,
    })) as string;

    const frontmatterData: { [key: string]: FrontMatter } = {
      [KOREADERKEY]: {
        type: 'koreader-sync-note',
        uniqueId,
        data: {
          title: book.title,
          authors: book.authors,
          chapter: bookmark.chapter,
          page,
          highlight: bookmark.notes,
          datetime: bookmark.datetime,
          text: noteItself,
        },
        metadata: {
          body_hash: crypto.createHash('md5').update(content).digest('hex'),
          keep_in_sync: keepInSync || this.settings.keepInSync,
          yet_to_be_edited: true,
          managed_book_title: managedBookTitle,
        },
      },
    };

    return { content, frontmatterData, notePath };
  }

  async createDataviewQueryPerBook(dataview: {
    path: string;
    managedBookTitle: string;
    title: string;
    percent_finished: number;
  }) {
    const { path, title, managedBookTitle, percent_finished } = dataview;
    const frontMatter = {
      cssclass: 'koreader-sync-dataview',
      [KOREADERKEY]: {
        type: 'koreader-sync-dataview',
        managed_title: managedBookTitle,
        data: {
          title,
          percent_finished,
        },
      },
    };

    const defaultTemplate = `# Title: <%= it.title %>

<progress value="${percent_finished}" max="100"> </progress>
\`\`\`dataviewjs
const title = dv.current()['koreader-sync'].managed_title
dv.pages().where(n => {
return n['koreader-sync'] && n['koreader-sync'].type == 'koreader-sync-note' && n['koreader-sync'].metadata.managed_book_title == title
}).sort(p => p['koreader-sync'].data.page).forEach(p => dv.paragraph(dv.fileLink(p.file.name, true), {style: 'test-css'}))
\`\`\`
    `;

    const templateFile = this.settings.customDataviewTemplate
      ? this.app.vault.getAbstractFileByPath(this.settings.dataviewTemplatePath)
      : null;
    const template = templateFile
      ? await this.app.vault.read(templateFile as TFile)
      : defaultTemplate;
    const content = (await eta.render(template, {
      title,
    })) as string;
    this.app.vault.create(
      `${path}/${managedBookTitle}.md`,
      matter.stringify(content, frontMatter)
    );
  }

  async importNotes() {
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
      // if the setting aFolderForEachBook is true, we add the managedBookTitle to the path specified in obsidianNoteFolder
      const path = this.settings.aFolderForEachBook
        ? `${this.settings.obsidianNoteFolder}/${managedBookTitle}`
        : this.settings.obsidianNoteFolder;
      // if aFolderForEachBook is set, create a folder for each book
      if (this.settings.aFolderForEachBook) {
        if (!this.app.vault.getAbstractFileByPath(path)) {
          this.app.vault.createFolder(path);
        }
      }
      // if createDataviewQuery is set, create a dataview query, for each book, with the book's managed title (if it doesn't exist)
      if (
        this.settings.createDataviewQuery &&
        !this.app.vault.getAbstractFileByPath(`${path}/${managedBookTitle}.md`)
      ) {
        this.createDataviewQueryPerBook({
          path,
          managedBookTitle,
          title: data[book].title,
          percent_finished: data[book].percent_finished * 100,
        });
      }

      for (const bookmark in data[book].bookmarks) {
        const updateNote: boolean = false;
        const uniqueId = crypto
          .createHash('md5')
          .update(
            `${data[book].title} - ${data[book].authors} - ${data[book].bookmarks[bookmark].pos0} - ${data[book].bookmarks[bookmark].pos1}`
          )
          .digest('hex');

        // if the note is not yet imported, we create it
        if (!Object.keys(this.settings.importedNotes).includes(uniqueId)) {
          if (!Object.keys(existingNotes).includes(uniqueId)) {
            const { content, frontmatterData, notePath } =
              await this.createNote({
                path,
                uniqueId,
                bookmark: data[book].bookmarks[bookmark],
                managedBookTitle,
                book: data[book],
                keepInSync: this.settings.keepInSync,
              });

            this.app.vault.create(
              `${notePath}.md`,
              matter.stringify(content, frontmatterData)
            );
          }
          this.settings.importedNotes[uniqueId] = true;
          // else if the note exists and keep_in_sync is true and yet_to_be_edited is false, we update it
        } else if (
          Object.keys(existingNotes).includes(uniqueId) &&
          existingNotes[uniqueId].keep_in_sync &&
          !existingNotes[uniqueId].yet_to_be_edited
        ) {
          const note = existingNotes[uniqueId].note as TFile;
          const { content, frontmatterData, notePath } = await this.createNote({
            path,
            uniqueId,
            bookmark: data[book].bookmarks[bookmark],
            managedBookTitle,
            book: data[book],
            keepInSync: existingNotes[uniqueId]?.keep_in_sync,
          });

          this.app.vault.modify(
            note,
            matter.stringify(content, frontmatterData)
          );
        }
      }
    }
    await this.saveSettings();
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
      .setDesc('Eg. /media/<user>/KOBOeReader')
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

    containerEl.createEl('h2', { text: 'View settings' });

    new Setting(containerEl)
      .setName('Custom template')
      .setDesc('Use a custom template for the notes')
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.customTemplate)
          .onChange(async (value) => {
            this.plugin.settings.customTemplate = value;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName('Template file')
      .setDesc('The template file to use. Remember to add the ".md" extension')
      .addText((text) =>
        text
          .setPlaceholder('templates/note.md')
          .setValue(this.plugin.settings.templatePath)
          .onChange(async (value) => {
            this.plugin.settings.templatePath = value;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName('Custom book template')
      .setDesc('Use a custom template for the dataview')
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.customDataviewTemplate)
          .onChange(async (value) => {
            this.plugin.settings.customDataviewTemplate = value;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName('Book template file')
      .setDesc('The template file to use. Remember to add the ".md" extension')
      .addText((text) =>
        text
          .setPlaceholder('templates/template-book.md')
          .setValue(this.plugin.settings.dataviewTemplatePath)
          .onChange(async (value) => {
            this.plugin.settings.dataviewTemplatePath = value;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName('Create a dataview query')
      .setDesc(
        createFragment((frag) => {
          frag.appendText(
            'Create a note (for each book) with a dataview query (read the '
          );
          frag.createEl(
            'a',
            {
              text: 'documentation',
              href: 'https://github.com/Edo78/obsidian-koreader-sync#dateview-embedded',
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
          .setValue(this.plugin.settings.createDataviewQuery)
          .onChange(async (value) => {
            this.plugin.settings.createDataviewQuery = value;
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

    containerEl.createEl('h2', { text: 'DANGER ZONE' });

    new Setting(containerEl)
      .setName('Enable reset of imported notes')
      .setDesc(
        "Enable the command to empty the list of imported notes in case you can't recover from the trash one or more notes"
      )
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.enbleResetImportedNotes)
          .onChange(async (value) => {
            this.plugin.settings.enbleResetImportedNotes = value;
            await this.plugin.saveSettings();
          })
      );
  }
}
