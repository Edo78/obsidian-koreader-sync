---
cssclass: koreader-sync-dataview
koreader-sync:
  uniqueId: 2584f343307a6a1d62489660655552c0
  type: koreader-sync-dataview
  data:
    title: test
    authors: ''
  metadata:
    percent_finished: 50
    managed_title: (book) test-
    keep_in_sync: true
    yet_to_be_edited: true
---
# Title: test
<progress value="50" max="100"> </progress>

```dataviewjs
const title = dv.current()['koreader-sync'].metadata.managed_title
dv.pages().where(n => {
return n['koreader-sync'] && n['koreader-sync'].type == 'koreader-sync-note' && n['koreader-sync'].metadata.managed_book_title == title
}).sort(p => p['koreader-sync'].data.page).forEach(p => dv.paragraph(dv.fileLink(p.file.name, true), {style: 'test-css'}))
```
