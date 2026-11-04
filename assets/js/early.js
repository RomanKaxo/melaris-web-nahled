// Běží před vykreslením: zapne styly závislé na JS a obnoví zvolený vzhled.
(function () {
  var root = document.documentElement;
  root.classList.add('js');
  try {
    var theme = localStorage.getItem('melaris-theme');
    if (theme === 'dark' || theme === 'light') root.dataset.theme = theme;
  } catch (e) { /* úložiště nemusí být dostupné */ }
})();
