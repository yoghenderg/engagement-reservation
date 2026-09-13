const $ = (s) => document.querySelector(s);
const SITE_CONFIG = {
  closesAt: '2026-10-12T00:00:00+08:00',
  background: '/assets/couple-maroon.png',
  backgroundPosition: 'center bottom',
  supabaseUrl: 'https://bdooschvskhsyxripctz.supabase.co',
  supabaseAnonKey: 'sb_publishable_56ryK_rIZjtDb1cKufD_-w_flEdM0yl'
};
let settings;
let requestId = crypto.randomUUID();
let busy = false;
let adminRows = [];
const form = $('#rsvp');
const adminLogin = $('#admin-login');

function closed(c) {
  return new Date() >= new Date(c.closesAt);
}

async function getConfig() {
  settings = { ...SITE_CONFIG, closed: closed(SITE_CONFIG) };
  const deadline = new Date(new Date(settings.closesAt).getTime() - 1).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'Asia/Kuala_Lumpur'
  });
  $('#deadline').textContent = deadline;
  document.querySelectorAll('.deadline-copy').forEach((e) => { e.textContent = deadline; });
  $('.backdrop').style.setProperty('--mobile-photo', `url(${JSON.stringify(settings.background)})`);
  $('.backdrop').style.backgroundPosition = settings.backgroundPosition || 'center';
  return settings;
}

function pathFor(page) {
  if (page === 'reservation') return '/reserve';
  if (page === 'thanks') return '/thank-you';
  if (page === 'login' || page === 'admin') return '/login';
  return '/';
}

function show(page, push = true) {
  for (const id of ['landing', 'reservation', 'thanks', 'login', 'admin']) {
    $('#' + id).hidden = id !== page;
  }
  if (push) history.pushState({ page }, '', pathFor(page));
  window.scrollTo({ top: 0, behavior: 'instant' });
  if (page !== 'landing') {
    const focusId = page === 'reservation' ? 'form-title' : page === 'thanks' ? 'thanks-title' : page === 'login' ? 'login-title' : 'admin-title';
    setTimeout(() => $('#' + focusId).focus({ preventScroll: true }), 50);
  }
}

function closeNotice() {
  $('#closed-dialog').showModal();
}

async function reserve(push = true) {
  const b = $('#reserve');
  b.disabled = true;
  try {
    const c = await getConfig();
    if (c.closed) closeNotice();
    else show('reservation', push);
  } catch (e) {
    b.textContent = 'Connection unavailable · Try again';
  } finally {
    b.disabled = false;
  }
}

function update() {
  const yes = form.elements.attending.value === 'yes';
  $('#attending-fields').hidden = !yes;
  for (const el of [$('#guests'), $('#meal')]) {
    el.required = yes;
    el.disabled = !yes;
  }
  $('.submit').disabled = busy || !form.checkValidity() || $('#name').value.trim().length < 2 || $('#phone').value.replace(/\D/g, '').length < 7;
  $('.submit').firstChild.textContent = form.elements.attending.value === 'no' ? 'Send your reply ' : 'Confirm reservation ';
}

async function supabasePost(path, payload) {
  return fetch(`${settings.supabaseUrl}${path}`, {
    method: 'POST',
    headers: {
      apikey: settings.supabaseAnonKey,
      Authorization: `Bearer ${settings.supabaseAnonKey}`,
      'Content-Type': 'application/json',
      Prefer: 'return=minimal'
    },
    body: JSON.stringify(payload)
  });
}

async function saveReservation(data) {
  if (closed(settings)) return { closed: true };
  if (!settings.supabaseUrl || !settings.supabaseAnonKey) throw Error('Reservation database is not connected yet.');
  const payload = {
    request_id: requestId,
    full_name: data.name.trim(),
    phone: data.phone.trim(),
    attending: data.attending,
    guests: data.attending === 'yes' ? data.guests : null,
    meal: data.attending === 'yes' ? data.meal : null
  };
  const r = await supabasePost('/rest/v1/reservations', payload);
  if (r.status === 409) return { ok: true };
  if (!r.ok) throw Error('We couldn’t save your reply. Please try again.');
  return { ok: true };
}

function adminCredentials() {
  try {
    return JSON.parse(sessionStorage.getItem('rsvp-admin') || 'null');
  } catch (e) {
    return null;
  }
}

function saveAdminCredentials(username, password) {
  sessionStorage.setItem('rsvp-admin', JSON.stringify({ username, password }));
}

function clearAdminCredentials() {
  sessionStorage.removeItem('rsvp-admin');
}

