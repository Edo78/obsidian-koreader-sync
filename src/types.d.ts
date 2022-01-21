export interface Bookmark {
	chapter: string;
	text: string;
	datetime: string;
	notes: string;
	highlighted: boolean;
	pos0: string;
	pos1?: string;
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