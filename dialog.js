// In-app dialogs that replace the browser's prompt(), alert() and confirm().
// openDialog() resolves with the field values when confirmed, or null when cancelled.

let active = null;

function el(tag, props = {}, children = []) {
  const node = document.createElement(tag);
  Object.entries(props).forEach(([key, value]) => {
    if (value === undefined || value === null || value === false) return;
    if (key === 'text') node.textContent = value;
    else if (key === 'className') node.className = value;
    else node.setAttribute(key, value === true ? '' : value);
  });
  children.forEach((child) => node.appendChild(child));
  return node;
}

function renderField(field, index) {
  const id = `app-dialog-field-${index}`;
  const wrap = el('div', { className: 'dialog-field' });
  wrap.appendChild(el('label', { for: id, className: 'dialog-label', text: field.label }));

  let control;
  if (field.type === 'select') {
    control = el('select', { id, name: field.name, className: 'dialog-input' });
    field.options.forEach((opt) => {
      control.appendChild(el('option', { value: opt.value, text: opt.label, selected: opt.value === field.value }));
    });
  } else {
    control = el('input', {
      id,
      name: field.name,
      type: field.type || 'text',
      className: 'dialog-input',
      value: field.value ?? '',
      placeholder: field.placeholder,
      inputmode: field.inputmode,
      autocomplete: 'off',
      maxlength: field.maxlength,
      min: field.min,
      max: field.max,
    });
    // Free text with suggestions, e.g. a store name that may already exist
    if (field.suggestions) {
      const listId = `${id}-list`;
      control.setAttribute('list', listId);
      wrap.appendChild(el('datalist', { id: listId }, field.suggestions.map((s) => el('option', { value: s }))));
    }
  }
  wrap.insertBefore(control, wrap.querySelector('datalist'));
  if (field.prefix) {
    const group = el('div', { className: 'dialog-input-group' }, [el('span', { className: 'dialog-prefix', text: field.prefix, 'aria-hidden': 'true' })]);
    wrap.replaceChild(group, control);
    group.appendChild(control);
  }
  return { wrap, control };
}

function close(result) {
  if (!active) return;
  const { backdrop, resolve, restoreFocus, onKey } = active;
  active = null;
  backdrop.hidden = true;
  document.removeEventListener('keydown', onKey, true);
  if (restoreFocus && document.contains(restoreFocus)) restoreFocus.focus();
  resolve(result);
}

/**
 * @param {object} options
 * @param {string} options.title
 * @param {string} [options.message]       plain text under the title
 * @param {Array}  [options.fields]         { name, label, type, value, options, suggestions, prefix, placeholder, inputmode }
 * @param {string} options.confirmLabel
 * @param {string} options.cancelLabel
 * @param {boolean} [options.danger]        red confirm button, for deleting
 * @param {boolean} [options.hideCancel]    a notice with a single button
 * @param {Function} [options.validate]     values => error text, or '' when valid
 * @param {Function} [options.onChange]     (name, values, controls) => void, to update one field from another
 */
export function openDialog(options) {
  if (active) close(null);
  const backdrop = document.getElementById('app-dialog');
  const form = document.getElementById('app-dialog-form');
  const fieldsBox = document.getElementById('app-dialog-fields');
  const errorEl = document.getElementById('app-dialog-error');
  const messageEl = document.getElementById('app-dialog-message');
  const confirmBtn = document.getElementById('app-dialog-confirm');
  const cancelBtn = document.getElementById('app-dialog-cancel');

  document.getElementById('app-dialog-title').textContent = options.title;
  messageEl.textContent = options.message || '';
  messageEl.hidden = !options.message;
  errorEl.hidden = true;
  confirmBtn.textContent = options.confirmLabel;
  confirmBtn.classList.toggle('danger', Boolean(options.danger));
  cancelBtn.textContent = options.cancelLabel;
  cancelBtn.hidden = Boolean(options.hideCancel);

  fieldsBox.innerHTML = '';
  const controls = {};
  (options.fields || []).forEach((field, i) => {
    const { wrap, control } = renderField(field, i);
    controls[field.name] = control;
    fieldsBox.appendChild(wrap);
  });

  const values = () => Object.fromEntries(Object.entries(controls).map(([name, c]) => [name, c.value]));
  Object.entries(controls).forEach(([name, control]) => {
    control.addEventListener('input', () => {
      errorEl.hidden = true;
      if (options.onChange) options.onChange(name, values(), controls);
    });
  });

  return new Promise((resolve) => {
    const onKey = (e) => {
      if (e.key === 'Escape') { e.stopPropagation(); close(null); }
    };
    active = { backdrop, resolve, restoreFocus: document.activeElement, onKey };
    document.addEventListener('keydown', onKey, true);

    form.onsubmit = (e) => {
      e.preventDefault();
      const current = values();
      const error = options.validate ? options.validate(current) : '';
      if (error) {
        errorEl.textContent = error;
        errorEl.hidden = false;
        return;
      }
      close(current);
    };

    backdrop.hidden = false;
    const first = fieldsBox.querySelector('input, select');
    if (first) {
      first.focus();
      if (first.select && first.type !== 'date') first.select();
    } else {
      confirmBtn.focus();
    }
  });
}

// Replaces the suggestion list of a text field opened with `suggestions`.
export function setSuggestions(control, suggestions) {
  const list = document.getElementById(control.getAttribute('list'));
  if (!list) return;
  list.replaceChildren(...suggestions.map((s) => el('option', { value: s })));
}

export function setupDialog() {
  const backdrop = document.getElementById('app-dialog');
  document.getElementById('app-dialog-cancel').addEventListener('click', () => close(null));
  document.getElementById('app-dialog-close').addEventListener('click', () => close(null));
  backdrop.addEventListener('click', (e) => { if (e.target === backdrop) close(null); });
}
