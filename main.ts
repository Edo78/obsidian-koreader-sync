import { App, Editor, MarkdownView, Modal, Notice, Plugin, PluginSettingTab, Setting } from 'obsidian';

// Remember to rename these classes and interfaces!

interface KOReaderSettings {
	basePath: string;
}

const DEFAULT_SETTINGS: KOReaderSettings = {
	basePath: 'default'
}

// datetime is a string like "2022-01-18 19:14:05"
interface Bookmark {
	chapter: string;
	text: string;
	datetime: string;
	notes: string;
	highlighted: boolean;
	pos0: string;
	pos1?: string;
	page: string;
}

interface Bookmarks {
	[key: number]: Bookmark;
}

const test: Bookmarks = {
	1: {
		chapter: '1',
		text: 'test',
		datetime: '2020-01-18 19:14:05',
		notes: 'questa è la prima nota'
	},
	2: {
		chapter: '2',
		text: 'test 2',
		datetime: '2020-01-18 19:14:05',
		notes: 'questa è la seconda nota'
	}
};

interface Book {
	title: string;
	authors: string;
	bookmarks: Bookmarks;
	highlight: any;
}

interface Books {
	[fullTitle: string]: Book;
}

const books: Books = {
  "Altre storie straordinarie delle materie prime - Alessandro Giraudo": {
    "title": "Altre storie straordinarie delle materie prime",
    "authors": "Alessandro Giraudo",
    "highlight": {
      "73": {
        "1": {
          "drawer": "lighten",
          "pos0": "/body/DocFragment[28]/body/p[2]/text().402",
          "pos1": "/body/DocFragment[28]/body/p[2]/text().421",
          "text": "mamelucchi circassi",
          "chapter": "Il sapone: una ricetta dei Sumeri, prodotto a Venezia e a Marsiglia",
          "datetime": "2022-01-18 19:14:05"
        }
      }
    },
    "bookmarks": {
      "1": {
        "highlighted": true,
        "chapter": "Il sapone: una ricetta dei Sumeri, prodotto a Venezia e a Marsiglia",
        "text": "Pagina 73 mamelucchi circassi @ 2022-01-18 19:14:05\n\nSe non ricordo male mia madre usava il termine mammalucco",
        "pos0": "/body/DocFragment[28]/body/p[2]/text().402",
        "pos1": "/body/DocFragment[28]/body/p[2]/text().421",
        "page": "/body/DocFragment[28]/body/p[2]/text().402",
        "notes": "mamelucchi circassi",
        "datetime": "2022-01-18 19:14:05"
      }
    }
  },
  "Tutti i romanzi e i racconti - Howard Phillips Lovecraft": {
    "title": "Tutti i romanzi e i racconti",
    "authors": "Howard Phillips Lovecraft",
    "highlight": {
      "748": {
        "1": {
          "datetime": "2022-01-16 18:47:41",
          "chapter": "L’orrore a Red Hook*",
          "pos0": "/body/DocFragment[36]/body/p[201]/i/text().0",
          "drawer": "lighten",
          "text": "An sint unquam daemones incubi et succubae, et an ex tali congressu proles enasci queat?7",
          "pos1": "/body/DocFragment[36]/body/p[201]/sup/a/text().1"
        }
      },
      "754": {
        "1": {
          "datetime": "2022-01-16 18:52:27",
          "chapter": "L’orrore a Red Hook*",
          "pos0": "/body/DocFragment[36]/body/p[229]/i[1]/text().0",
          "drawer": "lighten",
          "text": "Encyclopaedia of Occultism di Lewis Spence",
          "pos1": "/body/DocFragment[36]/body/p[229]/text()[2].16"
        }
      },
      "895": {
        "1": {
          "datetime": "2022-01-18 15:01:20",
          "chapter": "L’ultimo esperimento di Clarendon*",
          "pos0": "/body/DocFragment[43]/body/p[18]/text().293",
          "drawer": "lighten",
          "text": "gran parte le malattie che si diffondono sul globo scaturiscono dalle zone sconosciute dell’antichissima e misteriosa Asia.",
          "pos1": "/body/DocFragment[43]/body/p[18]/text().417"
        }
      }
    },
    "bookmarks": {
      "1": {
        "datetime": "2022-01-18 15:01:20",
        "highlighted": true,
        "notes": "gran parte le malattie che si diffondono sul globo scaturiscono dalle zone sconosciute dell’antichissima e misteriosa Asia.",
        "pos0": "/body/DocFragment[43]/body/p[18]/text().293",
        "pos1": "/body/DocFragment[43]/body/p[18]/text().417",
        "page": "/body/DocFragment[43]/body/p[18]/text().293",
        "chapter": "L’ultimo esperimento di Clarendon*",
        "text": "Pagina 895 gran parte le malattie che si diffondono sul globo scaturiscono dalle zone sconosciute dell’antichissima e misteriosa Asia. @ 2022-01-18 15:01:20\n\nCome il covid?"
      },
      "2": {
        "datetime": "2022-01-16 18:52:27",
        "highlighted": true,
        "notes": "Encyclopaedia of Occultism di Lewis Spence",
        "pos0": "/body/DocFragment[36]/body/p[229]/i[1]/text().0",
        "pos1": "/body/DocFragment[36]/body/p[229]/text()[2].16",
        "text": "Pagina 754 Encyclopaedia of Occultism di Lewis Spence @ 2022-01-16 18:52:27\n\nEnciclopedia da cui spesso Lovecraft prendeva spunto",
        "chapter": "L’orrore a Red Hook*",
        "page": "/body/DocFragment[36]/body/p[229]/i[1]/text().0"
      },
      "3": {
        "datetime": "2022-01-16 18:47:41",
        "highlighted": true,
        "notes": "An sint unquam daemones incubi et succubae, et an ex tali congressu proles enasci queat?7",
        "pos0": "/body/DocFragment[36]/body/p[201]/i/text().0",
        "pos1": "/body/DocFragment[36]/body/p[201]/sup/a/text().1",
        "text": "Pagina 748 An sint unquam daemones incubi et succubae, et an ex tali congressu proles enasci queat?7 @ 2022-01-16 18:47:41\n\nCosa vuol dire?",
        "chapter": "L’orrore a Red Hook*",
        "page": "/body/DocFragment[36]/body/p[201]/i/text().0"
      }
    }
  }
};

