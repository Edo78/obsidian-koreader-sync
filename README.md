# Obsidian KOReader Plugin

Sync [KOReader][1] notes in your [Obsidian][2] vault. The KOReader device must be connected to the device running obsidian to let the plugin scan through it's metadata.

## Configuration
There ara two settings:
- `KOReader mounted path` that **MUST** be set correctly to the path where KOReader is mounted
- `Highlights folder location` that can be let as the default `/` (or you can create a folder and select it from the dropdown)

## Usage
Once everything is ready for the test you can plug the device with KOReader and click on the icon with two documents. The plugin should propmplty create a single file for each note.

Create an issue if something didn't work as expected.

## Known Issues
- the name of the note is set to the note as written is koreader so it can be too long
- editing the note in koreader will create a new note in obsidian but the old one will not be removed

[1]: https://koreader.rocks/
[2]: https://obsidian.md