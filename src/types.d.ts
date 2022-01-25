export interface Bookmark {
  chapter: string;
  text: string;
  datetime: string;
  notes: string;
  highlighted: boolean;
  pos0: string;
  pos1: string;
  page: string;
}

export interface Bookmarks {
  [key: number]: Bookmark;
}

export interface Book {
  title: string;
  authors: string;
  bookmarks: Bookmarks;
  highlight: any;
}

export interface Books {
  [fullTitle: string]: Book;
}

export interface FrontMatterData {
  title: string;
  authors: string;
  chapter: string;
  highlight: string;
  datetime: string;
}

export interface FrontMatterMetadata {
  body_hash: string;
  keep_in_sync: boolean;
  yet_to_be_edited: boolean;
}

export interface FrontMatter {
  uniqueId: string;
  data: FrontMatterData,
  metadata: FrontMatterMetadata,
}