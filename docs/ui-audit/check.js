(() => {
  const els = [...document.querySelectorAll('body *')].filter(e => e.offsetParent !== null && e.innerText && e.children.length === 0);
  const sizes = new Set(els.map(e => getComputedStyle(e).fontSize));
  const tiny = els.filter(e => parseFloat(getComputedStyle(e).fontSize) < 12).map(e => e.innerText.trim().slice(0, 30));
  const arial = [...document.querySelectorAll('button,select,input,textarea')].filter(e => getComputedStyle(e).fontFamily.trim().startsWith('Arial')).length;
  const small = [...document.querySelectorAll('button,a,[role=button]')].filter(e => e.offsetParent !== null).map(e => [e.innerText.trim().slice(0, 20) || e.getAttribute('aria-label'), Math.round(e.getBoundingClientRect().height)]).filter(([, h]) => h < 24);
  const p = [...document.querySelectorAll('main p')].sort((a, b) => b.innerText.length - a.innerText.length)[0];
  return {
    route: location.pathname,
    vw: innerWidth,
    distinctFontSizes: sizes.size,
    sizes: [...sizes].sort(),
    under12px: tiny,
    arialControls: arial,
    targetsUnder24px: small,
    longestParagraphWidth: p ? Math.round(p.getBoundingClientRect().width) : null,
    dialogsOpen: document.querySelectorAll('[role=dialog]').length,
    scrollOverflowX: document.documentElement.scrollWidth > innerWidth
  };
})();
