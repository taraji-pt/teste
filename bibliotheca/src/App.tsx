import { useEffect, useMemo, useRef, useState } from 'react';
import {
  BookOpen, Search, Plus, LayoutGrid, List, LibraryBig, Tags, Bookmark,
  Users, ChevronDown, X, Cloud, CloudOff, Download,
  Upload, Pencil, Trash2, CircleCheck, Clock3, BookMarked, ArrowUpRight,
  Menu, RotateCcw, Save
} from 'lucide-react';
import type { Book, Loan, ReadingStatus } from './types';
import { categories } from './data';
import { cloudConfigured, supabase } from './supabase';

type Section = 'Biblioteca' | 'Categorias' | 'Empréstimos' | 'Autores';
const BOOKS_KEY = 'bibliotheca-books-v1';
const LOANS_KEY = 'bibliotheca-loans-v1';

function load<T>(key: string, fallback: T): T {
  try {
    const v = localStorage.getItem(key);
    return v ? JSON.parse(v) as T : fallback;
  } catch { return fallback; }
}
function newId() { return crypto.randomUUID(); }
function emptyBook(): Book {
  return { id: newId(), title: '', authors: [], isbn: '', publisher: '', year: '',
    category: 'Teologia reformada', tags: [], status: 'Por ler', rating: 0,
    notes: '', shelf: '', cover: '', createdAt: new Date().toISOString() };
}
function initials(authors: string[]) {
  return authors.map(a => a.split(/\s+/).filter(Boolean).slice(-1)[0]).join(', ');
}
function App() {
  const [books, setBooks] = useState<Book[]>([]);
  const [loans, setLoans] = useState<Loan[]>([]);
  const [section, setSection] = useState<Section>('Biblioteca');
  const [query, setQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('Todas as categorias');
  const [userCategories, setUserCategories] = useState<string[]>(categories);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [categoryDeleteTarget, setCategoryDeleteTarget] = useState<string | null>(null);
  const [categoryReassignments, setCategoryReassignments] = useState<Record<string, string>>({});
  const [view, setView] = useState<'grid'|'list'>('grid');
  const [editor, setEditor] = useState<Book | null>(null);
  const [loanEditor, setLoanEditor] = useState<Book | null>(null);
  const [toast, setToast] = useState('');
  const [mobileMenu, setMobileMenu] = useState(false);
  const [cloudUser, setCloudUser] = useState<string | null>(null);
  const [displayName, setDisplayName] = useState<string | null>(null);
  const [displayNameDraft, setDisplayNameDraft] = useState('');
  const [authChecked, setAuthChecked] = useState(false);
  const [cloudDataReadyFor, setCloudDataReadyFor] = useState<string | null>(null);
  const [loginModalOpen, setLoginModalOpen] = useState(false);
  const [authEmail, setAuthEmail] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [showAuth, setShowAuth] = useState(false);
  const [lastSyncAt, setLastSyncAt] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const syncReadyRef = useRef(false);
  const syncingRemoteRef = useRef(false);
  const syncedBooksRef = useRef<Book[]>([]);
  const syncedLoansRef = useRef<Loan[]>([]);
  const syncTimerRef = useRef<number | null>(null);
  const currentBooksRef = useRef<Book[]>(books);
  const currentLoansRef = useRef<Loan[]>(loans);
  currentBooksRef.current = books;
  currentLoansRef.current = loans;
  const syncStorageKey = cloudUser ? `bibliotheca-last-sync-${cloudUser}` : null;
  const markSynced = () => {
    const timestamp = new Date().toISOString();
    if (syncStorageKey) localStorage.setItem(syncStorageKey, timestamp);
    setLastSyncAt(timestamp);
  };
  const formatSyncTime = (value: string | null) => value
    ? new Intl.DateTimeFormat('pt-PT', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(value))
    : null;

  useEffect(() => { localStorage.setItem(BOOKS_KEY, JSON.stringify(books)); }, [books]);
  useEffect(() => { localStorage.setItem(LOANS_KEY, JSON.stringify(loans)); }, [loans]);
  useEffect(() => {
    setLastSyncAt(cloudUser ? localStorage.getItem(`bibliotheca-last-sync-${cloudUser}`) : null);
  }, [cloudUser]);
  useEffect(() => { setDisplayNameDraft(displayName ?? ''); }, [displayName]);
  useEffect(() => {
    if (!supabase) { setAuthChecked(true); return; }
    const categoriesFromUser = (user: { user_metadata?: Record<string, unknown> } | null | undefined) => {
      const saved = user?.user_metadata?.bibliotheca_categories;
      return Array.isArray(saved) && saved.every((item): item is string => typeof item === 'string') ? saved : categories;
    };
    const nameFromUser = (user: { user_metadata?: Record<string, unknown> } | null | undefined) => {
      const metadata = user?.user_metadata;
      const name = metadata?.display_name ?? metadata?.full_name ?? metadata?.name;
      return typeof name === 'string' && name.trim() ? name.trim() : null;
    };
    supabase.auth.getSession().then(({ data, error }) => {
      if (!error) {
        setCloudUser(data.session?.user.email ?? null);
        setDisplayName(nameFromUser(data.session?.user));
        setUserCategories(categoriesFromUser(data.session?.user));
      }
      setAuthChecked(true);
    }).catch(() => setAuthChecked(true));
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setCloudUser(session?.user.email ?? null);
      setDisplayName(nameFromUser(session?.user));
      setUserCategories(categoriesFromUser(session?.user));
      setAuthChecked(true);
    });
    return () => listener.subscription.unsubscribe();
  }, []);
  useEffect(() => {
    if (!supabase || !cloudUser) {
      syncReadyRef.current = false;
      return;
    }
    let cancelled = false;
    let channel: ReturnType<NonNullable<typeof supabase>['channel']> | null = null;

    const applyRemoteBooks = (rows: { id: string; data: Book }[]) => {
      const remote = rows.map(row => row.data);
      syncingRemoteRef.current = true;
      syncedBooksRef.current = remote;
      setBooks(remote);
      window.setTimeout(() => { syncingRemoteRef.current = false; }, 0);
    };
    const applyRemoteLoans = (rows: { id: string; data: Loan }[]) => {
      const remote = rows.map(row => row.data);
      syncingRemoteRef.current = true;
      syncedLoansRef.current = remote;
      setLoans(remote);
      window.setTimeout(() => { syncingRemoteRef.current = false; }, 0);
    };

    async function initialise() {
      const { data: userData } = await supabase!.auth.getUser();
      const uid = userData.user?.id;
      if (!uid || cancelled) return;
      const [bRes, lRes] = await Promise.all([
        supabase!.from('library_books').select('id,data').eq('user_id', uid),
        supabase!.from('library_loans').select('id,data').eq('user_id', uid)
      ]);
      if (cancelled) return;
      if (bRes.error || lRes.error) {
        setToast('Não foi possível iniciar a sincronização automática.');
        return;
      }
      const remoteBooks = (bRes.data ?? []).map((r: {id:string;data:Book}) => r.data);
      const remoteLoans = (lRes.data ?? []).map((r: {id:string;data:Loan}) => r.data);
      // Cloud is the source of truth for authenticated users. Never seed a new account
      // from shared browser storage or demo data: an empty account must start empty.
      applyRemoteBooks((bRes.data ?? []) as {id:string;data:Book}[]);
      applyRemoteLoans((lRes.data ?? []) as {id:string;data:Loan}[]);
      syncReadyRef.current = true;
      markSynced();
      setCloudDataReadyFor(cloudUser);
      setToast('Sincronização automática ativa.');
      channel = supabase!.channel('bibliotheca-auto-sync')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'library_books', filter: `user_id=eq.${uid}` }, payload => {
          if (payload.eventType === 'DELETE') {
            const id = String((payload.old as {id?:string}).id ?? '');
            const next = syncedBooksRef.current.filter(b => b.id !== id);
            syncedBooksRef.current = next;
            syncingRemoteRef.current = true;
            setBooks(next);
            markSynced();
            window.setTimeout(() => { syncingRemoteRef.current = false; }, 0);
          } else {
            const row = payload.new as {id:string;data:Book};
            if (!row?.data) return;
            const next = [...syncedBooksRef.current.filter(b => b.id !== row.id), row.data];
            syncedBooksRef.current = next;
            syncingRemoteRef.current = true;
            setBooks(next);
            markSynced();
            window.setTimeout(() => { syncingRemoteRef.current = false; }, 0);
          }
        })
        .on('postgres_changes', { event: '*', schema: 'public', table: 'library_loans', filter: `user_id=eq.${uid}` }, payload => {
          if (payload.eventType === 'DELETE') {
            const id = String((payload.old as {id?:string}).id ?? '');
            const next = syncedLoansRef.current.filter(l => l.id !== id);
            syncedLoansRef.current = next;
            syncingRemoteRef.current = true;
            setLoans(next);
            markSynced();
            window.setTimeout(() => { syncingRemoteRef.current = false; }, 0);
          } else {
            const row = payload.new as {id:string;data:Loan};
            if (!row?.data) return;
            const next = [...syncedLoansRef.current.filter(l => l.id !== row.id), row.data];
            syncedLoansRef.current = next;
            syncingRemoteRef.current = true;
            setLoans(next);
            markSynced();
            window.setTimeout(() => { syncingRemoteRef.current = false; }, 0);
          }
        })
        .subscribe();
    }
    void initialise();
    return () => {
      cancelled = true;
      syncReadyRef.current = false;
      if (channel && supabase) void supabase.removeChannel(channel);
    };
  }, [cloudUser]);

  useEffect(() => {
    if (!supabase || !cloudUser || !syncReadyRef.current || syncingRemoteRef.current) return;
    if (syncTimerRef.current) window.clearTimeout(syncTimerRef.current);
    syncTimerRef.current = window.setTimeout(async () => {
      const { data: userData } = await supabase!.auth.getUser();
      const uid = userData.user?.id;
      if (!uid || syncingRemoteRef.current) return;
      const previousBooks = syncedBooksRef.current;
      const previousLoans = syncedLoansRef.current;
      const changedBooks = books.filter(book => {
        const previous = previousBooks.find(item => item.id === book.id);
        return !previous || JSON.stringify(previous) !== JSON.stringify(book);
      });
      const removedBooks = previousBooks.filter(previous => !books.some(book => book.id === previous.id));
      const changedLoans = loans.filter(loan => {
        const previous = previousLoans.find(item => item.id === loan.id);
        return !previous || JSON.stringify(previous) !== JSON.stringify(loan);
      });
      const removedLoans = previousLoans.filter(previous => !loans.some(loan => loan.id === previous.id));
      // Advance the local baseline before writes so realtime echoes are harmless.
      syncedBooksRef.current = books;
      syncedLoansRef.current = loans;
      const tasks = [];
      if (changedBooks.length) tasks.push(supabase!.from('library_books').upsert(changedBooks.map(data => ({id:data.id,user_id:uid,data}))));
      if (removedBooks.length) tasks.push(supabase!.from('library_books').delete().eq('user_id',uid).in('id',removedBooks.map(b=>b.id)));
      if (changedLoans.length) tasks.push(supabase!.from('library_loans').upsert(changedLoans.map(data => ({id:data.id,user_id:uid,data}))));
      if (removedLoans.length) tasks.push(supabase!.from('library_loans').delete().eq('user_id',uid).in('id',removedLoans.map(l=>l.id)));
      if (tasks.length) {
        const results = await Promise.all(tasks);
        if (results.some(result => result.error)) setToast('Erro ao sincronizar automaticamente. Verifica a ligação.');
        else markSynced();
      }
    }, 700);
    return () => { if (syncTimerRef.current) window.clearTimeout(syncTimerRef.current); };
  }, [books, loans, cloudUser]);
  // Realtime provides fast updates when available; polling/focus refresh is a fallback.
  useEffect(() => {
    if (!supabase || !cloudUser) return;
    let stopped = false;
    let refreshing = false;

    const sameById = <T extends { id: string }>(a: T[], b: T[]) => {
      const sort = (items: T[]) => [...items].sort((x, y) => x.id.localeCompare(y.id));
      return JSON.stringify(sort(a)) === JSON.stringify(sort(b));
    };

    const refreshFromCloud = async () => {
      if (stopped || !syncReadyRef.current || refreshing || document.visibilityState === 'hidden') return;
      refreshing = true;
      try {
        const { data: userData } = await supabase!.auth.getUser();
        const uid = userData.user?.id;
        if (!uid || stopped) return;
        const [bRes, lRes] = await Promise.all([
          supabase!.from('library_books').select('id,data').eq('user_id', uid),
          supabase!.from('library_loans').select('id,data').eq('user_id', uid)
        ]);
        if (stopped || bRes.error || lRes.error) return;
        const remoteBooks = (bRes.data ?? []).map((r: {id:string;data:Book}) => r.data);
        const remoteLoans = (lRes.data ?? []).map((r: {id:string;data:Loan}) => r.data);

        // Apply each collection only when this device has no unsaved local changes to it.
        const booksAreLocallyDirty = !sameById(currentBooksRef.current, syncedBooksRef.current);
        const loansAreLocallyDirty = !sameById(currentLoansRef.current, syncedLoansRef.current);
        if (!booksAreLocallyDirty && !sameById(remoteBooks, syncedBooksRef.current)) {
          syncedBooksRef.current = remoteBooks;
          syncingRemoteRef.current = true;
          setBooks(remoteBooks);
          markSynced();
          window.setTimeout(() => { syncingRemoteRef.current = false; }, 0);
        }
        if (!loansAreLocallyDirty && !sameById(remoteLoans, syncedLoansRef.current)) {
          syncedLoansRef.current = remoteLoans;
          syncingRemoteRef.current = true;
          setLoans(remoteLoans);
          markSynced();
          window.setTimeout(() => { syncingRemoteRef.current = false; }, 0);
        }
      } catch {
        // Temporary network failures are retried on the next poll or focus event.
      } finally {
        refreshing = false;
      }
    };

    const interval = window.setInterval(() => { void refreshFromCloud(); }, 10000);
    const onReturn = () => { if (document.visibilityState === 'visible') void refreshFromCloud(); };
    window.addEventListener('focus', onReturn);
    document.addEventListener('visibilitychange', onReturn);
    void refreshFromCloud();
    return () => {
      stopped = true;
      window.clearInterval(interval);
      window.removeEventListener('focus', onReturn);
      document.removeEventListener('visibilitychange', onReturn);
    };
  }, [cloudUser]);

  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(''), 3000);
    return () => window.clearTimeout(t);
  }, [toast]);
  const filtered = useMemo(() => books.filter(b => {
    const haystack = [b.title, ...b.authors, b.isbn, b.publisher, b.category, ...b.tags, b.shelf].join(' ').toLocaleLowerCase('pt-PT');
    return haystack.includes(query.toLocaleLowerCase('pt-PT')) &&
      (categoryFilter === 'Todas as categorias' || b.category === categoryFilter);
  }).sort((a,b) => a.title.localeCompare(b.title, 'pt-PT')), [books, query, categoryFilter]);

  const activeLoans = loans.filter(l => !l.returnedAt);
  const authors = [...new Set(books.flatMap(b => b.authors).filter(Boolean))].sort((a,b) => a.localeCompare(b, 'pt-PT'));
  const stats = [
    { label: 'Livros no catálogo', value: books.length, icon: LibraryBig },
    { label: 'Emprestados', value: activeLoans.length, icon: Users },
    { label: 'Autores', value: authors.length, icon: BookOpen },
    { label: 'Categorias', value: userCategories.length, icon: Tags }
  ];

  async function refreshAuthState() {
    if (!supabase) {
      setCloudUser(null);
      setDisplayName(null);
      setShowAuth(true);
      return;
    }
    const { data, error } = await supabase.auth.getSession();
    if (error) {
      setToast('Não foi possível verificar a sessão. Tenta novamente.');
      return;
    }
    const email = data.session?.user.email ?? null;
    setCloudUser(email);
    if (email) {
      const { data: userData } = await supabase.auth.getUser();
      setCloudUser(userData.user?.email ?? email);
      const metadata = userData.user?.user_metadata;
      const name = metadata?.display_name ?? metadata?.full_name ?? metadata?.name;
      setDisplayName(typeof name === 'string' && name.trim() ? name.trim() : null);
      const savedCategories = userData.user?.user_metadata?.bibliotheca_categories;
      setUserCategories(Array.isArray(savedCategories) && savedCategories.every((item: unknown) => typeof item === 'string') ? savedCategories : categories);
    } else setDisplayName(null);
  }

  async function saveDisplayName() {
    if (!supabase || !cloudUser) return;
    const name = displayNameDraft.trim();
    if (!name) { setToast('Introdu um nome de apresentação.'); return; }
    const { data, error } = await supabase.auth.updateUser({ data: { display_name: name } });
    if (error) { setToast(`Não foi possível guardar o nome: ${error.message}`); return; }
    const savedName = data.user?.user_metadata?.display_name;
    setDisplayName(typeof savedName === 'string' && savedName.trim() ? savedName.trim() : name);
    setToast('Nome de apresentação atualizado.');
  }

  async function auth() {
    if (!supabase) { setToast('A autenticação não está configurada.'); return; }
    if (cloudUser) {
      const result = await supabase.auth.signOut();
      if (result.error) setToast(result.error.message);
      else {
        setCloudUser(null);
        setDisplayName(null);
        setShowAuth(false);
        setToast('Sessão terminada.');
      }
      return;
    }
    const result = await supabase.auth.signInWithPassword({ email: authEmail, password: authPassword });
    if (result.error) {
      setToast(result.error.message);
      return;
    }
    const { data } = await supabase.auth.getSession();
    setCloudUser(data.session?.user.email ?? null);
    const metadata = data.session?.user.user_metadata;
    const name = metadata?.display_name ?? metadata?.full_name ?? metadata?.name;
    setDisplayName(typeof name === 'string' && name.trim() ? name.trim() : null);
    const savedCategories = data.session?.user.user_metadata?.bibliotheca_categories;
    setUserCategories(Array.isArray(savedCategories) && savedCategories.every((item: unknown) => typeof item === 'string') ? savedCategories : categories);
    setAuthChecked(true);
    setShowAuth(false);
    setAuthPassword('');
    setToast(data.session ? 'Sessão iniciada.' : 'Não foi possível confirmar a sessão.');
  }
  function exportData() {
    const blob = new Blob([JSON.stringify({ version: 1, exportedAt: new Date().toISOString(), books, loans }, null, 2)], {type:'application/json'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = `BiblioTTheca-backup-${new Date().toISOString().slice(0,10)}.json`; a.click();
    URL.revokeObjectURL(url);
  }
  function importData(file?: File) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(String(reader.result));
        if (!Array.isArray(data.books) || !Array.isArray(data.loans)) throw new Error();
        if (window.confirm(`Importar ${data.books.length} livros e ${data.loans.length} empréstimos? Os dados atuais serão substituídos.`)) {
          setBooks(data.books); setLoans(data.loans); setToast('Biblioteca importada.');
        }
      } catch { setToast('Ficheiro inválido. Escolhe uma cópia BiblioTTheca JSON.'); }
    };
    reader.readAsText(file);
  }
  function saveBook() {
    if (!editor?.title.trim()) { setToast('O título é obrigatório.'); return; }
    const normalized = { ...editor, authors: editor.authors.map(a => a.trim()).filter(Boolean) };
    setBooks(prev => prev.some(b => b.id === normalized.id) ? prev.map(b => b.id === normalized.id ? normalized : b) : [normalized, ...prev]);
    setEditor(null); setToast('Livro guardado.');
  }
  function deleteBook(book: Book) {
    if (!window.confirm(`Eliminar “${book.title}” do catálogo?`)) return;
    setBooks(prev => prev.filter(b => b.id !== book.id));
    setLoans(prev => prev.filter(l => l.bookId !== book.id));
    setToast('Livro eliminado.');
  }
  function addLoan(book: Book, borrower: string, dueAt: string, notes: string) {
    if (!borrower.trim()) { setToast('Indica a pessoa a quem emprestaste o livro.'); return; }
    setLoans(prev => [{ id: newId(), bookId: book.id, borrower: borrower.trim(), lentAt: new Date().toISOString().slice(0,10), dueAt, returnedAt: '', notes }, ...prev]);
    setLoanEditor(null); setToast('Empréstimo registado.');
  }
  const navItems = [
    { label: 'Biblioteca' as Section, icon: BookOpen, count: books.length },
    { label: 'Categorias' as Section, icon: Tags, count: userCategories.length },
    { label: 'Empréstimos' as Section, icon: Users, count: loans.length },
    { label: 'Autores' as Section, icon: Bookmark, count: authors.length }
  ];

  async function persistCategories(next: string[]) {
    if (!supabase) { setToast('A ligação ao Supabase não está disponível.'); return false; }
    const { data, error } = await supabase.auth.updateUser({ data: { bibliotheca_categories: next } });
    if (error) { setToast('Não foi possível guardar as categorias: ' + error.message); return false; }
    setUserCategories(next);
    const saved = data.user?.user_metadata?.bibliotheca_categories;
    if (Array.isArray(saved)) setUserCategories(saved.filter((item): item is string => typeof item === 'string'));
    setToast('Categorias atualizadas.');
    return true;
  }

  async function addCategory() {
    const name = newCategoryName.trim().replace(/\s+/g, ' ');
    if (!name) { setToast('Escreve o nome da categoria.'); return; }
    if (userCategories.some(category => category.toLocaleLowerCase('pt-PT') === name.toLocaleLowerCase('pt-PT'))) {
      setToast('Essa categoria já existe.'); return;
    }
    const next = [...userCategories, name].sort((a,b) => a.localeCompare(b, 'pt-PT'));
    if (await persistCategories(next)) setNewCategoryName('');
  }

  async function renameCategory(category: string) {
    const raw = window.prompt('Novo nome da categoria:', category);
    if (raw === null) return;
    const name = raw.trim().replace(/\\s+/g, ' ');
    if (!name) { setToast('O nome da categoria não pode ficar vazio.'); return; }
    if (name.toLocaleLowerCase('pt-PT') !== category.toLocaleLowerCase('pt-PT') && userCategories.some(item => item.toLocaleLowerCase('pt-PT') === name.toLocaleLowerCase('pt-PT'))) {
      setToast('Já existe uma categoria com esse nome.'); return;
    }
    if (name === category) return;
    const next = userCategories.map(item => item === category ? name : item).sort((a,b) => a.localeCompare(b, 'pt-PT'));
    if (await persistCategories(next)) {
      setBooks(previous => previous.map(book => book.category === category ? { ...book, category: name } : book));
      if (categoryFilter === category) setCategoryFilter(name);
    }
  }

  async function deleteCategory(category: string) {
    if (userCategories.length <= 1) { setToast('Mantém pelo menos uma categoria.'); return; }
    const assigned = books.filter(book => book.category === category);
    if (assigned.length) {
      setCategoryDeleteTarget(category);
      setCategoryReassignments(Object.fromEntries(assigned.map(book => [book.id, 'Sem categoria'])));
      return;
    }
    if (!window.confirm(`Eliminar a categoria “${category}”?`)) return;
    const next = userCategories.filter(item => item !== category);
    if (await persistCategories(next) && categoryFilter === category) setCategoryFilter('Todas as categorias');
  }

  async function confirmDeleteCategory() {
    if (!categoryDeleteTarget) return;
    const category = categoryDeleteTarget;
    const assigned = books.filter(book => book.category === category);
    if (assigned.some(book => !categoryReassignments[book.id])) {
      setToast('Escolhe uma categoria para cada livro.'); return;
    }
    const next = userCategories.filter(item => item !== category);
    if (await persistCategories(next)) {
      setBooks(previous => previous.map(book => book.category === category
        ? { ...book, category: categoryReassignments[book.id] || 'Sem categoria' }
        : book));
      if (categoryFilter === category) setCategoryFilter('Todas as categorias');
      setCategoryDeleteTarget(null);
      setCategoryReassignments({});
      setToast('Categoria eliminada e livros reclassificados.');
    }
  }

  if (!authChecked) return <div className="auth-loading"><img src={`${import.meta.env.BASE_URL}bibliotheca-logo.png?v=3`} alt="" /><span>A preparar a tua biblioteca…</span></div>;

  if (cloudUser && cloudDataReadyFor !== cloudUser) return <div className="auth-loading"><img src={`${import.meta.env.BASE_URL}bibliotheca-logo.png?v=3`} alt="" /><span>A carregar a tua coleção privada…</span></div>;

  if (!cloudUser) return <div className="login-screen">
    <section className="login-panel">
      <div className="login-brand"><img src={`${import.meta.env.BASE_URL}bibliotheca-logo.png?v=3`} alt="" /><div><strong>Biblio<span>TTheca</span></strong><small>Gestão de biblioteca pessoal</small></div></div>
      <div className="login-intro"><div className="login-kicker">O TEU ESPAÇO DE LEITURA</div><h1>Uma biblioteca de <em>sabedoria.</em></h1><p>Organiza, descobre e acompanha a tua coleção de livros — onde quer que estejas.</p></div>
      <div className="login-features">
        <div><BookOpen/><span><strong>Catálogo pessoal</strong><small>Todos os teus livros num só lugar</small></span></div>
        <div><Tags/><span><strong>Categorias e autores</strong><small>Encontra facilmente o que procuras</small></span></div>
        <div><Clock3/><span><strong>Empréstimos</strong><small>Acompanha os livros emprestados</small></span></div>
        <div><Cloud/><span><strong>Sincronização na nuvem</strong><small>Acesso entre os teus dispositivos</small></span></div>
      </div>
      <div className="login-cta">
        <button className="login-submit" type="button" onClick={() => setLoginModalOpen(true)}><Users size={17}/>Iniciar sessão<ArrowUpRight size={17}/></button>
      </div>
      {loginModalOpen && <div className="login-modal-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget)setLoginModalOpen(false);}}>
        <form className="login-modal" onSubmit={e=>{e.preventDefault();void auth();}}>
          <div className="login-modal-heading"><div><div className="login-form-title">Entra na tua biblioteca</div><p>Inicia sessão para aceder à tua coleção.</p></div><button type="button" className="login-modal-close" aria-label="Fechar" onClick={()=>setLoginModalOpen(false)}><X size={19}/></button></div>
          {!cloudConfigured ? <p className="login-config-note">A autenticação ainda não está configurada. Verifica as definições do Supabase.</p> : <>
            <label>Email<input className="field" type="email" autoComplete="username" placeholder="nome@exemplo.com" value={authEmail} onChange={e=>setAuthEmail(e.target.value)} required /></label>
            <label>Palavra-passe<input className="field" type="password" autoComplete="current-password" placeholder="A tua palavra-passe" value={authPassword} onChange={e=>setAuthPassword(e.target.value)} required /></label>
            <button className="login-submit" type="submit"><Users size={17}/>Iniciar sessão<ArrowUpRight size={17}/></button>
          </>}
          <p className="login-private"><Cloud size={14}/> A tua coleção é privada e sincronizada em segurança.</p>
        </form>
      </div>}
      <footer className="login-footer">© Tiago Terraquente, 2026</footer>
    </section>
    <section className="login-visual" aria-label="Interior de uma biblioteca">
      <img className="login-library-image" src="https://unsplash.com/photos/olrbGGnUDxs/download?force=true&w=1920" alt="Interior de uma biblioteca moderna com estantes e escadas" />
      <div className="login-image-shade"/>
      
      <a className="login-photo-credit" href="https://unsplash.com/pt-br/fotografias/uma-biblioteca-moderna-de-varios-andares-com-inumeras-estantes-e-escadas-olrbGGnUDxs" target="_blank" rel="noreferrer">Fotografia: Unsplash</a>
    </section>
  </div>;

  return <div className="app-shell">
    <aside className={`sidebar ${mobileMenu ? 'open' : ''}`}>
      <div className="brand"><img className="brand-mark" src={`${import.meta.env.BASE_URL}bibliotheca-logo.png?v=2`} alt="" /><div><strong>BiblioTTheca</strong><small>Gestão de biblioteca pessoal</small></div><button className="icon-btn close-menu" onClick={() => setMobileMenu(false)}><X size={18}/></button></div>
      <div className="side-label">A MINHA COLEÇÃO</div>
      <nav>{navItems.map(item => <button key={item.label} className={`nav-item ${section===item.label?'active':''}`} onClick={() => {setSection(item.label);setMobileMenu(false);}}><item.icon size={18}/><span>{item.label}</span><span className="nav-count">{item.count}</span></button>)}</nav>
      {userCategories.some(category => books.some(book => book.category === category)) && <>
        <div className="side-label section-label">COLEÇÕES</div>
        {userCategories.filter(category => books.some(book => book.category === category)).map((category, index) => <button key={category} className="nav-item collection-item" onClick={() => {setSection('Biblioteca');setCategoryFilter(category);setMobileMenu(false);}}><span className={`collection-dot ${['sage','ochre','blue'][index%3]}`}/><span>{category}</span><span className="nav-count">{books.filter(book => book.category === category).length}</span></button>)}
      </>}
      <div className="sidebar-bottom">
        <button type="button" className="sync-card sync-card-button" onClick={() => void refreshAuthState()} title="Atualizar estado da conta e sincronização"><div className="sync-icon">{cloudConfigured?<Cloud size={18}/>:<CloudOff size={18}/>}</div><div className="sync-copy"><strong>{!cloudConfigured?'Nuvem indisponível':!cloudUser?'Sessão não iniciada':'Última sincronização'}</strong><small>{!cloudConfigured?'Verifica a configuração':!cloudUser?'Inicia sessão para sincronizar':formatSyncTime(lastSyncAt) || 'A aguardar sincronização'}</small></div></button>
        <button className="nav-item" onClick={exportData}><Download size={17}/>Exportar cópia</button>
        <button className="nav-item" onClick={() => fileRef.current?.click()}><Upload size={17}/>Importar cópia</button>
        <input ref={fileRef} type="file" accept="application/json,.json" hidden onChange={e=>{importData(e.target.files?.[0]);e.currentTarget.value='';}}/>
      </div>
    </aside>
    {mobileMenu && <div className="scrim" onClick={() => setMobileMenu(false)}/>}
    <main className="main">
      <header className="topbar">
        <button className="icon-btn mobile-menu-btn" onClick={() => setMobileMenu(true)}><Menu size={20}/></button>
        <div className="breadcrumbs"><span>BiblioTTheca</span><span className="crumb-slash">/</span><strong>{section}</strong></div>
        <div className="top-actions"><button type="button" className={`live-toggle ${cloudUser ? 'is-live' : 'is-off'}`} onClick={() => { if (showAuth) setShowAuth(false); else { setShowAuth(true); void refreshAuthState(); } }} aria-expanded={showAuth} aria-label="Detalhes da sessão">{cloudUser ? `Olá ${displayName || cloudUser}` : cloudConfigured ? 'ON' : 'OFF'}</button></div>
      </header>
      {showAuth && <div className="auth-panel">
        <div className="auth-head"><div><strong>Sincronização privada</strong><small>{!cloudConfigured?'Configuração Supabase necessária.':cloudUser?`Sessão iniciada como ${cloudUser}.`:'Liga-te à tua conta para sincronizar.'}</small></div><button className="icon-btn" onClick={()=>setShowAuth(false)}><X size={17}/></button></div>
        {!cloudConfigured ? <p className="muted small">Cria um projeto Supabase, configura as variáveis VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY e executa o ficheiro <code>supabase/schema.sql</code>.</p> : <>
          {!cloudUser && <><input className="field" placeholder="Email" value={authEmail} onChange={e=>setAuthEmail(e.target.value)}/><input className="field" placeholder="Palavra-passe" type="password" value={authPassword} onChange={e=>setAuthPassword(e.target.value)}/></>}
          {cloudUser && <div className="display-name-editor"><label className="muted small" htmlFor="display-name-input">Nome apresentado no botão</label><input id="display-name-input" className="field" value={displayNameDraft} onChange={e=>setDisplayNameDraft(e.target.value)} placeholder="O teu nome"/><div className="button-row"><button className="btn secondary" onClick={() => void saveDisplayName()}>Guardar nome</button></div></div>}
          <div className="button-row"><button className={cloudUser ? "btn logout-glow" : "btn secondary"} onClick={auth}>{cloudUser?'Terminar sessão':'Iniciar sessão'}</button></div>{cloudUser&&<p className="muted small">Sessão ativa. Os livros e empréstimos são sincronizados automaticamente entre os teus dispositivos.</p>}
        </>}
      </div>}
      <div className="content">
        {section==='Biblioteca' && <>
          <div className="page-heading"><div><div className="eyebrow">A TUA COLEÇÃO PRIVADA</div><h1>Uma biblioteca de <em>sabedoria.</em></h1><p className="subtitle">Toda a tua leitura, organizada num só lugar.</p></div><button className="btn primary add-main" onClick={()=>setEditor({...emptyBook(), category: userCategories[0] ?? ''})}><Plus size={17}/>Adicionar livro</button></div>
          <div className="stats-grid">{stats.map(s=><div className="stat-card" key={s.label}><div className="stat-top"><span>{s.label}</span><s.icon size={17}/></div><div className="stat-number">{s.value}</div></div>)}</div>
          <div className="toolbar"><div className="search-box"><Search size={17}/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Pesquisar título ou autor..."/>{query&&<button onClick={()=>setQuery('')}><X size={15}/></button>}<kbd>⌘ K</kbd></div><div className="toolbar-actions"><select value={categoryFilter} onChange={e=>setCategoryFilter(e.target.value)}><option>Todas as categorias</option>{userCategories.map(c=><option key={c}>{c}</option>)}{books.some(b=>!b.category||b.category==="Sem categoria")&&<option>Sem categoria</option>}</select><div className="view-switch"><button className={view==='grid'?'selected':''} onClick={()=>setView('grid')} title="Grelha"><LayoutGrid size={17}/></button><button className={view==='list'?'selected':''} onClick={()=>setView('list')} title="Lista"><List size={17}/></button></div></div></div>
          <div className="results-line"><span>{filtered.length} {filtered.length===1?'livro':'livros'} encontrados</span><button className="text-action" onClick={()=>{setQuery('');setCategoryFilter('Todas as categorias');}}>Limpar filtros <RotateCcw size={13}/></button></div>
          {filtered.length===0 ? <div className="empty-state"><BookOpen size={32}/><h3>Nenhum livro encontrado</h3><p>Experimenta alterar a pesquisa ou adiciona um livro à tua coleção.</p><button className="btn primary" onClick={()=>setEditor({...emptyBook(), category: userCategories[0] ?? ''})}><Plus size={16}/>Adicionar primeiro livro</button></div> :
          <div className={view==='grid'?'book-grid':'book-list'}>{filtered.map(book=><BookCard key={book.id} book={book} view={view} onEdit={()=>setEditor({...book})} onDelete={()=>deleteBook(book)} onLoan={()=>setLoanEditor(book)}/>)}</div>}
        </>}
        {section==='Categorias' && <><div className="page-heading"><div><div className="eyebrow">ORGANIZAÇÃO</div><h1>Temas e <em>disciplinas.</em></h1><p className="subtitle">Cria e gere as categorias da tua biblioteca.</p></div></div><form className="category-create" onSubmit={e=>{e.preventDefault();void addCategory();}}><input className="field" value={newCategoryName} onChange={e=>setNewCategoryName(e.target.value)} placeholder="Nome da nova categoria" aria-label="Nome da nova categoria"/><button className="btn primary" type="submit"><Plus size={16}/>Adicionar categoria</button></form><div className="category-grid">{userCategories.map((cat,i)=>{const count=books.filter(b=>b.category===cat).length;return <div className="category-card" key={cat}><button className="category-open" onClick={()=>{setCategoryFilter(cat);setSection('Biblioteca');}}><div className={`category-icon tone-${i%5}`}><Tags size={20}/></div><div className="category-info"><strong>{cat}</strong><small>{count} {count===1?'livro':'livros'}</small></div><ArrowUpRight size={17}/></button><button className="category-edit" aria-label={`Editar categoria ${cat}`} title="Editar nome" onClick={()=>void renameCategory(cat)}><Pencil size={15}/></button><button className="category-delete" aria-label={`Eliminar categoria ${cat}`} title="Eliminar categoria" onClick={()=>void deleteCategory(cat)}><Trash2 size={15}/></button></div>})}</div></>}
        {section==='Autores' && <><div className="page-heading"><div><div className="eyebrow">ÍNDICE ONOMÁSTICO</div><h1>Autores e <em>pensadores.</em></h1><p className="subtitle">Os autores presentes na tua biblioteca.</p></div></div><div className="authors-list">{authors.map(author=>{const count=books.filter(b=>b.authors.includes(author)).length;return <button className="author-row" key={author} onClick={()=>{setQuery(author);setSection('Biblioteca');}}><div className="author-avatar">{author.split(' ').map(p=>p[0]).slice(0,2).join('')}</div><strong>{author}</strong><span>{count} {count===1?'livro':'livros'}</span><ArrowUpRight size={16}/></button>})}{!authors.length&&<div className="empty-state">Os autores aparecerão aqui quando adicionares livros.</div>}</div></>}
        {section==='Empréstimos' && <><div className="page-heading"><div><div className="eyebrow">GESTÃO DA COLEÇÃO</div><h1>Livros em <em>circulação.</em></h1><p className="subtitle">Acompanha os livros emprestados e as datas de devolução.</p></div></div><div className="loan-list">{loans.filter(loan=>!loan.returnedAt).length===0?<div className="empty-state"><Users size={30}/><h3>Sem livros emprestados</h3><p>Quando emprestares um livro, aparecerá aqui até ser devolvido.</p></div>:loans.filter(loan=>!loan.returnedAt).map(loan=>{const book=books.find(b=>b.id===loan.bookId);return <div className="loan-row" key={loan.id}><div className="mini-cover">{book?.cover?<img src={book.cover} alt=""/>:<BookOpen size={20}/>}</div><div className="loan-main"><strong>{book?.title||'Livro removido'}</strong><small>Emprestado a {loan.borrower}</small>{loan.dueAt&&<small>Devolução prevista: {loan.dueAt}</small>}</div><span className={`loan-status ${loan.dueAt&&loan.dueAt<new Date().toISOString().slice(0,10)?'late':''}`}>{loan.dueAt&&loan.dueAt<new Date().toISOString().slice(0,10)?'Atrasado':'Emprestado'}</span><button className="btn secondary compact" onClick={()=>{setLoans(prev=>prev.filter(l=>l.id!==loan.id));setToast('Devolução registada. O livro saiu da lista de empréstimos.')}}><CircleCheck size={15}/>Devolvido</button></div>})}</div></>}
        <footer className="footer"><span></span><span>© Tiago Terraquente, 2026</span></footer>
      </div>
    </main>
    {editor&&<BookModal book={editor} categories={userCategories} onClose={()=>setEditor(null)} onSave={saveBook} onChange={setEditor}/>}
    {loanEditor&&<LoanModal book={loanEditor} onClose={()=>setLoanEditor(null)} onSave={addLoan}/>}
    {categoryDeleteTarget && <div className="modal-backdrop"><div className="modal category-reassign-modal"><div className="modal-header"><div><div className="eyebrow">GESTÃO DE CATEGORIAS</div><h2>Eliminar “{categoryDeleteTarget}”</h2><p className="subtitle">Escolhe para onde transferir cada livro antes de eliminar esta categoria.</p></div><button className="icon-btn" onClick={()=>setCategoryDeleteTarget(null)} aria-label="Fechar"><X/></button></div><div className="category-reassign-list">{books.filter(book=>book.category===categoryDeleteTarget).map(book=><label className="category-reassign-row" key={book.id}><span><strong>{book.title || 'Livro sem título'}</strong><small>{book.authors.join(', ') || 'Autor não indicado'}</small></span><select className="field" value={categoryReassignments[book.id] || 'Sem categoria'} onChange={e=>setCategoryReassignments(previous=>({...previous,[book.id]:e.target.value}))}><option>Sem categoria</option>{userCategories.filter(cat=>cat!==categoryDeleteTarget).map(cat=><option key={cat}>{cat}</option>)}</select></label>)}</div><div className="modal-footer"><button className="btn secondary" onClick={()=>setCategoryDeleteTarget(null)}>Cancelar</button><button className="btn primary" onClick={()=>void confirmDeleteCategory()}><Trash2 size={16}/>Reclassificar e eliminar</button></div></div></div>}
    {toast&&<div className="toast"><CircleCheck size={17}/>{toast}</div>}
  </div>;
}

