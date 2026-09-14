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
let selectedSide = '';
const sideLabel = side => side === 'mappilai' ? 'Mappilai side' : side === 'ponnu' ? 'Ponnu side' : 'Not specified';
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
  if (page === 'side') return '/choose-side';
  if (page === 'reservation') return '/reserve';
  if (page === 'thanks') return '/thank-you';
  if (page === 'login' || page === 'admin') return '/login';
  return '/';
}

function show(page, push = true) {
  $('#page-loading').hidden = true;
  for (const id of ['landing', 'side', 'reservation', 'thanks', 'login', 'admin']) {
    $('#' + id).hidden = id !== page;
  }
  if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
  if (push) history.pushState({ page }, '', pathFor(page));
  window.scrollTo({ top: 0, behavior: 'instant' });
  if (page !== 'landing') {
    const focusId = page === 'side' ? 'side-title' : page === 'reservation' ? 'form-title' : page === 'thanks' ? 'thanks-title' : page === 'login' ? 'login-title' : 'admin-title';
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
    else show('side', push);
  } catch (e) {
    b.textContent = 'Connection unavailable · Try again';
  } finally {
    b.disabled = false;
  }
}

function update() {
  const yes = form.elements.attending.value === 'yes';
  $('#attending-fields').hidden = !yes;
  for (const el of [$('#guests'), $('#vegetarian_count')]) {
    el.required = yes;
    el.disabled = !yes;
  }
  const total = Math.max(0, Math.min(50, Math.floor(Number($('#guests').value) || 0)));
  const choice = form.elements.meal_choice.value;
  for (const radio of form.querySelectorAll('[name="meal_choice"]')) {
    radio.required = yes;
    radio.disabled = !yes;
  }
  $('#mixed-meals').hidden = choice !== 'mixed';
  for (const select of [$('#vegetarian_count')]) {
    if (select.dataset.total !== String(total)) {
      const previous = Math.min(Number(select.value), total);
      select.innerHTML = Array.from({length:total+1}, (_,i) => `<option value="${i}">${i} ${i === 1 ? 'person' : 'people'}</option>`).join('');
      select.value = previous;
      select.dataset.total = total;
    }
  }
  if (choice !== 'mixed') {
    $('#vegetarian_count').value = choice === 'vegetarian' ? total : 0;
  }
  const veg = Number($('#vegetarian_count').value);
  const remaining = total - veg;
  $('#vegetarian_count').max = total;
  $('#vegetarian_count').setCustomValidity(yes && remaining < 0 ? 'Meal counts cannot exceed the number of guests.' : '');
  $('#nonveg-count').textContent = Math.max(0, remaining);
  $('#meal-summary').hidden = !choice || !total;
  $('#meal-summary').textContent = remaining < 0 ? 'Please reduce the meal counts to match your guests.' : `${veg} vegetarian · ${remaining} non-vegetarian`;
  $('.submit').disabled = busy || !form.checkValidity() || $('#name').value.trim().length < 2 || $('#phone').value.replace(/\D/g, '').length < 7;
  $('.submit').firstChild.textContent = form.elements.attending.value === 'no' ? 'Send your reply ' : 'Confirm reservation ';
}

