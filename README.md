# Obsidian KOReader Plugin

Sync [KOReader][1] notes in your [Obsidian][2] vault. The KOReader device must be connected to the device running obsidian to let the plugin scan through it's files.

In the beginning of each note there a series of YAML data knwon as Frontmatter. Those data are mainly used by the plugin itself (you can use them as shown in [dataview examples](#dataview-examples)) but messing with them will cause unexpected behaviour so use the provided [commands](#commands) to properly interact with them.

When you're comfy reading your notes in obsidian think about how useful is this plugin to you and express your gratitude with a tweet or with a coffee :coffee:

[![Twitter URL](https://img.shields.io/twitter/url?style=social&url=https%3A%2F%2Ftwitter.com%2Fintent%2Ftweet%3Ftext%3DI%2527m%2520enjoying%2520%2540Edo78%2527s%2520%2523Obsidian%2520plugin%2520to%2520sync%2520my%2520%2523KOReader%2520notes.%250AThank%2520you%2520for%2520your%2520great%2520work.%250A%250Ahttps%253A%252F%252Fgithub.com%252FEdo78%252Fobsidian-koreader-sync)](https://twitter.com/intent/tweet?text=I%27m%20enjoying%20%40Edo78%27s%20%23Obsidian%20plugin%20to%20sync%20my%20%23KOReader%20notes.%0AThank%20you%20for%20your%20great%20work.%0A%0Ahttps%3A%2F%2Fgithub.com%2FEdo78%2Fobsidian-koreader-sync)
<a href="https://www.buymeacoffee.com/Edo78" target="_blank"><img src="https://cdn.buymeacoffee.com/buttons/default-orange.png" alt="Buy Me A Coffee" height="41" width="174"></a>

## Configuration

There ara four main settings:
- `KOReader mounted path` that **MUST** be set correctly to the path where KOReader is mounted
- `Highlights folder location` that can be let as the default `/` (or you can create a folder and select it from the dropdown)
- `Keep in sync` that define if the plugin **should** keep the notes in sync with KOReader importing them again (see [sync](#sync))
- `Create a folder for each book` if you are a fan of folders enabling this setting the **new notes** will be created in a subfolder named as the book itself

### Danger Zone

This area contains settings that can be useful in a very few edga cases and can be dangerous in a day to day usage.

- `Enable reset of imported notes` enable a one shot execution of the [command](#commands) `Reset Sync List`

### View configuration
The plugin use [Eta.js](https://eta.js.org/) as template engine to create the body of the note (the same used from the plugin [Templater](https://github.com/SilentVoid13/Templater)).
The default template is pretty minimal
```
## Title: [[<%= it.bookPath %>|<%= it.title %>]]

### by: [[<%= it.authors %>]]

### Chapter: <%= it.chapter %>

Page: <%= it.page %>

**==<%= it.highlight %>==**

<%= it.text %>
```
In the `View settings` section you can found the the option to use a custom template. If you chose to do so you must create a `.md` file in the vault and write your template in it (I suggest to copy the default in it as a starting point) and write the path in `Template file`

The template receive the following arguments:
- `bookPath`: koreader/(book) How to Take Smart Notes_... {book suffix}-Sönke Ahrens
- `title`: How to Take Smart Notes: One Simple Technique to Boost Writing, Learning and Thinking - for Students, Academics and Nonfiction Book Writers
- `authors`: Sönke Ahrens
- `chapter`: 1.1 Good Solutions are Simple – and Unexpected
- `highlight`: Clance and Imes 1978; Brems et al. 1994
- `text`: Clance (1978) first identified the Impostor Phenomenon in therapeutic sessions with highly successful women who attributed achievements to external factors
- `datetime`: 2022-01-22 09:57:29
- `page`: 19

### Book view configuration
The default template is minimal but complex
~~~markdown
# Title: <%= it.data.title %>

<progress value="<%= it.metadata.percent_finished %>" max="100"> </progress>
```dataviewjs
const title = dv.current()['koreader-sync'].metadata.managed_title
dv.pages().where(n => {
return n['koreader-sync'] && n['koreader-sync'].type == 'koreader-sync-note' && n['koreader-sync'].metadata.managed_book_title == title
}).sort(p => p['koreader-sync'].data.page).forEach(p => dv.paragraph(dv.fileLink(p.file.name, true), {style: 'test-css'}))
```
~~~
The core of this template is a js [dataview embedded](#dataview-embedded) query. Don't mess with it if you don't know what you are doing (I don't because I barely know Dataview).

The template receive exactly the same data you can see in the frontmatter. If it's not there you can't use it but you can create an issue asking for it.

#### Dataview embedded
Besides a native support for [Dataview](https://github.com/blacksmithgu/obsidian-dataview) (look at the [example](#dataview-examples)) the plugin let the user chose to automatically create a note for each book with a dataview query inside.
The note is created in the same folder of the notes of the book but can be moved and renamed and Obsidian will take care of updating the links.
To use this feature Dataview needs to be installed and its `Enable JavaScript Queries` must be enabled.
The query itself will embed the single notes and a CSS will hide every `h2` and `h3` tags (with the default template this will hide the title, the author and the chapter).

**ATTENTION**: this feature require at least Obsidian v0.13.19 but there is a glitch that sometimes show only the filename of the notes instead of their contents. Try to close the note and open it again (sorry, not my fault)

## Usage
Once the plugin is configured properly you can plug the device with KOReader and click on the icon with two documents and the tooltip `Sync your KOReader highlights`. The plugin should propmplty create a single file for each note.

### Commands
**NOTE:** if a command is suppose to set a frontmatter property equal to a certain value then it will be shown only if the open note has such property with a different value.
 
There are five commands:
- `Sync` it's the same as clicking on the plugin's icon, it's trigger the sync of the notes
- `Reset Sync List` empty the list of imported notes (see [Danger Zone](#danger-zone)). Always try to retrieve the deleted notes from trash before using this command because all the rightfully discarded notes will be imported again. This command will also disable itself so you have to enable in the settings again if you wish to use it again.
- `Mark this note as Edited` set the frontmatter propery `yet_to_be_edited` to `false` (see [Note editing](#note-editing))
- `Mark this note as NOT Edited` set the frontmatter propery `yet_to_be_edited` to `true` (see [Note editing](#note-editing))
- `Enable Sync for this note` set the frontmatter propery `keep_in_sync` to `true` (see [sync](#sync))
- `Disable Sync for this note` set the frontmatter propery `keep_in_sync` to `false` (see [sync](#sync))

### Note editing
If you chose to manually edit a note you are strongly raccomanded to change the frontmatter `yet_to_be_edited` value from `true` to `false` to let the plugin know that you altered something and to avoid any loss in case of [sync](#sync)
It's easier/safer to use the proper [commands](#commands) to do so instead of manually editing the frontmatter

### Sync
**WARNING** Sync works by deleting a note and creating it again from KOReader. Anything added or updated (in Obsidian) will be lost _like tears in rain_. Consider yourself warned.

The syncing process rely on two property defined in the frontmatter metadata:

- `keep_in_sync`
- `yet_to_be_edited`

Both needs to be `true` for the note to be synced.

`keep_in_sync` can be controlled at global level through the setting `Keep in sync` or in each note while `yet_to_be_edited` is set to `true` when the note is imported from KOReader and can only be manually changed in the note itself.

The default value for `keep_in_sync` is `false` so the default behaviour is that once a note is in obsidian it will never be synced again.

If you modify your notes in KOReader and want them to be synced in obsidian you have to enable the `Keep in sync` setting **OR** use the proper [commands](#commands) to change the `keep_in_sync` frontmatter of a specific note from `false` to `true` and if the `yet_to_be_edited` of that note is `true` then the note will be deleted and recreated.

## Dataview examples
Thanks to the frontmatter data in each note you can use Dataview to easily query your notes

### Books
~~~markdown
```dataview
list
where koreader-sync
group by koreader-sync.data.title
```
~~~

### Chapters of a specific book (with notes in them)
~~~markdown
```dataview
list
where koreader-sync.data.title = "How to Take Smart Notes: One Simple Technique to Boost Writing, Learning and Thinking - for Students, Academics and Nonfiction Book Writers"
group by koreader-sync.data.chapter
```
~~~

### Notes of a specific chapter of a specific book
~~~markdown
```dataview
list
where koreader-sync.data.title = "How to Take Smart Notes: One Simple Technique to Boost Writing, Learning and Thinking - for Students, Academics and Nonfiction Book Writers" and koreader-sync.data.chapter = "Introduction"
```
~~~

### Text of notes of a specific book (without a link to the note and only where text is present)
~~~markdown
```dataview
list without id koreader-sync.data.text
where koreader-sync.data.title = "How to Take Smart Notes: One Simple Technique to Boost Writing, Learning and Thinking - for Students, Academics and Nonfiction Book Writers"
where koreader-sync.data.text
```
~~~

### List of notes yet to be edited
~~~markdown
```dataview
list 
where koreader-sync.metadata.yet_to_be_edited
```
~~~

### List of notes that should be kept in sync
~~~markdown
```dataview
list 
where koreader-sync.metadata.keep_in_sync
```
~~~

### List of notes that will be kept in sync
~~~markdown
```dataview
list 
where koreader-sync.metadata.keep_in_sync and koreader-sync.metadata.yet_to_be_edited
```
~~~

[1]: https://koreader.rocks/
[2]: https://obsidian.md