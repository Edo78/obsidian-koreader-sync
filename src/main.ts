import { App, Plugin, PluginSettingTab, Setting, normalizePath } from 'obsidian';
import * as matter from 'gray-matter';
import * as crypto from 'crypto';
import { Books } from './types';
import { KOReaderMetadata } from './koreader-metadata';

interface KOReaderSettings {
  koreaderBasePath: string;
  obsidianNoteFolder: string;
}

const DEFAULT_SETTINGS: KOReaderSettings = {
  koreaderBasePath: '/media/user/KOBOeReader',
  obsidianNoteFolder: '/',
};

interface TitleOptions {
  prefix?: string;
  suffix?: string;
  maxLength?: number;
  maxWords?: number;
}

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
      title = title.substring(0, options.maxLength) + '...';
    }
    // if options.maxWords is set, trim the title to that number of words and add '...'
    if (options.maxWords && title.split(' ').length > options.maxWords) {
      title = title.split(' ').slice(0, options.maxWords).join(' ') + '...';
    }

    return `${options.prefix || ''}${title}${options.suffix || ''}`;
  }

  async onload() {
    await this.loadSettings();

    const ribbonIconEl = this.addRibbonIcon(
      'documents',
      'KOReader Plugin',
      async (evt: MouseEvent) => {
        const metadata = new KOReaderMetadata(this.settings.koreaderBasePath);
        const data: Books = await metadata.scan();

        const existingFiles = this.app.vault.getMarkdownFiles().map((file) => file.path);
        const existingNotes = this.app.vault.getMarkdownFiles().map((f) => {
          const fm = this.app.metadataCache.getFileCache(f)?.frontmatter;
          return (fm?.['koreader-sync']?.['uniqueId'])
        });

        for (const book in data) {
          for (const bookmark in data[book].bookmarks) {
            const uniqueId = crypto.createHash('md5').update(`${data[book].title} - ${data[book].authors} - ${data[book].bookmarks[bookmark].pos0} - ${data[book].bookmarks[bookmark].pos1}`).digest("hex");
            if (existingNotes.includes(uniqueId)) {
              continue;
            }
            const note = data[book].bookmarks[bookmark];
            const noteItself = note.text ? note.text
              .split(data[book].bookmarks[bookmark].datetime)[1]
              .replace(/^\s+|\s+$/g, '') : '';
            const noteTitle = noteItself ?
              this.manageTitle(noteItself) :
              `${this.manageTitle(data[book].title)} - ${data[book].authors}`;

            const frontmatterData = {
              'koreader-sync': {
                'uniqueId': uniqueId,
              },
            };
            const content = `# Title: [[${this.manageTitle(data[book].title)} - ${data[book].authors}|${data[book].title}]]
by: [[${data[book].authors}]]
## Chapter: ${note.chapter}
**==${note.notes}==**

${noteItself}
`;
            const path =
              this.settings.obsidianNoteFolder === '/'
                ? ''
                : `${this.settings.obsidianNoteFolder}/`;
            const notePath = normalizePath(`${path}${noteTitle}.md`);
            this.app.vault.create(notePath, matter.stringify(content, frontmatterData));
          }
        }
      }
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

    containerEl.createEl('h2', { text: 'KOReader plugin settings' });

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
        const folders = Object.keys(files).filter((key) => files[key].type === 'folder');
        console.log(folders);
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
  }
}
