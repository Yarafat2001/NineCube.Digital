import { useState } from 'react';
import { useCategories, useCategoryMutation, useProducts, useProduct } from '../api/hooks';
import { useDebouncedValue } from '../lib/helpers';
import type { Category } from '../api/types';
import { flattenCategories } from './CategoryFilters';
import { ErrorState, LoadingBlock, Pager, Modal } from './ui';

const slugify = (name: string) => name.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const categoryLabel = (category: Category) => category.breadcrumb.map(c => c.name).join(' / ') + (!category.isActive ? ' (inactive)' : '');

export function CategoryManager() {
  const [view, setView] = useState<'categories' | 'products'>('categories');
  const [editorOpen, setEditorOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [categoryPage, setCategoryPage] = useState(1);
  const [productSearch, setProductSearch] = useState('');
  const productTerm = useDebouncedValue(productSearch, 250);
  const categories = useCategories(true);
  const mutation = useCategoryMutation();
  const all = flattenCategories(categories.data ?? []);
  const filtered = all.filter(c => categoryLabel(c).toLowerCase().includes(search.toLowerCase().trim()));
  const categoryPages = Math.max(1, Math.ceil(filtered.length / 8));
  const currentPage = Math.min(categoryPage, categoryPages);
  const visibleCategories = filtered.slice((currentPage - 1) * 8, currentPage * 8);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const selected = all.find(c => c.id === selectedId) ?? null;
  const [name, setName] = useState(''); const [slug, setSlug] = useState('');
  const [parent, setParent] = useState(''); const [order, setOrder] = useState(0); const [active, setActive] = useState(true);
  const [reassign, setReassign] = useState(''); const [error, setError] = useState(''); const [message, setMessage] = useState('');
  const [actionTarget, setActionTarget] = useState<'category' | 'product'>('category');
  const [productId, setProductId] = useState<number | null>(null); const [productPage, setProductPage] = useState(1);
  const products = useProducts({ q: productTerm, page: productPage, pageSize: 20 });
  const product = useProduct(productId);
  const [assigned, setAssigned] = useState<number[]>([]); const [primary, setPrimary] = useState<number | null>(null); const [tags, setTags] = useState('');
  const load = (c: Category | null) => { setEditorOpen(true); setSelectedId(c?.id ?? null); setName(c?.name ?? ''); setSlug(c?.slug ?? ''); setParent(c?.parentId?.toString() ?? ''); setOrder(c?.sortOrder ?? 0); setActive(c?.isActive ?? true); setReassign(''); setError(''); setMessage(''); };
  const run = async (path: string, method: 'POST' | 'PUT' | 'DELETE', body?: unknown) => {
    setActionTarget(path.startsWith('/api/products/') ? 'product' : 'category');
    setError(''); setMessage('');
    try { await mutation.mutateAsync({ path, method, body }); setMessage('Changes saved.'); return true; }
    catch (caught) { setError(caught instanceof Error ? caught.message : 'Could not save the change.'); return false; }
  };
  const chooseProduct = (id: number) => {
    setProductId(id || null); setError(''); setMessage('');
    // Products in this page already carry category and tag metadata.
    const p = products.data?.items.find(x => x.id === id);
    setAssigned(p?.categories?.map(c => c.id) ?? [1]); setPrimary(p?.categories?.find(c => c.isPrimary)?.id ?? 1); setTags(p?.tags?.join(', ') ?? '');
  };
  return <section className="category-manager stack" aria-labelledby="category-manager-heading">
    <header><h2 id="category-manager-heading">Categories & product organization</h2><p className="muted">Organize products and browse category stock summaries.</p></header>
    {categories.isLoading && <LoadingBlock label="Loading category management" count={3} />}
    {categories.isError && <ErrorState error={categories.error} onRetry={() => categories.refetch()} />}
    <nav className="staff-sections" aria-label="Organization sections">
      <button className={`btn ${view === 'categories' ? 'btn--primary' : ''}`} type="button" aria-pressed={view === 'categories'} onClick={() => setView('categories')}>Categories & stock</button>
      <button className={`btn ${view === 'products' ? 'btn--primary' : ''}`} type="button" aria-pressed={view === 'products'} onClick={() => setView('products')}>Product categories & tags</button>
    </nav>
    <div className="stack" hidden={view !== 'categories'}>
    <div className="category-manager__toolbar"><div className="field"><label htmlFor="category-search">Find a category</label><input id="category-search" type="search" value={search} onChange={e => { setSearch(e.target.value); setCategoryPage(1); }} placeholder="Search category or parent" /></div><button type="button" className="btn btn--primary" onClick={() => load(null)}>Create category</button></div>
    <div className="table-surface"><div className="table-scroll"><table><caption>Stock by category, including subcategories</caption><thead><tr><th>Category</th><th>Products</th><th>In stock</th><th>Low stock</th><th>Manage</th></tr></thead><tbody>
      {visibleCategories.map(c => <tr key={c.id}><td>{'— '.repeat(c.depth - 1)}{c.name}{!c.isActive && <span className="badge badge--neutral">Inactive</span>}</td><td>{c.productCount}</td><td>{c.inStockCount}</td><td>{c.lowStockCount}</td><td><button type="button" className="btn btn--sm" aria-label={`Edit ${categoryLabel(c)}`} onClick={() => load(c)}>Edit</button></td></tr>)}
    {!filtered.length && <tr><td colSpan={5}>No categories match your search.</td></tr>}
    </tbody></table></div><Pager page={currentPage} pageSize={8} totalPages={categoryPages} totalCount={filtered.length} onPageChange={setCategoryPage} /></div>
    </div>
    <Modal open={editorOpen} title={selected ? `Edit ${selected.name}` : 'Create category'} onClose={() => setEditorOpen(false)}>
      <form className="card-glass stack" aria-label="Category editor" onSubmit={async e => { e.preventDefault(); await run(selected ? `/api/categories/${selected.id}` : '/api/categories', selected ? 'PUT' : 'POST', { name, slug, parentId: parent ? Number(parent) : null, sortOrder: order, isActive: active }); }}>
        <div className="field"><label>Category name<input required maxLength={120} value={name} onChange={e => { setName(e.target.value); if (!selected) setSlug(slugify(e.target.value)); }} disabled={selected?.id === 1} /></label></div>
        <div className="field"><label>Category slug<input required maxLength={120} value={slug} onChange={e => setSlug(e.target.value)} disabled={selected?.id === 1} /></label></div>
        <div className="field"><label>Parent category<select value={parent} onChange={e => setParent(e.target.value)} disabled={selected?.id === 1}><option value="">Root category</option>{all.map(c => <option key={c.id} value={c.id}>{categoryLabel(c)}</option>)}</select></label></div>
        <div className="field"><label>Sort order<input type="number" value={order} onChange={e => setOrder(Number(e.target.value))} /></label></div>
        <label className="checkbox"><input type="checkbox" checked={active} onChange={e => setActive(e.target.checked)} disabled={selected?.id === 1} />Active category</label>
        <p className="muted">Inactive categories and their subcategories are hidden from browsing. Product availability stays unchanged.</p>
        <button type="submit" className="btn btn--primary" disabled={mutation.isPending}>Save category</button>
        {actionTarget === 'category' && error && <p role="alert" className="category-manager__error">{error}</p>}
        {actionTarget === 'category' && message && <p role="status">{message}</p>}
        {selected && selected.id !== 1 && <>
          <button type="button" className="btn" disabled={mutation.isPending} onClick={() => run(`/api/categories/${selected.id}/move`, 'POST', { parentId: parent ? Number(parent) : null, sortOrder: order })}>Move category</button>
          <div className="field"><label>Reassign products and children to<select value={reassign} onChange={e => setReassign(e.target.value)}><option value="">Choose category</option>{all.filter(c => !c.path.startsWith(selected.path)).map(c => <option key={c.id} value={c.id}>{categoryLabel(c)}</option>)}</select></label></div>
          <button type="button" className="btn btn--danger" disabled={mutation.isPending || ((selected.directProductCount > 0 || selected.children.length > 0) && !reassign)} onClick={async () => { if (await run(`/api/categories/${selected.id}${reassign ? `?reassignToCategoryId=${reassign}` : ''}`, 'DELETE')) setEditorOpen(false); }}>Delete category</button>
          {(selected.directProductCount > 0 || selected.children.length > 0) && !reassign && <p className="muted">Choose a reassignment target to delete this category.</p>}
        </>}
      </form>
    </Modal>
      <div className="card-glass stack" hidden={view !== 'products'}>
        <h3>Product categories & tags</h3>
        <div className="field"><label htmlFor="organization-product-search">Find a product</label><input id="organization-product-search" type="search" placeholder="Search name or SKU" value={productSearch} onChange={e => { setProductSearch(e.target.value); setProductPage(1); setProductId(null); }} /></div>
        <div className="field"><label>Product<select value={productId ?? ''} disabled={products.isLoading || products.isPlaceholderData} onChange={e => chooseProduct(Number(e.target.value))}><option value="">Choose product</option>{products.data?.items.map(p => <option value={p.id} key={p.id}>{p.name} ({p.sku})</option>)}</select></label></div>
        {products.data && <Pager page={products.data.page} pageSize={products.data.pageSize} totalPages={products.data.totalPages} totalCount={products.data.totalCount} onPageChange={value => { setProductPage(value); setProductId(null); }} />}
        {productId && <form className="stack" aria-label="Product category editor" onSubmit={e => { e.preventDefault(); run(`/api/products/${productId}/categories`, 'PUT', { categoryIds: assigned, primaryCategoryId: assigned.includes(primary ?? 0) ? primary : assigned[0] ?? null, tags: tags.split(',').map(t => t.trim()).filter(Boolean) }); }}>
          <p>{product.data?.name ?? 'Selected product'}</p>
          <fieldset className="category-manager__assignments"><legend>Assigned categories</legend>{all.map(c => <label className="checkbox" key={c.id}><input type="checkbox" checked={assigned.includes(c.id)} onChange={e => setAssigned(old => e.target.checked ? [...old, c.id] : old.filter(id => id !== c.id))} />{categoryLabel(c)}</label>)}</fieldset>
          <div className="field"><label>Primary category<select value={assigned.includes(primary ?? 0) ? primary ?? '' : assigned[0] ?? ''} onChange={e => setPrimary(Number(e.target.value))}>{assigned.length ? all.filter(c => assigned.includes(c.id)).map(c => <option key={c.id} value={c.id}>{categoryLabel(c)}</option>) : <option value="">Uncategorized (automatic)</option>}</select></label></div>
          <div className="field"><label>Tags (comma separated)<input value={tags} onChange={e => setTags(e.target.value)} placeholder="Featured, Coffee" /></label></div>
          {!assigned.length && <p>Removing every category assigns Uncategorized automatically.</p>}
          <button type="submit" className="btn btn--primary" disabled={mutation.isPending}>Save product categories</button>
          {actionTarget === 'product' && error && <p role="alert" className="category-manager__error">{error}</p>}
          {actionTarget === 'product' && message && <p role="status">{message}</p>}
        </form>}
      </div>
  </section>;
}