function BookCard({book,view,onEdit,onDelete,onLoan}:{book:Book;view:'grid'|'list';onEdit:()=>void;onDelete:()=>void;onLoan:()=>void}) {
  const [menu,setMenu] = useState(false);
  return <article className={`book-card ${view==='list'?'list-mode':''}`}>
    <button className="cover-button" onClick={onEdit} aria-label={`Editar ${book.title}`}><div className={`book-cover ${book.cover?'has-cover':''}`}>{book.cover?<img src={book.cover} alt={`Capa de ${book.title}`} loading="lazy"/>:<><div className="cover-rule"/><BookOpen size={25}/><strong>{book.title}</strong><small>{initials(book.authors)}</small><div className="cover-bottom">BIBLIOTHECA</div></>}</div></button>
    <div className="book-info"><div className="book-meta"><span>{book.category}</span><div className="menu-wrap"><button className="tiny-icon" onClick={()=>setMenu(v=>!v)} aria-label="Ações do livro"><ChevronDown size={16}/></button>{menu&&<div className="action-menu"><button onClick={()=>{onEdit();setMenu(false)}}><Pencil size={14}/>Editar</button><button onClick={()=>{onLoan();setMenu(false)}}><Users size={14}/>Emprestar</button><button className="danger" onClick={()=>{onDelete();setMenu(false)}}><Trash2 size={14}/>Eliminar</button></div>}</div></div><button className="book-title" onClick={onEdit}>{book.title}</button><div className="book-author">{book.authors.join(', ')||'Autor desconhecido'}</div><div className="book-extra">{[book.publisher,book.year].filter(Boolean).join(' · ')}</div></div>
  </article>;
}

