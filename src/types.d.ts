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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  highlight: any;
  percent_finished: number;
}

export interface Books {
  [fullTitle: string]: Book;
}

export interface FrontMatterData {
  title: string;
  authors: string;
  chapter: string;
  page: number;
  highlight: string;
  datetime: string;
  text: string;
}

export interface FrontMatterMetadata {
  body_hash: string;
  keep_in_sync: boolean;
  yet_to_be_edited: boolean;
  managed_book_title: string;
}

export interface FrontMatter {
  type: string;
  uniqueId: string;
  data: FrontMatterData,
  metadata: FrontMatterMetadata,
}