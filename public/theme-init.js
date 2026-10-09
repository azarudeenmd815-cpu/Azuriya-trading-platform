try {
  document.documentElement.dataset.marketingTheme = localStorage.getItem('azuriya.marketing-theme') === 'light' ? 'light' : 'dark';
} catch {
  document.documentElement.dataset.marketingTheme = 'dark';
}
