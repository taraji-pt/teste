import type { Book, Loan } from './types';

export const categories = [
  'Teologia sistemática', 'Teologia bíblica', 'Teologia reformada',
  'Tradição baptista', 'Comentários bíblicos', 'Exegese e línguas bíblicas',
  'História da Igreja', 'Patrística', 'Puritanos', 'Apologética',
  'Ética e cosmovisão', 'Vida cristã', 'Pregação e pastoral', 'Ficção e literatura',
  'Referência'
];

export const sampleBooks: Book[] = [
  {
    id: 'sample-1', title: 'A Instituição da Religião Cristã', authors: ['João Calvino'],
    isbn: '', publisher: '', year: '', category: 'Teologia reformada',
    tags: ['Reforma', 'Teologia sistemática'], status: 'Por ler', rating: 0,
    notes: '', shelf: 'Estante A · Prateleira 1', cover: '',
    createdAt: new Date().toISOString()
  },
  {
    id: 'sample-2', title: 'A Santidade de Deus', authors: ['R. C. Sproul'],
    isbn: '', publisher: '', year: '', category: 'Teologia sistemática',
    tags: ['Atributos de Deus'], status: 'Lido', rating: 5,
    notes: '', shelf: 'Estante A · Prateleira 2', cover: '',
    createdAt: new Date().toISOString()
  },
  {
    id: 'sample-3', title: 'O Conhecimento de Deus', authors: ['J. I. Packer'],
    isbn: '', publisher: '', year: '', category: 'Vida cristã',
    tags: ['Conhecimento de Deus', 'Discipulado'], status: 'A ler', rating: 0,
    notes: '', shelf: 'Estante B · Prateleira 1', cover: '',
    createdAt: new Date().toISOString()
  },
  {
    id: 'sample-4', title: 'A Confissão de Fé Baptista de 1689', authors: ['Vários autores'],
    isbn: '', publisher: '', year: '1689', category: 'Tradição baptista',
    tags: ['Confissão', 'Baptista', 'Reformada'], status: 'Consulta', rating: 0,
    notes: '', shelf: 'Estante A · Prateleira 3', cover: '',
    createdAt: new Date().toISOString()
  }
];

export const sampleLoans: Loan[] = [];
