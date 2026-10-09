import { useEffect } from 'react';

export const platformLogoUrl = '/brand/azuriya-logo.png';
const neutralFavicon = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1 1"%3E%3C/svg%3E';

export function PlatformMark({ large = false }: { large?: boolean }) {
  return <span className={`platform-mark${large ? ' large' : ''}`} aria-hidden="true"><img src={platformLogoUrl} alt="" width={large ? 60 : 36} height={large ? 60 : 36} decoding="async" /></span>;
}

export function usePageFavicon(url?: string) {
  useEffect(() => {
    const existing = document.querySelector<HTMLLinkElement>('link[data-app-favicon]');
    const icon = existing ?? document.createElement('link');
    icon.rel = 'icon';
    icon.dataset.appFavicon = 'true';
    icon.href = url ?? neutralFavicon;
    if (url === platformLogoUrl) icon.type = 'image/png';
    else icon.removeAttribute('type');
    if (!existing) document.head.append(icon);
  }, [url]);
}