async function fetchAdminRows(username, password) {
  const r = await fetch(`${settings.supabaseUrl}/rest/v1/rpc/admin_reservations`, {
    method: 'POST',
    headers: {
      apikey: settings.supabaseAnonKey,
      Authorization: `Bearer ${settings.supabaseAnonKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ p_username: username, p_password: password })
  });
  if (!r.ok) throw Error('Admin login failed. Please check username and password.');
  return r.json();
}

function guestCount(row) {
  if (row.attending !== 'yes') return 0;
  if (row.guests === '6+') return 6;
  return Number(row.guests || 1);
}

function malaysiaTime(value) {
  return new Intl.DateTimeFormat('en-MY', {
    timeZone: 'Asia/Kuala_Lumpur',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true
  }).format(new Date(value));
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
}

function renderAdmin(rows) {
  adminRows = rows || [];
  const attendingGuests = adminRows.reduce((sum, row) => sum + guestCount(row), 0);
  const declined = adminRows.filter((row) => row.attending === 'no').length;
  $('#count-attending').textContent = attendingGuests;
  $('#count-declined').textContent = declined;
  $('#count-total').textContent = adminRows.length;
  $('#admin-empty').textContent = adminRows.length
    ? `${adminRows.length} replies received so far. ${attendingGuests} attending guests are expected.`
    : 'No replies have been submitted yet.';
  $('#admin-rows').innerHTML = adminRows.map((row) => `
    <tr>
      <td>${escapeHtml(row.full_name)}</td>
      <td><a href="tel:${escapeHtml(row.phone)}">${escapeHtml(row.phone)}</a></td>
      <td>${row.attending === 'yes' ? 'Attending' : 'Not attending'}</td>
      <td>${row.attending === 'yes' ? escapeHtml(row.guests || '1') : '—'}</td>
      <td>${row.attending === 'yes' ? escapeHtml(row.meal || '—') : '—'}</td>
      <td>${malaysiaTime(row.created_at)}</td>
    </tr>
  `).join('');
}

async function loadAdmin(push = true) {
  await getConfig();
  const creds = adminCredentials();
  if (!creds) {
    show('login', push);
    return;
  }
  try {
    $('#admin-error').textContent = '';
    renderAdmin(await fetchAdminRows(creds.username, creds.password));
    show('admin', push);
  } catch (e) {
    clearAdminCredentials();
    $('#login-error').textContent = 'Please login again.';
    show('login', push);
  }
}

function setAdminTab(tab) {
  const table = tab === 'table';
  $('#admin-summary').hidden = table;
  $('#admin-table').hidden = !table;
  $('#summary-tab').classList.toggle('is-active', !table);
  $('#table-tab').classList.toggle('is-active', table);
}

$('#reserve').onclick = () => reserve();
$('#back').onclick = () => show('landing');
$('#home').onclick = () => {
  form.reset();
  update();
  requestId = crypto.randomUUID();
  show('landing');
};
$('#login-home').onclick = () => show('landing');
$('.brand').onclick = (e) => {
  e.preventDefault();
  show('landing');
};
$('.close').onclick = () => $('#closed-dialog').close();
$('#admin-refresh').onclick = () => loadAdmin(false);
$('#admin-logout').onclick = () => {
  clearAdminCredentials();
  adminLogin.reset();
  show('login');
};
$('#summary-tab').onclick = () => setAdminTab('summary');
$('#table-tab').onclick = () => setAdminTab('table');
form.addEventListener('input', update);
form.addEventListener('change', update);

form.onsubmit = async (e) => {
  e.preventDefault();
  if (busy || !form.reportValidity()) return;
  busy = true;
  update();
  $('.submit').firstChild.textContent = 'Sending your reply… ';
  $('#error').textContent = '';
  const data = Object.fromEntries(new FormData(form));
  try {
    const result = await saveReservation(data);
    if (result.closed) {
      closeNotice();
      return;
    }
    const yes = data.attending === 'yes';
    $('#thanks-title').innerHTML = yes ? 'You’re on<br><em>our guest list.</em>' : 'You’ll be<br><em>with us in spirit.</em>';
    $('#thanks-copy').innerHTML = yes ? 'We’ll be waiting for your arrival.<br>Thank you for being part of our beginning.' : 'Thank you for letting us know.<br>We’ll miss you and keep you close in our hearts.';
    $('#receipt').textContent = yes ? `${data.guests} ${data.guests === '1' ? 'guest' : 'guests'} · ${data.meal === 'vegetarian' ? 'Vegetarian' : 'Non-vegetarian'}` : 'Your reply has been received.';
    show('thanks');
  } catch (e) {
    $('#error').textContent = e.message || 'We couldn’t save your reply. Please try again.';
  } finally {
    busy = false;
    update();
  }
};

adminLogin.onsubmit = async (e) => {
  e.preventDefault();
  $('#login-error').textContent = '';
  const data = Object.fromEntries(new FormData(adminLogin));
  try {
    saveAdminCredentials(data.username, data.password);
    renderAdmin(await fetchAdminRows(data.username, data.password));
    show('admin');
  } catch (err) {
    clearAdminCredentials();
    $('#login-error').textContent = err.message || 'Admin login failed.';
  }
};

window.onpopstate = () => {
  if (location.pathname === '/reserve') reserve(false);
  else if (location.pathname === '/login') loadAdmin(false);
  else show('landing', false);
};

update();
getConfig().then(() => {
  if (location.pathname === '/reserve') {
    if (settings.closed) {
      show('landing', false);
      closeNotice();
    } else show('reservation', false);
  } else if (location.pathname === '/login') {
    loadAdmin(false);
  } else {
    show('landing', false);
  }
}).catch(() => {});
