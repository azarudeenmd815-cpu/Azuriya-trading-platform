import { ArrowDown, ArrowUp, ChevronLeft, ChevronRight, Search, SlidersHorizontal } from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';
import { useSearchParams } from 'react-router-dom';
import type { Page, Row } from '../../shared/types';
import { useApi } from '../api';
import { date, display, str, words } from '../values';
import { Badge, EmptyState, ErrorState, Loading, Modal, PageHeading } from './ui';

export interface Column { key: string; label: string; type?: 'status' | 'date' | 'boolean' | 'code'; sortable?: boolean; }
export function ResourceView({ path, title, description, columns, action, rowAction, refresh = 0, emptyDescription, fixedSearch, filterKeys = [], detailKeys, statusOptions, searchable = true }: {
  path: string; title: string; description: string; columns: Column[]; action?: ReactNode;
  rowAction?: (row: Row, reload: () => void) => ReactNode; refresh?: number; emptyDescription?: string;
  fixedSearch?: string;
  filterKeys?: string[]; detailKeys?: string[]; statusOptions?: string[]; searchable?: boolean;
}) {
  const [params, setParams] = useSearchParams();
  const [detail, setDetail] = useState<Row | null>(null);
  const search = searchable ? fixedSearch ?? params.get('search') ?? '' : '';
  const status = params.get('status') ?? '';
  const offset = Math.max(0, Number(params.get('offset')) || 0);
  const sort = params.get('sort') ?? 'created_at';
  const direction = params.get('direction') === 'asc' ? 'asc' : 'desc';
  const query = new URLSearchParams({ ...(search ? { search } : {}), ...(status ? { status } : {}), offset: String(offset), limit: '20', sort, direction });
  for (const key of filterKeys) { const value = params.get(key); if (value) query.set(key,value); }
  const result = useApi<Page>(`${path}?${query}`);
  const { reload } = result;
  useEffect(() => { if (refresh) reload(); }, [refresh, reload]);
  function update(key: string, next: string) { const nextParams = new URLSearchParams(params); nextParams.set(key, next); if (key !== 'offset') nextParams.set('offset', '0'); setParams(nextParams, { replace: true }); }
  const page = result.data?.pagination;
  const sourceRows = result.data?.data ?? [];
  const normalizedSearch = search.trim().toLocaleLowerCase();
  const filteredRows = page ? sourceRows : sourceRows.filter(row =>
    (!normalizedSearch || Object.values(row).some(value => display(value).toLocaleLowerCase().includes(normalizedSearch))) &&
    (!status || str(row.status) === status)
  );
  const total = page?.total ?? filteredRows.length;
  const offsetActual = page?.offset ?? Math.min(offset, Math.max(0, Math.floor((total - 1) / 20) * 20));
  const rows = page ? sourceRows : filteredRows.slice(offsetActual, offsetActual + 20);
  const statusControl = statusOptions ? <select aria-label="Filter by status" value={status} onChange={event => update('status',event.target.value)}><option value="">All statuses</option>{statusOptions.map(item=><option key={item} value={item}>{words(item)}</option>)}</select> : <input value={status} onChange={event => update('status', event.target.value)} placeholder="Filter by status" aria-label="Filter by status" />;
  return <><PageHeading title={title} description={description} actions={action} /><section className="panel"><div className="table-toolbar">{searchable && (fixedSearch ? <div className="scope-filter"><Search size={16} aria-hidden="true" /><span>Audit scope <code>{fixedSearch}</code></span></div> : <div className="search-field"><Search size={17} aria-hidden="true" /><input type="search" aria-label={`Search ${title.toLowerCase()}`} placeholder={`Search ${title.toLowerCase()}…`} value={search} onChange={event => update('search', event.target.value)} /></div>)}{columns.some(column => column.key === 'status') && <div className="filter-field"><SlidersHorizontal size={15} aria-hidden="true" />{statusControl}</div>}<span className="record-count">{result.loading ? 'Loading…' : `${total} records`}</span></div>{result.loading ? <Loading /> : result.error ? <ErrorState error={result.error} retry={result.reload} /> : !rows.length ? <EmptyState title={search || status ? 'No matching records' : `No ${title.toLowerCase()} yet`} description={emptyDescription ?? 'Create a record or adjust your filters to get started.'} /> : <div className="table-scroll" role="region" aria-label={`${title} table`} tabIndex={0}><table><thead><tr>{columns.map(column => <th key={column.key} scope="col"><button disabled={column.sortable === false} className="sort-button" onClick={() => { const next = new URLSearchParams(params); next.set('sort', column.key); next.set('direction', sort === column.key && direction === 'asc' ? 'desc' : 'asc'); next.set('offset', '0'); setParams(next, { replace: true }); }}>{column.label}{sort === column.key && (direction === 'asc' ? <ArrowUp size={12} /> : <ArrowDown size={12} />)}</button></th>)}<th scope="col"><span className="sr-only">Actions</span></th></tr></thead><tbody>{rows.map((row, index) => <tr key={str(row.id, str(row.key, String(index)))}>{columns.map((column, columnIndex) => <td key={column.key} className={`${columnIndex === 0 ? 'primary-cell' : ''} ${column.type === 'code' ? 'mono' : ''}`}>{column.type === 'status' ? <Badge value={str(row[column.key], 'unknown')} /> : column.type === 'date' ? date(row[column.key]) : column.type === 'boolean' ? (row[column.key] === true ? 'Yes' : 'No') : <span title={display(row[column.key])}>{display(row[column.key])}</span>}</td>)}<td className="row-actions">{rowAction?.(row, result.reload)}<button className="button quiet small" onClick={() => setDetail(row)}>Details</button></td></tr>)}</tbody></table></div>}<div className="table-footer"><span>{total ? `${offsetActual + 1}–${Math.min(offsetActual + rows.length, total)} of ${total}` : '0 records'}</span><div className="pagination"><button className="icon-button" aria-label="Previous page" disabled={offsetActual === 0 || result.loading} onClick={() => update('offset', String(Math.max(0, offsetActual - 20)))}><ChevronLeft size={17} /></button><span>Page {Math.floor(offsetActual / 20) + 1}</span><button className="icon-button" aria-label="Next page" disabled={offsetActual + 20 >= total || result.loading} onClick={() => update('offset', String(offsetActual + 20))}><ChevronRight size={17} /></button></div></div></section>{detail && <Modal title={str(detail.name, str(detail.provider_name, 'Record details'))} description="Current persisted metadata" close={() => setDetail(null)}><dl className="detail-grid">{Object.entries(detail).filter(([key]) => !detailKeys || detailKeys.includes(key)).map(([key, value]) => <div key={key}><dt>{words(key)}</dt><dd>{key.endsWith('_at') ? date(value) : display(value)}</dd></div>)}</dl><div className="modal-footer"><button className="button secondary" onClick={() => setDetail(null)}>Close</button></div></Modal>}</>;
}


