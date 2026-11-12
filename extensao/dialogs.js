/** Diálogo do painel lateral: um pedido por vez, texto seguro e foco restaurado. */
(() => {
  let active = false;
  globalThis.OctorDialogs = {
    confirm(message, { title = 'Confirmar ação', confirmText = 'Confirmar' } = {}) {
      if (active) return Promise.resolve(false);
      active = true;
      return new Promise(resolve => {
        const previousFocus = document.activeElement;
        const dialog = document.createElement('dialog');
        dialog.className = 'octor-dialog';
        dialog.setAttribute('aria-labelledby', 'extension-dialog-title');
        dialog.setAttribute('aria-describedby', 'extension-dialog-description');
        const heading = document.createElement('h2'); heading.id = 'extension-dialog-title'; heading.textContent = title;
        const description = document.createElement('p'); description.id = 'extension-dialog-description'; description.textContent = message;
        const footer = document.createElement('div'); footer.className = 'dialog-actions';
        const cancel = document.createElement('button'); cancel.type = 'button'; cancel.textContent = 'Cancelar';
        const accept = document.createElement('button'); accept.type = 'button'; accept.className = 'dialog-confirm'; accept.textContent = confirmText;
        let settled = false;
        const finish = value => { if (settled) return; settled = true; active = false; dialog.close(); dialog.remove(); if (previousFocus?.isConnected) previousFocus.focus(); resolve(value); };
        cancel.addEventListener('click', () => finish(false));
        accept.addEventListener('click', () => finish(true));
        dialog.addEventListener('keydown', event => {
          if (event.key !== 'Tab') return;
          if (event.shiftKey && document.activeElement === cancel) { event.preventDefault(); accept.focus(); }
          else if (!event.shiftKey && document.activeElement === accept) { event.preventDefault(); cancel.focus(); }
        });
        dialog.addEventListener('cancel', event => { event.preventDefault(); finish(false); });
        dialog.addEventListener('close', () => finish(false));
        dialog.addEventListener('click', event => { if (event.target !== dialog) return; const r = dialog.getBoundingClientRect(); if (event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom) finish(false); });
        footer.append(cancel, accept); dialog.append(heading, description, footer); document.body.append(dialog);
        dialog.showModal(); cancel.focus();
      });
    }
  };
})();
