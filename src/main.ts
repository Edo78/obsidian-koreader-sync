import { __awaiter } from "tslib";
import * as crypto from 'crypto';
import * as eta from 'eta';
import { Plugin, PluginSettingTab, Setting, normalizePath, Notice, } from 'obsidian';
import matter from 'gray-matter';
import * as Diff from 'diff';
import { KOReaderMetadata } from './koreader-metadata';
var ErrorType;
(function (ErrorType) {
    ErrorType["NO_PLACEHOLDER_FOUND"] = "NO_PLACEHOLDER_FOUND";
    ErrorType["NO_PLACEHOLDER_NOTE_CREATED"] = "NO_PLACEHOLDER_NOTE_CREATED";
})(ErrorType || (ErrorType = {}));
var NoteType;
(function (NoteType) {
    NoteType["SINGLE_NOTE"] = "koreader-sync-note";
    NoteType["BOOK_NOTE"] = "koreader-sync-dataview";
})(NoteType || (NoteType = {}));
const DEFAULT_SETTINGS = {
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
const KOREADERKEY = 'koreader-sync';
const NOTE_TEXT_PLACEHOLDER = 'placeholder';
export default class KOReader extends Plugin {
    manageTitle(title, options = {}) {
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
    onload() {
        return __awaiter(this, void 0, void 0, function* () {
            eta.configure({
                cache: true,
                autoEscape: false,
            });
            yield this.loadSettings();
            // listen for note changes to update the frontmatter
            this.app.metadataCache.on('changed', (file) => __awaiter(this, void 0, void 0, function* () {
                try {
                    yield this.updateMetadataText(file);
                }
                catch (e) {
                    console.error(e);
                    new Notice(`Error updating metadata text: ${e.message}`);
                }
            }));
            const ribbonIconEl = this.addRibbonIcon('documents', 'Sync your KOReader highlights', this.importNotes.bind(this));
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
                editorCheckCallback: (checking, editor, view) => {
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
                editorCheckCallback: (checking, editor, view) => {
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
                editorCheckCallback: (checking, editor, view) => {
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
                editorCheckCallback: (checking, editor, view) => {
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
                checkCallback: (checking) => {
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
        });
    }
    onunload() { }
    loadSettings() {
        return __awaiter(this, void 0, void 0, function* () {
            this.settings = Object.assign(Object.assign({}, DEFAULT_SETTINGS), (yield this.loadData()));
        });
    }
    saveSettings() {
        return __awaiter(this, void 0, void 0, function* () {
            yield this.saveData(this.settings);
        });
    }
    updateMetadataText(file) {
        return __awaiter(this, void 0, void 0, function* () {
            const originalNote = yield this.app.vault.cachedRead(file);
            const text = yield this.extractTextFromNote(originalNote);
            if (text) {
                // new Notice(`Text extracted: ${text}`);
                const { data, content } = matter(originalNote, {});
                const propertyPath = `${[KOREADERKEY]}.data.text`;
                this.setObjectProperty(data, propertyPath, text);
                const yetToBeEditedPropertyPath = `${[
                    KOREADERKEY,
                ]}.metadata.yet_to_be_edited`;
                this.setObjectProperty(data, yetToBeEditedPropertyPath, false);
                this.app.vault.modify(file, matter.stringify(content, data, {}));
            }
            else {
                // new Notice('Text extraction failed');
            }
        });
    }
    // to detect where the note's text is in the whole document
    // I'll create a new document with a 'placeholder' text and compare the two notes
    // the text added where the 'placeholder' text is removed is the new text of the note
    extractTextFromNote(note) {
        return __awaiter(this, void 0, void 0, function* () {
            const { data, content: originalContent } = matter(note, {});
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
            // please don't judge me, I'm going to refactor this
            // ideally using the same object as argument of the createNote function,
            // for the template and in the frontmatter
            let diff;
            try {
                const { content: newContent, frontmatterData, notePath, } = yield this.createNote({
                    path,
                    uniqueId: '',
                    bookmark: {
                        chapter: frontMatter.data.chapter,
                        datetime: frontMatter.data.datetime,
                        notes: frontMatter.data.highlight,
                        highlighted: true,
                        pos0: 'pos0',
                        pos1: 'pos1',
                        page: `${frontMatter.data.page}`,
                        text: `Pagina ${frontMatter.data.page} ${frontMatter.data.highlight} @ ${frontMatter.data.datetime} ${NOTE_TEXT_PLACEHOLDER}`,
                    },
                    managedBookTitle: frontMatter.metadata.managed_book_title,
                    book: {
                        title: frontMatter.data.title,
                        authors: frontMatter.data.authors,
                        percent_finished: 1,
                        bookmarks: [],
                        highlight: frontMatter.data.highlight,
                    },
                    keepInSync: frontMatter.metadata.keep_in_sync,
                });
                diff = Diff.diffTrimmedLines(originalContent, newContent);
            }
            catch (e) {
                console.error(e);
                throw new Error(ErrorType.NO_PLACEHOLDER_NOTE_CREATED);
            }
            // extract from 'diff' the new text of the note
            // in the array is the element before the one whit 'added' to true and 'value' is 'placeholder'
            const placeholderIndex = diff.findIndex((element) => element.added && element.value === NOTE_TEXT_PLACEHOLDER);
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
        });
    }
    getObjectProperty(object, path) {
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
    setObjectProperty(object, path, value) {
        var _a;
        const parts = path.split('.');
        const limit = parts.length - 1;
        for (let i = 0; i < limit; ++i) {
            const key = parts[i];
            object = (_a = object[key]) !== null && _a !== void 0 ? _a : (object[key] = {});
        }
        const key = parts[limit];
        object[key] = value;
    }
    setFrontmatterProperty(property, value, view) {
        const { data, content } = matter(view.data, {});
        this.setObjectProperty(data, property, value);
        const note = matter.stringify(content, data);
        view.setViewData(note, false);
        view.requestSave();
    }
    getFrontmatterProperty(property, view) {
        const { data, content } = matter(view.data, {});
        return this.getObjectProperty(data, property);
    }
    createNote(note) {
        return __awaiter(this, void 0, void 0, function* () {
            const { path, uniqueId, bookmark, managedBookTitle, book, keepInSync } = note;
			//console.log(bookmark);
            // the page is always the first number in the bookmark's text (eg. 'Pagina 12 foo bar')
            //const page = bookmark.text ? parseInt(bookmark.text.match(/\d+/g)[0]) : -1;
			//start by default page in case it cannot be fetched
			var page = -1;
			var noteItself = bookmark.text;
			
			 if(noteItself && bookmark.text.match(/\d+/g)!==null)
			  {
				  page = parseInt(bookmark.text.match(/\d+/g)[0]);
				  noteItself = (bookmark.text.split(bookmark.datetime)!=null && bookmark.text.split(bookmark.datetime).length>1) ? bookmark.text.split(bookmark.datetime)[1].replace(/^\s+|\s+$/g, "") : "";
			  }
               
				//const noteItself = bookmark.text ? ( bookmark.text.split(bookmark.datetime).length>1 ? bookmark.text.split(bookmark.datetime)[1].replace(/^\s+|\s+$/g, "") : "") : false ;
		  //const noteTitle = noteItself ? this.manageTitle(noteItself, this.settings.noteTitleOptions) : `${this.manageTitle(bookmark.notes, this.settings.noteTitleOptions)} - ${book.authors}`;
		  const noteTitle = noteItself ? this.manageTitle(noteItself, this.settings.noteTitleOptions) : `${this.manageTitle(bookmark.notes, this.settings.noteTitleOptions)}`+'-'+`${this.manageTitle(book.authors, this.settings.noteTitleOptions)}`;
		  const notePath = (0, import_obsidian.normalizePath)(`${path2}/${noteTitle}`);
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
                ? yield this.app.vault.read(templateFile)
                : defaultTemplate;
            const bookPath = normalizePath(`${path}/${managedBookTitle}`);
			
			//Prevent any null value from causing troubles
			noteItself=[noteItself," "].join('');
			
            const content = (yield eta.render(template, {
                bookPath,
                title: book.title,
                authors: book.authors,
                chapter: bookmark.chapter,
                highlight: bookmark.notes,
                text: noteItself,
                datetime: bookmark.datetime,
                page,
            }));
            const frontmatterData = {
                [KOREADERKEY]: {
                    type: NoteType.SINGLE_NOTE,
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
        });
    }
    createDataviewQueryPerBook(dataview, updateNote) {
        return __awaiter(this, void 0, void 0, function* () {
            const { path, book, managedBookTitle } = dataview;
            let { keepInSync } = this.settings;
            if (updateNote) {
                const { data, content } = matter(yield this.app.vault.read(updateNote), {});
                keepInSync = data[KOREADERKEY].metadata.keep_in_sync;
                const yetToBeEdited = data[KOREADERKEY].metadata.yet_to_be_edited;
                if (!keepInSync || !yetToBeEdited) {
                    return;
                }
            }
            const frontMatter = {
                cssclass: NoteType.BOOK_NOTE,
                [KOREADERKEY]: {
                    uniqueId: crypto
                        .createHash('md5')
                        .update(`${book.title} - ${book.authors}}`)
                        .digest('hex'),
                    type: NoteType.BOOK_NOTE,
                    data: {
                        title: book.title,
                        authors: book.authors,
                    },
                    metadata: {
                        percent_finished: book.percent_finished,
                        managed_title: managedBookTitle,
                        keep_in_sync: keepInSync,
                        yet_to_be_edited: true,
                    },
                },
            };
            const defaultTemplate = `# Title: <%= it.data.title %>

<progress value="<%= it.metadata.percent_finished %>" max="100"> </progress>
\`\`\`dataviewjs
const title = dv.current()['koreader-sync'].metadata.managed_title
dv.pages().where(n => {
return n['koreader-sync'] && n['koreader-sync'].type == '${NoteType.SINGLE_NOTE}' && n['koreader-sync'].metadata.managed_book_title == title
}).sort(p => p['koreader-sync'].data.page).forEach(p => dv.paragraph(dv.fileLink(p.file.name, true), {style: 'test-css'}))
\`\`\`
    `;
            const templateFile = this.settings.customDataviewTemplate
                ? this.app.vault.getAbstractFileByPath(this.settings.dataviewTemplatePath)
                : null;
            const template = templateFile
                ? yield this.app.vault.read(templateFile)
                : defaultTemplate;
            const content = (yield eta.render(template, frontMatter[KOREADERKEY]));
            if (updateNote) {
                this.app.vault.modify(updateNote, matter.stringify(content, frontMatter));
            }
            else {
                this.app.vault.create(`${path}/${managedBookTitle}.md`, matter.stringify(content, frontMatter));
            }
        });
    }
    importNotes() {
        var _a;
        return __awaiter(this, void 0, void 0, function* () {
            const metadata = new KOReaderMetadata(this.settings.koreaderBasePath);
            const data = yield metadata.scan();
            // create a list of notes already imported in obsidian
            const existingNotes = {};
            this.app.vault.getMarkdownFiles().forEach((f) => {
                var _a, _b;
                const fm = (_a = this.app.metadataCache.getFileCache(f)) === null || _a === void 0 ? void 0 : _a.frontmatter;
                if ((_b = fm === null || fm === void 0 ? void 0 : fm[KOREADERKEY]) === null || _b === void 0 ? void 0 : _b.uniqueId) {
                    existingNotes[fm[KOREADERKEY].uniqueId] = {
                        keep_in_sync: fm[KOREADERKEY].metadata.keep_in_sync,
                        yet_to_be_edited: fm[KOREADERKEY].metadata.yet_to_be_edited,
                        note: f,
                    };
                }
            });
            for (const book in data) {
                 
				//const managedBookTitle = `${this.manageTitle(data[book].title, this.settings.bookTitleOptions)}-${data[book].authors}`;
				//Prevent illegal characters
				const managedBookTitle = `${this.manageTitle(data[book].title, this.settings.bookTitleOptions)}`+'-'+`${this.manageTitle(data[book].authors, this.settings.noteTitleOptions)}`;
				
				// if the setting aFolderForEachBook is true, we add the managedBookTitle to the path specified in obsidianNoteFolder
                //const path = this.settings.aFolderForEachBook
				const path = this.settings.aFolderForEachBook ? `${this.settings.obsidianNoteFolder}/${managedBookTitle}` : this.settings.obsidianNoteFolder;
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
                    this.createDataviewQueryPerBook({
                        path,
                        managedBookTitle,
                        book: data[book],
                    }, this.app.vault.getAbstractFileByPath(`${path}/${managedBookTitle}.md`));
                }
                for (const bookmark in data[book].bookmarks) {
                    const updateNote = false;
                    const uniqueId = crypto
                        .createHash('md5')
                        .update(`${data[book].title} - ${data[book].authors} - ${data[book].bookmarks[bookmark].pos0} - ${data[book].bookmarks[bookmark].pos1}`)
                        .digest('hex');
                    // if the note is not yet imported, we create it
                    if (!Object.keys(this.settings.importedNotes).includes(uniqueId)) {
                        if (!Object.keys(existingNotes).includes(uniqueId)) {
                            const { content, frontmatterData, notePath } = yield this.createNote({
                                path,
                                uniqueId,
                                bookmark: data[book].bookmarks[bookmark],
                                managedBookTitle,
                                book: data[book],
                                keepInSync: this.settings.keepInSync,
                            });
                            this.app.vault.create(`${notePath}.md`, matter.stringify(content, frontmatterData));
                        }
                        this.settings.importedNotes[uniqueId] = true;
                        // else if the note exists and keep_in_sync is true and yet_to_be_edited is false, we update it
                    }
                    else if (Object.keys(existingNotes).includes(uniqueId) &&
                        existingNotes[uniqueId].keep_in_sync &&
                        !existingNotes[uniqueId].yet_to_be_edited) {
                        const note = existingNotes[uniqueId].note;
                        const { content, frontmatterData, notePath } = yield this.createNote({
                            path,
                            uniqueId,
                            bookmark: data[book].bookmarks[bookmark],
                            managedBookTitle,
                            book: data[book],
                            keepInSync: (_a = existingNotes[uniqueId]) === null || _a === void 0 ? void 0 : _a.keep_in_sync,
                        });
                        this.app.vault.modify(note, matter.stringify(content, frontmatterData));
                    }
                }
            }
            yield this.saveSettings();
        }); 
    }
}
class KoreaderSettingTab extends PluginSettingTab {
    constructor(app, plugin) {
        super(app, plugin);
        this.plugin = plugin;
    }
    display() {
        const { containerEl } = this;
        containerEl.empty();
        containerEl.createEl('h2', { text: 'KOReader general settings' });
        new Setting(containerEl)
            .setName('KOReader mounted path')
            .setDesc('Eg. /media/<user>/KOBOeReader')
            .addText((text) => text
            .setPlaceholder('Enter the path wher KOReader is mounted')
            .setValue(this.plugin.settings.koreaderBasePath)
            .onChange((value) => __awaiter(this, void 0, void 0, function* () {
            this.plugin.settings.koreaderBasePath = value;
            yield this.plugin.saveSettings();
        })));
        new Setting(containerEl)
            .setName('Highlights folder location')
            .setDesc('Vault folder to use for writing book highlight notes')
            .addDropdown((dropdown) => {
            const { files } = this.app.vault.adapter;
            const folders = Object.keys(files).filter((key) => files[key].type === 'folder');
            folders.forEach((val) => {
                dropdown.addOption(val, val);
            });
            return dropdown
                .setValue(this.plugin.settings.obsidianNoteFolder)
                .onChange((value) => __awaiter(this, void 0, void 0, function* () {
                this.plugin.settings.obsidianNoteFolder = value;
                yield this.plugin.saveSettings();
            }));
        });
        new Setting(containerEl)
            .setName('Keep in sync')
            .setDesc(createFragment((frag) => {
            frag.appendText('Keep notes in sync with KOReader (read the ');
            frag.createEl('a', {
                text: 'documentation',
                href: 'https://github.com/Edo78/obsidian-koreader-sync#sync',
            }, (a) => {
                a.setAttr('target', '_blank');
            });
            frag.appendText(')');
        }))
            .addToggle((toggle) => toggle
            .setValue(this.plugin.settings.keepInSync)
            .onChange((value) => __awaiter(this, void 0, void 0, function* () {
            this.plugin.settings.keepInSync = value;
            yield this.plugin.saveSettings();
        })));
        new Setting(containerEl)
            .setName('Create a folder for each book')
            .setDesc('All the notes from a book will be saved in a folder named after the book')
            .addToggle((toggle) => toggle
            .setValue(this.plugin.settings.aFolderForEachBook)
            .onChange((value) => __awaiter(this, void 0, void 0, function* () {
            this.plugin.settings.aFolderForEachBook = value;
            yield this.plugin.saveSettings();
        })));
        containerEl.createEl('h2', { text: 'View settings' });
        new Setting(containerEl)
            .setName('Custom template')
            .setDesc('Use a custom template for the notes')
            .addToggle((toggle) => toggle
            .setValue(this.plugin.settings.customTemplate)
            .onChange((value) => __awaiter(this, void 0, void 0, function* () {
            this.plugin.settings.customTemplate = value;
            yield this.plugin.saveSettings();
        })));
        new Setting(containerEl)
            .setName('Template file')
            .setDesc('The template file to use. Remember to add the ".md" extension')
            .addText((text) => text
            .setPlaceholder('templates/note.md')
            .setValue(this.plugin.settings.templatePath)
            .onChange((value) => __awaiter(this, void 0, void 0, function* () {
            this.plugin.settings.templatePath = value;
            yield this.plugin.saveSettings();
        })));
        new Setting(containerEl)
            .setName('Custom book template')
            .setDesc('Use a custom template for the dataview')
            .addToggle((toggle) => toggle
            .setValue(this.plugin.settings.customDataviewTemplate)
            .onChange((value) => __awaiter(this, void 0, void 0, function* () {
            this.plugin.settings.customDataviewTemplate = value;
            yield this.plugin.saveSettings();
        })));
        new Setting(containerEl)
            .setName('Book template file')
            .setDesc('The template file to use. Remember to add the ".md" extension')
            .addText((text) => text
            .setPlaceholder('templates/template-book.md')
            .setValue(this.plugin.settings.dataviewTemplatePath)
            .onChange((value) => __awaiter(this, void 0, void 0, function* () {
            this.plugin.settings.dataviewTemplatePath = value;
            yield this.plugin.saveSettings();
        })));
        new Setting(containerEl)
            .setName('Create a dataview query')
            .setDesc(createFragment((frag) => {
            frag.appendText('Create a note (for each book) with a dataview query (read the ');
            frag.createEl('a', {
                text: 'documentation',
                href: 'https://github.com/Edo78/obsidian-koreader-sync#dateview-embedded',
            }, (a) => {
                a.setAttr('target', '_blank');
            });
            frag.appendText(')');
        }))
            .addToggle((toggle) => toggle
            .setValue(this.plugin.settings.createDataviewQuery)
            .onChange((value) => __awaiter(this, void 0, void 0, function* () {
            this.plugin.settings.createDataviewQuery = value;
            yield this.plugin.saveSettings();
        })));
        containerEl.createEl('h2', { text: 'Note title settings' });
        new Setting(containerEl).setName('Prefix').addText((text) => text
            .setPlaceholder('Enter the prefix')
            .setValue(this.plugin.settings.noteTitleOptions.prefix)
            .onChange((value) => __awaiter(this, void 0, void 0, function* () {
            this.plugin.settings.noteTitleOptions.prefix = value;
            yield this.plugin.saveSettings();
        })));
        new Setting(containerEl).setName('Suffix').addText((text) => text
            .setPlaceholder('Enter the suffix')
            .setValue(this.plugin.settings.noteTitleOptions.suffix)
            .onChange((value) => __awaiter(this, void 0, void 0, function* () {
            this.plugin.settings.noteTitleOptions.suffix = value;
            yield this.plugin.saveSettings();
        })));
        new Setting(containerEl)
            .setName('Max words')
            .setDesc('If is longer than this number of words, it will be truncated and "..." will be appended before the optional suffix')
            .addSlider((number) => number
            .setDynamicTooltip()
            .setLimits(0, 10, 1)
            .setValue(this.plugin.settings.noteTitleOptions.maxWords)
            .onChange((value) => __awaiter(this, void 0, void 0, function* () {
            this.plugin.settings.noteTitleOptions.maxWords = value;
            yield this.plugin.saveSettings();
        })));
        new Setting(containerEl)
            .setName('Max length')
            .setDesc('If is longer than this number of characters, it will be truncated and "..." will be appended before the optional suffix')
            .addSlider((number) => number
            .setDynamicTooltip()
            .setLimits(0, 50, 1)
            .setValue(this.plugin.settings.noteTitleOptions.maxLength)
            .onChange((value) => __awaiter(this, void 0, void 0, function* () {
            this.plugin.settings.noteTitleOptions.maxLength = value;
            yield this.plugin.saveSettings();
        })));
        containerEl.createEl('h2', { text: 'Book title settings' });
        new Setting(containerEl).setName('Prefix').addText((text) => text
            .setPlaceholder('Enter the prefix')
            .setValue(this.plugin.settings.bookTitleOptions.prefix)
            .onChange((value) => __awaiter(this, void 0, void 0, function* () {
            this.plugin.settings.bookTitleOptions.prefix = value;
            yield this.plugin.saveSettings();
        })));
        new Setting(containerEl).setName('Suffix').addText((text) => text
            .setPlaceholder('Enter the suffix')
            .setValue(this.plugin.settings.bookTitleOptions.suffix)
            .onChange((value) => __awaiter(this, void 0, void 0, function* () {
            this.plugin.settings.bookTitleOptions.suffix = value;
            yield this.plugin.saveSettings();
        })));
        new Setting(containerEl)
            .setName('Max words')
            .setDesc('If is longer than this number of words, it will be truncated and "..." will be appended before the optional suffix')
            .addSlider((number) => number
            .setDynamicTooltip()
            .setLimits(0, 10, 1)
            .setValue(this.plugin.settings.bookTitleOptions.maxWords)
            .onChange((value) => __awaiter(this, void 0, void 0, function* () {
            this.plugin.settings.bookTitleOptions.maxWords = value;
            yield this.plugin.saveSettings();
        })));
        new Setting(containerEl)
            .setName('Max length')
            .setDesc('If is longer than this number of characters, it will be truncated and "..." will be appended before the optional suffix')
            .addSlider((number) => number
            .setDynamicTooltip()
            .setLimits(0, 50, 1)
            .setValue(this.plugin.settings.bookTitleOptions.maxLength)
            .onChange((value) => __awaiter(this, void 0, void 0, function* () {
            this.plugin.settings.bookTitleOptions.maxLength = value;
            yield this.plugin.saveSettings();
        })));
        containerEl.createEl('h2', { text: 'DANGER ZONE' });
        new Setting(containerEl)
            .setName('Enable reset of imported notes')
            .setDesc("Enable the command to empty the list of imported notes in case you can't recover from the trash one or more notes")
            .addToggle((toggle) => toggle
            .setValue(this.plugin.settings.enbleResetImportedNotes)
            .onChange((value) => __awaiter(this, void 0, void 0, function* () {
            this.plugin.settings.enbleResetImportedNotes = value;
            yield this.plugin.saveSettings();
        })));
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibWFpbi5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIm1haW4udHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IjtBQUFBLE9BQU8sS0FBSyxNQUFNLE1BQU0sUUFBUSxDQUFDO0FBQ2pDLE9BQU8sS0FBSyxHQUFHLE1BQU0sS0FBSyxDQUFDO0FBRTNCLE9BQU8sRUFJTCxNQUFNLEVBQ04sZ0JBQWdCLEVBQ2hCLE9BQU8sRUFHUCxhQUFhLEVBQ2IsTUFBTSxHQUNQLE1BQU0sVUFBVSxDQUFDO0FBQ2xCLE9BQU8sTUFBTSxNQUFNLGFBQWEsQ0FBQztBQUNqQyxPQUFPLEtBQUssSUFBSSxNQUFNLE1BQU0sQ0FBQztBQUc3QixPQUFPLEVBQUUsZ0JBQWdCLEVBQUUsTUFBTSxxQkFBcUIsQ0FBQztBQUV2RCxJQUFLLFNBR0o7QUFIRCxXQUFLLFNBQVM7SUFDWiwwREFBNkMsQ0FBQTtJQUM3Qyx3RUFBMkQsQ0FBQTtBQUM3RCxDQUFDLEVBSEksU0FBUyxLQUFULFNBQVMsUUFHYjtBQUVELElBQUssUUFHSjtBQUhELFdBQUssUUFBUTtJQUNYLDhDQUFrQyxDQUFBO0lBQ2xDLGdEQUFvQyxDQUFBO0FBQ3RDLENBQUMsRUFISSxRQUFRLEtBQVIsUUFBUSxRQUdaO0FBa0JELE1BQU0sZ0JBQWdCLEdBQXFCO0lBQ3pDLGFBQWEsRUFBRSxFQUFFO0lBQ2pCLHVCQUF1QixFQUFFLEtBQUs7SUFDOUIsVUFBVSxFQUFFLEtBQUs7SUFDakIsa0JBQWtCLEVBQUUsS0FBSztJQUN6QixjQUFjLEVBQUUsS0FBSztJQUNyQixzQkFBc0IsRUFBRSxLQUFLO0lBQzdCLG1CQUFtQixFQUFFLEtBQUs7SUFDMUIsZ0JBQWdCLEVBQUUseUJBQXlCO0lBQzNDLGtCQUFrQixFQUFFLEdBQUc7SUFDdkIsZ0JBQWdCLEVBQUU7UUFDaEIsUUFBUSxFQUFFLENBQUM7UUFDWCxTQUFTLEVBQUUsRUFBRTtLQUNkO0lBQ0QsZ0JBQWdCLEVBQUU7UUFDaEIsUUFBUSxFQUFFLENBQUM7UUFDWCxTQUFTLEVBQUUsRUFBRTtRQUNiLE1BQU0sRUFBRSxTQUFTO0tBQ2xCO0NBQ0YsQ0FBQztBQVNGLE1BQU0sV0FBVyxHQUFHLGVBQWUsQ0FBQztBQUNwQyxNQUFNLHFCQUFxQixHQUFHLGFBQWEsQ0FBQztBQUU1QyxNQUFNLENBQUMsT0FBTyxPQUFPLFFBQVMsU0FBUSxNQUFNO0lBR2xDLFdBQVcsQ0FBQyxLQUFhLEVBQUUsVUFBd0IsRUFBRTtRQUMzRCwyQkFBMkI7UUFDM0IsS0FBSyxHQUFHLEtBQUssQ0FBQyxPQUFPLENBQUMsVUFBVSxFQUFFLEdBQUcsQ0FBQyxDQUFDO1FBQ3ZDLG1EQUFtRDtRQUNuRCxLQUFLLEdBQUcsS0FBSyxDQUFDLE9BQU8sQ0FBQyxLQUFLLEVBQUUsR0FBRyxDQUFDLENBQUM7UUFDbEMseUNBQXlDO1FBQ3pDLEtBQUssR0FBRyxLQUFLLENBQUMsSUFBSSxFQUFFLENBQUM7UUFDckIsMENBQTBDO1FBQzFDLEtBQUssR0FBRyxLQUFLLENBQUMsT0FBTyxDQUFDLFVBQVUsRUFBRSxFQUFFLENBQUMsQ0FBQztRQUN0Qyx5Q0FBeUM7UUFDekMsS0FBSyxHQUFHLEtBQUssQ0FBQyxPQUFPLENBQUMsTUFBTSxFQUFFLEdBQUcsQ0FBQyxDQUFDO1FBQ25DLDJFQUEyRTtRQUMzRSxJQUFJLE9BQU8sQ0FBQyxTQUFTLElBQUksS0FBSyxDQUFDLE1BQU0sR0FBRyxPQUFPLENBQUMsU0FBUyxFQUFFO1lBQ3pELEtBQUssR0FBRyxHQUFHLEtBQUssQ0FBQyxTQUFTLENBQUMsQ0FBQyxFQUFFLE9BQU8sQ0FBQyxTQUFTLENBQUMsS0FBSyxDQUFDO1NBQ3ZEO1FBQ0QsbUZBQW1GO1FBQ25GLElBQUksT0FBTyxDQUFDLFFBQVEsSUFBSSxLQUFLLENBQUMsS0FBSyxDQUFDLEdBQUcsQ0FBQyxDQUFDLE1BQU0sR0FBRyxPQUFPLENBQUMsUUFBUSxFQUFFO1lBQ2xFLEtBQUssR0FBRyxHQUFHLEtBQUssQ0FBQyxLQUFLLENBQUMsR0FBRyxDQUFDLENBQUMsS0FBSyxDQUFDLENBQUMsRUFBRSxPQUFPLENBQUMsUUFBUSxDQUFDLENBQUMsSUFBSSxDQUFDLEdBQUcsQ0FBQyxLQUFLLENBQUM7U0FDdkU7UUFFRCxPQUFPLEdBQUcsT0FBTyxDQUFDLE1BQU0sSUFBSSxFQUFFLEdBQUcsS0FBSyxHQUFHLE9BQU8sQ0FBQyxNQUFNLElBQUksRUFBRSxFQUFFLENBQUM7SUFDbEUsQ0FBQztJQUVLLE1BQU07O1lBQ1YsR0FBRyxDQUFDLFNBQVMsQ0FBQztnQkFDWixLQUFLLEVBQUUsSUFBSTtnQkFDWCxVQUFVLEVBQUUsS0FBSzthQUNsQixDQUFDLENBQUM7WUFDSCxNQUFNLElBQUksQ0FBQyxZQUFZLEVBQUUsQ0FBQztZQUUxQixvREFBb0Q7WUFDcEQsSUFBSSxDQUFDLEdBQUcsQ0FBQyxhQUFhLENBQUMsRUFBRSxDQUFDLFNBQVMsRUFBRSxDQUFPLElBQW1CLEVBQUUsRUFBRTtnQkFDakUsSUFBSTtvQkFDRixNQUFNLElBQUksQ0FBQyxrQkFBa0IsQ0FBQyxJQUFhLENBQUMsQ0FBQztpQkFDOUM7Z0JBQUMsT0FBTyxDQUFDLEVBQUU7b0JBQ1YsT0FBTyxDQUFDLEtBQUssQ0FBQyxDQUFDLENBQUMsQ0FBQztvQkFDakIsSUFBSSxNQUFNLENBQUMsaUNBQWlDLENBQUMsQ0FBQyxPQUFPLEVBQUUsQ0FBQyxDQUFDO2lCQUMxRDtZQUNILENBQUMsQ0FBQSxDQUFDLENBQUM7WUFFSCxNQUFNLFlBQVksR0FBRyxJQUFJLENBQUMsYUFBYSxDQUNyQyxXQUFXLEVBQ1gsK0JBQStCLEVBQy9CLElBQUksQ0FBQyxXQUFXLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxDQUM1QixDQUFDO1lBRUYsSUFBSSxDQUFDLFVBQVUsQ0FBQztnQkFDZCxFQUFFLEVBQUUsK0JBQStCO2dCQUNuQyxJQUFJLEVBQUUsTUFBTTtnQkFDWixRQUFRLEVBQUUsR0FBRyxFQUFFO29CQUNiLElBQUksQ0FBQyxXQUFXLEVBQUUsQ0FBQztnQkFDckIsQ0FBQzthQUNGLENBQUMsQ0FBQztZQUVILElBQUksQ0FBQyxVQUFVLENBQUM7Z0JBQ2QsRUFBRSxFQUFFLG1DQUFtQztnQkFDdkMsSUFBSSxFQUFFLDBCQUEwQjtnQkFDaEMsbUJBQW1CLEVBQUUsQ0FDbkIsUUFBaUIsRUFDakIsTUFBYyxFQUNkLElBQWtCLEVBQ2xCLEVBQUU7b0JBQ0YsTUFBTSxZQUFZLEdBQUcsR0FBRyxDQUFDLFdBQVcsQ0FBQyw0QkFBNEIsQ0FBQztvQkFDbEUsSUFBSSxRQUFRLEVBQUU7d0JBQ1osSUFBSSxJQUFJLENBQUMsc0JBQXNCLENBQUMsWUFBWSxFQUFFLElBQUksQ0FBQyxLQUFLLElBQUksRUFBRTs0QkFDNUQsT0FBTyxJQUFJLENBQUM7eUJBQ2I7d0JBQ0QsT0FBTyxLQUFLLENBQUM7cUJBQ2Q7b0JBQ0QsSUFBSSxDQUFDLHNCQUFzQixDQUFDLFlBQVksRUFBRSxLQUFLLEVBQUUsSUFBSSxDQUFDLENBQUM7Z0JBQ3pELENBQUM7YUFDRixDQUFDLENBQUM7WUFFSCxJQUFJLENBQUMsVUFBVSxDQUFDO2dCQUNkLEVBQUUsRUFBRSxxQ0FBcUM7Z0JBQ3pDLElBQUksRUFBRSw4QkFBOEI7Z0JBQ3BDLG1CQUFtQixFQUFFLENBQ25CLFFBQWlCLEVBQ2pCLE1BQWMsRUFDZCxJQUFrQixFQUNsQixFQUFFO29CQUNGLE1BQU0sWUFBWSxHQUFHLEdBQUcsQ0FBQyxXQUFXLENBQUMsNEJBQTRCLENBQUM7b0JBQ2xFLElBQUksUUFBUSxFQUFFO3dCQUNaLElBQUksSUFBSSxDQUFDLHNCQUFzQixDQUFDLFlBQVksRUFBRSxJQUFJLENBQUMsS0FBSyxLQUFLLEVBQUU7NEJBQzdELE9BQU8sSUFBSSxDQUFDO3lCQUNiO3dCQUNELE9BQU8sS0FBSyxDQUFDO3FCQUNkO29CQUNELElBQUksQ0FBQyxzQkFBc0IsQ0FBQyxZQUFZLEVBQUUsSUFBSSxFQUFFLElBQUksQ0FBQyxDQUFDO2dCQUN4RCxDQUFDO2FBQ0YsQ0FBQyxDQUFDO1lBRUgsSUFBSSxDQUFDLFVBQVUsQ0FBQztnQkFDZCxFQUFFLEVBQUUsbUNBQW1DO2dCQUN2QyxJQUFJLEVBQUUsMkJBQTJCO2dCQUNqQyxtQkFBbUIsRUFBRSxDQUNuQixRQUFpQixFQUNqQixNQUFjLEVBQ2QsSUFBa0IsRUFDbEIsRUFBRTtvQkFDRixNQUFNLFlBQVksR0FBRyxHQUFHLENBQUMsV0FBVyxDQUFDLHdCQUF3QixDQUFDO29CQUM5RCxJQUFJLFFBQVEsRUFBRTt3QkFDWixJQUFJLElBQUksQ0FBQyxzQkFBc0IsQ0FBQyxZQUFZLEVBQUUsSUFBSSxDQUFDLEtBQUssS0FBSyxFQUFFOzRCQUM3RCxPQUFPLElBQUksQ0FBQzt5QkFDYjt3QkFDRCxPQUFPLEtBQUssQ0FBQztxQkFDZDtvQkFDRCxJQUFJLENBQUMsc0JBQXNCLENBQUMsWUFBWSxFQUFFLElBQUksRUFBRSxJQUFJLENBQUMsQ0FBQztnQkFDeEQsQ0FBQzthQUNGLENBQUMsQ0FBQztZQUVILElBQUksQ0FBQyxVQUFVLENBQUM7Z0JBQ2QsRUFBRSxFQUFFLHFDQUFxQztnQkFDekMsSUFBSSxFQUFFLDRCQUE0QjtnQkFDbEMsbUJBQW1CLEVBQUUsQ0FDbkIsUUFBaUIsRUFDakIsTUFBYyxFQUNkLElBQWtCLEVBQ2xCLEVBQUU7b0JBQ0YsTUFBTSxZQUFZLEdBQUcsR0FBRyxDQUFDLFdBQVcsQ0FBQyx3QkFBd0IsQ0FBQztvQkFDOUQsSUFBSSxRQUFRLEVBQUU7d0JBQ1osSUFBSSxJQUFJLENBQUMsc0JBQXNCLENBQUMsWUFBWSxFQUFFLElBQUksQ0FBQyxLQUFLLElBQUksRUFBRTs0QkFDNUQsT0FBTyxJQUFJLENBQUM7eUJBQ2I7d0JBQ0QsT0FBTyxLQUFLLENBQUM7cUJBQ2Q7b0JBQ0QsSUFBSSxDQUFDLHNCQUFzQixDQUFDLFlBQVksRUFBRSxLQUFLLEVBQUUsSUFBSSxDQUFDLENBQUM7Z0JBQ3pELENBQUM7YUFDRixDQUFDLENBQUM7WUFFSCxJQUFJLENBQUMsVUFBVSxDQUFDO2dCQUNkLEVBQUUsRUFBRSwwQ0FBMEM7Z0JBQzlDLElBQUksRUFBRSxpQkFBaUI7Z0JBQ3ZCLGFBQWEsRUFBRSxDQUFDLFFBQWlCLEVBQUUsRUFBRTtvQkFDbkMsSUFBSSxJQUFJLENBQUMsUUFBUSxDQUFDLHVCQUF1QixFQUFFO3dCQUN6QyxJQUFJLENBQUMsUUFBUSxFQUFFOzRCQUNiLElBQUksQ0FBQyxRQUFRLENBQUMsYUFBYSxHQUFHLEVBQUUsQ0FBQzs0QkFDakMsSUFBSSxDQUFDLFFBQVEsQ0FBQyx1QkFBdUIsR0FBRyxLQUFLLENBQUM7NEJBQzlDLElBQUksQ0FBQyxZQUFZLEVBQUUsQ0FBQzt5QkFDckI7d0JBQ0QsT0FBTyxJQUFJLENBQUM7cUJBQ2I7b0JBQ0QsT0FBTyxLQUFLLENBQUM7Z0JBQ2YsQ0FBQzthQUNGLENBQUMsQ0FBQztZQUVILElBQUksQ0FBQyxhQUFhLENBQUMsSUFBSSxrQkFBa0IsQ0FBQyxJQUFJLENBQUMsR0FBRyxFQUFFLElBQUksQ0FBQyxDQUFDLENBQUM7UUFDN0QsQ0FBQztLQUFBO0lBRUQsUUFBUSxLQUFJLENBQUM7SUFFUCxZQUFZOztZQUNoQixJQUFJLENBQUMsUUFBUSxtQ0FBUSxnQkFBZ0IsR0FBSyxDQUFDLE1BQU0sSUFBSSxDQUFDLFFBQVEsRUFBRSxDQUFDLENBQUUsQ0FBQztRQUN0RSxDQUFDO0tBQUE7SUFFSyxZQUFZOztZQUNoQixNQUFNLElBQUksQ0FBQyxRQUFRLENBQUMsSUFBSSxDQUFDLFFBQVEsQ0FBQyxDQUFDO1FBQ3JDLENBQUM7S0FBQTtJQUVhLGtCQUFrQixDQUFDLElBQVc7O1lBQzFDLE1BQU0sWUFBWSxHQUFHLE1BQU0sSUFBSSxDQUFDLEdBQUcsQ0FBQyxLQUFLLENBQUMsVUFBVSxDQUFDLElBQUksQ0FBQyxDQUFDO1lBQzNELE1BQU0sSUFBSSxHQUFHLE1BQU0sSUFBSSxDQUFDLG1CQUFtQixDQUFDLFlBQVksQ0FBQyxDQUFDO1lBQzFELElBQUksSUFBSSxFQUFFO2dCQUNSLHlDQUF5QztnQkFDekMsTUFBTSxFQUFFLElBQUksRUFBRSxPQUFPLEVBQUUsR0FBRyxNQUFNLENBQUMsWUFBWSxFQUFFLEVBQUUsQ0FBQyxDQUFDO2dCQUNuRCxNQUFNLFlBQVksR0FBRyxHQUFHLENBQUMsV0FBVyxDQUFDLFlBQVksQ0FBQztnQkFDbEQsSUFBSSxDQUFDLGlCQUFpQixDQUFDLElBQUksRUFBRSxZQUFZLEVBQUUsSUFBSSxDQUFDLENBQUM7Z0JBQ2pELE1BQU0seUJBQXlCLEdBQUcsR0FBRztvQkFDbkMsV0FBVztpQkFDWiw0QkFBNEIsQ0FBQztnQkFDOUIsSUFBSSxDQUFDLGlCQUFpQixDQUFDLElBQUksRUFBRSx5QkFBeUIsRUFBRSxLQUFLLENBQUMsQ0FBQztnQkFDL0QsSUFBSSxDQUFDLEdBQUcsQ0FBQyxLQUFLLENBQUMsTUFBTSxDQUFDLElBQWEsRUFBRSxNQUFNLENBQUMsU0FBUyxDQUFDLE9BQU8sRUFBRSxJQUFJLEVBQUUsRUFBRSxDQUFDLENBQUMsQ0FBQzthQUMzRTtpQkFBTTtnQkFDTCx3Q0FBd0M7YUFDekM7UUFDSCxDQUFDO0tBQUE7SUFFRCwyREFBMkQ7SUFDM0QsaUZBQWlGO0lBQ2pGLHFGQUFxRjtJQUN2RSxtQkFBbUIsQ0FBQyxJQUFZOztZQUM1QyxNQUFNLEVBQUUsSUFBSSxFQUFFLE9BQU8sRUFBRSxlQUFlLEVBQUUsR0FBRyxNQUFNLENBQUMsSUFBSSxFQUFFLEVBQUUsQ0FHekQsQ0FBQztZQUNGLHlGQUF5RjtZQUN6Rix3Q0FBd0M7WUFDeEMsTUFBTSxXQUFXLEdBQUcsSUFBSSxDQUFDLFdBQVcsQ0FBQyxDQUFDO1lBQ3RDLG1DQUFtQztZQUNuQyxJQUFJLENBQUMsV0FBVyxJQUFJLFdBQVcsQ0FBQyxJQUFJLEtBQUssUUFBUSxDQUFDLFdBQVcsRUFBRTtnQkFDN0QsT0FBTzthQUNSO1lBQ0QsTUFBTSxJQUFJLEdBQUcsSUFBSSxDQUFDLFFBQVEsQ0FBQyxrQkFBa0I7Z0JBQzNDLENBQUMsQ0FBQyxHQUFHLElBQUksQ0FBQyxRQUFRLENBQUMsa0JBQWtCLElBQUksV0FBVyxDQUFDLFFBQVEsQ0FBQyxrQkFBa0IsRUFBRTtnQkFDbEYsQ0FBQyxDQUFDLElBQUksQ0FBQyxRQUFRLENBQUMsa0JBQWtCLENBQUM7WUFDckMsZ0VBQWdFO1lBQ2hFLG9EQUFvRDtZQUNwRCx3RUFBd0U7WUFDeEUsMENBQTBDO1lBQzFDLElBQUksSUFBSSxDQUFDO1lBQ1QsSUFBSTtnQkFDRixNQUFNLEVBQ0osT0FBTyxFQUFFLFVBQVUsRUFDbkIsZUFBZSxFQUNmLFFBQVEsR0FDVCxHQUFHLE1BQU0sSUFBSSxDQUFDLFVBQVUsQ0FBQztvQkFDeEIsSUFBSTtvQkFDSixRQUFRLEVBQUUsRUFBRTtvQkFDWixRQUFRLEVBQUU7d0JBQ1IsT0FBTyxFQUFFLFdBQVcsQ0FBQyxJQUFJLENBQUMsT0FBTzt3QkFDakMsUUFBUSxFQUFFLFdBQVcsQ0FBQyxJQUFJLENBQUMsUUFBUTt3QkFDbkMsS0FBSyxFQUFFLFdBQVcsQ0FBQyxJQUFJLENBQUMsU0FBUzt3QkFDakMsV0FBVyxFQUFFLElBQUk7d0JBQ2pCLElBQUksRUFBRSxNQUFNO3dCQUNaLElBQUksRUFBRSxNQUFNO3dCQUNaLElBQUksRUFBRSxHQUFHLFdBQVcsQ0FBQyxJQUFJLENBQUMsSUFBSSxFQUFFO3dCQUNoQyxJQUFJLEVBQUUsVUFBVSxXQUFXLENBQUMsSUFBSSxDQUFDLElBQUksSUFBSSxXQUFXLENBQUMsSUFBSSxDQUFDLFNBQVMsTUFBTSxXQUFXLENBQUMsSUFBSSxDQUFDLFFBQVEsSUFBSSxxQkFBcUIsRUFBRTtxQkFDOUg7b0JBQ0QsZ0JBQWdCLEVBQUUsV0FBVyxDQUFDLFFBQVEsQ0FBQyxrQkFBa0I7b0JBQ3pELElBQUksRUFBRTt3QkFDSixLQUFLLEVBQUUsV0FBVyxDQUFDLElBQUksQ0FBQyxLQUFLO3dCQUM3QixPQUFPLEVBQUUsV0FBVyxDQUFDLElBQUksQ0FBQyxPQUFPO3dCQUNqQyxnQkFBZ0IsRUFBRSxDQUFDO3dCQUNuQixTQUFTLEVBQUUsRUFBRTt3QkFDYixTQUFTLEVBQUUsV0FBVyxDQUFDLElBQUksQ0FBQyxTQUFTO3FCQUN0QztvQkFDRCxVQUFVLEVBQUUsV0FBVyxDQUFDLFFBQVEsQ0FBQyxZQUFZO2lCQUM5QyxDQUFDLENBQUM7Z0JBQ0gsSUFBSSxHQUFHLElBQUksQ0FBQyxnQkFBZ0IsQ0FBQyxlQUFlLEVBQUUsVUFBVSxDQUFDLENBQUM7YUFDM0Q7WUFBQyxPQUFPLENBQUMsRUFBRTtnQkFDVixPQUFPLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQyxDQUFDO2dCQUNqQixNQUFNLElBQUksS0FBSyxDQUFDLFNBQVMsQ0FBQywyQkFBMkIsQ0FBQyxDQUFDO2FBQ3hEO1lBRUQsK0NBQStDO1lBQy9DLCtGQUErRjtZQUMvRixNQUFNLGdCQUFnQixHQUFHLElBQUksQ0FBQyxTQUFTLENBQ3JDLENBQUMsT0FBTyxFQUFFLEVBQUUsQ0FBQyxPQUFPLENBQUMsS0FBSyxJQUFJLE9BQU8sQ0FBQyxLQUFLLEtBQUsscUJBQXFCLENBQ3RFLENBQUM7WUFDRixJQUFJLGdCQUFnQixLQUFLLENBQUMsQ0FBQyxFQUFFO2dCQUMzQixNQUFNLElBQUksS0FBSyxDQUFDLFNBQVMsQ0FBQyxvQkFBb0IsQ0FBQyxDQUFDO2FBQ2pEO1lBQ0Qsd0VBQXdFO1lBQ3hFLE1BQU0sT0FBTyxHQUFHLElBQUksQ0FBQyxnQkFBZ0IsR0FBRyxDQUFDLENBQUMsQ0FBQyxLQUFLLENBQUM7WUFDakQsa0VBQWtFO1lBQ2xFLElBQUksT0FBTyxLQUFLLFdBQVcsQ0FBQyxJQUFJLENBQUMsSUFBSSxFQUFFO2dCQUNyQyxPQUFPO2FBQ1I7WUFDRCxPQUFPLE9BQU8sQ0FBQztRQUNqQixDQUFDO0tBQUE7SUFFTyxpQkFBaUIsQ0FBQyxNQUE0QixFQUFFLElBQVk7UUFDbEUsSUFBSSxJQUFJLEtBQUssU0FBUyxJQUFJLElBQUksS0FBSyxJQUFJLEVBQUU7WUFDdkMsT0FBTyxNQUFNLENBQUM7U0FDZjtRQUNELE1BQU0sS0FBSyxHQUFHLElBQUksQ0FBQyxLQUFLLENBQUMsR0FBRyxDQUFDLENBQUM7UUFDOUIsS0FBSyxJQUFJLENBQUMsR0FBRyxDQUFDLEVBQUUsQ0FBQyxHQUFHLEtBQUssQ0FBQyxNQUFNLEVBQUUsRUFBRSxDQUFDLEVBQUU7WUFDckMsSUFBSSxNQUFNLEtBQUssU0FBUyxJQUFJLE1BQU0sS0FBSyxJQUFJLEVBQUU7Z0JBQzNDLE9BQU8sU0FBUyxDQUFDO2FBQ2xCO1lBQ0QsTUFBTSxHQUFHLEdBQUcsS0FBSyxDQUFDLENBQUMsQ0FBQyxDQUFDO1lBQ3JCLE1BQU0sR0FBRyxNQUFNLENBQUMsR0FBRyxDQUFDLENBQUM7U0FDdEI7UUFDRCxPQUFPLE1BQU0sQ0FBQztJQUNoQixDQUFDO0lBRU8saUJBQWlCLENBQ3ZCLE1BQTRCLEVBQzVCLElBQVksRUFDWixLQUFVOztRQUVWLE1BQU0sS0FBSyxHQUFHLElBQUksQ0FBQyxLQUFLLENBQUMsR0FBRyxDQUFDLENBQUM7UUFDOUIsTUFBTSxLQUFLLEdBQUcsS0FBSyxDQUFDLE1BQU0sR0FBRyxDQUFDLENBQUM7UUFDL0IsS0FBSyxJQUFJLENBQUMsR0FBRyxDQUFDLEVBQUUsQ0FBQyxHQUFHLEtBQUssRUFBRSxFQUFFLENBQUMsRUFBRTtZQUM5QixNQUFNLEdBQUcsR0FBRyxLQUFLLENBQUMsQ0FBQyxDQUFDLENBQUM7WUFDckIsTUFBTSxHQUFHLE1BQUEsTUFBTSxDQUFDLEdBQUcsQ0FBQyxtQ0FBSSxDQUFDLE1BQU0sQ0FBQyxHQUFHLENBQUMsR0FBRyxFQUFFLENBQUMsQ0FBQztTQUM1QztRQUNELE1BQU0sR0FBRyxHQUFHLEtBQUssQ0FBQyxLQUFLLENBQUMsQ0FBQztRQUN6QixNQUFNLENBQUMsR0FBRyxDQUFDLEdBQUcsS0FBSyxDQUFDO0lBQ3RCLENBQUM7SUFFRCxzQkFBc0IsQ0FBQyxRQUFnQixFQUFFLEtBQVUsRUFBRSxJQUFrQjtRQUNyRSxNQUFNLEVBQUUsSUFBSSxFQUFFLE9BQU8sRUFBRSxHQUFHLE1BQU0sQ0FBQyxJQUFJLENBQUMsSUFBSSxFQUFFLEVBQUUsQ0FBQyxDQUFDO1FBQ2hELElBQUksQ0FBQyxpQkFBaUIsQ0FBQyxJQUFJLEVBQUUsUUFBUSxFQUFFLEtBQUssQ0FBQyxDQUFDO1FBQzlDLE1BQU0sSUFBSSxHQUFHLE1BQU0sQ0FBQyxTQUFTLENBQUMsT0FBTyxFQUFFLElBQUksQ0FBQyxDQUFDO1FBQzdDLElBQUksQ0FBQyxXQUFXLENBQUMsSUFBSSxFQUFFLEtBQUssQ0FBQyxDQUFDO1FBQzlCLElBQUksQ0FBQyxXQUFXLEVBQUUsQ0FBQztJQUNyQixDQUFDO0lBRUQsc0JBQXNCLENBQUMsUUFBZ0IsRUFBRSxJQUFrQjtRQUN6RCxNQUFNLEVBQUUsSUFBSSxFQUFFLE9BQU8sRUFBRSxHQUFHLE1BQU0sQ0FBQyxJQUFJLENBQUMsSUFBSSxFQUFFLEVBQUUsQ0FBQyxDQUFDO1FBQ2hELE9BQU8sSUFBSSxDQUFDLGlCQUFpQixDQUFDLElBQUksRUFBRSxRQUFRLENBQUMsQ0FBQztJQUNoRCxDQUFDO0lBRWEsVUFBVSxDQUFDLElBT3hCOztZQUNDLE1BQU0sRUFBRSxJQUFJLEVBQUUsUUFBUSxFQUFFLFFBQVEsRUFBRSxnQkFBZ0IsRUFBRSxJQUFJLEVBQUUsVUFBVSxFQUFFLEdBQ3BFLElBQUksQ0FBQztZQUNQLHVGQUF1RjtZQUN2RixNQUFNLElBQUksR0FBRyxRQUFRLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxRQUFRLENBQUMsUUFBUSxDQUFDLElBQUksQ0FBQyxLQUFLLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUM7WUFDM0UsTUFBTSxVQUFVLEdBQUcsUUFBUSxDQUFDLElBQUk7Z0JBQzlCLENBQUMsQ0FBQyxRQUFRLENBQUMsSUFBSSxDQUFDLEtBQUssQ0FBQyxRQUFRLENBQUMsUUFBUSxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsT0FBTyxDQUFDLFlBQVksRUFBRSxFQUFFLENBQUM7Z0JBQ3JFLENBQUMsQ0FBQyxFQUFFLENBQUM7WUFDUCxNQUFNLFNBQVMsR0FBRyxVQUFVO2dCQUMxQixDQUFDLENBQUMsSUFBSSxDQUFDLFdBQVcsQ0FBQyxVQUFVLEVBQUUsSUFBSSxDQUFDLFFBQVEsQ0FBQyxnQkFBZ0IsQ0FBQztnQkFDOUQsQ0FBQyxDQUFDLEdBQUcsSUFBSSxDQUFDLFdBQVcsQ0FDakIsUUFBUSxDQUFDLEtBQUssRUFDZCxJQUFJLENBQUMsUUFBUSxDQUFDLGdCQUFnQixDQUMvQixNQUFNLElBQUksQ0FBQyxPQUFPLEVBQUUsQ0FBQztZQUMxQixNQUFNLFFBQVEsR0FBRyxhQUFhLENBQUMsR0FBRyxJQUFJLElBQUksU0FBUyxFQUFFLENBQUMsQ0FBQztZQUV2RCxNQUFNLGVBQWUsR0FBRzs7Ozs7Ozs7OztlQVViLENBQUM7WUFFWixNQUFNLFlBQVksR0FBRyxJQUFJLENBQUMsUUFBUSxDQUFDLGNBQWM7Z0JBQy9DLENBQUMsQ0FBQyxJQUFJLENBQUMsR0FBRyxDQUFDLEtBQUssQ0FBQyxxQkFBcUIsQ0FBQyxJQUFJLENBQUMsUUFBUSxDQUFDLFlBQVksQ0FBQztnQkFDbEUsQ0FBQyxDQUFDLElBQUksQ0FBQztZQUNULE1BQU0sUUFBUSxHQUFHLFlBQVk7Z0JBQzNCLENBQUMsQ0FBQyxNQUFNLElBQUksQ0FBQyxHQUFHLENBQUMsS0FBSyxDQUFDLElBQUksQ0FBQyxZQUFxQixDQUFDO2dCQUNsRCxDQUFDLENBQUMsZUFBZSxDQUFDO1lBQ3BCLE1BQU0sUUFBUSxHQUFHLGFBQWEsQ0FBQyxHQUFHLElBQUksSUFBSSxnQkFBZ0IsRUFBRSxDQUFDLENBQUM7WUFDOUQsTUFBTSxPQUFPLEdBQUcsQ0FBQyxNQUFNLEdBQUcsQ0FBQyxNQUFNLENBQUMsUUFBUSxFQUFFO2dCQUMxQyxRQUFRO2dCQUNSLEtBQUssRUFBRSxJQUFJLENBQUMsS0FBSztnQkFDakIsT0FBTyxFQUFFLElBQUksQ0FBQyxPQUFPO2dCQUNyQixPQUFPLEVBQUUsUUFBUSxDQUFDLE9BQU87Z0JBQ3pCLFNBQVMsRUFBRSxRQUFRLENBQUMsS0FBSztnQkFDekIsSUFBSSxFQUFFLFVBQVU7Z0JBQ2hCLFFBQVEsRUFBRSxRQUFRLENBQUMsUUFBUTtnQkFDM0IsSUFBSTthQUNMLENBQUMsQ0FBVyxDQUFDO1lBRWQsTUFBTSxlQUFlLEdBQW1DO2dCQUN0RCxDQUFDLFdBQVcsQ0FBQyxFQUFFO29CQUNiLElBQUksRUFBRSxRQUFRLENBQUMsV0FBVztvQkFDMUIsUUFBUTtvQkFDUixJQUFJLEVBQUU7d0JBQ0osS0FBSyxFQUFFLElBQUksQ0FBQyxLQUFLO3dCQUNqQixPQUFPLEVBQUUsSUFBSSxDQUFDLE9BQU87d0JBQ3JCLE9BQU8sRUFBRSxRQUFRLENBQUMsT0FBTzt3QkFDekIsSUFBSTt3QkFDSixTQUFTLEVBQUUsUUFBUSxDQUFDLEtBQUs7d0JBQ3pCLFFBQVEsRUFBRSxRQUFRLENBQUMsUUFBUTt3QkFDM0IsSUFBSSxFQUFFLFVBQVU7cUJBQ2pCO29CQUNELFFBQVEsRUFBRTt3QkFDUixTQUFTLEVBQUUsTUFBTSxDQUFDLFVBQVUsQ0FBQyxLQUFLLENBQUMsQ0FBQyxNQUFNLENBQUMsT0FBTyxDQUFDLENBQUMsTUFBTSxDQUFDLEtBQUssQ0FBQzt3QkFDakUsWUFBWSxFQUFFLFVBQVUsSUFBSSxJQUFJLENBQUMsUUFBUSxDQUFDLFVBQVU7d0JBQ3BELGdCQUFnQixFQUFFLElBQUk7d0JBQ3RCLGtCQUFrQixFQUFFLGdCQUFnQjtxQkFDckM7aUJBQ0Y7YUFDRixDQUFDO1lBRUYsT0FBTyxFQUFFLE9BQU8sRUFBRSxlQUFlLEVBQUUsUUFBUSxFQUFFLENBQUM7UUFDaEQsQ0FBQztLQUFBO0lBRUssMEJBQTBCLENBQzlCLFFBSUMsRUFDRCxVQUFrQjs7WUFFbEIsTUFBTSxFQUFFLElBQUksRUFBRSxJQUFJLEVBQUUsZ0JBQWdCLEVBQUUsR0FBRyxRQUFRLENBQUM7WUFDbEQsSUFBSSxFQUFFLFVBQVUsRUFBRSxHQUFHLElBQUksQ0FBQyxRQUFRLENBQUM7WUFDbkMsSUFBSSxVQUFVLEVBQUU7Z0JBQ2QsTUFBTSxFQUFFLElBQUksRUFBRSxPQUFPLEVBQUUsR0FBRyxNQUFNLENBQzlCLE1BQU0sSUFBSSxDQUFDLEdBQUcsQ0FBQyxLQUFLLENBQUMsSUFBSSxDQUFDLFVBQVUsQ0FBQyxFQUNyQyxFQUFFLENBQ0gsQ0FBQztnQkFDRixVQUFVLEdBQUcsSUFBSSxDQUFDLFdBQVcsQ0FBQyxDQUFDLFFBQVEsQ0FBQyxZQUFZLENBQUM7Z0JBQ3JELE1BQU0sYUFBYSxHQUFHLElBQUksQ0FBQyxXQUFXLENBQUMsQ0FBQyxRQUFRLENBQUMsZ0JBQWdCLENBQUM7Z0JBQ2xFLElBQUksQ0FBQyxVQUFVLElBQUksQ0FBQyxhQUFhLEVBQUU7b0JBQ2pDLE9BQU87aUJBQ1I7YUFDRjtZQUNELE1BQU0sV0FBVyxHQUFHO2dCQUNsQixRQUFRLEVBQUUsUUFBUSxDQUFDLFNBQVM7Z0JBQzVCLENBQUMsV0FBVyxDQUFDLEVBQUU7b0JBQ2IsUUFBUSxFQUFFLE1BQU07eUJBQ2IsVUFBVSxDQUFDLEtBQUssQ0FBQzt5QkFDakIsTUFBTSxDQUFDLEdBQUcsSUFBSSxDQUFDLEtBQUssTUFBTSxJQUFJLENBQUMsT0FBTyxHQUFHLENBQUM7eUJBQzFDLE1BQU0sQ0FBQyxLQUFLLENBQUM7b0JBQ2hCLElBQUksRUFBRSxRQUFRLENBQUMsU0FBUztvQkFDeEIsSUFBSSxFQUFFO3dCQUNKLEtBQUssRUFBRSxJQUFJLENBQUMsS0FBSzt3QkFDakIsT0FBTyxFQUFFLElBQUksQ0FBQyxPQUFPO3FCQUN0QjtvQkFDRCxRQUFRLEVBQUU7d0JBQ1IsZ0JBQWdCLEVBQUUsSUFBSSxDQUFDLGdCQUFnQjt3QkFDdkMsYUFBYSxFQUFFLGdCQUFnQjt3QkFDL0IsWUFBWSxFQUFFLFVBQVU7d0JBQ3hCLGdCQUFnQixFQUFFLElBQUk7cUJBQ3ZCO2lCQUNGO2FBQ0YsQ0FBQztZQUVGLE1BQU0sZUFBZSxHQUFHOzs7Ozs7MkRBTStCLFFBQVEsQ0FBQyxXQUFXOzs7S0FHMUUsQ0FBQztZQUVGLE1BQU0sWUFBWSxHQUFHLElBQUksQ0FBQyxRQUFRLENBQUMsc0JBQXNCO2dCQUN2RCxDQUFDLENBQUMsSUFBSSxDQUFDLEdBQUcsQ0FBQyxLQUFLLENBQUMscUJBQXFCLENBQUMsSUFBSSxDQUFDLFFBQVEsQ0FBQyxvQkFBb0IsQ0FBQztnQkFDMUUsQ0FBQyxDQUFDLElBQUksQ0FBQztZQUNULE1BQU0sUUFBUSxHQUFHLFlBQVk7Z0JBQzNCLENBQUMsQ0FBQyxNQUFNLElBQUksQ0FBQyxHQUFHLENBQUMsS0FBSyxDQUFDLElBQUksQ0FBQyxZQUFxQixDQUFDO2dCQUNsRCxDQUFDLENBQUMsZUFBZSxDQUFDO1lBQ3BCLE1BQU0sT0FBTyxHQUFHLENBQUMsTUFBTSxHQUFHLENBQUMsTUFBTSxDQUMvQixRQUFRLEVBQ1IsV0FBVyxDQUFDLFdBQVcsQ0FBQyxDQUN6QixDQUFXLENBQUM7WUFDYixJQUFJLFVBQVUsRUFBRTtnQkFDZCxJQUFJLENBQUMsR0FBRyxDQUFDLEtBQUssQ0FBQyxNQUFNLENBQUMsVUFBVSxFQUFFLE1BQU0sQ0FBQyxTQUFTLENBQUMsT0FBTyxFQUFFLFdBQVcsQ0FBQyxDQUFDLENBQUM7YUFDM0U7aUJBQU07Z0JBQ0wsSUFBSSxDQUFDLEdBQUcsQ0FBQyxLQUFLLENBQUMsTUFBTSxDQUNuQixHQUFHLElBQUksSUFBSSxnQkFBZ0IsS0FBSyxFQUNoQyxNQUFNLENBQUMsU0FBUyxDQUFDLE9BQU8sRUFBRSxXQUFXLENBQUMsQ0FDdkMsQ0FBQzthQUNIO1FBQ0gsQ0FBQztLQUFBO0lBRUssV0FBVzs7O1lBQ2YsTUFBTSxRQUFRLEdBQUcsSUFBSSxnQkFBZ0IsQ0FBQyxJQUFJLENBQUMsUUFBUSxDQUFDLGdCQUFnQixDQUFDLENBQUM7WUFDdEUsTUFBTSxJQUFJLEdBQVUsTUFBTSxRQUFRLENBQUMsSUFBSSxFQUFFLENBQUM7WUFFMUMsc0RBQXNEO1lBQ3RELE1BQU0sYUFBYSxHQU1mLEVBQUUsQ0FBQztZQUNQLElBQUksQ0FBQyxHQUFHLENBQUMsS0FBSyxDQUFDLGdCQUFnQixFQUFFLENBQUMsT0FBTyxDQUFDLENBQUMsQ0FBQyxFQUFFLEVBQUU7O2dCQUM5QyxNQUFNLEVBQUUsR0FBRyxNQUFBLElBQUksQ0FBQyxHQUFHLENBQUMsYUFBYSxDQUFDLFlBQVksQ0FBQyxDQUFDLENBQUMsMENBQUUsV0FBVyxDQUFDO2dCQUMvRCxJQUFJLE1BQUEsRUFBRSxhQUFGLEVBQUUsdUJBQUYsRUFBRSxDQUFHLFdBQVcsQ0FBQywwQ0FBRSxRQUFRLEVBQUU7b0JBQy9CLGFBQWEsQ0FBQyxFQUFFLENBQUMsV0FBVyxDQUFDLENBQUMsUUFBUSxDQUFDLEdBQUc7d0JBQ3hDLFlBQVksRUFBRSxFQUFFLENBQUMsV0FBVyxDQUFDLENBQUMsUUFBUSxDQUFDLFlBQVk7d0JBQ25ELGdCQUFnQixFQUFFLEVBQUUsQ0FBQyxXQUFXLENBQUMsQ0FBQyxRQUFRLENBQUMsZ0JBQWdCO3dCQUMzRCxJQUFJLEVBQUUsQ0FBQztxQkFDUixDQUFDO2lCQUNIO1lBQ0gsQ0FBQyxDQUFDLENBQUM7WUFFSCxLQUFLLE1BQU0sSUFBSSxJQUFJLElBQUksRUFBRTtnQkFDdkIsTUFBTSxnQkFBZ0IsR0FBRyxHQUFHLElBQUksQ0FBQyxXQUFXLENBQzFDLElBQUksQ0FBQyxJQUFJLENBQUMsQ0FBQyxLQUFLLEVBQ2hCLElBQUksQ0FBQyxRQUFRLENBQUMsZ0JBQWdCLENBQy9CLElBQUksSUFBSSxDQUFDLElBQUksQ0FBQyxDQUFDLE9BQU8sRUFBRSxDQUFDO2dCQUMxQixxSEFBcUg7Z0JBQ3JILE1BQU0sSUFBSSxHQUFHLElBQUksQ0FBQyxRQUFRLENBQUMsa0JBQWtCO29CQUMzQyxDQUFDLENBQUMsR0FBRyxJQUFJLENBQUMsUUFBUSxDQUFDLGtCQUFrQixJQUFJLGdCQUFnQixFQUFFO29CQUMzRCxDQUFDLENBQUMsSUFBSSxDQUFDLFFBQVEsQ0FBQyxrQkFBa0IsQ0FBQztnQkFDckMsOERBQThEO2dCQUM5RCxJQUFJLElBQUksQ0FBQyxRQUFRLENBQUMsa0JBQWtCLEVBQUU7b0JBQ3BDLElBQUksQ0FBQyxJQUFJLENBQUMsR0FBRyxDQUFDLEtBQUssQ0FBQyxxQkFBcUIsQ0FBQyxJQUFJLENBQUMsRUFBRTt3QkFDL0MsSUFBSSxDQUFDLEdBQUcsQ0FBQyxLQUFLLENBQUMsWUFBWSxDQUFDLElBQUksQ0FBQyxDQUFDO3FCQUNuQztpQkFDRjtnQkFDRCw2SEFBNkg7Z0JBQzdILElBQUksSUFBSSxDQUFDLFFBQVEsQ0FBQyxtQkFBbUIsRUFBRTtvQkFDckMsSUFBSSxDQUFDLDBCQUEwQixDQUM3Qjt3QkFDRSxJQUFJO3dCQUNKLGdCQUFnQjt3QkFDaEIsSUFBSSxFQUFFLElBQUksQ0FBQyxJQUFJLENBQUM7cUJBQ2pCLEVBQ0QsSUFBSSxDQUFDLEdBQUcsQ0FBQyxLQUFLLENBQUMscUJBQXFCLENBQ2xDLEdBQUcsSUFBSSxJQUFJLGdCQUFnQixLQUFLLENBQ3hCLENBQ1gsQ0FBQztpQkFDSDtnQkFFRCxLQUFLLE1BQU0sUUFBUSxJQUFJLElBQUksQ0FBQyxJQUFJLENBQUMsQ0FBQyxTQUFTLEVBQUU7b0JBQzNDLE1BQU0sVUFBVSxHQUFZLEtBQUssQ0FBQztvQkFDbEMsTUFBTSxRQUFRLEdBQUcsTUFBTTt5QkFDcEIsVUFBVSxDQUFDLEtBQUssQ0FBQzt5QkFDakIsTUFBTSxDQUNMLEdBQUcsSUFBSSxDQUFDLElBQUksQ0FBQyxDQUFDLEtBQUssTUFBTSxJQUFJLENBQUMsSUFBSSxDQUFDLENBQUMsT0FBTyxNQUFNLElBQUksQ0FBQyxJQUFJLENBQUMsQ0FBQyxTQUFTLENBQUMsUUFBUSxDQUFDLENBQUMsSUFBSSxNQUFNLElBQUksQ0FBQyxJQUFJLENBQUMsQ0FBQyxTQUFTLENBQUMsUUFBUSxDQUFDLENBQUMsSUFBSSxFQUFFLENBQ2hJO3lCQUNBLE1BQU0sQ0FBQyxLQUFLLENBQUMsQ0FBQztvQkFFakIsZ0RBQWdEO29CQUNoRCxJQUFJLENBQUMsTUFBTSxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsUUFBUSxDQUFDLGFBQWEsQ0FBQyxDQUFDLFFBQVEsQ0FBQyxRQUFRLENBQUMsRUFBRTt3QkFDaEUsSUFBSSxDQUFDLE1BQU0sQ0FBQyxJQUFJLENBQUMsYUFBYSxDQUFDLENBQUMsUUFBUSxDQUFDLFFBQVEsQ0FBQyxFQUFFOzRCQUNsRCxNQUFNLEVBQUUsT0FBTyxFQUFFLGVBQWUsRUFBRSxRQUFRLEVBQUUsR0FDMUMsTUFBTSxJQUFJLENBQUMsVUFBVSxDQUFDO2dDQUNwQixJQUFJO2dDQUNKLFFBQVE7Z0NBQ1IsUUFBUSxFQUFFLElBQUksQ0FBQyxJQUFJLENBQUMsQ0FBQyxTQUFTLENBQUMsUUFBUSxDQUFDO2dDQUN4QyxnQkFBZ0I7Z0NBQ2hCLElBQUksRUFBRSxJQUFJLENBQUMsSUFBSSxDQUFDO2dDQUNoQixVQUFVLEVBQUUsSUFBSSxDQUFDLFFBQVEsQ0FBQyxVQUFVOzZCQUNyQyxDQUFDLENBQUM7NEJBRUwsSUFBSSxDQUFDLEdBQUcsQ0FBQyxLQUFLLENBQUMsTUFBTSxDQUNuQixHQUFHLFFBQVEsS0FBSyxFQUNoQixNQUFNLENBQUMsU0FBUyxDQUFDLE9BQU8sRUFBRSxlQUFlLENBQUMsQ0FDM0MsQ0FBQzt5QkFDSDt3QkFDRCxJQUFJLENBQUMsUUFBUSxDQUFDLGFBQWEsQ0FBQyxRQUFRLENBQUMsR0FBRyxJQUFJLENBQUM7d0JBQzdDLCtGQUErRjtxQkFDaEc7eUJBQU0sSUFDTCxNQUFNLENBQUMsSUFBSSxDQUFDLGFBQWEsQ0FBQyxDQUFDLFFBQVEsQ0FBQyxRQUFRLENBQUM7d0JBQzdDLGFBQWEsQ0FBQyxRQUFRLENBQUMsQ0FBQyxZQUFZO3dCQUNwQyxDQUFDLGFBQWEsQ0FBQyxRQUFRLENBQUMsQ0FBQyxnQkFBZ0IsRUFDekM7d0JBQ0EsTUFBTSxJQUFJLEdBQUcsYUFBYSxDQUFDLFFBQVEsQ0FBQyxDQUFDLElBQWEsQ0FBQzt3QkFDbkQsTUFBTSxFQUFFLE9BQU8sRUFBRSxlQUFlLEVBQUUsUUFBUSxFQUFFLEdBQUcsTUFBTSxJQUFJLENBQUMsVUFBVSxDQUFDOzRCQUNuRSxJQUFJOzRCQUNKLFFBQVE7NEJBQ1IsUUFBUSxFQUFFLElBQUksQ0FBQyxJQUFJLENBQUMsQ0FBQyxTQUFTLENBQUMsUUFBUSxDQUFDOzRCQUN4QyxnQkFBZ0I7NEJBQ2hCLElBQUksRUFBRSxJQUFJLENBQUMsSUFBSSxDQUFDOzRCQUNoQixVQUFVLEVBQUUsTUFBQSxhQUFhLENBQUMsUUFBUSxDQUFDLDBDQUFFLFlBQVk7eUJBQ2xELENBQUMsQ0FBQzt3QkFFSCxJQUFJLENBQUMsR0FBRyxDQUFDLEtBQUssQ0FBQyxNQUFNLENBQ25CLElBQUksRUFDSixNQUFNLENBQUMsU0FBUyxDQUFDLE9BQU8sRUFBRSxlQUFlLENBQUMsQ0FDM0MsQ0FBQztxQkFDSDtpQkFDRjthQUNGO1lBQ0QsTUFBTSxJQUFJLENBQUMsWUFBWSxFQUFFLENBQUM7O0tBQzNCO0NBQ0Y7QUFFRCxNQUFNLGtCQUFtQixTQUFRLGdCQUFnQjtJQUcvQyxZQUFZLEdBQVEsRUFBRSxNQUFnQjtRQUNwQyxLQUFLLENBQUMsR0FBRyxFQUFFLE1BQU0sQ0FBQyxDQUFDO1FBQ25CLElBQUksQ0FBQyxNQUFNLEdBQUcsTUFBTSxDQUFDO0lBQ3ZCLENBQUM7SUFFRCxPQUFPO1FBQ0wsTUFBTSxFQUFFLFdBQVcsRUFBRSxHQUFHLElBQUksQ0FBQztRQUU3QixXQUFXLENBQUMsS0FBSyxFQUFFLENBQUM7UUFFcEIsV0FBVyxDQUFDLFFBQVEsQ0FBQyxJQUFJLEVBQUUsRUFBRSxJQUFJLEVBQUUsMkJBQTJCLEVBQUUsQ0FBQyxDQUFDO1FBRWxFLElBQUksT0FBTyxDQUFDLFdBQVcsQ0FBQzthQUNyQixPQUFPLENBQUMsdUJBQXVCLENBQUM7YUFDaEMsT0FBTyxDQUFDLCtCQUErQixDQUFDO2FBQ3hDLE9BQU8sQ0FBQyxDQUFDLElBQUksRUFBRSxFQUFFLENBQ2hCLElBQUk7YUFDRCxjQUFjLENBQUMseUNBQXlDLENBQUM7YUFDekQsUUFBUSxDQUFDLElBQUksQ0FBQyxNQUFNLENBQUMsUUFBUSxDQUFDLGdCQUFnQixDQUFDO2FBQy9DLFFBQVEsQ0FBQyxDQUFPLEtBQUssRUFBRSxFQUFFO1lBQ3hCLElBQUksQ0FBQyxNQUFNLENBQUMsUUFBUSxDQUFDLGdCQUFnQixHQUFHLEtBQUssQ0FBQztZQUM5QyxNQUFNLElBQUksQ0FBQyxNQUFNLENBQUMsWUFBWSxFQUFFLENBQUM7UUFDbkMsQ0FBQyxDQUFBLENBQUMsQ0FDTCxDQUFDO1FBRUosSUFBSSxPQUFPLENBQUMsV0FBVyxDQUFDO2FBQ3JCLE9BQU8sQ0FBQyw0QkFBNEIsQ0FBQzthQUNyQyxPQUFPLENBQUMsc0RBQXNELENBQUM7YUFDL0QsV0FBVyxDQUFDLENBQUMsUUFBUSxFQUFFLEVBQUU7WUFDeEIsTUFBTSxFQUFFLEtBQUssRUFBRSxHQUFHLElBQUksQ0FBQyxHQUFHLENBQUMsS0FBSyxDQUFDLE9BQWMsQ0FBQztZQUNoRCxNQUFNLE9BQU8sR0FBRyxNQUFNLENBQUMsSUFBSSxDQUFDLEtBQUssQ0FBQyxDQUFDLE1BQU0sQ0FDdkMsQ0FBQyxHQUFHLEVBQUUsRUFBRSxDQUFDLEtBQUssQ0FBQyxHQUFHLENBQUMsQ0FBQyxJQUFJLEtBQUssUUFBUSxDQUN0QyxDQUFDO1lBQ0YsT0FBTyxDQUFDLE9BQU8sQ0FBQyxDQUFDLEdBQUcsRUFBRSxFQUFFO2dCQUN0QixRQUFRLENBQUMsU0FBUyxDQUFDLEdBQUcsRUFBRSxHQUFHLENBQUMsQ0FBQztZQUMvQixDQUFDLENBQUMsQ0FBQztZQUNILE9BQU8sUUFBUTtpQkFDWixRQUFRLENBQUMsSUFBSSxDQUFDLE1BQU0sQ0FBQyxRQUFRLENBQUMsa0JBQWtCLENBQUM7aUJBQ2pELFFBQVEsQ0FBQyxDQUFPLEtBQUssRUFBRSxFQUFFO2dCQUN4QixJQUFJLENBQUMsTUFBTSxDQUFDLFFBQVEsQ0FBQyxrQkFBa0IsR0FBRyxLQUFLLENBQUM7Z0JBQ2hELE1BQU0sSUFBSSxDQUFDLE1BQU0sQ0FBQyxZQUFZLEVBQUUsQ0FBQztZQUNuQyxDQUFDLENBQUEsQ0FBQyxDQUFDO1FBQ1AsQ0FBQyxDQUFDLENBQUM7UUFFTCxJQUFJLE9BQU8sQ0FBQyxXQUFXLENBQUM7YUFDckIsT0FBTyxDQUFDLGNBQWMsQ0FBQzthQUN2QixPQUFPLENBQ04sY0FBYyxDQUFDLENBQUMsSUFBSSxFQUFFLEVBQUU7WUFDdEIsSUFBSSxDQUFDLFVBQVUsQ0FBQyw2Q0FBNkMsQ0FBQyxDQUFDO1lBQy9ELElBQUksQ0FBQyxRQUFRLENBQ1gsR0FBRyxFQUNIO2dCQUNFLElBQUksRUFBRSxlQUFlO2dCQUNyQixJQUFJLEVBQUUsc0RBQXNEO2FBQzdELEVBQ0QsQ0FBQyxDQUFDLEVBQUUsRUFBRTtnQkFDSixDQUFDLENBQUMsT0FBTyxDQUFDLFFBQVEsRUFBRSxRQUFRLENBQUMsQ0FBQztZQUNoQyxDQUFDLENBQ0YsQ0FBQztZQUNGLElBQUksQ0FBQyxVQUFVLENBQUMsR0FBRyxDQUFDLENBQUM7UUFDdkIsQ0FBQyxDQUFDLENBQ0g7YUFDQSxTQUFTLENBQUMsQ0FBQyxNQUFNLEVBQUUsRUFBRSxDQUNwQixNQUFNO2FBQ0gsUUFBUSxDQUFDLElBQUksQ0FBQyxNQUFNLENBQUMsUUFBUSxDQUFDLFVBQVUsQ0FBQzthQUN6QyxRQUFRLENBQUMsQ0FBTyxLQUFLLEVBQUUsRUFBRTtZQUN4QixJQUFJLENBQUMsTUFBTSxDQUFDLFFBQVEsQ0FBQyxVQUFVLEdBQUcsS0FBSyxDQUFDO1lBQ3hDLE1BQU0sSUFBSSxDQUFDLE1BQU0sQ0FBQyxZQUFZLEVBQUUsQ0FBQztRQUNuQyxDQUFDLENBQUEsQ0FBQyxDQUNMLENBQUM7UUFFSixJQUFJLE9BQU8sQ0FBQyxXQUFXLENBQUM7YUFDckIsT0FBTyxDQUFDLCtCQUErQixDQUFDO2FBQ3hDLE9BQU8sQ0FDTiwwRUFBMEUsQ0FDM0U7YUFDQSxTQUFTLENBQUMsQ0FBQyxNQUFNLEVBQUUsRUFBRSxDQUNwQixNQUFNO2FBQ0gsUUFBUSxDQUFDLElBQUksQ0FBQyxNQUFNLENBQUMsUUFBUSxDQUFDLGtCQUFrQixDQUFDO2FBQ2pELFFBQVEsQ0FBQyxDQUFPLEtBQUssRUFBRSxFQUFFO1lBQ3hCLElBQUksQ0FBQyxNQUFNLENBQUMsUUFBUSxDQUFDLGtCQUFrQixHQUFHLEtBQUssQ0FBQztZQUNoRCxNQUFNLElBQUksQ0FBQyxNQUFNLENBQUMsWUFBWSxFQUFFLENBQUM7UUFDbkMsQ0FBQyxDQUFBLENBQUMsQ0FDTCxDQUFDO1FBRUosV0FBVyxDQUFDLFFBQVEsQ0FBQyxJQUFJLEVBQUUsRUFBRSxJQUFJLEVBQUUsZUFBZSxFQUFFLENBQUMsQ0FBQztRQUV0RCxJQUFJLE9BQU8sQ0FBQyxXQUFXLENBQUM7YUFDckIsT0FBTyxDQUFDLGlCQUFpQixDQUFDO2FBQzFCLE9BQU8sQ0FBQyxxQ0FBcUMsQ0FBQzthQUM5QyxTQUFTLENBQUMsQ0FBQyxNQUFNLEVBQUUsRUFBRSxDQUNwQixNQUFNO2FBQ0gsUUFBUSxDQUFDLElBQUksQ0FBQyxNQUFNLENBQUMsUUFBUSxDQUFDLGNBQWMsQ0FBQzthQUM3QyxRQUFRLENBQUMsQ0FBTyxLQUFLLEVBQUUsRUFBRTtZQUN4QixJQUFJLENBQUMsTUFBTSxDQUFDLFFBQVEsQ0FBQyxjQUFjLEdBQUcsS0FBSyxDQUFDO1lBQzVDLE1BQU0sSUFBSSxDQUFDLE1BQU0sQ0FBQyxZQUFZLEVBQUUsQ0FBQztRQUNuQyxDQUFDLENBQUEsQ0FBQyxDQUNMLENBQUM7UUFFSixJQUFJLE9BQU8sQ0FBQyxXQUFXLENBQUM7YUFDckIsT0FBTyxDQUFDLGVBQWUsQ0FBQzthQUN4QixPQUFPLENBQUMsK0RBQStELENBQUM7YUFDeEUsT0FBTyxDQUFDLENBQUMsSUFBSSxFQUFFLEVBQUUsQ0FDaEIsSUFBSTthQUNELGNBQWMsQ0FBQyxtQkFBbUIsQ0FBQzthQUNuQyxRQUFRLENBQUMsSUFBSSxDQUFDLE1BQU0sQ0FBQyxRQUFRLENBQUMsWUFBWSxDQUFDO2FBQzNDLFFBQVEsQ0FBQyxDQUFPLEtBQUssRUFBRSxFQUFFO1lBQ3hCLElBQUksQ0FBQyxNQUFNLENBQUMsUUFBUSxDQUFDLFlBQVksR0FBRyxLQUFLLENBQUM7WUFDMUMsTUFBTSxJQUFJLENBQUMsTUFBTSxDQUFDLFlBQVksRUFBRSxDQUFDO1FBQ25DLENBQUMsQ0FBQSxDQUFDLENBQ0wsQ0FBQztRQUVKLElBQUksT0FBTyxDQUFDLFdBQVcsQ0FBQzthQUNyQixPQUFPLENBQUMsc0JBQXNCLENBQUM7YUFDL0IsT0FBTyxDQUFDLHdDQUF3QyxDQUFDO2FBQ2pELFNBQVMsQ0FBQyxDQUFDLE1BQU0sRUFBRSxFQUFFLENBQ3BCLE1BQU07YUFDSCxRQUFRLENBQUMsSUFBSSxDQUFDLE1BQU0sQ0FBQyxRQUFRLENBQUMsc0JBQXNCLENBQUM7YUFDckQsUUFBUSxDQUFDLENBQU8sS0FBSyxFQUFFLEVBQUU7WUFDeEIsSUFBSSxDQUFDLE1BQU0sQ0FBQyxRQUFRLENBQUMsc0JBQXNCLEdBQUcsS0FBSyxDQUFDO1lBQ3BELE1BQU0sSUFBSSxDQUFDLE1BQU0sQ0FBQyxZQUFZLEVBQUUsQ0FBQztRQUNuQyxDQUFDLENBQUEsQ0FBQyxDQUNMLENBQUM7UUFFSixJQUFJLE9BQU8sQ0FBQyxXQUFXLENBQUM7YUFDckIsT0FBTyxDQUFDLG9CQUFvQixDQUFDO2FBQzdCLE9BQU8sQ0FBQywrREFBK0QsQ0FBQzthQUN4RSxPQUFPLENBQUMsQ0FBQyxJQUFJLEVBQUUsRUFBRSxDQUNoQixJQUFJO2FBQ0QsY0FBYyxDQUFDLDRCQUE0QixDQUFDO2FBQzVDLFFBQVEsQ0FBQyxJQUFJLENBQUMsTUFBTSxDQUFDLFFBQVEsQ0FBQyxvQkFBb0IsQ0FBQzthQUNuRCxRQUFRLENBQUMsQ0FBTyxLQUFLLEVBQUUsRUFBRTtZQUN4QixJQUFJLENBQUMsTUFBTSxDQUFDLFFBQVEsQ0FBQyxvQkFBb0IsR0FBRyxLQUFLLENBQUM7WUFDbEQsTUFBTSxJQUFJLENBQUMsTUFBTSxDQUFDLFlBQVksRUFBRSxDQUFDO1FBQ25DLENBQUMsQ0FBQSxDQUFDLENBQ0wsQ0FBQztRQUVKLElBQUksT0FBTyxDQUFDLFdBQVcsQ0FBQzthQUNyQixPQUFPLENBQUMseUJBQXlCLENBQUM7YUFDbEMsT0FBTyxDQUNOLGNBQWMsQ0FBQyxDQUFDLElBQUksRUFBRSxFQUFFO1lBQ3RCLElBQUksQ0FBQyxVQUFVLENBQ2IsZ0VBQWdFLENBQ2pFLENBQUM7WUFDRixJQUFJLENBQUMsUUFBUSxDQUNYLEdBQUcsRUFDSDtnQkFDRSxJQUFJLEVBQUUsZUFBZTtnQkFDckIsSUFBSSxFQUFFLG1FQUFtRTthQUMxRSxFQUNELENBQUMsQ0FBQyxFQUFFLEVBQUU7Z0JBQ0osQ0FBQyxDQUFDLE9BQU8sQ0FBQyxRQUFRLEVBQUUsUUFBUSxDQUFDLENBQUM7WUFDaEMsQ0FBQyxDQUNGLENBQUM7WUFDRixJQUFJLENBQUMsVUFBVSxDQUFDLEdBQUcsQ0FBQyxDQUFDO1FBQ3ZCLENBQUMsQ0FBQyxDQUNIO2FBQ0EsU0FBUyxDQUFDLENBQUMsTUFBTSxFQUFFLEVBQUUsQ0FDcEIsTUFBTTthQUNILFFBQVEsQ0FBQyxJQUFJLENBQUMsTUFBTSxDQUFDLFFBQVEsQ0FBQyxtQkFBbUIsQ0FBQzthQUNsRCxRQUFRLENBQUMsQ0FBTyxLQUFLLEVBQUUsRUFBRTtZQUN4QixJQUFJLENBQUMsTUFBTSxDQUFDLFFBQVEsQ0FBQyxtQkFBbUIsR0FBRyxLQUFLLENBQUM7WUFDakQsTUFBTSxJQUFJLENBQUMsTUFBTSxDQUFDLFlBQVksRUFBRSxDQUFDO1FBQ25DLENBQUMsQ0FBQSxDQUFDLENBQ0wsQ0FBQztRQUVKLFdBQVcsQ0FBQyxRQUFRLENBQUMsSUFBSSxFQUFFLEVBQUUsSUFBSSxFQUFFLHFCQUFxQixFQUFFLENBQUMsQ0FBQztRQUU1RCxJQUFJLE9BQU8sQ0FBQyxXQUFXLENBQUMsQ0FBQyxPQUFPLENBQUMsUUFBUSxDQUFDLENBQUMsT0FBTyxDQUFDLENBQUMsSUFBSSxFQUFFLEVBQUUsQ0FDMUQsSUFBSTthQUNELGNBQWMsQ0FBQyxrQkFBa0IsQ0FBQzthQUNsQyxRQUFRLENBQUMsSUFBSSxDQUFDLE1BQU0sQ0FBQyxRQUFRLENBQUMsZ0JBQWdCLENBQUMsTUFBTSxDQUFDO2FBQ3RELFFBQVEsQ0FBQyxDQUFPLEtBQUssRUFBRSxFQUFFO1lBQ3hCLElBQUksQ0FBQyxNQUFNLENBQUMsUUFBUSxDQUFDLGdCQUFnQixDQUFDLE1BQU0sR0FBRyxLQUFLLENBQUM7WUFDckQsTUFBTSxJQUFJLENBQUMsTUFBTSxDQUFDLFlBQVksRUFBRSxDQUFDO1FBQ25DLENBQUMsQ0FBQSxDQUFDLENBQ0wsQ0FBQztRQUNGLElBQUksT0FBTyxDQUFDLFdBQVcsQ0FBQyxDQUFDLE9BQU8sQ0FBQyxRQUFRLENBQUMsQ0FBQyxPQUFPLENBQUMsQ0FBQyxJQUFJLEVBQUUsRUFBRSxDQUMxRCxJQUFJO2FBQ0QsY0FBYyxDQUFDLGtCQUFrQixDQUFDO2FBQ2xDLFFBQVEsQ0FBQyxJQUFJLENBQUMsTUFBTSxDQUFDLFFBQVEsQ0FBQyxnQkFBZ0IsQ0FBQyxNQUFNLENBQUM7YUFDdEQsUUFBUSxDQUFDLENBQU8sS0FBSyxFQUFFLEVBQUU7WUFDeEIsSUFBSSxDQUFDLE1BQU0sQ0FBQyxRQUFRLENBQUMsZ0JBQWdCLENBQUMsTUFBTSxHQUFHLEtBQUssQ0FBQztZQUNyRCxNQUFNLElBQUksQ0FBQyxNQUFNLENBQUMsWUFBWSxFQUFFLENBQUM7UUFDbkMsQ0FBQyxDQUFBLENBQUMsQ0FDTCxDQUFDO1FBQ0YsSUFBSSxPQUFPLENBQUMsV0FBVyxDQUFDO2FBQ3JCLE9BQU8sQ0FBQyxXQUFXLENBQUM7YUFDcEIsT0FBTyxDQUNOLG9IQUFvSCxDQUNySDthQUNBLFNBQVMsQ0FBQyxDQUFDLE1BQU0sRUFBRSxFQUFFLENBQ3BCLE1BQU07YUFDSCxpQkFBaUIsRUFBRTthQUNuQixTQUFTLENBQUMsQ0FBQyxFQUFFLEVBQUUsRUFBRSxDQUFDLENBQUM7YUFDbkIsUUFBUSxDQUFDLElBQUksQ0FBQyxNQUFNLENBQUMsUUFBUSxDQUFDLGdCQUFnQixDQUFDLFFBQVEsQ0FBQzthQUN4RCxRQUFRLENBQUMsQ0FBTyxLQUFLLEVBQUUsRUFBRTtZQUN4QixJQUFJLENBQUMsTUFBTSxDQUFDLFFBQVEsQ0FBQyxnQkFBZ0IsQ0FBQyxRQUFRLEdBQUcsS0FBSyxDQUFDO1lBQ3ZELE1BQU0sSUFBSSxDQUFDLE1BQU0sQ0FBQyxZQUFZLEVBQUUsQ0FBQztRQUNuQyxDQUFDLENBQUEsQ0FBQyxDQUNMLENBQUM7UUFDSixJQUFJLE9BQU8sQ0FBQyxXQUFXLENBQUM7YUFDckIsT0FBTyxDQUFDLFlBQVksQ0FBQzthQUNyQixPQUFPLENBQ04seUhBQXlILENBQzFIO2FBQ0EsU0FBUyxDQUFDLENBQUMsTUFBTSxFQUFFLEVBQUUsQ0FDcEIsTUFBTTthQUNILGlCQUFpQixFQUFFO2FBQ25CLFNBQVMsQ0FBQyxDQUFDLEVBQUUsRUFBRSxFQUFFLENBQUMsQ0FBQzthQUNuQixRQUFRLENBQUMsSUFBSSxDQUFDLE1BQU0sQ0FBQyxRQUFRLENBQUMsZ0JBQWdCLENBQUMsU0FBUyxDQUFDO2FBQ3pELFFBQVEsQ0FBQyxDQUFPLEtBQUssRUFBRSxFQUFFO1lBQ3hCLElBQUksQ0FBQyxNQUFNLENBQUMsUUFBUSxDQUFDLGdCQUFnQixDQUFDLFNBQVMsR0FBRyxLQUFLLENBQUM7WUFDeEQsTUFBTSxJQUFJLENBQUMsTUFBTSxDQUFDLFlBQVksRUFBRSxDQUFDO1FBQ25DLENBQUMsQ0FBQSxDQUFDLENBQ0wsQ0FBQztRQUVKLFdBQVcsQ0FBQyxRQUFRLENBQUMsSUFBSSxFQUFFLEVBQUUsSUFBSSxFQUFFLHFCQUFxQixFQUFFLENBQUMsQ0FBQztRQUU1RCxJQUFJLE9BQU8sQ0FBQyxXQUFXLENBQUMsQ0FBQyxPQUFPLENBQUMsUUFBUSxDQUFDLENBQUMsT0FBTyxDQUFDLENBQUMsSUFBSSxFQUFFLEVBQUUsQ0FDMUQsSUFBSTthQUNELGNBQWMsQ0FBQyxrQkFBa0IsQ0FBQzthQUNsQyxRQUFRLENBQUMsSUFBSSxDQUFDLE1BQU0sQ0FBQyxRQUFRLENBQUMsZ0JBQWdCLENBQUMsTUFBTSxDQUFDO2FBQ3RELFFBQVEsQ0FBQyxDQUFPLEtBQUssRUFBRSxFQUFFO1lBQ3hCLElBQUksQ0FBQyxNQUFNLENBQUMsUUFBUSxDQUFDLGdCQUFnQixDQUFDLE1BQU0sR0FBRyxLQUFLLENBQUM7WUFDckQsTUFBTSxJQUFJLENBQUMsTUFBTSxDQUFDLFlBQVksRUFBRSxDQUFDO1FBQ25DLENBQUMsQ0FBQSxDQUFDLENBQ0wsQ0FBQztRQUNGLElBQUksT0FBTyxDQUFDLFdBQVcsQ0FBQyxDQUFDLE9BQU8sQ0FBQyxRQUFRLENBQUMsQ0FBQyxPQUFPLENBQUMsQ0FBQyxJQUFJLEVBQUUsRUFBRSxDQUMxRCxJQUFJO2FBQ0QsY0FBYyxDQUFDLGtCQUFrQixDQUFDO2FBQ2xDLFFBQVEsQ0FBQyxJQUFJLENBQUMsTUFBTSxDQUFDLFFBQVEsQ0FBQyxnQkFBZ0IsQ0FBQyxNQUFNLENBQUM7YUFDdEQsUUFBUSxDQUFDLENBQU8sS0FBSyxFQUFFLEVBQUU7WUFDeEIsSUFBSSxDQUFDLE1BQU0sQ0FBQyxRQUFRLENBQUMsZ0JBQWdCLENBQUMsTUFBTSxHQUFHLEtBQUssQ0FBQztZQUNyRCxNQUFNLElBQUksQ0FBQyxNQUFNLENBQUMsWUFBWSxFQUFFLENBQUM7UUFDbkMsQ0FBQyxDQUFBLENBQUMsQ0FDTCxDQUFDO1FBQ0YsSUFBSSxPQUFPLENBQUMsV0FBVyxDQUFDO2FBQ3JCLE9BQU8sQ0FBQyxXQUFXLENBQUM7YUFDcEIsT0FBTyxDQUNOLG9IQUFvSCxDQUNySDthQUNBLFNBQVMsQ0FBQyxDQUFDLE1BQU0sRUFBRSxFQUFFLENBQ3BCLE1BQU07YUFDSCxpQkFBaUIsRUFBRTthQUNuQixTQUFTLENBQUMsQ0FBQyxFQUFFLEVBQUUsRUFBRSxDQUFDLENBQUM7YUFDbkIsUUFBUSxDQUFDLElBQUksQ0FBQyxNQUFNLENBQUMsUUFBUSxDQUFDLGdCQUFnQixDQUFDLFFBQVEsQ0FBQzthQUN4RCxRQUFRLENBQUMsQ0FBTyxLQUFLLEVBQUUsRUFBRTtZQUN4QixJQUFJLENBQUMsTUFBTSxDQUFDLFFBQVEsQ0FBQyxnQkFBZ0IsQ0FBQyxRQUFRLEdBQUcsS0FBSyxDQUFDO1lBQ3ZELE1BQU0sSUFBSSxDQUFDLE1BQU0sQ0FBQyxZQUFZLEVBQUUsQ0FBQztRQUNuQyxDQUFDLENBQUEsQ0FBQyxDQUNMLENBQUM7UUFDSixJQUFJLE9BQU8sQ0FBQyxXQUFXLENBQUM7YUFDckIsT0FBTyxDQUFDLFlBQVksQ0FBQzthQUNyQixPQUFPLENBQ04seUhBQXlILENBQzFIO2FBQ0EsU0FBUyxDQUFDLENBQUMsTUFBTSxFQUFFLEVBQUUsQ0FDcEIsTUFBTTthQUNILGlCQUFpQixFQUFFO2FBQ25CLFNBQVMsQ0FBQyxDQUFDLEVBQUUsRUFBRSxFQUFFLENBQUMsQ0FBQzthQUNuQixRQUFRLENBQUMsSUFBSSxDQUFDLE1BQU0sQ0FBQyxRQUFRLENBQUMsZ0JBQWdCLENBQUMsU0FBUyxDQUFDO2FBQ3pELFFBQVEsQ0FBQyxDQUFPLEtBQUssRUFBRSxFQUFFO1lBQ3hCLElBQUksQ0FBQyxNQUFNLENBQUMsUUFBUSxDQUFDLGdCQUFnQixDQUFDLFNBQVMsR0FBRyxLQUFLLENBQUM7WUFDeEQsTUFBTSxJQUFJLENBQUMsTUFBTSxDQUFDLFlBQVksRUFBRSxDQUFDO1FBQ25DLENBQUMsQ0FBQSxDQUFDLENBQ0wsQ0FBQztRQUVKLFdBQVcsQ0FBQyxRQUFRLENBQUMsSUFBSSxFQUFFLEVBQUUsSUFBSSxFQUFFLGFBQWEsRUFBRSxDQUFDLENBQUM7UUFFcEQsSUFBSSxPQUFPLENBQUMsV0FBVyxDQUFDO2FBQ3JCLE9BQU8sQ0FBQyxnQ0FBZ0MsQ0FBQzthQUN6QyxPQUFPLENBQ04sbUhBQW1ILENBQ3BIO2FBQ0EsU0FBUyxDQUFDLENBQUMsTUFBTSxFQUFFLEVBQUUsQ0FDcEIsTUFBTTthQUNILFFBQVEsQ0FBQyxJQUFJLENBQUMsTUFBTSxDQUFDLFFBQVEsQ0FBQyx1QkFBdUIsQ0FBQzthQUN0RCxRQUFRLENBQUMsQ0FBTyxLQUFLLEVBQUUsRUFBRTtZQUN4QixJQUFJLENBQUMsTUFBTSxDQUFDLFFBQVEsQ0FBQyx1QkFBdUIsR0FBRyxLQUFLLENBQUM7WUFDckQsTUFBTSxJQUFJLENBQUMsTUFBTSxDQUFDLFlBQVksRUFBRSxDQUFDO1FBQ25DLENBQUMsQ0FBQSxDQUFDLENBQ0wsQ0FBQztJQUNOLENBQUM7Q0FDRiIsInNvdXJjZXNDb250ZW50IjpbImltcG9ydCAqIGFzIGNyeXB0byBmcm9tICdjcnlwdG8nO1xyXG5pbXBvcnQgKiBhcyBldGEgZnJvbSAnZXRhJztcclxuXHJcbmltcG9ydCB7XHJcbiAgQXBwLFxyXG4gIEVkaXRvcixcclxuICBNYXJrZG93blZpZXcsXHJcbiAgUGx1Z2luLFxyXG4gIFBsdWdpblNldHRpbmdUYWIsXHJcbiAgU2V0dGluZyxcclxuICBUQWJzdHJhY3RGaWxlLFxyXG4gIFRGaWxlLFxyXG4gIG5vcm1hbGl6ZVBhdGgsXHJcbiAgTm90aWNlLFxyXG59IGZyb20gJ29ic2lkaWFuJztcclxuaW1wb3J0IG1hdHRlciBmcm9tICdncmF5LW1hdHRlcic7XHJcbmltcG9ydCAqIGFzIERpZmYgZnJvbSAnZGlmZic7XHJcbmltcG9ydCB7IEJvb2ssIEJvb2ttYXJrLCBCb29rcywgRnJvbnRNYXR0ZXIgfSBmcm9tICcuL3R5cGVzJztcclxuXHJcbmltcG9ydCB7IEtPUmVhZGVyTWV0YWRhdGEgfSBmcm9tICcuL2tvcmVhZGVyLW1ldGFkYXRhJztcclxuXHJcbmVudW0gRXJyb3JUeXBlIHtcclxuICBOT19QTEFDRUhPTERFUl9GT1VORCA9ICdOT19QTEFDRUhPTERFUl9GT1VORCcsXHJcbiAgTk9fUExBQ0VIT0xERVJfTk9URV9DUkVBVEVEID0gJ05PX1BMQUNFSE9MREVSX05PVEVfQ1JFQVRFRCcsXHJcbn1cclxuXHJcbmVudW0gTm90ZVR5cGUge1xyXG4gIFNJTkdMRV9OT1RFID0gJ2tvcmVhZGVyLXN5bmMtbm90ZScsXHJcbiAgQk9PS19OT1RFID0gJ2tvcmVhZGVyLXN5bmMtZGF0YXZpZXcnLFxyXG59XHJcblxyXG5pbnRlcmZhY2UgS09SZWFkZXJTZXR0aW5ncyB7XHJcbiAga29yZWFkZXJCYXNlUGF0aDogc3RyaW5nO1xyXG4gIG9ic2lkaWFuTm90ZUZvbGRlcjogc3RyaW5nO1xyXG4gIG5vdGVUaXRsZU9wdGlvbnM6IFRpdGxlT3B0aW9ucztcclxuICBib29rVGl0bGVPcHRpb25zOiBUaXRsZU9wdGlvbnM7XHJcbiAga2VlcEluU3luYzogYm9vbGVhbjtcclxuICBhRm9sZGVyRm9yRWFjaEJvb2s6IGJvb2xlYW47XHJcbiAgY3VzdG9tVGVtcGxhdGU6IGJvb2xlYW47XHJcbiAgY3VzdG9tRGF0YXZpZXdUZW1wbGF0ZTogYm9vbGVhbjtcclxuICB0ZW1wbGF0ZVBhdGg/OiBzdHJpbmc7XHJcbiAgZGF0YXZpZXdUZW1wbGF0ZVBhdGg/OiBzdHJpbmc7XHJcbiAgY3JlYXRlRGF0YXZpZXdRdWVyeTogYm9vbGVhbjtcclxuICBpbXBvcnRlZE5vdGVzOiB7IFtrZXk6IHN0cmluZ106IGJvb2xlYW4gfTtcclxuICBlbmJsZVJlc2V0SW1wb3J0ZWROb3RlczogYm9vbGVhbjtcclxufVxyXG5cclxuY29uc3QgREVGQVVMVF9TRVRUSU5HUzogS09SZWFkZXJTZXR0aW5ncyA9IHtcclxuICBpbXBvcnRlZE5vdGVzOiB7fSxcclxuICBlbmJsZVJlc2V0SW1wb3J0ZWROb3RlczogZmFsc2UsXHJcbiAga2VlcEluU3luYzogZmFsc2UsXHJcbiAgYUZvbGRlckZvckVhY2hCb29rOiBmYWxzZSxcclxuICBjdXN0b21UZW1wbGF0ZTogZmFsc2UsXHJcbiAgY3VzdG9tRGF0YXZpZXdUZW1wbGF0ZTogZmFsc2UsXHJcbiAgY3JlYXRlRGF0YXZpZXdRdWVyeTogZmFsc2UsXHJcbiAga29yZWFkZXJCYXNlUGF0aDogJy9tZWRpYS91c2VyL0tPQk9lUmVhZGVyJyxcclxuICBvYnNpZGlhbk5vdGVGb2xkZXI6ICcvJyxcclxuICBub3RlVGl0bGVPcHRpb25zOiB7XHJcbiAgICBtYXhXb3JkczogNSxcclxuICAgIG1heExlbmd0aDogMjUsXHJcbiAgfSxcclxuICBib29rVGl0bGVPcHRpb25zOiB7XHJcbiAgICBtYXhXb3JkczogNSxcclxuICAgIG1heExlbmd0aDogMjUsXHJcbiAgICBwcmVmaXg6ICcoYm9vaykgJyxcclxuICB9LFxyXG59O1xyXG5cclxuaW50ZXJmYWNlIFRpdGxlT3B0aW9ucyB7XHJcbiAgcHJlZml4Pzogc3RyaW5nO1xyXG4gIHN1ZmZpeD86IHN0cmluZztcclxuICBtYXhMZW5ndGg/OiBudW1iZXI7XHJcbiAgbWF4V29yZHM/OiBudW1iZXI7XHJcbn1cclxuXHJcbmNvbnN0IEtPUkVBREVSS0VZID0gJ2tvcmVhZGVyLXN5bmMnO1xyXG5jb25zdCBOT1RFX1RFWFRfUExBQ0VIT0xERVIgPSAncGxhY2Vob2xkZXInO1xyXG5cclxuZXhwb3J0IGRlZmF1bHQgY2xhc3MgS09SZWFkZXIgZXh0ZW5kcyBQbHVnaW4ge1xyXG4gIHNldHRpbmdzOiBLT1JlYWRlclNldHRpbmdzO1xyXG5cclxuICBwcml2YXRlIG1hbmFnZVRpdGxlKHRpdGxlOiBzdHJpbmcsIG9wdGlvbnM6IFRpdGxlT3B0aW9ucyA9IHt9KTogc3RyaW5nIHtcclxuICAgIC8vIHJlcGxhY2UgXFwgLyBhbmQgOiB3aXRoIF9cclxuICAgIHRpdGxlID0gdGl0bGUucmVwbGFjZSgvXFxcXHxcXC98Oi9nLCAnXycpO1xyXG4gICAgLy8gcmVwbGFjZSBtdWx0aXBsZSB1bmRlcnNjb3JlcyB3aXRoIG9uZSB1bmRlcnNjb3JlXHJcbiAgICB0aXRsZSA9IHRpdGxlLnJlcGxhY2UoL18rL2csICdfJyk7XHJcbiAgICAvLyByZW1vdmUgbGVhZGluZyBhbmQgdHJhaWxpbmcgd2hpdGVzcGFjZVxyXG4gICAgdGl0bGUgPSB0aXRsZS50cmltKCk7XHJcbiAgICAvLyByZW1vdmUgbGVhZGluZyBhbmQgdHJhaWxpbmcgdW5kZXJzY29yZXNcclxuICAgIHRpdGxlID0gdGl0bGUucmVwbGFjZSgvXl8rfF8rJC9nLCAnJyk7XHJcbiAgICAvLyByZXBsYWNlIG11bHRpcGxlIHNwYWNlcyB3aXRoIG9uZSBzcGFjZVxyXG4gICAgdGl0bGUgPSB0aXRsZS5yZXBsYWNlKC9cXHMrL2csICcgJyk7XHJcbiAgICAvLyBpZiBvcHRpb25zLm1heExlbmd0aCBpcyBzZXQsIHRyaW0gdGhlIHRpdGxlIHRvIHRoYXQgbGVuZ3RoIGFuZCBhZGQgJy4uLidcclxuICAgIGlmIChvcHRpb25zLm1heExlbmd0aCAmJiB0aXRsZS5sZW5ndGggPiBvcHRpb25zLm1heExlbmd0aCkge1xyXG4gICAgICB0aXRsZSA9IGAke3RpdGxlLnN1YnN0cmluZygwLCBvcHRpb25zLm1heExlbmd0aCl9Li4uYDtcclxuICAgIH1cclxuICAgIC8vIGlmIG9wdGlvbnMubWF4V29yZHMgaXMgc2V0LCB0cmltIHRoZSB0aXRsZSB0byB0aGF0IG51bWJlciBvZiB3b3JkcyBhbmQgYWRkICcuLi4nXHJcbiAgICBpZiAob3B0aW9ucy5tYXhXb3JkcyAmJiB0aXRsZS5zcGxpdCgnICcpLmxlbmd0aCA+IG9wdGlvbnMubWF4V29yZHMpIHtcclxuICAgICAgdGl0bGUgPSBgJHt0aXRsZS5zcGxpdCgnICcpLnNsaWNlKDAsIG9wdGlvbnMubWF4V29yZHMpLmpvaW4oJyAnKX0uLi5gO1xyXG4gICAgfVxyXG5cclxuICAgIHJldHVybiBgJHtvcHRpb25zLnByZWZpeCB8fCAnJ30ke3RpdGxlfSR7b3B0aW9ucy5zdWZmaXggfHwgJyd9YDtcclxuICB9XHJcblxyXG4gIGFzeW5jIG9ubG9hZCgpIHtcclxuICAgIGV0YS5jb25maWd1cmUoe1xyXG4gICAgICBjYWNoZTogdHJ1ZSwgLy8gTWFrZSBFdGEgY2FjaGUgdGVtcGxhdGVzXHJcbiAgICAgIGF1dG9Fc2NhcGU6IGZhbHNlLFxyXG4gICAgfSk7XHJcbiAgICBhd2FpdCB0aGlzLmxvYWRTZXR0aW5ncygpO1xyXG5cclxuICAgIC8vIGxpc3RlbiBmb3Igbm90ZSBjaGFuZ2VzIHRvIHVwZGF0ZSB0aGUgZnJvbnRtYXR0ZXJcclxuICAgIHRoaXMuYXBwLm1ldGFkYXRhQ2FjaGUub24oJ2NoYW5nZWQnLCBhc3luYyAoZmlsZTogVEFic3RyYWN0RmlsZSkgPT4ge1xyXG4gICAgICB0cnkge1xyXG4gICAgICAgIGF3YWl0IHRoaXMudXBkYXRlTWV0YWRhdGFUZXh0KGZpbGUgYXMgVEZpbGUpO1xyXG4gICAgICB9IGNhdGNoIChlKSB7XHJcbiAgICAgICAgY29uc29sZS5lcnJvcihlKTtcclxuICAgICAgICBuZXcgTm90aWNlKGBFcnJvciB1cGRhdGluZyBtZXRhZGF0YSB0ZXh0OiAke2UubWVzc2FnZX1gKTtcclxuICAgICAgfVxyXG4gICAgfSk7XHJcblxyXG4gICAgY29uc3QgcmliYm9uSWNvbkVsID0gdGhpcy5hZGRSaWJib25JY29uKFxyXG4gICAgICAnZG9jdW1lbnRzJyxcclxuICAgICAgJ1N5bmMgeW91ciBLT1JlYWRlciBoaWdobGlnaHRzJyxcclxuICAgICAgdGhpcy5pbXBvcnROb3Rlcy5iaW5kKHRoaXMpXHJcbiAgICApO1xyXG5cclxuICAgIHRoaXMuYWRkQ29tbWFuZCh7XHJcbiAgICAgIGlkOiAnb2JzaWRpYW4ta29yZWFkZXItcGx1Z2luLXN5bmMnLFxyXG4gICAgICBuYW1lOiAnU3luYycsXHJcbiAgICAgIGNhbGxiYWNrOiAoKSA9PiB7XHJcbiAgICAgICAgdGhpcy5pbXBvcnROb3RlcygpO1xyXG4gICAgICB9LFxyXG4gICAgfSk7XHJcblxyXG4gICAgdGhpcy5hZGRDb21tYW5kKHtcclxuICAgICAgaWQ6ICdvYnNpZGlhbi1rb3JlYWRlci1wbHVnaW4tc2V0LWVkaXQnLFxyXG4gICAgICBuYW1lOiAnTWFyayB0aGlzIG5vdGUgYXMgRWRpdGVkJyxcclxuICAgICAgZWRpdG9yQ2hlY2tDYWxsYmFjazogKFxyXG4gICAgICAgIGNoZWNraW5nOiBib29sZWFuLFxyXG4gICAgICAgIGVkaXRvcjogRWRpdG9yLFxyXG4gICAgICAgIHZpZXc6IE1hcmtkb3duVmlld1xyXG4gICAgICApID0+IHtcclxuICAgICAgICBjb25zdCBwcm9wZXJ0eVBhdGggPSBgJHtbS09SRUFERVJLRVldfS5tZXRhZGF0YS55ZXRfdG9fYmVfZWRpdGVkYDtcclxuICAgICAgICBpZiAoY2hlY2tpbmcpIHtcclxuICAgICAgICAgIGlmICh0aGlzLmdldEZyb250bWF0dGVyUHJvcGVydHkocHJvcGVydHlQYXRoLCB2aWV3KSA9PT0gdHJ1ZSkge1xyXG4gICAgICAgICAgICByZXR1cm4gdHJ1ZTtcclxuICAgICAgICAgIH1cclxuICAgICAgICAgIHJldHVybiBmYWxzZTtcclxuICAgICAgICB9XHJcbiAgICAgICAgdGhpcy5zZXRGcm9udG1hdHRlclByb3BlcnR5KHByb3BlcnR5UGF0aCwgZmFsc2UsIHZpZXcpO1xyXG4gICAgICB9LFxyXG4gICAgfSk7XHJcblxyXG4gICAgdGhpcy5hZGRDb21tYW5kKHtcclxuICAgICAgaWQ6ICdvYnNpZGlhbi1rb3JlYWRlci1wbHVnaW4tY2xlYXItZWRpdCcsXHJcbiAgICAgIG5hbWU6ICdNYXJrIHRoaXMgbm90ZSBhcyBOT1QgRWRpdGVkJyxcclxuICAgICAgZWRpdG9yQ2hlY2tDYWxsYmFjazogKFxyXG4gICAgICAgIGNoZWNraW5nOiBib29sZWFuLFxyXG4gICAgICAgIGVkaXRvcjogRWRpdG9yLFxyXG4gICAgICAgIHZpZXc6IE1hcmtkb3duVmlld1xyXG4gICAgICApID0+IHtcclxuICAgICAgICBjb25zdCBwcm9wZXJ0eVBhdGggPSBgJHtbS09SRUFERVJLRVldfS5tZXRhZGF0YS55ZXRfdG9fYmVfZWRpdGVkYDtcclxuICAgICAgICBpZiAoY2hlY2tpbmcpIHtcclxuICAgICAgICAgIGlmICh0aGlzLmdldEZyb250bWF0dGVyUHJvcGVydHkocHJvcGVydHlQYXRoLCB2aWV3KSA9PT0gZmFsc2UpIHtcclxuICAgICAgICAgICAgcmV0dXJuIHRydWU7XHJcbiAgICAgICAgICB9XHJcbiAgICAgICAgICByZXR1cm4gZmFsc2U7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIHRoaXMuc2V0RnJvbnRtYXR0ZXJQcm9wZXJ0eShwcm9wZXJ0eVBhdGgsIHRydWUsIHZpZXcpO1xyXG4gICAgICB9LFxyXG4gICAgfSk7XHJcblxyXG4gICAgdGhpcy5hZGRDb21tYW5kKHtcclxuICAgICAgaWQ6ICdvYnNpZGlhbi1rb3JlYWRlci1wbHVnaW4tc2V0LXN5bmMnLFxyXG4gICAgICBuYW1lOiAnRW5hYmxlIFN5bmMgZm9yIHRoaXMgbm90ZScsXHJcbiAgICAgIGVkaXRvckNoZWNrQ2FsbGJhY2s6IChcclxuICAgICAgICBjaGVja2luZzogYm9vbGVhbixcclxuICAgICAgICBlZGl0b3I6IEVkaXRvcixcclxuICAgICAgICB2aWV3OiBNYXJrZG93blZpZXdcclxuICAgICAgKSA9PiB7XHJcbiAgICAgICAgY29uc3QgcHJvcGVydHlQYXRoID0gYCR7W0tPUkVBREVSS0VZXX0ubWV0YWRhdGEua2VlcF9pbl9zeW5jYDtcclxuICAgICAgICBpZiAoY2hlY2tpbmcpIHtcclxuICAgICAgICAgIGlmICh0aGlzLmdldEZyb250bWF0dGVyUHJvcGVydHkocHJvcGVydHlQYXRoLCB2aWV3KSA9PT0gZmFsc2UpIHtcclxuICAgICAgICAgICAgcmV0dXJuIHRydWU7XHJcbiAgICAgICAgICB9XHJcbiAgICAgICAgICByZXR1cm4gZmFsc2U7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIHRoaXMuc2V0RnJvbnRtYXR0ZXJQcm9wZXJ0eShwcm9wZXJ0eVBhdGgsIHRydWUsIHZpZXcpO1xyXG4gICAgICB9LFxyXG4gICAgfSk7XHJcblxyXG4gICAgdGhpcy5hZGRDb21tYW5kKHtcclxuICAgICAgaWQ6ICdvYnNpZGlhbi1rb3JlYWRlci1wbHVnaW4tY2xlYXItc3luYycsXHJcbiAgICAgIG5hbWU6ICdEaXNhYmxlIFN5bmMgZm9yIHRoaXMgbm90ZScsXHJcbiAgICAgIGVkaXRvckNoZWNrQ2FsbGJhY2s6IChcclxuICAgICAgICBjaGVja2luZzogYm9vbGVhbixcclxuICAgICAgICBlZGl0b3I6IEVkaXRvcixcclxuICAgICAgICB2aWV3OiBNYXJrZG93blZpZXdcclxuICAgICAgKSA9PiB7XHJcbiAgICAgICAgY29uc3QgcHJvcGVydHlQYXRoID0gYCR7W0tPUkVBREVSS0VZXX0ubWV0YWRhdGEua2VlcF9pbl9zeW5jYDtcclxuICAgICAgICBpZiAoY2hlY2tpbmcpIHtcclxuICAgICAgICAgIGlmICh0aGlzLmdldEZyb250bWF0dGVyUHJvcGVydHkocHJvcGVydHlQYXRoLCB2aWV3KSA9PT0gdHJ1ZSkge1xyXG4gICAgICAgICAgICByZXR1cm4gdHJ1ZTtcclxuICAgICAgICAgIH1cclxuICAgICAgICAgIHJldHVybiBmYWxzZTtcclxuICAgICAgICB9XHJcbiAgICAgICAgdGhpcy5zZXRGcm9udG1hdHRlclByb3BlcnR5KHByb3BlcnR5UGF0aCwgZmFsc2UsIHZpZXcpO1xyXG4gICAgICB9LFxyXG4gICAgfSk7XHJcblxyXG4gICAgdGhpcy5hZGRDb21tYW5kKHtcclxuICAgICAgaWQ6ICdvYnNpZGlhbi1rb3JlYWRlci1wbHVnaW4tcmVzZXQtc3luYy1saXN0JyxcclxuICAgICAgbmFtZTogJ1Jlc2V0IFN5bmMgTGlzdCcsXHJcbiAgICAgIGNoZWNrQ2FsbGJhY2s6IChjaGVja2luZzogYm9vbGVhbikgPT4ge1xyXG4gICAgICAgIGlmICh0aGlzLnNldHRpbmdzLmVuYmxlUmVzZXRJbXBvcnRlZE5vdGVzKSB7XHJcbiAgICAgICAgICBpZiAoIWNoZWNraW5nKSB7XHJcbiAgICAgICAgICAgIHRoaXMuc2V0dGluZ3MuaW1wb3J0ZWROb3RlcyA9IHt9O1xyXG4gICAgICAgICAgICB0aGlzLnNldHRpbmdzLmVuYmxlUmVzZXRJbXBvcnRlZE5vdGVzID0gZmFsc2U7XHJcbiAgICAgICAgICAgIHRoaXMuc2F2ZVNldHRpbmdzKCk7XHJcbiAgICAgICAgICB9XHJcbiAgICAgICAgICByZXR1cm4gdHJ1ZTtcclxuICAgICAgICB9XHJcbiAgICAgICAgcmV0dXJuIGZhbHNlO1xyXG4gICAgICB9LFxyXG4gICAgfSk7XHJcblxyXG4gICAgdGhpcy5hZGRTZXR0aW5nVGFiKG5ldyBLb3JlYWRlclNldHRpbmdUYWIodGhpcy5hcHAsIHRoaXMpKTtcclxuICB9XHJcblxyXG4gIG9udW5sb2FkKCkge31cclxuXHJcbiAgYXN5bmMgbG9hZFNldHRpbmdzKCkge1xyXG4gICAgdGhpcy5zZXR0aW5ncyA9IHsgLi4uREVGQVVMVF9TRVRUSU5HUywgLi4uKGF3YWl0IHRoaXMubG9hZERhdGEoKSkgfTtcclxuICB9XHJcblxyXG4gIGFzeW5jIHNhdmVTZXR0aW5ncygpIHtcclxuICAgIGF3YWl0IHRoaXMuc2F2ZURhdGEodGhpcy5zZXR0aW5ncyk7XHJcbiAgfVxyXG5cclxuICBwcml2YXRlIGFzeW5jIHVwZGF0ZU1ldGFkYXRhVGV4dChmaWxlOiBURmlsZSkge1xyXG4gICAgY29uc3Qgb3JpZ2luYWxOb3RlID0gYXdhaXQgdGhpcy5hcHAudmF1bHQuY2FjaGVkUmVhZChmaWxlKTtcclxuICAgIGNvbnN0IHRleHQgPSBhd2FpdCB0aGlzLmV4dHJhY3RUZXh0RnJvbU5vdGUob3JpZ2luYWxOb3RlKTtcclxuICAgIGlmICh0ZXh0KSB7XHJcbiAgICAgIC8vIG5ldyBOb3RpY2UoYFRleHQgZXh0cmFjdGVkOiAke3RleHR9YCk7XHJcbiAgICAgIGNvbnN0IHsgZGF0YSwgY29udGVudCB9ID0gbWF0dGVyKG9yaWdpbmFsTm90ZSwge30pO1xyXG4gICAgICBjb25zdCBwcm9wZXJ0eVBhdGggPSBgJHtbS09SRUFERVJLRVldfS5kYXRhLnRleHRgO1xyXG4gICAgICB0aGlzLnNldE9iamVjdFByb3BlcnR5KGRhdGEsIHByb3BlcnR5UGF0aCwgdGV4dCk7XHJcbiAgICAgIGNvbnN0IHlldFRvQmVFZGl0ZWRQcm9wZXJ0eVBhdGggPSBgJHtbXHJcbiAgICAgICAgS09SRUFERVJLRVksXHJcbiAgICAgIF19Lm1ldGFkYXRhLnlldF90b19iZV9lZGl0ZWRgO1xyXG4gICAgICB0aGlzLnNldE9iamVjdFByb3BlcnR5KGRhdGEsIHlldFRvQmVFZGl0ZWRQcm9wZXJ0eVBhdGgsIGZhbHNlKTtcclxuICAgICAgdGhpcy5hcHAudmF1bHQubW9kaWZ5KGZpbGUgYXMgVEZpbGUsIG1hdHRlci5zdHJpbmdpZnkoY29udGVudCwgZGF0YSwge30pKTtcclxuICAgIH0gZWxzZSB7XHJcbiAgICAgIC8vIG5ldyBOb3RpY2UoJ1RleHQgZXh0cmFjdGlvbiBmYWlsZWQnKTtcclxuICAgIH1cclxuICB9XHJcblxyXG4gIC8vIHRvIGRldGVjdCB3aGVyZSB0aGUgbm90ZSdzIHRleHQgaXMgaW4gdGhlIHdob2xlIGRvY3VtZW50XHJcbiAgLy8gSSdsbCBjcmVhdGUgYSBuZXcgZG9jdW1lbnQgd2l0aCBhICdwbGFjZWhvbGRlcicgdGV4dCBhbmQgY29tcGFyZSB0aGUgdHdvIG5vdGVzXHJcbiAgLy8gdGhlIHRleHQgYWRkZWQgd2hlcmUgdGhlICdwbGFjZWhvbGRlcicgdGV4dCBpcyByZW1vdmVkIGlzIHRoZSBuZXcgdGV4dCBvZiB0aGUgbm90ZVxyXG4gIHByaXZhdGUgYXN5bmMgZXh0cmFjdFRleHRGcm9tTm90ZShub3RlOiBzdHJpbmcpOiBQcm9taXNlPHN0cmluZyB8IHZvaWQ+IHtcclxuICAgIGNvbnN0IHsgZGF0YSwgY29udGVudDogb3JpZ2luYWxDb250ZW50IH0gPSBtYXR0ZXIobm90ZSwge30pIGFzIHVua25vd24gYXMge1xyXG4gICAgICBkYXRhOiB7IFtrZXk6IHN0cmluZ106IEZyb250TWF0dGVyIH07XHJcbiAgICAgIGNvbnRlbnQ6IHN0cmluZztcclxuICAgIH07XHJcbiAgICAvLyBjcmVhdGUgYSBuZXcgbm90ZSB3aXRoIHRoZSBzYW1lIGZyb250bWF0dGVyIGFuZCBjb250ZW50IGNyZWF0ZWQgd2l0aCB0aGUgc2FtZSB0ZW1wbGF0ZVxyXG4gICAgLy8gYW5kIG5vdGVJdHNlbGYgZXF1YWwgdG8gJ3BsYWNlaG9sZGVyJ1xyXG4gICAgY29uc3QgZnJvbnRNYXR0ZXIgPSBkYXRhW0tPUkVBREVSS0VZXTtcclxuICAgIC8vIGV4aXQgaWYgaXQncyBub3QgYSBrb3JlYWRlciBub3RlXHJcbiAgICBpZiAoIWZyb250TWF0dGVyIHx8IGZyb250TWF0dGVyLnR5cGUgIT09IE5vdGVUeXBlLlNJTkdMRV9OT1RFKSB7XHJcbiAgICAgIHJldHVybjtcclxuICAgIH1cclxuICAgIGNvbnN0IHBhdGggPSB0aGlzLnNldHRpbmdzLmFGb2xkZXJGb3JFYWNoQm9va1xyXG4gICAgICA/IGAke3RoaXMuc2V0dGluZ3Mub2JzaWRpYW5Ob3RlRm9sZGVyfS8ke2Zyb250TWF0dGVyLm1ldGFkYXRhLm1hbmFnZWRfYm9va190aXRsZX1gXHJcbiAgICAgIDogdGhpcy5zZXR0aW5ncy5vYnNpZGlhbk5vdGVGb2xkZXI7XHJcbiAgICAvLyB0aGlzIGlzIG9uZSBvZiB0aGUgd29yc3RlIHRoaW5ncyBJJ3ZlIGV2ZXIgZG9uZSBhbmQgSSdtIHNvcnJ5XHJcbiAgICAvLyBwbGVhc2UgZG9uJ3QganVkZ2UgbWUsIEknbSBnb2luZyB0byByZWZhY3RvciB0aGlzXHJcbiAgICAvLyBpZGVhbGx5IHVzaW5nIHRoZSBzYW1lIG9iamVjdCBhcyBhcmd1bWVudCBvZiB0aGUgY3JlYXRlTm90ZSBmdW5jdGlvbixcclxuICAgIC8vIGZvciB0aGUgdGVtcGxhdGUgYW5kIGluIHRoZSBmcm9udG1hdHRlclxyXG4gICAgbGV0IGRpZmY7XHJcbiAgICB0cnkge1xyXG4gICAgICBjb25zdCB7XHJcbiAgICAgICAgY29udGVudDogbmV3Q29udGVudCxcclxuICAgICAgICBmcm9udG1hdHRlckRhdGEsXHJcbiAgICAgICAgbm90ZVBhdGgsXHJcbiAgICAgIH0gPSBhd2FpdCB0aGlzLmNyZWF0ZU5vdGUoe1xyXG4gICAgICAgIHBhdGgsXHJcbiAgICAgICAgdW5pcXVlSWQ6ICcnLFxyXG4gICAgICAgIGJvb2ttYXJrOiB7XHJcbiAgICAgICAgICBjaGFwdGVyOiBmcm9udE1hdHRlci5kYXRhLmNoYXB0ZXIsXHJcbiAgICAgICAgICBkYXRldGltZTogZnJvbnRNYXR0ZXIuZGF0YS5kYXRldGltZSxcclxuICAgICAgICAgIG5vdGVzOiBmcm9udE1hdHRlci5kYXRhLmhpZ2hsaWdodCxcclxuICAgICAgICAgIGhpZ2hsaWdodGVkOiB0cnVlLFxyXG4gICAgICAgICAgcG9zMDogJ3BvczAnLFxyXG4gICAgICAgICAgcG9zMTogJ3BvczEnLFxyXG4gICAgICAgICAgcGFnZTogYCR7ZnJvbnRNYXR0ZXIuZGF0YS5wYWdlfWAsXHJcbiAgICAgICAgICB0ZXh0OiBgUGFnaW5hICR7ZnJvbnRNYXR0ZXIuZGF0YS5wYWdlfSAke2Zyb250TWF0dGVyLmRhdGEuaGlnaGxpZ2h0fSBAICR7ZnJvbnRNYXR0ZXIuZGF0YS5kYXRldGltZX0gJHtOT1RFX1RFWFRfUExBQ0VIT0xERVJ9YCxcclxuICAgICAgICB9LFxyXG4gICAgICAgIG1hbmFnZWRCb29rVGl0bGU6IGZyb250TWF0dGVyLm1ldGFkYXRhLm1hbmFnZWRfYm9va190aXRsZSxcclxuICAgICAgICBib29rOiB7XHJcbiAgICAgICAgICB0aXRsZTogZnJvbnRNYXR0ZXIuZGF0YS50aXRsZSxcclxuICAgICAgICAgIGF1dGhvcnM6IGZyb250TWF0dGVyLmRhdGEuYXV0aG9ycyxcclxuICAgICAgICAgIHBlcmNlbnRfZmluaXNoZWQ6IDEsXHJcbiAgICAgICAgICBib29rbWFya3M6IFtdLFxyXG4gICAgICAgICAgaGlnaGxpZ2h0OiBmcm9udE1hdHRlci5kYXRhLmhpZ2hsaWdodCxcclxuICAgICAgICB9LFxyXG4gICAgICAgIGtlZXBJblN5bmM6IGZyb250TWF0dGVyLm1ldGFkYXRhLmtlZXBfaW5fc3luYyxcclxuICAgICAgfSk7XHJcbiAgICAgIGRpZmYgPSBEaWZmLmRpZmZUcmltbWVkTGluZXMob3JpZ2luYWxDb250ZW50LCBuZXdDb250ZW50KTtcclxuICAgIH0gY2F0Y2ggKGUpIHtcclxuICAgICAgY29uc29sZS5lcnJvcihlKTtcclxuICAgICAgdGhyb3cgbmV3IEVycm9yKEVycm9yVHlwZS5OT19QTEFDRUhPTERFUl9OT1RFX0NSRUFURUQpO1xyXG4gICAgfVxyXG5cclxuICAgIC8vIGV4dHJhY3QgZnJvbSAnZGlmZicgdGhlIG5ldyB0ZXh0IG9mIHRoZSBub3RlXHJcbiAgICAvLyBpbiB0aGUgYXJyYXkgaXMgdGhlIGVsZW1lbnQgYmVmb3JlIHRoZSBvbmUgd2hpdCAnYWRkZWQnIHRvIHRydWUgYW5kICd2YWx1ZScgaXMgJ3BsYWNlaG9sZGVyJ1xyXG4gICAgY29uc3QgcGxhY2Vob2xkZXJJbmRleCA9IGRpZmYuZmluZEluZGV4KFxyXG4gICAgICAoZWxlbWVudCkgPT4gZWxlbWVudC5hZGRlZCAmJiBlbGVtZW50LnZhbHVlID09PSBOT1RFX1RFWFRfUExBQ0VIT0xERVJcclxuICAgICk7XHJcbiAgICBpZiAocGxhY2Vob2xkZXJJbmRleCA9PT0gLTEpIHtcclxuICAgICAgdGhyb3cgbmV3IEVycm9yKEVycm9yVHlwZS5OT19QTEFDRUhPTERFUl9GT1VORCk7XHJcbiAgICB9XHJcbiAgICAvLyB0aGUgbmV3IHRleHQgaXMgdGhlIHZhbHVlIG9mIHRoZSBlbGVtZW50IGJlZm9yZSB0aGUgcGxhY2Vob2xkZXIgaW5kZXhcclxuICAgIGNvbnN0IG5ld1RleHQgPSBkaWZmW3BsYWNlaG9sZGVySW5kZXggLSAxXS52YWx1ZTtcclxuICAgIC8vIGV4aXQgaWYgdGhlIG5ldyB0ZXh0IGlzIHRoZSBzYW1lIGFzIHRoZSB0ZXh0IGluIHRoZSBmcm9udG1hdHRlclxyXG4gICAgaWYgKG5ld1RleHQgPT09IGZyb250TWF0dGVyLmRhdGEudGV4dCkge1xyXG4gICAgICByZXR1cm47XHJcbiAgICB9XHJcbiAgICByZXR1cm4gbmV3VGV4dDtcclxuICB9XHJcblxyXG4gIHByaXZhdGUgZ2V0T2JqZWN0UHJvcGVydHkob2JqZWN0OiB7IFt4OiBzdHJpbmddOiBhbnkgfSwgcGF0aDogc3RyaW5nKSB7XHJcbiAgICBpZiAocGF0aCA9PT0gdW5kZWZpbmVkIHx8IHBhdGggPT09IG51bGwpIHtcclxuICAgICAgcmV0dXJuIG9iamVjdDtcclxuICAgIH1cclxuICAgIGNvbnN0IHBhcnRzID0gcGF0aC5zcGxpdCgnLicpO1xyXG4gICAgZm9yIChsZXQgaSA9IDA7IGkgPCBwYXJ0cy5sZW5ndGg7ICsraSkge1xyXG4gICAgICBpZiAob2JqZWN0ID09PSB1bmRlZmluZWQgfHwgb2JqZWN0ID09PSBudWxsKSB7XHJcbiAgICAgICAgcmV0dXJuIHVuZGVmaW5lZDtcclxuICAgICAgfVxyXG4gICAgICBjb25zdCBrZXkgPSBwYXJ0c1tpXTtcclxuICAgICAgb2JqZWN0ID0gb2JqZWN0W2tleV07XHJcbiAgICB9XHJcbiAgICByZXR1cm4gb2JqZWN0O1xyXG4gIH1cclxuXHJcbiAgcHJpdmF0ZSBzZXRPYmplY3RQcm9wZXJ0eShcclxuICAgIG9iamVjdDogeyBbeDogc3RyaW5nXTogYW55IH0sXHJcbiAgICBwYXRoOiBzdHJpbmcsXHJcbiAgICB2YWx1ZTogYW55XHJcbiAgKSB7XHJcbiAgICBjb25zdCBwYXJ0cyA9IHBhdGguc3BsaXQoJy4nKTtcclxuICAgIGNvbnN0IGxpbWl0ID0gcGFydHMubGVuZ3RoIC0gMTtcclxuICAgIGZvciAobGV0IGkgPSAwOyBpIDwgbGltaXQ7ICsraSkge1xyXG4gICAgICBjb25zdCBrZXkgPSBwYXJ0c1tpXTtcclxuICAgICAgb2JqZWN0ID0gb2JqZWN0W2tleV0gPz8gKG9iamVjdFtrZXldID0ge30pO1xyXG4gICAgfVxyXG4gICAgY29uc3Qga2V5ID0gcGFydHNbbGltaXRdO1xyXG4gICAgb2JqZWN0W2tleV0gPSB2YWx1ZTtcclxuICB9XHJcblxyXG4gIHNldEZyb250bWF0dGVyUHJvcGVydHkocHJvcGVydHk6IHN0cmluZywgdmFsdWU6IGFueSwgdmlldzogTWFya2Rvd25WaWV3KSB7XHJcbiAgICBjb25zdCB7IGRhdGEsIGNvbnRlbnQgfSA9IG1hdHRlcih2aWV3LmRhdGEsIHt9KTtcclxuICAgIHRoaXMuc2V0T2JqZWN0UHJvcGVydHkoZGF0YSwgcHJvcGVydHksIHZhbHVlKTtcclxuICAgIGNvbnN0IG5vdGUgPSBtYXR0ZXIuc3RyaW5naWZ5KGNvbnRlbnQsIGRhdGEpO1xyXG4gICAgdmlldy5zZXRWaWV3RGF0YShub3RlLCBmYWxzZSk7XHJcbiAgICB2aWV3LnJlcXVlc3RTYXZlKCk7XHJcbiAgfVxyXG5cclxuICBnZXRGcm9udG1hdHRlclByb3BlcnR5KHByb3BlcnR5OiBzdHJpbmcsIHZpZXc6IE1hcmtkb3duVmlldyk6IGFueSB7XHJcbiAgICBjb25zdCB7IGRhdGEsIGNvbnRlbnQgfSA9IG1hdHRlcih2aWV3LmRhdGEsIHt9KTtcclxuICAgIHJldHVybiB0aGlzLmdldE9iamVjdFByb3BlcnR5KGRhdGEsIHByb3BlcnR5KTtcclxuICB9XHJcblxyXG4gIHByaXZhdGUgYXN5bmMgY3JlYXRlTm90ZShub3RlOiB7XHJcbiAgICBwYXRoOiBzdHJpbmc7XHJcbiAgICB1bmlxdWVJZDogc3RyaW5nO1xyXG4gICAgYm9va21hcms6IEJvb2ttYXJrO1xyXG4gICAgbWFuYWdlZEJvb2tUaXRsZTogc3RyaW5nO1xyXG4gICAgYm9vazogQm9vaztcclxuICAgIGtlZXBJblN5bmM/OiBib29sZWFuO1xyXG4gIH0pIHtcclxuICAgIGNvbnN0IHsgcGF0aCwgdW5pcXVlSWQsIGJvb2ttYXJrLCBtYW5hZ2VkQm9va1RpdGxlLCBib29rLCBrZWVwSW5TeW5jIH0gPVxyXG4gICAgICBub3RlO1xyXG4gICAgLy8gdGhlIHBhZ2UgaXMgYWx3YXlzIHRoZSBmaXJzdCBudW1iZXIgaW4gdGhlIGJvb2ttYXJrJ3MgdGV4dCAoZWcuICdQYWdpbmEgMTIgZm9vIGJhcicpXHJcbiAgICBjb25zdCBwYWdlID0gYm9va21hcmsudGV4dCA/IHBhcnNlSW50KGJvb2ttYXJrLnRleHQubWF0Y2goL1xcZCsvZylbMF0pIDogLTE7XHJcbiAgICBjb25zdCBub3RlSXRzZWxmID0gYm9va21hcmsudGV4dFxyXG4gICAgICA/IGJvb2ttYXJrLnRleHQuc3BsaXQoYm9va21hcmsuZGF0ZXRpbWUpWzFdLnJlcGxhY2UoL15cXHMrfFxccyskL2csICcnKVxyXG4gICAgICA6ICcnO1xyXG4gICAgY29uc3Qgbm90ZVRpdGxlID0gbm90ZUl0c2VsZlxyXG4gICAgICA/IHRoaXMubWFuYWdlVGl0bGUobm90ZUl0c2VsZiwgdGhpcy5zZXR0aW5ncy5ub3RlVGl0bGVPcHRpb25zKVxyXG4gICAgICA6IGAke3RoaXMubWFuYWdlVGl0bGUoXHJcbiAgICAgICAgICBib29rbWFyay5ub3RlcyxcclxuICAgICAgICAgIHRoaXMuc2V0dGluZ3Mubm90ZVRpdGxlT3B0aW9uc1xyXG4gICAgICAgICl9IC0gJHtib29rLmF1dGhvcnN9YDtcclxuICAgIGNvbnN0IG5vdGVQYXRoID0gbm9ybWFsaXplUGF0aChgJHtwYXRofS8ke25vdGVUaXRsZX1gKTtcclxuXHJcbiAgICBjb25zdCBkZWZhdWx0VGVtcGxhdGUgPSBgIyMgVGl0bGU6IFtbPCU9IGl0LmJvb2tQYXRoICU+fDwlPSBpdC50aXRsZSAlPl1dXHJcblxyXG4jIyMgYnk6IFtbPCU9IGl0LmF1dGhvcnMgJT5dXVxyXG5cclxuIyMjIENoYXB0ZXI6IDwlPSBpdC5jaGFwdGVyICU+XHJcblxyXG5QYWdlOiA8JT0gaXQucGFnZSAlPlxyXG5cclxuKio9PTwlPSBpdC5oaWdobGlnaHQgJT49PSoqXHJcblxyXG48JT0gaXQudGV4dCAlPmA7XHJcblxyXG4gICAgY29uc3QgdGVtcGxhdGVGaWxlID0gdGhpcy5zZXR0aW5ncy5jdXN0b21UZW1wbGF0ZVxyXG4gICAgICA/IHRoaXMuYXBwLnZhdWx0LmdldEFic3RyYWN0RmlsZUJ5UGF0aCh0aGlzLnNldHRpbmdzLnRlbXBsYXRlUGF0aClcclxuICAgICAgOiBudWxsO1xyXG4gICAgY29uc3QgdGVtcGxhdGUgPSB0ZW1wbGF0ZUZpbGVcclxuICAgICAgPyBhd2FpdCB0aGlzLmFwcC52YXVsdC5yZWFkKHRlbXBsYXRlRmlsZSBhcyBURmlsZSlcclxuICAgICAgOiBkZWZhdWx0VGVtcGxhdGU7XHJcbiAgICBjb25zdCBib29rUGF0aCA9IG5vcm1hbGl6ZVBhdGgoYCR7cGF0aH0vJHttYW5hZ2VkQm9va1RpdGxlfWApO1xyXG4gICAgY29uc3QgY29udGVudCA9IChhd2FpdCBldGEucmVuZGVyKHRlbXBsYXRlLCB7XHJcbiAgICAgIGJvb2tQYXRoLFxyXG4gICAgICB0aXRsZTogYm9vay50aXRsZSxcclxuICAgICAgYXV0aG9yczogYm9vay5hdXRob3JzLFxyXG4gICAgICBjaGFwdGVyOiBib29rbWFyay5jaGFwdGVyLFxyXG4gICAgICBoaWdobGlnaHQ6IGJvb2ttYXJrLm5vdGVzLFxyXG4gICAgICB0ZXh0OiBub3RlSXRzZWxmLFxyXG4gICAgICBkYXRldGltZTogYm9va21hcmsuZGF0ZXRpbWUsXHJcbiAgICAgIHBhZ2UsXHJcbiAgICB9KSkgYXMgc3RyaW5nO1xyXG5cclxuICAgIGNvbnN0IGZyb250bWF0dGVyRGF0YTogeyBba2V5OiBzdHJpbmddOiBGcm9udE1hdHRlciB9ID0ge1xyXG4gICAgICBbS09SRUFERVJLRVldOiB7XHJcbiAgICAgICAgdHlwZTogTm90ZVR5cGUuU0lOR0xFX05PVEUsXHJcbiAgICAgICAgdW5pcXVlSWQsXHJcbiAgICAgICAgZGF0YToge1xyXG4gICAgICAgICAgdGl0bGU6IGJvb2sudGl0bGUsXHJcbiAgICAgICAgICBhdXRob3JzOiBib29rLmF1dGhvcnMsXHJcbiAgICAgICAgICBjaGFwdGVyOiBib29rbWFyay5jaGFwdGVyLFxyXG4gICAgICAgICAgcGFnZSxcclxuICAgICAgICAgIGhpZ2hsaWdodDogYm9va21hcmsubm90ZXMsXHJcbiAgICAgICAgICBkYXRldGltZTogYm9va21hcmsuZGF0ZXRpbWUsXHJcbiAgICAgICAgICB0ZXh0OiBub3RlSXRzZWxmLFxyXG4gICAgICAgIH0sXHJcbiAgICAgICAgbWV0YWRhdGE6IHtcclxuICAgICAgICAgIGJvZHlfaGFzaDogY3J5cHRvLmNyZWF0ZUhhc2goJ21kNScpLnVwZGF0ZShjb250ZW50KS5kaWdlc3QoJ2hleCcpLFxyXG4gICAgICAgICAga2VlcF9pbl9zeW5jOiBrZWVwSW5TeW5jIHx8IHRoaXMuc2V0dGluZ3Mua2VlcEluU3luYyxcclxuICAgICAgICAgIHlldF90b19iZV9lZGl0ZWQ6IHRydWUsXHJcbiAgICAgICAgICBtYW5hZ2VkX2Jvb2tfdGl0bGU6IG1hbmFnZWRCb29rVGl0bGUsXHJcbiAgICAgICAgfSxcclxuICAgICAgfSxcclxuICAgIH07XHJcblxyXG4gICAgcmV0dXJuIHsgY29udGVudCwgZnJvbnRtYXR0ZXJEYXRhLCBub3RlUGF0aCB9O1xyXG4gIH1cclxuXHJcbiAgYXN5bmMgY3JlYXRlRGF0YXZpZXdRdWVyeVBlckJvb2soXHJcbiAgICBkYXRhdmlldzoge1xyXG4gICAgICBwYXRoOiBzdHJpbmc7XHJcbiAgICAgIG1hbmFnZWRCb29rVGl0bGU6IHN0cmluZztcclxuICAgICAgYm9vazogQm9vaztcclxuICAgIH0sXHJcbiAgICB1cGRhdGVOb3RlPzogVEZpbGVcclxuICApIHtcclxuICAgIGNvbnN0IHsgcGF0aCwgYm9vaywgbWFuYWdlZEJvb2tUaXRsZSB9ID0gZGF0YXZpZXc7XHJcbiAgICBsZXQgeyBrZWVwSW5TeW5jIH0gPSB0aGlzLnNldHRpbmdzO1xyXG4gICAgaWYgKHVwZGF0ZU5vdGUpIHtcclxuICAgICAgY29uc3QgeyBkYXRhLCBjb250ZW50IH0gPSBtYXR0ZXIoXHJcbiAgICAgICAgYXdhaXQgdGhpcy5hcHAudmF1bHQucmVhZCh1cGRhdGVOb3RlKSxcclxuICAgICAgICB7fVxyXG4gICAgICApO1xyXG4gICAgICBrZWVwSW5TeW5jID0gZGF0YVtLT1JFQURFUktFWV0ubWV0YWRhdGEua2VlcF9pbl9zeW5jO1xyXG4gICAgICBjb25zdCB5ZXRUb0JlRWRpdGVkID0gZGF0YVtLT1JFQURFUktFWV0ubWV0YWRhdGEueWV0X3RvX2JlX2VkaXRlZDtcclxuICAgICAgaWYgKCFrZWVwSW5TeW5jIHx8ICF5ZXRUb0JlRWRpdGVkKSB7XHJcbiAgICAgICAgcmV0dXJuO1xyXG4gICAgICB9XHJcbiAgICB9XHJcbiAgICBjb25zdCBmcm9udE1hdHRlciA9IHtcclxuICAgICAgY3NzY2xhc3M6IE5vdGVUeXBlLkJPT0tfTk9URSxcclxuICAgICAgW0tPUkVBREVSS0VZXToge1xyXG4gICAgICAgIHVuaXF1ZUlkOiBjcnlwdG9cclxuICAgICAgICAgIC5jcmVhdGVIYXNoKCdtZDUnKVxyXG4gICAgICAgICAgLnVwZGF0ZShgJHtib29rLnRpdGxlfSAtICR7Ym9vay5hdXRob3JzfX1gKVxyXG4gICAgICAgICAgLmRpZ2VzdCgnaGV4JyksXHJcbiAgICAgICAgdHlwZTogTm90ZVR5cGUuQk9PS19OT1RFLFxyXG4gICAgICAgIGRhdGE6IHtcclxuICAgICAgICAgIHRpdGxlOiBib29rLnRpdGxlLFxyXG4gICAgICAgICAgYXV0aG9yczogYm9vay5hdXRob3JzLFxyXG4gICAgICAgIH0sXHJcbiAgICAgICAgbWV0YWRhdGE6IHtcclxuICAgICAgICAgIHBlcmNlbnRfZmluaXNoZWQ6IGJvb2sucGVyY2VudF9maW5pc2hlZCxcclxuICAgICAgICAgIG1hbmFnZWRfdGl0bGU6IG1hbmFnZWRCb29rVGl0bGUsXHJcbiAgICAgICAgICBrZWVwX2luX3N5bmM6IGtlZXBJblN5bmMsXHJcbiAgICAgICAgICB5ZXRfdG9fYmVfZWRpdGVkOiB0cnVlLFxyXG4gICAgICAgIH0sXHJcbiAgICAgIH0sXHJcbiAgICB9O1xyXG5cclxuICAgIGNvbnN0IGRlZmF1bHRUZW1wbGF0ZSA9IGAjIFRpdGxlOiA8JT0gaXQuZGF0YS50aXRsZSAlPlxyXG5cclxuPHByb2dyZXNzIHZhbHVlPVwiPCU9IGl0Lm1ldGFkYXRhLnBlcmNlbnRfZmluaXNoZWQgJT5cIiBtYXg9XCIxMDBcIj4gPC9wcm9ncmVzcz5cclxuXFxgXFxgXFxgZGF0YXZpZXdqc1xyXG5jb25zdCB0aXRsZSA9IGR2LmN1cnJlbnQoKVsna29yZWFkZXItc3luYyddLm1ldGFkYXRhLm1hbmFnZWRfdGl0bGVcclxuZHYucGFnZXMoKS53aGVyZShuID0+IHtcclxucmV0dXJuIG5bJ2tvcmVhZGVyLXN5bmMnXSAmJiBuWydrb3JlYWRlci1zeW5jJ10udHlwZSA9PSAnJHtOb3RlVHlwZS5TSU5HTEVfTk9URX0nICYmIG5bJ2tvcmVhZGVyLXN5bmMnXS5tZXRhZGF0YS5tYW5hZ2VkX2Jvb2tfdGl0bGUgPT0gdGl0bGVcclxufSkuc29ydChwID0+IHBbJ2tvcmVhZGVyLXN5bmMnXS5kYXRhLnBhZ2UpLmZvckVhY2gocCA9PiBkdi5wYXJhZ3JhcGgoZHYuZmlsZUxpbmsocC5maWxlLm5hbWUsIHRydWUpLCB7c3R5bGU6ICd0ZXN0LWNzcyd9KSlcclxuXFxgXFxgXFxgXHJcbiAgICBgO1xyXG5cclxuICAgIGNvbnN0IHRlbXBsYXRlRmlsZSA9IHRoaXMuc2V0dGluZ3MuY3VzdG9tRGF0YXZpZXdUZW1wbGF0ZVxyXG4gICAgICA/IHRoaXMuYXBwLnZhdWx0LmdldEFic3RyYWN0RmlsZUJ5UGF0aCh0aGlzLnNldHRpbmdzLmRhdGF2aWV3VGVtcGxhdGVQYXRoKVxyXG4gICAgICA6IG51bGw7XHJcbiAgICBjb25zdCB0ZW1wbGF0ZSA9IHRlbXBsYXRlRmlsZVxyXG4gICAgICA/IGF3YWl0IHRoaXMuYXBwLnZhdWx0LnJlYWQodGVtcGxhdGVGaWxlIGFzIFRGaWxlKVxyXG4gICAgICA6IGRlZmF1bHRUZW1wbGF0ZTtcclxuICAgIGNvbnN0IGNvbnRlbnQgPSAoYXdhaXQgZXRhLnJlbmRlcihcclxuICAgICAgdGVtcGxhdGUsXHJcbiAgICAgIGZyb250TWF0dGVyW0tPUkVBREVSS0VZXVxyXG4gICAgKSkgYXMgc3RyaW5nO1xyXG4gICAgaWYgKHVwZGF0ZU5vdGUpIHtcclxuICAgICAgdGhpcy5hcHAudmF1bHQubW9kaWZ5KHVwZGF0ZU5vdGUsIG1hdHRlci5zdHJpbmdpZnkoY29udGVudCwgZnJvbnRNYXR0ZXIpKTtcclxuICAgIH0gZWxzZSB7XHJcbiAgICAgIHRoaXMuYXBwLnZhdWx0LmNyZWF0ZShcclxuICAgICAgICBgJHtwYXRofS8ke21hbmFnZWRCb29rVGl0bGV9Lm1kYCxcclxuICAgICAgICBtYXR0ZXIuc3RyaW5naWZ5KGNvbnRlbnQsIGZyb250TWF0dGVyKVxyXG4gICAgICApO1xyXG4gICAgfVxyXG4gIH1cclxuXHJcbiAgYXN5bmMgaW1wb3J0Tm90ZXMoKSB7XHJcbiAgICBjb25zdCBtZXRhZGF0YSA9IG5ldyBLT1JlYWRlck1ldGFkYXRhKHRoaXMuc2V0dGluZ3Mua29yZWFkZXJCYXNlUGF0aCk7XHJcbiAgICBjb25zdCBkYXRhOiBCb29rcyA9IGF3YWl0IG1ldGFkYXRhLnNjYW4oKTtcclxuXHJcbiAgICAvLyBjcmVhdGUgYSBsaXN0IG9mIG5vdGVzIGFscmVhZHkgaW1wb3J0ZWQgaW4gb2JzaWRpYW5cclxuICAgIGNvbnN0IGV4aXN0aW5nTm90ZXM6IHtcclxuICAgICAgW2tleTogc3RyaW5nXToge1xyXG4gICAgICAgIGtlZXBfaW5fc3luYzogYm9vbGVhbjtcclxuICAgICAgICB5ZXRfdG9fYmVfZWRpdGVkOiBib29sZWFuO1xyXG4gICAgICAgIG5vdGU6IFRBYnN0cmFjdEZpbGU7XHJcbiAgICAgIH07XHJcbiAgICB9ID0ge307XHJcbiAgICB0aGlzLmFwcC52YXVsdC5nZXRNYXJrZG93bkZpbGVzKCkuZm9yRWFjaCgoZikgPT4ge1xyXG4gICAgICBjb25zdCBmbSA9IHRoaXMuYXBwLm1ldGFkYXRhQ2FjaGUuZ2V0RmlsZUNhY2hlKGYpPy5mcm9udG1hdHRlcjtcclxuICAgICAgaWYgKGZtPy5bS09SRUFERVJLRVldPy51bmlxdWVJZCkge1xyXG4gICAgICAgIGV4aXN0aW5nTm90ZXNbZm1bS09SRUFERVJLRVldLnVuaXF1ZUlkXSA9IHtcclxuICAgICAgICAgIGtlZXBfaW5fc3luYzogZm1bS09SRUFERVJLRVldLm1ldGFkYXRhLmtlZXBfaW5fc3luYyxcclxuICAgICAgICAgIHlldF90b19iZV9lZGl0ZWQ6IGZtW0tPUkVBREVSS0VZXS5tZXRhZGF0YS55ZXRfdG9fYmVfZWRpdGVkLFxyXG4gICAgICAgICAgbm90ZTogZixcclxuICAgICAgICB9O1xyXG4gICAgICB9XHJcbiAgICB9KTtcclxuXHJcbiAgICBmb3IgKGNvbnN0IGJvb2sgaW4gZGF0YSkge1xyXG4gICAgICBjb25zdCBtYW5hZ2VkQm9va1RpdGxlID0gYCR7dGhpcy5tYW5hZ2VUaXRsZShcclxuICAgICAgICBkYXRhW2Jvb2tdLnRpdGxlLFxyXG4gICAgICAgIHRoaXMuc2V0dGluZ3MuYm9va1RpdGxlT3B0aW9uc1xyXG4gICAgICApfS0ke2RhdGFbYm9va10uYXV0aG9yc31gO1xyXG4gICAgICAvLyBpZiB0aGUgc2V0dGluZyBhRm9sZGVyRm9yRWFjaEJvb2sgaXMgdHJ1ZSwgd2UgYWRkIHRoZSBtYW5hZ2VkQm9va1RpdGxlIHRvIHRoZSBwYXRoIHNwZWNpZmllZCBpbiBvYnNpZGlhbk5vdGVGb2xkZXJcclxuICAgICAgY29uc3QgcGF0aCA9IHRoaXMuc2V0dGluZ3MuYUZvbGRlckZvckVhY2hCb29rXHJcbiAgICAgICAgPyBgJHt0aGlzLnNldHRpbmdzLm9ic2lkaWFuTm90ZUZvbGRlcn0vJHttYW5hZ2VkQm9va1RpdGxlfWBcclxuICAgICAgICA6IHRoaXMuc2V0dGluZ3Mub2JzaWRpYW5Ob3RlRm9sZGVyO1xyXG4gICAgICAvLyBpZiBhRm9sZGVyRm9yRWFjaEJvb2sgaXMgc2V0LCBjcmVhdGUgYSBmb2xkZXIgZm9yIGVhY2ggYm9va1xyXG4gICAgICBpZiAodGhpcy5zZXR0aW5ncy5hRm9sZGVyRm9yRWFjaEJvb2spIHtcclxuICAgICAgICBpZiAoIXRoaXMuYXBwLnZhdWx0LmdldEFic3RyYWN0RmlsZUJ5UGF0aChwYXRoKSkge1xyXG4gICAgICAgICAgdGhpcy5hcHAudmF1bHQuY3JlYXRlRm9sZGVyKHBhdGgpO1xyXG4gICAgICAgIH1cclxuICAgICAgfVxyXG4gICAgICAvLyBpZiBjcmVhdGVEYXRhdmlld1F1ZXJ5IGlzIHNldCwgY3JlYXRlIGEgZGF0YXZpZXcgcXVlcnksIGZvciBlYWNoIGJvb2ssIHdpdGggdGhlIGJvb2sncyBtYW5hZ2VkIHRpdGxlIChpZiBpdCBkb2Vzbid0IGV4aXN0KVxyXG4gICAgICBpZiAodGhpcy5zZXR0aW5ncy5jcmVhdGVEYXRhdmlld1F1ZXJ5KSB7XHJcbiAgICAgICAgdGhpcy5jcmVhdGVEYXRhdmlld1F1ZXJ5UGVyQm9vayhcclxuICAgICAgICAgIHtcclxuICAgICAgICAgICAgcGF0aCxcclxuICAgICAgICAgICAgbWFuYWdlZEJvb2tUaXRsZSxcclxuICAgICAgICAgICAgYm9vazogZGF0YVtib29rXSxcclxuICAgICAgICAgIH0sXHJcbiAgICAgICAgICB0aGlzLmFwcC52YXVsdC5nZXRBYnN0cmFjdEZpbGVCeVBhdGgoXHJcbiAgICAgICAgICAgIGAke3BhdGh9LyR7bWFuYWdlZEJvb2tUaXRsZX0ubWRgXHJcbiAgICAgICAgICApIGFzIFRGaWxlXHJcbiAgICAgICAgKTtcclxuICAgICAgfVxyXG5cclxuICAgICAgZm9yIChjb25zdCBib29rbWFyayBpbiBkYXRhW2Jvb2tdLmJvb2ttYXJrcykge1xyXG4gICAgICAgIGNvbnN0IHVwZGF0ZU5vdGU6IGJvb2xlYW4gPSBmYWxzZTtcclxuICAgICAgICBjb25zdCB1bmlxdWVJZCA9IGNyeXB0b1xyXG4gICAgICAgICAgLmNyZWF0ZUhhc2goJ21kNScpXHJcbiAgICAgICAgICAudXBkYXRlKFxyXG4gICAgICAgICAgICBgJHtkYXRhW2Jvb2tdLnRpdGxlfSAtICR7ZGF0YVtib29rXS5hdXRob3JzfSAtICR7ZGF0YVtib29rXS5ib29rbWFya3NbYm9va21hcmtdLnBvczB9IC0gJHtkYXRhW2Jvb2tdLmJvb2ttYXJrc1tib29rbWFya10ucG9zMX1gXHJcbiAgICAgICAgICApXHJcbiAgICAgICAgICAuZGlnZXN0KCdoZXgnKTtcclxuXHJcbiAgICAgICAgLy8gaWYgdGhlIG5vdGUgaXMgbm90IHlldCBpbXBvcnRlZCwgd2UgY3JlYXRlIGl0XHJcbiAgICAgICAgaWYgKCFPYmplY3Qua2V5cyh0aGlzLnNldHRpbmdzLmltcG9ydGVkTm90ZXMpLmluY2x1ZGVzKHVuaXF1ZUlkKSkge1xyXG4gICAgICAgICAgaWYgKCFPYmplY3Qua2V5cyhleGlzdGluZ05vdGVzKS5pbmNsdWRlcyh1bmlxdWVJZCkpIHtcclxuICAgICAgICAgICAgY29uc3QgeyBjb250ZW50LCBmcm9udG1hdHRlckRhdGEsIG5vdGVQYXRoIH0gPVxyXG4gICAgICAgICAgICAgIGF3YWl0IHRoaXMuY3JlYXRlTm90ZSh7XHJcbiAgICAgICAgICAgICAgICBwYXRoLFxyXG4gICAgICAgICAgICAgICAgdW5pcXVlSWQsXHJcbiAgICAgICAgICAgICAgICBib29rbWFyazogZGF0YVtib29rXS5ib29rbWFya3NbYm9va21hcmtdLFxyXG4gICAgICAgICAgICAgICAgbWFuYWdlZEJvb2tUaXRsZSxcclxuICAgICAgICAgICAgICAgIGJvb2s6IGRhdGFbYm9va10sXHJcbiAgICAgICAgICAgICAgICBrZWVwSW5TeW5jOiB0aGlzLnNldHRpbmdzLmtlZXBJblN5bmMsXHJcbiAgICAgICAgICAgICAgfSk7XHJcblxyXG4gICAgICAgICAgICB0aGlzLmFwcC52YXVsdC5jcmVhdGUoXHJcbiAgICAgICAgICAgICAgYCR7bm90ZVBhdGh9Lm1kYCxcclxuICAgICAgICAgICAgICBtYXR0ZXIuc3RyaW5naWZ5KGNvbnRlbnQsIGZyb250bWF0dGVyRGF0YSlcclxuICAgICAgICAgICAgKTtcclxuICAgICAgICAgIH1cclxuICAgICAgICAgIHRoaXMuc2V0dGluZ3MuaW1wb3J0ZWROb3Rlc1t1bmlxdWVJZF0gPSB0cnVlO1xyXG4gICAgICAgICAgLy8gZWxzZSBpZiB0aGUgbm90ZSBleGlzdHMgYW5kIGtlZXBfaW5fc3luYyBpcyB0cnVlIGFuZCB5ZXRfdG9fYmVfZWRpdGVkIGlzIGZhbHNlLCB3ZSB1cGRhdGUgaXRcclxuICAgICAgICB9IGVsc2UgaWYgKFxyXG4gICAgICAgICAgT2JqZWN0LmtleXMoZXhpc3RpbmdOb3RlcykuaW5jbHVkZXModW5pcXVlSWQpICYmXHJcbiAgICAgICAgICBleGlzdGluZ05vdGVzW3VuaXF1ZUlkXS5rZWVwX2luX3N5bmMgJiZcclxuICAgICAgICAgICFleGlzdGluZ05vdGVzW3VuaXF1ZUlkXS55ZXRfdG9fYmVfZWRpdGVkXHJcbiAgICAgICAgKSB7XHJcbiAgICAgICAgICBjb25zdCBub3RlID0gZXhpc3RpbmdOb3Rlc1t1bmlxdWVJZF0ubm90ZSBhcyBURmlsZTtcclxuICAgICAgICAgIGNvbnN0IHsgY29udGVudCwgZnJvbnRtYXR0ZXJEYXRhLCBub3RlUGF0aCB9ID0gYXdhaXQgdGhpcy5jcmVhdGVOb3RlKHtcclxuICAgICAgICAgICAgcGF0aCxcclxuICAgICAgICAgICAgdW5pcXVlSWQsXHJcbiAgICAgICAgICAgIGJvb2ttYXJrOiBkYXRhW2Jvb2tdLmJvb2ttYXJrc1tib29rbWFya10sXHJcbiAgICAgICAgICAgIG1hbmFnZWRCb29rVGl0bGUsXHJcbiAgICAgICAgICAgIGJvb2s6IGRhdGFbYm9va10sXHJcbiAgICAgICAgICAgIGtlZXBJblN5bmM6IGV4aXN0aW5nTm90ZXNbdW5pcXVlSWRdPy5rZWVwX2luX3N5bmMsXHJcbiAgICAgICAgICB9KTtcclxuXHJcbiAgICAgICAgICB0aGlzLmFwcC52YXVsdC5tb2RpZnkoXHJcbiAgICAgICAgICAgIG5vdGUsXHJcbiAgICAgICAgICAgIG1hdHRlci5zdHJpbmdpZnkoY29udGVudCwgZnJvbnRtYXR0ZXJEYXRhKVxyXG4gICAgICAgICAgKTtcclxuICAgICAgICB9XHJcbiAgICAgIH1cclxuICAgIH1cclxuICAgIGF3YWl0IHRoaXMuc2F2ZVNldHRpbmdzKCk7XHJcbiAgfVxyXG59XHJcblxyXG5jbGFzcyBLb3JlYWRlclNldHRpbmdUYWIgZXh0ZW5kcyBQbHVnaW5TZXR0aW5nVGFiIHtcclxuICBwbHVnaW46IEtPUmVhZGVyO1xyXG5cclxuICBjb25zdHJ1Y3RvcihhcHA6IEFwcCwgcGx1Z2luOiBLT1JlYWRlcikge1xyXG4gICAgc3VwZXIoYXBwLCBwbHVnaW4pO1xyXG4gICAgdGhpcy5wbHVnaW4gPSBwbHVnaW47XHJcbiAgfVxyXG5cclxuICBkaXNwbGF5KCk6IHZvaWQge1xyXG4gICAgY29uc3QgeyBjb250YWluZXJFbCB9ID0gdGhpcztcclxuXHJcbiAgICBjb250YWluZXJFbC5lbXB0eSgpO1xyXG5cclxuICAgIGNvbnRhaW5lckVsLmNyZWF0ZUVsKCdoMicsIHsgdGV4dDogJ0tPUmVhZGVyIGdlbmVyYWwgc2V0dGluZ3MnIH0pO1xyXG5cclxuICAgIG5ldyBTZXR0aW5nKGNvbnRhaW5lckVsKVxyXG4gICAgICAuc2V0TmFtZSgnS09SZWFkZXIgbW91bnRlZCBwYXRoJylcclxuICAgICAgLnNldERlc2MoJ0VnLiAvbWVkaWEvPHVzZXI+L0tPQk9lUmVhZGVyJylcclxuICAgICAgLmFkZFRleHQoKHRleHQpID0+XHJcbiAgICAgICAgdGV4dFxyXG4gICAgICAgICAgLnNldFBsYWNlaG9sZGVyKCdFbnRlciB0aGUgcGF0aCB3aGVyIEtPUmVhZGVyIGlzIG1vdW50ZWQnKVxyXG4gICAgICAgICAgLnNldFZhbHVlKHRoaXMucGx1Z2luLnNldHRpbmdzLmtvcmVhZGVyQmFzZVBhdGgpXHJcbiAgICAgICAgICAub25DaGFuZ2UoYXN5bmMgKHZhbHVlKSA9PiB7XHJcbiAgICAgICAgICAgIHRoaXMucGx1Z2luLnNldHRpbmdzLmtvcmVhZGVyQmFzZVBhdGggPSB2YWx1ZTtcclxuICAgICAgICAgICAgYXdhaXQgdGhpcy5wbHVnaW4uc2F2ZVNldHRpbmdzKCk7XHJcbiAgICAgICAgICB9KVxyXG4gICAgICApO1xyXG5cclxuICAgIG5ldyBTZXR0aW5nKGNvbnRhaW5lckVsKVxyXG4gICAgICAuc2V0TmFtZSgnSGlnaGxpZ2h0cyBmb2xkZXIgbG9jYXRpb24nKVxyXG4gICAgICAuc2V0RGVzYygnVmF1bHQgZm9sZGVyIHRvIHVzZSBmb3Igd3JpdGluZyBib29rIGhpZ2hsaWdodCBub3RlcycpXHJcbiAgICAgIC5hZGREcm9wZG93bigoZHJvcGRvd24pID0+IHtcclxuICAgICAgICBjb25zdCB7IGZpbGVzIH0gPSB0aGlzLmFwcC52YXVsdC5hZGFwdGVyIGFzIGFueTtcclxuICAgICAgICBjb25zdCBmb2xkZXJzID0gT2JqZWN0LmtleXMoZmlsZXMpLmZpbHRlcihcclxuICAgICAgICAgIChrZXkpID0+IGZpbGVzW2tleV0udHlwZSA9PT0gJ2ZvbGRlcidcclxuICAgICAgICApO1xyXG4gICAgICAgIGZvbGRlcnMuZm9yRWFjaCgodmFsKSA9PiB7XHJcbiAgICAgICAgICBkcm9wZG93bi5hZGRPcHRpb24odmFsLCB2YWwpO1xyXG4gICAgICAgIH0pO1xyXG4gICAgICAgIHJldHVybiBkcm9wZG93blxyXG4gICAgICAgICAgLnNldFZhbHVlKHRoaXMucGx1Z2luLnNldHRpbmdzLm9ic2lkaWFuTm90ZUZvbGRlcilcclxuICAgICAgICAgIC5vbkNoYW5nZShhc3luYyAodmFsdWUpID0+IHtcclxuICAgICAgICAgICAgdGhpcy5wbHVnaW4uc2V0dGluZ3Mub2JzaWRpYW5Ob3RlRm9sZGVyID0gdmFsdWU7XHJcbiAgICAgICAgICAgIGF3YWl0IHRoaXMucGx1Z2luLnNhdmVTZXR0aW5ncygpO1xyXG4gICAgICAgICAgfSk7XHJcbiAgICAgIH0pO1xyXG5cclxuICAgIG5ldyBTZXR0aW5nKGNvbnRhaW5lckVsKVxyXG4gICAgICAuc2V0TmFtZSgnS2VlcCBpbiBzeW5jJylcclxuICAgICAgLnNldERlc2MoXHJcbiAgICAgICAgY3JlYXRlRnJhZ21lbnQoKGZyYWcpID0+IHtcclxuICAgICAgICAgIGZyYWcuYXBwZW5kVGV4dCgnS2VlcCBub3RlcyBpbiBzeW5jIHdpdGggS09SZWFkZXIgKHJlYWQgdGhlICcpO1xyXG4gICAgICAgICAgZnJhZy5jcmVhdGVFbChcclxuICAgICAgICAgICAgJ2EnLFxyXG4gICAgICAgICAgICB7XHJcbiAgICAgICAgICAgICAgdGV4dDogJ2RvY3VtZW50YXRpb24nLFxyXG4gICAgICAgICAgICAgIGhyZWY6ICdodHRwczovL2dpdGh1Yi5jb20vRWRvNzgvb2JzaWRpYW4ta29yZWFkZXItc3luYyNzeW5jJyxcclxuICAgICAgICAgICAgfSxcclxuICAgICAgICAgICAgKGEpID0+IHtcclxuICAgICAgICAgICAgICBhLnNldEF0dHIoJ3RhcmdldCcsICdfYmxhbmsnKTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICAgKTtcclxuICAgICAgICAgIGZyYWcuYXBwZW5kVGV4dCgnKScpO1xyXG4gICAgICAgIH0pXHJcbiAgICAgIClcclxuICAgICAgLmFkZFRvZ2dsZSgodG9nZ2xlKSA9PlxyXG4gICAgICAgIHRvZ2dsZVxyXG4gICAgICAgICAgLnNldFZhbHVlKHRoaXMucGx1Z2luLnNldHRpbmdzLmtlZXBJblN5bmMpXHJcbiAgICAgICAgICAub25DaGFuZ2UoYXN5bmMgKHZhbHVlKSA9PiB7XHJcbiAgICAgICAgICAgIHRoaXMucGx1Z2luLnNldHRpbmdzLmtlZXBJblN5bmMgPSB2YWx1ZTtcclxuICAgICAgICAgICAgYXdhaXQgdGhpcy5wbHVnaW4uc2F2ZVNldHRpbmdzKCk7XHJcbiAgICAgICAgICB9KVxyXG4gICAgICApO1xyXG5cclxuICAgIG5ldyBTZXR0aW5nKGNvbnRhaW5lckVsKVxyXG4gICAgICAuc2V0TmFtZSgnQ3JlYXRlIGEgZm9sZGVyIGZvciBlYWNoIGJvb2snKVxyXG4gICAgICAuc2V0RGVzYyhcclxuICAgICAgICAnQWxsIHRoZSBub3RlcyBmcm9tIGEgYm9vayB3aWxsIGJlIHNhdmVkIGluIGEgZm9sZGVyIG5hbWVkIGFmdGVyIHRoZSBib29rJ1xyXG4gICAgICApXHJcbiAgICAgIC5hZGRUb2dnbGUoKHRvZ2dsZSkgPT5cclxuICAgICAgICB0b2dnbGVcclxuICAgICAgICAgIC5zZXRWYWx1ZSh0aGlzLnBsdWdpbi5zZXR0aW5ncy5hRm9sZGVyRm9yRWFjaEJvb2spXHJcbiAgICAgICAgICAub25DaGFuZ2UoYXN5bmMgKHZhbHVlKSA9PiB7XHJcbiAgICAgICAgICAgIHRoaXMucGx1Z2luLnNldHRpbmdzLmFGb2xkZXJGb3JFYWNoQm9vayA9IHZhbHVlO1xyXG4gICAgICAgICAgICBhd2FpdCB0aGlzLnBsdWdpbi5zYXZlU2V0dGluZ3MoKTtcclxuICAgICAgICAgIH0pXHJcbiAgICAgICk7XHJcblxyXG4gICAgY29udGFpbmVyRWwuY3JlYXRlRWwoJ2gyJywgeyB0ZXh0OiAnVmlldyBzZXR0aW5ncycgfSk7XHJcblxyXG4gICAgbmV3IFNldHRpbmcoY29udGFpbmVyRWwpXHJcbiAgICAgIC5zZXROYW1lKCdDdXN0b20gdGVtcGxhdGUnKVxyXG4gICAgICAuc2V0RGVzYygnVXNlIGEgY3VzdG9tIHRlbXBsYXRlIGZvciB0aGUgbm90ZXMnKVxyXG4gICAgICAuYWRkVG9nZ2xlKCh0b2dnbGUpID0+XHJcbiAgICAgICAgdG9nZ2xlXHJcbiAgICAgICAgICAuc2V0VmFsdWUodGhpcy5wbHVnaW4uc2V0dGluZ3MuY3VzdG9tVGVtcGxhdGUpXHJcbiAgICAgICAgICAub25DaGFuZ2UoYXN5bmMgKHZhbHVlKSA9PiB7XHJcbiAgICAgICAgICAgIHRoaXMucGx1Z2luLnNldHRpbmdzLmN1c3RvbVRlbXBsYXRlID0gdmFsdWU7XHJcbiAgICAgICAgICAgIGF3YWl0IHRoaXMucGx1Z2luLnNhdmVTZXR0aW5ncygpO1xyXG4gICAgICAgICAgfSlcclxuICAgICAgKTtcclxuXHJcbiAgICBuZXcgU2V0dGluZyhjb250YWluZXJFbClcclxuICAgICAgLnNldE5hbWUoJ1RlbXBsYXRlIGZpbGUnKVxyXG4gICAgICAuc2V0RGVzYygnVGhlIHRlbXBsYXRlIGZpbGUgdG8gdXNlLiBSZW1lbWJlciB0byBhZGQgdGhlIFwiLm1kXCIgZXh0ZW5zaW9uJylcclxuICAgICAgLmFkZFRleHQoKHRleHQpID0+XHJcbiAgICAgICAgdGV4dFxyXG4gICAgICAgICAgLnNldFBsYWNlaG9sZGVyKCd0ZW1wbGF0ZXMvbm90ZS5tZCcpXHJcbiAgICAgICAgICAuc2V0VmFsdWUodGhpcy5wbHVnaW4uc2V0dGluZ3MudGVtcGxhdGVQYXRoKVxyXG4gICAgICAgICAgLm9uQ2hhbmdlKGFzeW5jICh2YWx1ZSkgPT4ge1xyXG4gICAgICAgICAgICB0aGlzLnBsdWdpbi5zZXR0aW5ncy50ZW1wbGF0ZVBhdGggPSB2YWx1ZTtcclxuICAgICAgICAgICAgYXdhaXQgdGhpcy5wbHVnaW4uc2F2ZVNldHRpbmdzKCk7XHJcbiAgICAgICAgICB9KVxyXG4gICAgICApO1xyXG5cclxuICAgIG5ldyBTZXR0aW5nKGNvbnRhaW5lckVsKVxyXG4gICAgICAuc2V0TmFtZSgnQ3VzdG9tIGJvb2sgdGVtcGxhdGUnKVxyXG4gICAgICAuc2V0RGVzYygnVXNlIGEgY3VzdG9tIHRlbXBsYXRlIGZvciB0aGUgZGF0YXZpZXcnKVxyXG4gICAgICAuYWRkVG9nZ2xlKCh0b2dnbGUpID0+XHJcbiAgICAgICAgdG9nZ2xlXHJcbiAgICAgICAgICAuc2V0VmFsdWUodGhpcy5wbHVnaW4uc2V0dGluZ3MuY3VzdG9tRGF0YXZpZXdUZW1wbGF0ZSlcclxuICAgICAgICAgIC5vbkNoYW5nZShhc3luYyAodmFsdWUpID0+IHtcclxuICAgICAgICAgICAgdGhpcy5wbHVnaW4uc2V0dGluZ3MuY3VzdG9tRGF0YXZpZXdUZW1wbGF0ZSA9IHZhbHVlO1xyXG4gICAgICAgICAgICBhd2FpdCB0aGlzLnBsdWdpbi5zYXZlU2V0dGluZ3MoKTtcclxuICAgICAgICAgIH0pXHJcbiAgICAgICk7XHJcblxyXG4gICAgbmV3IFNldHRpbmcoY29udGFpbmVyRWwpXHJcbiAgICAgIC5zZXROYW1lKCdCb29rIHRlbXBsYXRlIGZpbGUnKVxyXG4gICAgICAuc2V0RGVzYygnVGhlIHRlbXBsYXRlIGZpbGUgdG8gdXNlLiBSZW1lbWJlciB0byBhZGQgdGhlIFwiLm1kXCIgZXh0ZW5zaW9uJylcclxuICAgICAgLmFkZFRleHQoKHRleHQpID0+XHJcbiAgICAgICAgdGV4dFxyXG4gICAgICAgICAgLnNldFBsYWNlaG9sZGVyKCd0ZW1wbGF0ZXMvdGVtcGxhdGUtYm9vay5tZCcpXHJcbiAgICAgICAgICAuc2V0VmFsdWUodGhpcy5wbHVnaW4uc2V0dGluZ3MuZGF0YXZpZXdUZW1wbGF0ZVBhdGgpXHJcbiAgICAgICAgICAub25DaGFuZ2UoYXN5bmMgKHZhbHVlKSA9PiB7XHJcbiAgICAgICAgICAgIHRoaXMucGx1Z2luLnNldHRpbmdzLmRhdGF2aWV3VGVtcGxhdGVQYXRoID0gdmFsdWU7XHJcbiAgICAgICAgICAgIGF3YWl0IHRoaXMucGx1Z2luLnNhdmVTZXR0aW5ncygpO1xyXG4gICAgICAgICAgfSlcclxuICAgICAgKTtcclxuXHJcbiAgICBuZXcgU2V0dGluZyhjb250YWluZXJFbClcclxuICAgICAgLnNldE5hbWUoJ0NyZWF0ZSBhIGRhdGF2aWV3IHF1ZXJ5JylcclxuICAgICAgLnNldERlc2MoXHJcbiAgICAgICAgY3JlYXRlRnJhZ21lbnQoKGZyYWcpID0+IHtcclxuICAgICAgICAgIGZyYWcuYXBwZW5kVGV4dChcclxuICAgICAgICAgICAgJ0NyZWF0ZSBhIG5vdGUgKGZvciBlYWNoIGJvb2spIHdpdGggYSBkYXRhdmlldyBxdWVyeSAocmVhZCB0aGUgJ1xyXG4gICAgICAgICAgKTtcclxuICAgICAgICAgIGZyYWcuY3JlYXRlRWwoXHJcbiAgICAgICAgICAgICdhJyxcclxuICAgICAgICAgICAge1xyXG4gICAgICAgICAgICAgIHRleHQ6ICdkb2N1bWVudGF0aW9uJyxcclxuICAgICAgICAgICAgICBocmVmOiAnaHR0cHM6Ly9naXRodWIuY29tL0Vkbzc4L29ic2lkaWFuLWtvcmVhZGVyLXN5bmMjZGF0ZXZpZXctZW1iZWRkZWQnLFxyXG4gICAgICAgICAgICB9LFxyXG4gICAgICAgICAgICAoYSkgPT4ge1xyXG4gICAgICAgICAgICAgIGEuc2V0QXR0cigndGFyZ2V0JywgJ19ibGFuaycpO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgICApO1xyXG4gICAgICAgICAgZnJhZy5hcHBlbmRUZXh0KCcpJyk7XHJcbiAgICAgICAgfSlcclxuICAgICAgKVxyXG4gICAgICAuYWRkVG9nZ2xlKCh0b2dnbGUpID0+XHJcbiAgICAgICAgdG9nZ2xlXHJcbiAgICAgICAgICAuc2V0VmFsdWUodGhpcy5wbHVnaW4uc2V0dGluZ3MuY3JlYXRlRGF0YXZpZXdRdWVyeSlcclxuICAgICAgICAgIC5vbkNoYW5nZShhc3luYyAodmFsdWUpID0+IHtcclxuICAgICAgICAgICAgdGhpcy5wbHVnaW4uc2V0dGluZ3MuY3JlYXRlRGF0YXZpZXdRdWVyeSA9IHZhbHVlO1xyXG4gICAgICAgICAgICBhd2FpdCB0aGlzLnBsdWdpbi5zYXZlU2V0dGluZ3MoKTtcclxuICAgICAgICAgIH0pXHJcbiAgICAgICk7XHJcblxyXG4gICAgY29udGFpbmVyRWwuY3JlYXRlRWwoJ2gyJywgeyB0ZXh0OiAnTm90ZSB0aXRsZSBzZXR0aW5ncycgfSk7XHJcblxyXG4gICAgbmV3IFNldHRpbmcoY29udGFpbmVyRWwpLnNldE5hbWUoJ1ByZWZpeCcpLmFkZFRleHQoKHRleHQpID0+XHJcbiAgICAgIHRleHRcclxuICAgICAgICAuc2V0UGxhY2Vob2xkZXIoJ0VudGVyIHRoZSBwcmVmaXgnKVxyXG4gICAgICAgIC5zZXRWYWx1ZSh0aGlzLnBsdWdpbi5zZXR0aW5ncy5ub3RlVGl0bGVPcHRpb25zLnByZWZpeClcclxuICAgICAgICAub25DaGFuZ2UoYXN5bmMgKHZhbHVlKSA9PiB7XHJcbiAgICAgICAgICB0aGlzLnBsdWdpbi5zZXR0aW5ncy5ub3RlVGl0bGVPcHRpb25zLnByZWZpeCA9IHZhbHVlO1xyXG4gICAgICAgICAgYXdhaXQgdGhpcy5wbHVnaW4uc2F2ZVNldHRpbmdzKCk7XHJcbiAgICAgICAgfSlcclxuICAgICk7XHJcbiAgICBuZXcgU2V0dGluZyhjb250YWluZXJFbCkuc2V0TmFtZSgnU3VmZml4JykuYWRkVGV4dCgodGV4dCkgPT5cclxuICAgICAgdGV4dFxyXG4gICAgICAgIC5zZXRQbGFjZWhvbGRlcignRW50ZXIgdGhlIHN1ZmZpeCcpXHJcbiAgICAgICAgLnNldFZhbHVlKHRoaXMucGx1Z2luLnNldHRpbmdzLm5vdGVUaXRsZU9wdGlvbnMuc3VmZml4KVxyXG4gICAgICAgIC5vbkNoYW5nZShhc3luYyAodmFsdWUpID0+IHtcclxuICAgICAgICAgIHRoaXMucGx1Z2luLnNldHRpbmdzLm5vdGVUaXRsZU9wdGlvbnMuc3VmZml4ID0gdmFsdWU7XHJcbiAgICAgICAgICBhd2FpdCB0aGlzLnBsdWdpbi5zYXZlU2V0dGluZ3MoKTtcclxuICAgICAgICB9KVxyXG4gICAgKTtcclxuICAgIG5ldyBTZXR0aW5nKGNvbnRhaW5lckVsKVxyXG4gICAgICAuc2V0TmFtZSgnTWF4IHdvcmRzJylcclxuICAgICAgLnNldERlc2MoXHJcbiAgICAgICAgJ0lmIGlzIGxvbmdlciB0aGFuIHRoaXMgbnVtYmVyIG9mIHdvcmRzLCBpdCB3aWxsIGJlIHRydW5jYXRlZCBhbmQgXCIuLi5cIiB3aWxsIGJlIGFwcGVuZGVkIGJlZm9yZSB0aGUgb3B0aW9uYWwgc3VmZml4J1xyXG4gICAgICApXHJcbiAgICAgIC5hZGRTbGlkZXIoKG51bWJlcikgPT5cclxuICAgICAgICBudW1iZXJcclxuICAgICAgICAgIC5zZXREeW5hbWljVG9vbHRpcCgpXHJcbiAgICAgICAgICAuc2V0TGltaXRzKDAsIDEwLCAxKVxyXG4gICAgICAgICAgLnNldFZhbHVlKHRoaXMucGx1Z2luLnNldHRpbmdzLm5vdGVUaXRsZU9wdGlvbnMubWF4V29yZHMpXHJcbiAgICAgICAgICAub25DaGFuZ2UoYXN5bmMgKHZhbHVlKSA9PiB7XHJcbiAgICAgICAgICAgIHRoaXMucGx1Z2luLnNldHRpbmdzLm5vdGVUaXRsZU9wdGlvbnMubWF4V29yZHMgPSB2YWx1ZTtcclxuICAgICAgICAgICAgYXdhaXQgdGhpcy5wbHVnaW4uc2F2ZVNldHRpbmdzKCk7XHJcbiAgICAgICAgICB9KVxyXG4gICAgICApO1xyXG4gICAgbmV3IFNldHRpbmcoY29udGFpbmVyRWwpXHJcbiAgICAgIC5zZXROYW1lKCdNYXggbGVuZ3RoJylcclxuICAgICAgLnNldERlc2MoXHJcbiAgICAgICAgJ0lmIGlzIGxvbmdlciB0aGFuIHRoaXMgbnVtYmVyIG9mIGNoYXJhY3RlcnMsIGl0IHdpbGwgYmUgdHJ1bmNhdGVkIGFuZCBcIi4uLlwiIHdpbGwgYmUgYXBwZW5kZWQgYmVmb3JlIHRoZSBvcHRpb25hbCBzdWZmaXgnXHJcbiAgICAgIClcclxuICAgICAgLmFkZFNsaWRlcigobnVtYmVyKSA9PlxyXG4gICAgICAgIG51bWJlclxyXG4gICAgICAgICAgLnNldER5bmFtaWNUb29sdGlwKClcclxuICAgICAgICAgIC5zZXRMaW1pdHMoMCwgNTAsIDEpXHJcbiAgICAgICAgICAuc2V0VmFsdWUodGhpcy5wbHVnaW4uc2V0dGluZ3Mubm90ZVRpdGxlT3B0aW9ucy5tYXhMZW5ndGgpXHJcbiAgICAgICAgICAub25DaGFuZ2UoYXN5bmMgKHZhbHVlKSA9PiB7XHJcbiAgICAgICAgICAgIHRoaXMucGx1Z2luLnNldHRpbmdzLm5vdGVUaXRsZU9wdGlvbnMubWF4TGVuZ3RoID0gdmFsdWU7XHJcbiAgICAgICAgICAgIGF3YWl0IHRoaXMucGx1Z2luLnNhdmVTZXR0aW5ncygpO1xyXG4gICAgICAgICAgfSlcclxuICAgICAgKTtcclxuXHJcbiAgICBjb250YWluZXJFbC5jcmVhdGVFbCgnaDInLCB7IHRleHQ6ICdCb29rIHRpdGxlIHNldHRpbmdzJyB9KTtcclxuXHJcbiAgICBuZXcgU2V0dGluZyhjb250YWluZXJFbCkuc2V0TmFtZSgnUHJlZml4JykuYWRkVGV4dCgodGV4dCkgPT5cclxuICAgICAgdGV4dFxyXG4gICAgICAgIC5zZXRQbGFjZWhvbGRlcignRW50ZXIgdGhlIHByZWZpeCcpXHJcbiAgICAgICAgLnNldFZhbHVlKHRoaXMucGx1Z2luLnNldHRpbmdzLmJvb2tUaXRsZU9wdGlvbnMucHJlZml4KVxyXG4gICAgICAgIC5vbkNoYW5nZShhc3luYyAodmFsdWUpID0+IHtcclxuICAgICAgICAgIHRoaXMucGx1Z2luLnNldHRpbmdzLmJvb2tUaXRsZU9wdGlvbnMucHJlZml4ID0gdmFsdWU7XHJcbiAgICAgICAgICBhd2FpdCB0aGlzLnBsdWdpbi5zYXZlU2V0dGluZ3MoKTtcclxuICAgICAgICB9KVxyXG4gICAgKTtcclxuICAgIG5ldyBTZXR0aW5nKGNvbnRhaW5lckVsKS5zZXROYW1lKCdTdWZmaXgnKS5hZGRUZXh0KCh0ZXh0KSA9PlxyXG4gICAgICB0ZXh0XHJcbiAgICAgICAgLnNldFBsYWNlaG9sZGVyKCdFbnRlciB0aGUgc3VmZml4JylcclxuICAgICAgICAuc2V0VmFsdWUodGhpcy5wbHVnaW4uc2V0dGluZ3MuYm9va1RpdGxlT3B0aW9ucy5zdWZmaXgpXHJcbiAgICAgICAgLm9uQ2hhbmdlKGFzeW5jICh2YWx1ZSkgPT4ge1xyXG4gICAgICAgICAgdGhpcy5wbHVnaW4uc2V0dGluZ3MuYm9va1RpdGxlT3B0aW9ucy5zdWZmaXggPSB2YWx1ZTtcclxuICAgICAgICAgIGF3YWl0IHRoaXMucGx1Z2luLnNhdmVTZXR0aW5ncygpO1xyXG4gICAgICAgIH0pXHJcbiAgICApO1xyXG4gICAgbmV3IFNldHRpbmcoY29udGFpbmVyRWwpXHJcbiAgICAgIC5zZXROYW1lKCdNYXggd29yZHMnKVxyXG4gICAgICAuc2V0RGVzYyhcclxuICAgICAgICAnSWYgaXMgbG9uZ2VyIHRoYW4gdGhpcyBudW1iZXIgb2Ygd29yZHMsIGl0IHdpbGwgYmUgdHJ1bmNhdGVkIGFuZCBcIi4uLlwiIHdpbGwgYmUgYXBwZW5kZWQgYmVmb3JlIHRoZSBvcHRpb25hbCBzdWZmaXgnXHJcbiAgICAgIClcclxuICAgICAgLmFkZFNsaWRlcigobnVtYmVyKSA9PlxyXG4gICAgICAgIG51bWJlclxyXG4gICAgICAgICAgLnNldER5bmFtaWNUb29sdGlwKClcclxuICAgICAgICAgIC5zZXRMaW1pdHMoMCwgMTAsIDEpXHJcbiAgICAgICAgICAuc2V0VmFsdWUodGhpcy5wbHVnaW4uc2V0dGluZ3MuYm9va1RpdGxlT3B0aW9ucy5tYXhXb3JkcylcclxuICAgICAgICAgIC5vbkNoYW5nZShhc3luYyAodmFsdWUpID0+IHtcclxuICAgICAgICAgICAgdGhpcy5wbHVnaW4uc2V0dGluZ3MuYm9va1RpdGxlT3B0aW9ucy5tYXhXb3JkcyA9IHZhbHVlO1xyXG4gICAgICAgICAgICBhd2FpdCB0aGlzLnBsdWdpbi5zYXZlU2V0dGluZ3MoKTtcclxuICAgICAgICAgIH0pXHJcbiAgICAgICk7XHJcbiAgICBuZXcgU2V0dGluZyhjb250YWluZXJFbClcclxuICAgICAgLnNldE5hbWUoJ01heCBsZW5ndGgnKVxyXG4gICAgICAuc2V0RGVzYyhcclxuICAgICAgICAnSWYgaXMgbG9uZ2VyIHRoYW4gdGhpcyBudW1iZXIgb2YgY2hhcmFjdGVycywgaXQgd2lsbCBiZSB0cnVuY2F0ZWQgYW5kIFwiLi4uXCIgd2lsbCBiZSBhcHBlbmRlZCBiZWZvcmUgdGhlIG9wdGlvbmFsIHN1ZmZpeCdcclxuICAgICAgKVxyXG4gICAgICAuYWRkU2xpZGVyKChudW1iZXIpID0+XHJcbiAgICAgICAgbnVtYmVyXHJcbiAgICAgICAgICAuc2V0RHluYW1pY1Rvb2x0aXAoKVxyXG4gICAgICAgICAgLnNldExpbWl0cygwLCA1MCwgMSlcclxuICAgICAgICAgIC5zZXRWYWx1ZSh0aGlzLnBsdWdpbi5zZXR0aW5ncy5ib29rVGl0bGVPcHRpb25zLm1heExlbmd0aClcclxuICAgICAgICAgIC5vbkNoYW5nZShhc3luYyAodmFsdWUpID0+IHtcclxuICAgICAgICAgICAgdGhpcy5wbHVnaW4uc2V0dGluZ3MuYm9va1RpdGxlT3B0aW9ucy5tYXhMZW5ndGggPSB2YWx1ZTtcclxuICAgICAgICAgICAgYXdhaXQgdGhpcy5wbHVnaW4uc2F2ZVNldHRpbmdzKCk7XHJcbiAgICAgICAgICB9KVxyXG4gICAgICApO1xyXG5cclxuICAgIGNvbnRhaW5lckVsLmNyZWF0ZUVsKCdoMicsIHsgdGV4dDogJ0RBTkdFUiBaT05FJyB9KTtcclxuXHJcbiAgICBuZXcgU2V0dGluZyhjb250YWluZXJFbClcclxuICAgICAgLnNldE5hbWUoJ0VuYWJsZSByZXNldCBvZiBpbXBvcnRlZCBub3RlcycpXHJcbiAgICAgIC5zZXREZXNjKFxyXG4gICAgICAgIFwiRW5hYmxlIHRoZSBjb21tYW5kIHRvIGVtcHR5IHRoZSBsaXN0IG9mIGltcG9ydGVkIG5vdGVzIGluIGNhc2UgeW91IGNhbid0IHJlY292ZXIgZnJvbSB0aGUgdHJhc2ggb25lIG9yIG1vcmUgbm90ZXNcIlxyXG4gICAgICApXHJcbiAgICAgIC5hZGRUb2dnbGUoKHRvZ2dsZSkgPT5cclxuICAgICAgICB0b2dnbGVcclxuICAgICAgICAgIC5zZXRWYWx1ZSh0aGlzLnBsdWdpbi5zZXR0aW5ncy5lbmJsZVJlc2V0SW1wb3J0ZWROb3RlcylcclxuICAgICAgICAgIC5vbkNoYW5nZShhc3luYyAodmFsdWUpID0+IHtcclxuICAgICAgICAgICAgdGhpcy5wbHVnaW4uc2V0dGluZ3MuZW5ibGVSZXNldEltcG9ydGVkTm90ZXMgPSB2YWx1ZTtcclxuICAgICAgICAgICAgYXdhaXQgdGhpcy5wbHVnaW4uc2F2ZVNldHRpbmdzKCk7XHJcbiAgICAgICAgICB9KVxyXG4gICAgICApO1xyXG4gIH1cclxufVxyXG4iXX0=
