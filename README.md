# Obsidian KOReader Plugin

**Rigth now this is just an ugly PoC**

## Test the plugin
I **STRONGLY** suggest to test this plugin in a disposable vault to avoid any mess.

This is a pre-release version so if you want to test/help you should follow the step for developing a plugin
- Clone your repo to a local development folder. For convenience, you can place this folder in your `.obsidian/plugins/your-plugin-name` folder.
- Install NodeJS, then run `npm i` in the command line under your repo folder.
- Run `npm run dev` to compile your plugin from `main.ts` to `main.js`.
- Enable plugin in settings window.

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
