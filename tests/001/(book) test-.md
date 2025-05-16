---
cssclass: koreader-sync-dataview
koreader-sync:
  uniqueId: b9ff2bc8934d754b07f2bff467e0fbb0
  type: koreader-sync-dataview
  data:
    title: test
    authors: ''
  metadata:
    percent_finished: 100
    managed_title: (book) test-
    keep_in_sync: true
    yet_to_be_edited: true
---
# Title: test
<progress value="100" max="100"> </progress>
```dataviewjs
const title = dv.current()['koreader-sync'].metadata.managed_title
dv.pages().where(n => {
return n['koreader-sync'] && n['koreader-sync'].type == 'koreader-sync-note' && n['koreader-sync'].metadata.managed_book_title == title
}).sort(p => p['koreader-sync'].data.page).forEach(p => dv.paragraph(dv.fileLink(p.file.name, true), {style: 'test-css'}))
```
    
