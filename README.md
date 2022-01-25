# Obsidian KOReader Plugin

Sync [KOReader][1] notes in your [Obsidian][2] vault. The KOReader device must be connected to the device running obsidian to let the plugin scan through it's files.

## Configuration
There ara four main settings:
- `KOReader mounted path` that **MUST** be set correctly to the path where KOReader is mounted
- `Highlights folder location` that can be let as the default `/` (or you can create a folder and select it from the dropdown)
- `Keep in sync` that define if the plugin **should** keep the notes in sync with KOReader importing them again (see [sync](#sync))
- `Create a folder for each book` if you are a fan of folders enabling this setting the **new notes** will be created in a subfolder named as the book itself

## Usage
Once the plugin is configured properly you can plug the device with KOReader and click on the icon with two documents. The plugin should propmplty create a single file for each note.

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

[1]: https://koreader.rocks/
[2]: https://obsidian.md