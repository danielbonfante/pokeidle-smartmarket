// Páginas de teste: ?noite no endereço liga o modo noturno do jogo (classe night-mode no <html>).
if (/[?&]noite\b/.test(location.search)) document.documentElement.classList.add('night-mode');