function BookModal({book,categories,onClose,onSave,onChange}:{book:Book;categories:string[];onClose:()=>void;onSave:()=>void;onChange:(b:Book)=>void}) {
  const set = (key:keyof Book,value:unknown) => onChange({...book,[key]:value});
  return <div className="modal-backdrop"><div className="modal book-modal"><div className="modal-header"><div><div className="eyebrow">CATÁLOGO PESSOAL</div><h2>{book.title?'Editar livro':'Adicionar livro'}</h2></div><button className="icon-btn" onClick={onClose}><X/></button></div>
    <div className="form-grid">
      <label className="span-2">Título *<input autoFocus className="field" value={book.title} onChange={e=>set('title',e.target.value)} placeholder="Título da obra"/></label>
      <label className="span-2">Autor(es)<input className="field" value={book.authors.join('; ')} onChange={e=>set('authors',e.target.value.split(';').map(s=>s.trim()).filter(Boolean))} placeholder="Separar autores com ponto e vírgula"/></label>
      <label>Editora<input className="field" value={book.publisher} onChange={e=>set('publisher',e.target.value)} placeholder="Editora"/></label>
      <label>Ano<input className="field" value={book.year} onChange={e=>set('year',e.target.value)} placeholder="2024"/></label>
      <label className="span-2">Categoria<select className="field" value={book.category} onChange={e=>set('category',e.target.value)}><option>Sem categoria</option>{categories.map(c=><option key={c}>{c}</option>)}</select></label>
      <label className="span-2">URL da capa<input className="field" type="url" value={book.cover} onChange={e=>set('cover',e.target.value)} placeholder="https://…"/></label>
    </div>
    <div className="modal-footer book-modal-footer"><a className="isbnsearch-link" href="https://isbnsearch.org/" target="_blank" rel="noopener noreferrer">Pesquisar no ISBN Search <ArrowUpRight size={14}/></a><div className="book-modal-actions"><button className="btn secondary" onClick={onClose}>Cancelar</button><button className="btn primary" onClick={onSave}><Save size={16}/>Guardar livro</button></div></div>
  </div></div>;
}
function LoanModal({book,onClose,onSave}:{book:Book;onClose:()=>void;onSave:(book:Book,borrower:string,dueAt:string,notes:string)=>void}) {
  const [borrower,setBorrower]=useState(''); const [dueAt,setDueAt]=useState(''); const [notes,setNotes]=useState('');
  return <div className="modal-backdrop"><div className="modal loan-modal"><div className="modal-header"><div><div className="eyebrow">GESTÃO DE EMPRÉSTIMO</div><h2>Emprestar livro</h2></div><button className="icon-btn" onClick={onClose}><X/></button></div><div className="loan-book-preview"><BookOpen size={21}/><div><strong>{book.title}</strong><small>{book.authors.join(', ')}</small></div></div><label>Emprestado a *<input autoFocus className="field" value={borrower} onChange={e=>setBorrower(e.target.value)} placeholder="Nome da pessoa"/></label><label>Data prevista de devolução<input className="field" type="date" value={dueAt} onChange={e=>setDueAt(e.target.value)}/></label><label>Notas<textarea className="field" rows={2} value={notes} onChange={e=>setNotes(e.target.value)} placeholder="Contacto, condição do livro…"/></label><div className="modal-footer"><button className="btn secondary" onClick={onClose}>Cancelar</button><button className="btn primary" onClick={()=>onSave(book,borrower,dueAt,notes)}><Users size={16}/>Registar empréstimo</button></div></div></div>;
}
export default App;
