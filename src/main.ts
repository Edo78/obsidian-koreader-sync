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
  Notice,
} from 'obsidian';
import matter from 'gray-matter';
import * as Diff from 'diff';
import { Book, Bookmark, Books, FrontMatter } from './types';
import {
  DEFAULT_DATAVIEW_TEMPLATE,
  buildBookDataviewFrontMatter,
  renderBookDataviewContent,
} from './markdown-generator';
import {
  DEFAULT_NOTE_TEMPLATE,
  buildFrontmatterFromPayload,
  buildNotePayloadFromBookmark,
  buildNotePayloadFromFrontmatter,
  renderNoteContent,
  sanitizeForPath,
} from './note-model';

import { KOReaderMetadata } from './koreader-metadata';

enum ErrorType {
  NO_PLACEHOLDER_FOUND = 'NO_PLACEHOLDER_FOUND',
  NO_PLACEHOLDER_NOTE_CREATED = 'NO_PLACEHOLDER_NOTE_CREATED',
}

enum NoteType {
  SINGLE_NOTE = 'koreader-sync-note',
  BOOK_NOTE = 'koreader-sync-dataview',
}

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
  enableTest: boolean;
  testBasePath?: string; // Nuovo campo
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
  enableTest: false,
  testBasePath: '/path/to/test/files', // Valore predefinito
};

interface TitleOptions {
  prefix?: string;
  suffix?: string;
  maxLength?: number;
  maxWords?: number;
}

