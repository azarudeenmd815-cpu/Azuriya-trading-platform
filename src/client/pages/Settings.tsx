import type { Page } from '../../shared/types';
import { useApi } from '../api';
import { EmptyState, ErrorState, Loading, PageHeading } from '../components/ui';
import { display, words } from '../values';

export function Settings({ apiBase }: { apiBase: string }) {
  const result = useApi<Page>(`${apiBase}/settings`);
  return <><PageHeading title="Workspace settings" description="Effective feature settings for this instance, including tenant overrides. Provisioning changes are managed through Core." />{result.loading ? <Loading /> : result.error ? <ErrorState error={result.error} retry={result.reload} /> : !result.data?.data.length ? <EmptyState title="No feature settings available" description="Effective settings appear when platform feature flags are configured." /> : result.data.data.map((record, index) => <section className="panel" key={index}><div className="panel-heading"><div><h2>{typeof record.key === 'string' ? words(record.key) : 'Feature setting'}</h2><p>Effective server configuration for this instance</p></div></div><dl className="detail-grid settings-grid">{Object.entries(record).map(([key, value]) => <div key={key}><dt>{words(key)}</dt><dd>{display(value)}</dd></div>)}</dl></section>)}</>;
}
