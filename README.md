# Obsidian KOReader Plugin

Sync [KOReader][1] notes in your [Obsidian][2] vault. The KOReader device must be connected to the device running obsidian to let the plugin scan through it's files.

## Configuration

There ara four main settings:
- `KOReader mounted path` that **MUST** be set correctly to the path where KOReader is mounted
- `Highlights folder location` that can be let as the default `/` (or you can create a folder and select it from the dropdown)
- `Keep in sync` that define if the plugin **should** keep the notes in sync with KOReader importing them again (see [sync](#sync))
- `Create a folder for each book` if you are a fan of folders enabling this setting the **new notes** will be created in a subfolder named as the book itself

### Template configuration
The plugin use [Eta.js](https://eta.js.org/) as template engine to create the body of the note (the same used from the plugin [Templater](https://github.com/SilentVoid13/Templater)).
The default template is pretty minimal
```
# Title: [[<%= it.bookPath %>|<%= it.title %>]]

by: [[<%= it.authors %>]]

## Chapter: <%= it.chapter %>

Page: <%= it.page %>

**==<%= it.highlight %>==**

<%= it.text %>
```
In the `Template settings` section you can found the the option to use a custom template. If you chose to do so you must create a `.md` file in the vault and write your template in it (I suggest to copy the default in it as a starting point) and write the full path in `Template file`

The template receive the following arguments:
- `bookPath`: koreader/(book) How to Take Smart Notes_... {book suffix}-Sönke Ahrens
- `title`: How to Take Smart Notes: One Simple Technique to Boost Writing, Learning and Thinking - for Students, Academics and Nonfiction Book Writers
- `authors`: Sönke Ahrens
- `chapter`: 1.1 Good Solutions are Simple – and Unexpected
- `highlight`: Clance and Imes 1978; Brems et al. 1994
- `text`: Clance (1978) first identified the Impostor Phenomenon in therapeutic sessions with highly successful women who attributed achievements to external factors
- `datetime`: 2022-01-22 09:57:29

## Usage
Once the plugin is configured properly you can plug the device with KOReader and click on the icon with two documents and the tooltip `KOReader Plugin`. The plugin should propmplty create a single file for each note.

Create an issue if something didn't work as expected.

### Note editing
If you chose to manually edit a note you are strongly raccomanded to change the frontmatter `yet_to_be_edited` value from `true` to `false` to let the plugin know that you altered something and to avoid any loss in case of [sync](#sync)

### Sync
**WARNING** Sync works by deleting a note and creating it again from KOReader. Anything added or updated (in Obsidian) will be lost _like tears in rain_. Consider yourself warned.

The syncing process rely on two property defined in the frontmatter metadata:

- `keep_in_sync`
- `yet_to_be_edited`

Both needs to be `true` for the note to be synced.

`keep_in_sync` can be controlled at global level through the setting `Keep in sync` or in each note while `yet_to_be_edited` is set to `true` when the note is imported from KOReader and can only be manually changed in the note itself.

The default value for `keep_in_sync` is `false` so the default behaviour is that once a note is in obsidian it will never be synced again.

If you modify your notes in KOReader and want them to be synced in obsidian you have to enable the `Keep in sync` setting **OR** to manually change the `keep_in_sync` frontmatter of a specific note from `false` to `true` and if the `yet_to_be_edited` of that note is `true` then the note will be deleted and recreated.

## Dataview examples
Thanks to the frontmatter data in each note you can use [Dataview](https://github.com/blacksmithgu/obsidian-dataview) to easily query your notes

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