import { Moon, Sun } from 'lucide-react';
import { useEffect, useState } from 'react';
export function useLightTheme() {
  const [light, setLight] = useState(document.documentElement.dataset.marketingTheme === 'light');
  useEffect(() => {
    const observer = new MutationObserver(() => setLight(document.documentElement.dataset.marketingTheme === 'light'));
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-marketing-theme'] });
    return () => observer.disconnect();
  }, []);
  return light;
}
export function ThemeToggle() {
  const light = useLightTheme();
  function toggle() {
    const next = !light;
    document.documentElement.dataset.marketingTheme = next ? 'light' : 'dark';
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', next ? '#ffffff' : '#000000');
    try { localStorage.setItem('azuriya.marketing-theme', next ? 'light' : 'dark'); } catch { /* The theme still works without persistent storage. */ }
  }
  return <button className="icon-button theme-toggle" aria-label={`Switch to ${light ? 'dark' : 'light'} theme`} title={`Switch to ${light ? 'dark' : 'light'} theme`} onClick={toggle}>{light ? <Moon size={19} /> : <Sun size={19} />}</button>;
}