async function supabasePost(path, payload) {
  return fetch(`${settings.supabaseUrl}${path}`, {
    method: 'POST',
    headers: {
      apikey: settings.supabaseAnonKey,
      Authorization: `Bearer ${settings.supabaseAnonKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  });
}

async function saveReservation(data) {
  if (closed(settings)) return { closed: true };
  if (!settings.supabaseUrl || !settings.supabaseAnonKey) throw Error('Reservation database is not connected yet.');
  const payload = {
    request_id: requestId,
    side: selectedSide,
    full_name: data.name.trim(),
    phone: data.phone.trim(),
    attending: data.attending,
    guests: data.attending === 'yes' ? data.guests : null,
    vegetarian_count: data.attending === 'yes' ? Number(data.vegetarian_count) : 0,
    either_count: 0,
    non_vegetarian_count: data.attending === 'yes' ? Number(data.guests) - Number(data.vegetarian_count) : 0
  };
  if (!selectedSide) throw Error('Please go back and choose your side.');
  const r = await supabasePost('/rest/v1/rpc/submit_reservation', { p_reply: payload });
  if (!r.ok) throw Error('We couldn’t save your reply. Please try again.');
  return r.json();
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

function mealCount(row, key, legacy) { return row.attending === 'yes' ? Number(row[key] ?? (row.meal === legacy ? guestCount(row) : 0)) : 0; }

function renderAdmin(rows) {
  adminRows = rows || [];
  const attendingGuests = adminRows.reduce((sum, row) => sum + guestCount(row), 0);
  const declined = adminRows.filter((row) => row.attending === 'no').length;
  const vegetarian = adminRows.reduce((sum, row) => sum + mealCount(row, 'vegetarian_count', 'vegetarian'), 0);
  const nonVegetarian = adminRows.reduce((sum, row) => sum + mealCount(row, 'non_vegetarian_count', 'non-vegetarian'), 0);
  $('#count-attending').textContent = attendingGuests;
  $('#count-declined').textContent = declined;
  $('#count-either').textContent = adminRows.reduce((sum, row) => sum + mealCount(row, 'either_count', 'either'), 0);
  $('#count-veg').textContent = vegetarian;
  $('#count-nonveg').textContent = nonVegetarian;
  for (const side of ['mappilai', 'ponnu']) {
    $('#count-' + side).textContent = adminRows.reduce((sum, row) => sum + (row.side === side ? guestCount(row) : 0), 0);
  }
  const unspecified = adminRows.reduce((sum, row) => sum + (!['mappilai', 'ponnu'].includes(row.side) ? guestCount(row) : 0), 0);
  $('#count-unspecified').textContent = unspecified;
  $('#unspecified-side').hidden = unspecified === 0;
  $('#side-help').hidden = unspecified === 0;
  $('#guest-estimate').hidden = !adminRows.some(row => row.attending === 'yes' && row.guests === '6+');
  $('#count-total').textContent = adminRows.length;
  $('#admin-empty').textContent = adminRows.length
    ? `${adminRows.length} replies received so far. ${attendingGuests} attending guests are expected.`
    : 'No replies have been submitted yet.';
  $('#admin-rows').innerHTML = adminRows.map((row) => `
    <tr>
      <td>${escapeHtml(row.full_name)}</td>
      <td><a href="tel:${escapeHtml(row.phone)}">${escapeHtml(row.phone)}</a></td>
      <td>${escapeHtml(sideLabel(row.side))}</td>
      <td>${row.attending === 'yes' ? 'Attending' : 'Not attending'}</td>
      <td>${row.attending === 'yes' ? escapeHtml(row.guests || '1') : '—'}</td>
      <td>${mealCount(row, 'vegetarian_count', 'vegetarian')}</td><td>${mealCount(row, 'non_vegetarian_count', 'non-vegetarian')}</td><td>${mealCount(row, 'either_count', 'either')}</td>
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


// Let the browser move the focused input above its native keyboard.
// Do not collapse content or issue competing animated scrolls on focus.
function setAdminTab(tab) {
  const table = tab === 'table';
  $('#admin-summary').hidden = table;
  $('#admin-table').hidden = !table;
  $('#summary-tab').classList.toggle('is-active', !table);
  $('#table-tab').classList.toggle('is-active', table);
}

$('#reserve').onclick = () => reserve();
$('#back').onclick = () => show('side');
$('#side-back').onclick = () => show('landing');
document.querySelectorAll('[data-side]').forEach(button => {
  button.onclick = () => {
    selectedSide = button.dataset.side;
    $('#chosen-side').textContent = sideLabel(selectedSide);
    show('reservation');
  };
});
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
form.addEventListener('change', (event) => {
  if (event.target.name === 'meal_choice' && event.target.value === 'mixed') {
    $('#vegetarian_count').value = '0';
  }
  update();
});

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
    if (result.duplicate) {
      $('#thanks-title').innerHTML = 'Reply already<br><em>received.</em>';
      $('#thanks-copy').textContent = 'We already have a reply for this contact number. No second booking has been added. Please contact us if you need to change your reply.';
      $('#receipt').textContent = 'Your existing reply is unchanged.';
      show('thanks');
      return;
    }
    const yes = data.attending === 'yes';
    $('#thanks-title').innerHTML = yes ? 'You’re on<br><em>our guest list.</em>' : 'You’ll be<br><em>with us in spirit.</em>';
    $('#thanks-copy').innerHTML = yes ? 'We’ll be waiting for your arrival.<br>Thank you for being part of our beginning.' : 'Thank you for letting us know.<br>We’ll miss you and keep you close in our hearts.';
    $('#receipt').textContent = yes ? `${sideLabel(selectedSide)} · ${data.guests} ${data.guests === '1' ? 'guest' : 'guests'} · ${data.vegetarian_count} vegetarian · ${Number(data.guests)-Number(data.vegetarian_count)} non-vegetarian` : 'Your reply has been received.';
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
  if (location.pathname === '/choose-side' || location.pathname === '/reserve') {
    if (location.pathname === '/reserve' && selectedSide) show('reservation', false);
    else reserve(false);
  }
  else if (location.pathname === '/login') loadAdmin(false);
  else show('landing', false);
};

update();
getConfig().then(() => {
  if (['/reserve', '/choose-side'].includes(location.pathname)) {
    if (settings.closed) {
      show('landing', false);
      closeNotice();
    } else show('side', false);
  } else if (location.pathname === '/login') {
    loadAdmin(false);
  } else {
    show('landing', false);
  }
}).catch(() => {
  $('#page-loading').textContent = 'Unable to load this page. Please reload to try again.';
});
