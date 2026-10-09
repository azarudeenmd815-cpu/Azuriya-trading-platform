import type { Row } from '../../shared/types';
import { useApi } from '../api';
import { Badge, ErrorState, Loading, PageHeading } from '../components/ui';
import { display, words } from '../values';

export function CoreSummary({ section }: { section: 'infrastructure' | 'system-settings' }) {
  const infrastructure = section === 'infrastructure';
  const result = useApi<{ data: Row }>(`/core/${section}`);
  return <><PageHeading title={infrastructure ? 'Infrastructure' : 'System settings'} description={infrastructure ? 'Current runtime and infrastructure capability metadata. Availability reflects implemented platform capabilities.' : 'Current authoritative platform configuration and operational boundaries.'} />{result.loading ? <Loading /> : result.error ? <ErrorState error={result.error} retry={result.reload} /> : <section className="panel"><div className="panel-heading"><div><h2>{infrastructure ? 'Platform capabilities' : 'Platform configuration'}</h2><p>Reported by the running Core API</p></div></div><dl className="detail-grid">{Object.entries(result.data?.data ?? {}).map(([key, value]) => <div key={key}><dt>{words(key)}</dt><dd>{typeof value === 'boolean' ? <Badge value={value ? 'enabled' : 'disabled'} /> : display(value)}</dd></div>)}</dl></section>}</>;
}