export default class KOReader extends Plugin {
	settings: KOReaderSettings;

	async onload() {
		await this.loadSettings();
		const statusBarItemEl = this.addStatusBarItem();

		// This creates an icon in the left ribbon.
		const ribbonIconEl = this.addRibbonIcon('dice', 'KOReader Plugin', async (evt: MouseEvent) => {
			// This will scan for metadata
			const metadata = new KOReaderMetadata(this.settings.basePath, statusBarItemEl);
			// const data: Books = await metadata.scan();
			const data: Books = await metadata.fakeScan();
			console.log(JSON.stringify(data, null, 2));
			
			// Loop on each book in 'data' and on each bookmark
			// then create a note in the vault
			for (const book in data) {
				// console.log('book', data[book]);
				for (const bookmark in data[book].bookmarks) {
					// const note = new Note(data[book].title, data[book].Bookmarks[bookmark].chapter, data[book].Bookmarks[bookmark].text, data[book].Bookmarks[bookmark].notes);
					const note = `# Title: [[${data[book].title}]]
## Authors: [[${data[book].authors}]]
## Chapter: ${data[book].bookmarks[bookmark].chapter}
**==${data[book].bookmarks[bookmark].notes}==**

${data[book].bookmarks[bookmark].text}
`;
					this.app.vault.create(`${data[book].title} - ${data[book].authors}.md`, note);
				}
			}

			// this.app.vault.create('KOReader.md', 'questa è una prova');
		});
		// Perform additional things with the ribbon
		ribbonIconEl.addClass('my-plugin-ribbon-class');

		// This adds a status bar item to the bottom of the app. Does not work on mobile apps.
		statusBarItemEl.setText('Status Bar Text');


		// This adds a settings tab so the user can configure various aspects of the plugin
		this.addSettingTab(new SampleSettingTab(this.app, this));

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

class KOReaderMetadata {
	basePath: string;
	FindFiles = require("node-find-files");
	statusBarItemEl: HTMLElement;
	path = require('path');
	luaJson = require('lua-json')
	fs = require('fs');

	constructor(basePath: string, statusBarItemEl: HTMLElement) {
		this.basePath = basePath;
		this.statusBarItemEl = statusBarItemEl;
	}

	public async fakeScan(): Promise<Books> {
		return Promise.resolve({
  "Altre storie straordinarie delle materie prime - Alessandro Giraudo": {
    "title": "Altre storie straordinarie delle materie prime",
    "authors": "Alessandro Giraudo",
    "highlight": {
      "73": {
        "1": {
          "drawer": "lighten",
          "pos0": "/body/DocFragment[28]/body/p[2]/text().402",
          "pos1": "/body/DocFragment[28]/body/p[2]/text().421",
          "text": "mamelucchi circassi",
          "chapter": "Il sapone: una ricetta dei Sumeri, prodotto a Venezia e a Marsiglia",
          "datetime": "2022-01-18 19:14:05"
        }
      }
    },
    "bookmarks": {
      "1": {
        "highlighted": true,
        "chapter": "Il sapone: una ricetta dei Sumeri, prodotto a Venezia e a Marsiglia",
        "text": "Pagina 73 mamelucchi circassi @ 2022-01-18 19:14:05\n\nSe non ricordo male mia madre usava il termine mammalucco",
        "pos0": "/body/DocFragment[28]/body/p[2]/text().402",
        "pos1": "/body/DocFragment[28]/body/p[2]/text().421",
        "page": "/body/DocFragment[28]/body/p[2]/text().402",
        "notes": "mamelucchi circassi",
        "datetime": "2022-01-18 19:14:05"
      }
    }
  },
  "Tutti i romanzi e i racconti - Howard Phillips Lovecraft": {
    "title": "Tutti i romanzi e i racconti",
    "authors": "Howard Phillips Lovecraft",
    "highlight": {
      "748": {
        "1": {
          "datetime": "2022-01-16 18:47:41",
          "chapter": "L’orrore a Red Hook*",
          "pos0": "/body/DocFragment[36]/body/p[201]/i/text().0",
          "drawer": "lighten",
          "text": "An sint unquam daemones incubi et succubae, et an ex tali congressu proles enasci queat?7",
          "pos1": "/body/DocFragment[36]/body/p[201]/sup/a/text().1"
        }
      },
      "754": {
        "1": {
          "datetime": "2022-01-16 18:52:27",
          "chapter": "L’orrore a Red Hook*",
          "pos0": "/body/DocFragment[36]/body/p[229]/i[1]/text().0",
          "drawer": "lighten",
          "text": "Encyclopaedia of Occultism di Lewis Spence",
          "pos1": "/body/DocFragment[36]/body/p[229]/text()[2].16"
        }
      },
      "895": {
        "1": {
          "datetime": "2022-01-18 15:01:20",
          "chapter": "L’ultimo esperimento di Clarendon*",
          "pos0": "/body/DocFragment[43]/body/p[18]/text().293",
          "drawer": "lighten",
          "text": "gran parte le malattie che si diffondono sul globo scaturiscono dalle zone sconosciute dell’antichissima e misteriosa Asia.",
          "pos1": "/body/DocFragment[43]/body/p[18]/text().417"
        }
      }
    },
    "bookmarks": {
      "1": {
        "datetime": "2022-01-18 15:01:20",
        "highlighted": true,
        "notes": "gran parte le malattie che si diffondono sul globo scaturiscono dalle zone sconosciute dell’antichissima e misteriosa Asia.",
        "pos0": "/body/DocFragment[43]/body/p[18]/text().293",
        "pos1": "/body/DocFragment[43]/body/p[18]/text().417",
        "page": "/body/DocFragment[43]/body/p[18]/text().293",
        "chapter": "L’ultimo esperimento di Clarendon*",
        "text": "Pagina 895 gran parte le malattie che si diffondono sul globo scaturiscono dalle zone sconosciute dell’antichissima e misteriosa Asia. @ 2022-01-18 15:01:20\n\nCome il covid?"
      },
      "2": {
        "datetime": "2022-01-16 18:52:27",
        "highlighted": true,
        "notes": "Encyclopaedia of Occultism di Lewis Spence",
        "pos0": "/body/DocFragment[36]/body/p[229]/i[1]/text().0",
        "pos1": "/body/DocFragment[36]/body/p[229]/text()[2].16",
        "text": "Pagina 754 Encyclopaedia of Occultism di Lewis Spence @ 2022-01-16 18:52:27\n\nEnciclopedia da cui spesso Lovecraft prendeva spunto",
        "chapter": "L’orrore a Red Hook*",
        "page": "/body/DocFragment[36]/body/p[229]/i[1]/text().0"
      },
      "3": {
        "datetime": "2022-01-16 18:47:41",
        "highlighted": true,
        "notes": "An sint unquam daemones incubi et succubae, et an ex tali congressu proles enasci queat?7",
        "pos0": "/body/DocFragment[36]/body/p[201]/i/text().0",
        "pos1": "/body/DocFragment[36]/body/p[201]/sup/a/text().1",
        "text": "Pagina 748 An sint unquam daemones incubi et succubae, et an ex tali congressu proles enasci queat?7 @ 2022-01-16 18:47:41\n\nCosa vuol dire?",
        "chapter": "L’orrore a Red Hook*",
        "page": "/body/DocFragment[36]/body/p[201]/i/text().0"
      }
    }
  }
});
	}

	// a public method will scan the basePath for metadata files
	public async scan(): Promise<Books> {
		const metadatas:any = {};
		return new Promise((resolve, reject) => {
			const finder = new this.FindFiles({
				rootFolder: this.basePath,
			});
			finder.on('match', (file: string) => {
				const filename = this.path.parse(file).base;
				if (filename.match(/metadata\..*\.lua$/)) {
					// read the file
					const content = this.fs.readFileSync(file, 'utf8');
					// console.log(file);
					const jsonMetadata = this.luaJson.parse(content);
					// console.log(JSON.stringify(jsonMetadata, null, 2));
					const { highlight, bookmarks, doc_props: { title }, doc_props: { authors } } = jsonMetadata;
					// parse only if highlight and bookmarks are present
					// console.log('test', (Object.keys(highlight).length && Object.keys(bookmarks).length) ? true : false);
					if (Object.keys(highlight).length && Object.keys(bookmarks).length) {
						// console.log(`${filename} - ${title} - ${authors}`);
						metadatas[`${title} - ${authors}`] = {
							title,
							authors,
							highlight,
							bookmarks,
						};
						// console.log(JSON.stringify(metadatas, null, 2));
					}
				}
			});
			finder.on('error', (err: any) => {
				console.log(err);
				reject(err);
			});
			finder.on('complete', () => {
				// console.log(JSON.stringify(metadatas, null, 2));
				resolve(metadatas);
			});
			finder.startSearch();
		});
	}
}

class SampleSettingTab extends PluginSettingTab {
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
			.setDesc('/mnt/user/onboard')
			.addText(text => text
				.setPlaceholder('Enter the path to KOReader')
				.setValue(this.plugin.settings.basePath)
				.onChange(async (value) => {
					console.log('Path: ' + value);
					this.plugin.settings.basePath = value;
					await this.plugin.saveSettings();
				}));
	}
}
