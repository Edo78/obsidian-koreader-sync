import { App, Editor, MarkdownView, Modal, Notice, Plugin, PluginSettingTab, Setting, addIcon } from 'obsidian';
import { KOReaderMetadata } from './koreader-metadata';
import { Books } from './types';

interface KOReaderSettings {
	koreaderBasePath: string;
  obsidianNoteFolder: string;
}

const DEFAULT_SETTINGS: KOReaderSettings = {
	koreaderBasePath: '/media/user/KOBOeReader',
  obsidianNoteFolder: '/'
}

export default class KOReader extends Plugin {
	settings: KOReaderSettings;

	async onload() {
		await this.loadSettings();

		const ribbonIconEl = this.addRibbonIcon('documents', 'KOReader Plugin', async (evt: MouseEvent) => {
			const metadata = new KOReaderMetadata(this.settings.koreaderBasePath);
			const data: Books = await metadata.scan();
			// console.log(JSON.stringify(data, null, 2));
			
			const existingFiles = this.app.vault.getMarkdownFiles().map(file => file.path);

			for (const book in data) {
				for (const bookmark in data[book].bookmarks) {
          const note = data[book].bookmarks[bookmark];
          const noteTitle = note.text.split(data[book].bookmarks[bookmark].datetime)[1].replace(/^\s+|\s+$/g, '');
					const body = `# Title: [[${data[book].title} - ${data[book].authors}|${data[book].title}]]
by: [[${data[book].authors}]]
## Chapter: ${note.chapter}
**==${note.notes}==**

${noteTitle}
`;
					const path = this.settings.obsidianNoteFolder === '/' ? '' : this.settings.obsidianNoteFolder + '/';
					const notePath = `${path}${noteTitle} (${bookmark}).md`;
					if (!existingFiles.includes(notePath)) {
						this.app.vault.create(notePath, body);
					}
				}
			}
		});

		this.addSettingTab(new KoreaderSettingTab(this.app, this));
	}

	onunload() {
	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
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
		const {containerEl} = this;

		containerEl.empty();

		containerEl.createEl('h2', {text: 'KOReader plugin settings'});

		new Setting(containerEl)
			.setName('KOReader mounted path')
			.setDesc('/media/<user>/KOBOeReader')
			.addText(text => text
				.setPlaceholder('Enter the path wher KOReader is mounted')
				.setValue(this.plugin.settings.koreaderBasePath)
				.onChange(async (value) => {
					console.log('Path: ' + value);
					this.plugin.settings.koreaderBasePath = value;
					await this.plugin.saveSettings();
				}));

    new Setting(containerEl)
      .setName('Highlights folder location')
      .setDesc('Vault folder to use for writing book highlight notes')
      .addDropdown((dropdown) => {

        const files = (this.app.vault.adapter as any).files;
				const folders = Object.keys(files).filter(key => files[key].type === 'folder');
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
