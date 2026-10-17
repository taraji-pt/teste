export type ReadingStatus = 'Por ler' | 'A ler' | 'Lido' | 'Consulta';
export type Book = {
  id: string;
  title: string;
  authors: string[];
  isbn: string;
  publisher: string;
  year: string;
  category: string;
  tags: string[];
  status: ReadingStatus;
  rating: number;
  notes: string;
  shelf: string;
  cover: string;
  createdAt: string;
};
export type Loan = {
  id: string;
  bookId: string;
  borrower: string;
  lentAt: string;
  dueAt: string;
  returnedAt: string;
  notes: string;
};