const KOREADERKEY = 'koreader-sync';
const NOTE_TEXT_PLACEHOLDER = 'placeholder';

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

    // listen for note changes to update the frontmatter
    this.app.metadataCache.on('changed', async (file: TAbstractFile) => {
      try {
        await this.updateMetadataText(file as TFile);
      } catch (e) {
        console.error(e);
        new Notice(`Error updating metadata text: ${e.message}`);
      }
    });

    this.addRibbonIcon(
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
      editorCheckCallback: (
        checking: boolean,
        editor: Editor,
        view: MarkdownView
      ) => {
        const propertyPath = `${[KOREADERKEY]}.metadata.yet_to_be_edited`;
        if (checking) {
          if (this.getFrontmatterProperty(propertyPath, view) === true) {
            return true;
          }
          return false;
        }
        this.setFrontmatterProperty(propertyPath, false, view);
      },
    });

    this.addCommand({
      id: 'obsidian-koreader-plugin-clear-edit',
      name: 'Mark this note as NOT Edited',
      editorCheckCallback: (
        checking: boolean,
        editor: Editor,
        view: MarkdownView
      ) => {
        const propertyPath = `${[KOREADERKEY]}.metadata.yet_to_be_edited`;
        if (checking) {
          if (this.getFrontmatterProperty(propertyPath, view) === false) {
            return true;
          }
          return false;
        }
        this.setFrontmatterProperty(propertyPath, true, view);
      },
    });

    this.addCommand({
      id: 'obsidian-koreader-plugin-set-sync',
      name: 'Enable Sync for this note',
      editorCheckCallback: (
        checking: boolean,
        editor: Editor,
        view: MarkdownView
      ) => {
        const propertyPath = `${[KOREADERKEY]}.metadata.keep_in_sync`;
        if (checking) {
          if (this.getFrontmatterProperty(propertyPath, view) === false) {
            return true;
          }
          return false;
        }
        this.setFrontmatterProperty(propertyPath, true, view);
      },
    });

    this.addCommand({
      id: 'obsidian-koreader-plugin-clear-sync',
      name: 'Disable Sync for this note',
      editorCheckCallback: (
        checking: boolean,
        editor: Editor,
        view: MarkdownView
      ) => {
        const propertyPath = `${[KOREADERKEY]}.metadata.keep_in_sync`;
        if (checking) {
          if (this.getFrontmatterProperty(propertyPath, view) === true) {
            return true;
          }
          return false;
        }
        this.setFrontmatterProperty(propertyPath, false, view);
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

    this.addCommand({
      id: 'obsidian-koreader-plugin-test',
      name: 'Test',
      callback: () => {
        this.test();
      }
    })

    this.addSettingTab(new KoreaderSettingTab(this.app, this));
  }

  onunload() {
    // this method is called when the plugin is deactivated
  }

  async loadSettings() {
    this.settings = { ...DEFAULT_SETTINGS, ...(await this.loadData()) };
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }

  async test() {
    this.settings.enableTest = !this.settings.enableTest;
    await this.saveSettings();
    new Notice(`Test mode ${this.settings.enableTest ? 'enabled' : 'disabled'}`);
  }

  private async updateMetadataText(file: TFile) {
    const originalNote = await this.app.vault.cachedRead(file);
    const text = await this.extractTextFromNote(originalNote);
    if (text) {
      // new Notice(`Text extracted: ${text}`);
      const { data, content } = matter(originalNote, {});
      const propertyPath = `${[KOREADERKEY]}.data.text`;
      this.setObjectProperty(data, propertyPath, text);
      const yetToBeEditedPropertyPath = `${[
        KOREADERKEY,
      ]}.metadata.yet_to_be_edited`;
      this.setObjectProperty(data, yetToBeEditedPropertyPath, false);
      this.app.vault.modify(file as TFile, matter.stringify(content, data, {}));
    } else {
      // new Notice('Text extraction failed');
    }
  }

  // to detect where the note's text is in the whole document
  // I'll create a new document with a 'placeholder' text and compare the two notes
  // the text added where the 'placeholder' text is removed is the new text of the note
  private async extractTextFromNote(note: string): Promise<string | void> {
    const { data, content: originalContent } = matter(note, {}) as unknown as {
      data: { [key: string]: FrontMatter };
      content: string;
    };
    // create a new note with the same frontmatter and content created with the same template
    // and noteItself equal to 'placeholder'
    const frontMatter = data[KOREADERKEY];
    // exit if it's not a koreader note
    if (!frontMatter || frontMatter.type !== NoteType.SINGLE_NOTE) {
      return;
    }
    const path = this.settings.aFolderForEachBook
      ? `${this.settings.obsidianNoteFolder}/${frontMatter.metadata.managed_book_title}`
      : this.settings.obsidianNoteFolder;
    // this is one of the worste things I've ever done and I'm sorry
    // please don't judge me, i'm going to refactor this
    // ideally using the same object as argument of the createNote function,
    // for the template and in the frontmatter
    let diff;
    try {
      const payload = buildNotePayloadFromFrontmatter({
        path,
        frontmatter: frontMatter,
        noteTitleOptions: this.settings.noteTitleOptions,
        normalizePath,
      });
      const placeholderPayload = {
        ...payload,
        noteItself: NOTE_TEXT_PLACEHOLDER,
      };
      const template = await this.getNoteTemplate();
      const newContent = await renderNoteContent(
        template,
        placeholderPayload
      );
      diff = Diff.diffTrimmedLines(originalContent, newContent);
    } catch (e) {
      console.error(e);
      throw new Error(ErrorType.NO_PLACEHOLDER_NOTE_CREATED);
    }

    // extract from 'diff' the new text of the note
    // in the array is the element before the one whit 'added' to true and 'value' is 'placeholder'
    const placeholderIndex = diff.findIndex(
      (element) => element.added && element.value === NOTE_TEXT_PLACEHOLDER
    );
    if (placeholderIndex === -1) {
      throw new Error(ErrorType.NO_PLACEHOLDER_FOUND);
    }
    // the new text is the value of the element before the placeholder index
    const newText = diff[placeholderIndex - 1].value;
    // exit if the new text is the same as the text in the frontmatter
    if (newText === frontMatter.data.text) {
      return;
    }
    return newText;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    object: { [x: string]: any },
    path: string,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
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

  setFrontmatterProperty(property: string, value: boolean, view: MarkdownView) {
    const { data, content } = matter(view.data, {});
    this.setObjectProperty(data, property, value);
    const note = matter.stringify(content, data);
    view.setViewData(note, false);
    view.requestSave();
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  getFrontmatterProperty(property: string, view: MarkdownView): any {
    const { data } = matter(view.data, {});
    return this.getObjectProperty(data, property);
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
    const payload = buildNotePayloadFromBookmark({
      path,
      uniqueId,
      book,
      bookmark,
      managedBookTitle,
      keepInSync: keepInSync ?? this.settings.keepInSync,
      noteTitleOptions: this.settings.noteTitleOptions,
      normalizePath,
    });

    const template = await this.getNoteTemplate();
    const content = await renderNoteContent(template, payload);
    const frontmatterData = buildFrontmatterFromPayload(payload, content);
    const notePath = normalizePath(`${path}/${payload.noteTitle}`);

    return { content, frontmatterData, notePath };
  }

  private async getNoteTemplate() {
    const templateFile = this.settings.customTemplate
      ? this.app.vault.getAbstractFileByPath(this.settings.templatePath)
      : null;
    return templateFile
      ? await this.app.vault.read(templateFile as TFile)
      : DEFAULT_NOTE_TEMPLATE;
  }

  async createDataviewQueryPerBook(
    dataview: {
      path: string;
      managedBookTitle: string;
      book: Book;
    },
    updateNote?: TFile
  ) {
    const { path, book, managedBookTitle } = dataview;
    let { keepInSync } = this.settings;
    if (updateNote) {
      const { data } = matter(
        await this.app.vault.read(updateNote),
        {}
      );
      keepInSync = data[KOREADERKEY].metadata.keep_in_sync;
      const yetToBeEdited = data[KOREADERKEY].metadata.yet_to_be_edited;
      if (!keepInSync || !yetToBeEdited) {
        return;
      }
    }
    const frontMatter = buildBookDataviewFrontMatter({
      book,
      managedBookTitle,
      keepInSync,
    });

    const templateFile = this.settings.customDataviewTemplate
      ? this.app.vault.getAbstractFileByPath(this.settings.dataviewTemplatePath)
      : null;
    const template = templateFile
      ? await this.app.vault.read(templateFile as TFile)
      : DEFAULT_DATAVIEW_TEMPLATE;
    const content = await renderBookDataviewContent(
      template,
      frontMatter[KOREADERKEY]
    );
    if (updateNote) {
      this.app.vault.modify(updateNote, matter.stringify(content, frontMatter));
    } else {
      this.app.vault.create(
        `${path}/${managedBookTitle}.md`,
        matter.stringify(content, frontMatter)
      );
    }
  }

  async importNotes() {
    console.log("Sync started");
    const basePath = this.settings.enableTest 
      ? this.settings.testBasePath 
      : this.settings.koreaderBasePath;
    if (this.settings.enableTest) {
      console.log("[TEST MODE] KOReader Sync is running in test mode");
      console.log("Test base path:", this.settings.testBasePath);
      console.log("KOReaderMetadata basePath:", basePath);
    }
    let data: Books;
    try {
      const metadata = new KOReaderMetadata(basePath);
      data = await metadata.scan();
    } catch (e) {
      console.error(e);
      new Notice(
        `KOReader path not found or not readable: ${basePath}. ` +
          'Use the device root (drive letter) or the folder containing .sdr.'
      );
      return;
    }
    if (!Object.keys(data).length) {
      new Notice(
        `No KOReader metadata found at ${basePath}. ` +
          'Make sure it points to the device root or the folder containing .sdr.'
      );
      return;
    }
    if (this.settings.enableTest) {
      console.log("[TEST MODE] Parsed KOReader metadata:", JSON.stringify(data, null, 2));
    }

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
      if (this.settings.enableTest) {
        console.log(`[TEST MODE] Processing book: ${book}`);
        console.log(`[TEST MODE] Book data:`, JSON.stringify(data[book], null, 2));
      }
      const managedBookTitle = sanitizeForPath(
        `${this.manageTitle(
          data[book].title,
          this.settings.bookTitleOptions
        )}-${sanitizeForPath(data[book].authors)}`
      );
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
      if (this.settings.createDataviewQuery) {
        this.createDataviewQueryPerBook(
          {
            path,
            managedBookTitle,
            book: data[book],
          },
          this.app.vault.getAbstractFileByPath(
            `${path}/${managedBookTitle}.md`
          ) as TFile
        );
      }

      for (const bookmark in data[book].bookmarks) {
        if (this.settings.enableTest) {
          console.log(`[TEST MODE] Processing bookmark: ${bookmark}`);
          console.log(`[TEST MODE] Bookmark data:`, JSON.stringify(data[book].bookmarks[bookmark], null, 2));
        }
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
          const { content, frontmatterData } = await this.createNote({
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
            this.plugin.settings.koreaderBasePath = value;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName('Highlights folder location')
      .setDesc('Vault folder to use for writing book highlight notes')
      .addDropdown((dropdown) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
          })
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

    containerEl.createEl('h2', { text: 'Debug settings' });

    const debugContainer = containerEl.createDiv();

    new Setting(debugContainer)
      .setName('Enable test mode')
      .setDesc('Toggle test mode on/off')
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.enableTest)
          .onChange(async (value) => {
            this.plugin.settings.enableTest = value;
            // Mostra/nascondi il campo testBasePath in base al valore di enableTest
            testPathSetting.settingEl.style.display = value ? 'flex' : 'none';
            await this.plugin.saveSettings();
          })
      );

    const testPathSetting = new Setting(debugContainer)
      .setName('Test files path')
      .setDesc('Path to test files directory')
      .addText((text) =>
        text
          .setPlaceholder('/path/to/test/files')
          .setValue(this.plugin.settings.testBasePath)
          .onChange(async (value) => {
            this.plugin.settings.testBasePath = value;
            await this.plugin.saveSettings();
          })
      );

    // Imposta la visibilità iniziale del campo testBasePath
    testPathSetting.settingEl.style.display = this.plugin.settings.enableTest ? 'flex' : 'none';
  }
}
