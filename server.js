const express = require('express');
const { Pool } = require('pg');
const nodemailer = require('nodemailer');

const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
const ADMIN_KEY = process.env.ADMIN_KEY || 'rich';
const CRON_KEY = process.env.CRON_KEY || 'rich-cron';
const NOTIFY_TO = process.env.NOTIFY_TO || 'calicowoodsigns@gmail.com';
const TZ = 'America/Los_Angeles';

const EMPLOYEES = [
  { id: 'adam', name: 'Adam', admin: false },
  { id: 'angel', name: 'Angel', admin: false },
  { id: 'johnathan', name: 'Johnathan', admin: false },
  { id: 'marvin', name: 'Marvin', admin: false },
  { id: 'rich', name: 'Rich', admin: true },
  { id: 'ricky', name: 'Ricky', admin: false },
  { id: 'sir-j', name: 'Sir J', admin: false },
];

let mailer = null;
if (process.env.GMAIL_USER && process.env.GMAIL_APP_PASSWORD) {
  mailer = nodemailer.createTransport({
    service: 'gmail',
    auth: { user: process.env.GMAIL_USER, pass: process.env.GMAIL_APP_PASSWORD },
  });
}

async function sendMail(subject, text) {
  if (!mailer) {
    console.log('[email skipped, not configured]', subject, '|', text);
    return;
  }
  try {
    await mailer.sendMail({ from: process.env.GMAIL_USER, to: NOTIFY_TO, subject, text });
  } catch (err) {
    console.error('Email send failed:', err.message);
  }
}

async function init() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS employees (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      admin BOOLEAN NOT NULL DEFAULT false
    );
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS time_entries (
      id SERIAL PRIMARY KEY,
      employee_id TEXT NOT NULL REFERENCES employees(id),
      clock_in TIMESTAMPTZ NOT NULL,
      clock_out TIMESTAMPTZ,
      drawer_total NUMERIC,
      notes TEXT
    );
  `);
  await pool.query(`ALTER TABLE employees ADD COLUMN IF NOT EXISTS pin TEXT NOT NULL DEFAULT '1111';`);
  await pool.query(`ALTER TABLE employees ADD COLUMN IF NOT EXISTS pin_is_temp BOOLEAN NOT NULL DEFAULT true;`);
  for (const e of EMPLOYEES) {
    await pool.query(
      `INSERT INTO employees (id, name, admin) VALUES ($1,$2,$3)
       ON CONFLICT (id) DO NOTHING;`,
      [e.id, e.name, e.admin]
    );
  }
}

const app = express();
app.use(express.json());

const PAGE_STYLE = `
  @import url('https://fonts.googleapis.com/css2?family=Sancreek&family=Zilla+Slab:wght@400;600;700&display=swap');
  *{box-sizing:border-box;}
  body{
    margin:0;min-height:100vh;
    background:#241408;
    font-family:'Zilla Slab',Georgia,serif;
    color:#f3e6c9;
    display:flex;align-items:center;justify-content:center;
    padding:2rem;
  }
  h1{font-family:'Sancreek',serif;font-weight:400;font-size:2.1rem;margin:0 0 .2rem;letter-spacing:.02em;text-align:center;}
  .sub{text-align:center;color:#cf9a5c;font-size:.85rem;letter-spacing:.06em;text-transform:uppercase;margin-bottom:1.6rem;}
  .board{
    background:#6b4226;
    border:6px solid #5a2116;
    border-radius:10px;
    padding:2rem 1.8rem;
    box-shadow:0 25px 50px -20px rgba(0,0,0,.6);
    width:100%;max-width:480px;
    position:relative;
  }
  .board::before,.board::after{
    content:'';position:absolute;top:14px;width:14px;height:14px;border-radius:50%;
    background:radial-gradient(circle at 35% 35%, #e7c290, #8a5a2e 70%);
  }
  .board::before{left:14px;}
  .board::after{right:14px;}
  .grid{display:grid;grid-template-columns:1fr 1fr;gap:.9rem;}
  button.emp{
    font-family:'Zilla Slab',serif;font-weight:700;font-size:1.05rem;
    background:#3b2415;color:#f3e6c9;
    border:2px solid #cf9a5c;border-radius:6px;
    padding:.9rem;cursor:pointer;
    box-shadow:0 6px 14px -8px rgba(0,0,0,.7);
    transition:background .15s;
  }
  button.emp:hover{background:#4a2e1a;}
  button.emp.in{background:#2f5233;border-color:#8fbf93;}
  button.emp .status{display:block;font-size:.68rem;letter-spacing:.08em;text-transform:uppercase;margin-top:.3rem;color:#cf9a5c;}
  button.emp.in .status{color:#a9d9ae;}
  .msg{text-align:center;margin-top:1.2rem;font-size:.9rem;min-height:1.2em;color:#e7c290;}
  a.admin-link{display:block;text-align:center;margin-top:1.6rem;color:#cf9a5c;font-size:.8rem;text-decoration:none;letter-spacing:.06em;text-transform:uppercase;}
  table{width:100%;border-collapse:collapse;margin-top:1rem;font-size:.9rem;}
  th,td{border-bottom:1px solid rgba(207,154,92,.3);padding:.5rem .6rem;text-align:left;}
  th{color:#cf9a5c;font-size:.72rem;letter-spacing:.08em;text-transform:uppercase;}
  .wrap{max-width:820px;width:100%;}
  input{font-family:'Zilla Slab',serif;padding:.5rem;border-radius:4px;border:1px solid #cf9a5c;background:#1a1109;color:#f3e6c9;}

  .overlay{position:fixed;inset:0;background:rgba(15,8,4,.75);display:flex;align-items:center;justify-content:center;z-index:50;padding:1rem;}
  .pinbox{background:#3b2415;border:4px solid #cf9a5c;border-radius:10px;padding:1.6rem 1.4rem;width:100%;max-width:340px;text-align:center;}
  .pinbox h2{font-family:'Sancreek',serif;font-weight:400;margin:0 0 .2rem;font-size:1.4rem;color:#f3e6c9;}
  .pinSub{color:#cf9a5c;font-size:.8rem;margin:0 0 1rem;}
  .dots{font-size:1.6rem;letter-spacing:.3rem;min-height:2rem;margin-bottom:1rem;color:#f3e6c9;}
  .dots.drawerDisplay{font-family:'Zilla Slab',serif;font-size:1.8rem;letter-spacing:normal;}
  .keypad{display:grid;grid-template-columns:repeat(3,1fr);gap:.5rem;margin-bottom:1rem;}
  .keypad button{font-size:1.2rem;padding:.7rem 0;border-radius:6px;border:1px solid #cf9a5c;background:#2a1810;color:#f3e6c9;cursor:pointer;}
  .keypad button:active{background:#4a2e1a;}
  .pinActions{display:flex;gap:.5rem;justify-content:center;margin-bottom:.6rem;}
  .pinActions button{flex:1;padding:.6rem 0;border-radius:6px;border:1px solid #cf9a5c;background:#2f5233;color:#f3e6c9;font-weight:700;cursor:pointer;}
  .pinActions #cancelBtn{background:#5a2116;}
  .pinActions #skipBtn{background:#6b4226;}
  .pinErr{color:#e07a5f;font-size:.78rem;min-height:1.2em;}
`;

function boardPage(statusByEmp) {
  const buttons = EMPLOYEES.map((e) => {
    const st = statusByEmp[e.id];
    const isIn = !!(st && st.clock_in && !st.clock_out);
    return `<button class="emp${isIn ? ' in' : ''}" data-id="${e.id}">${e.name}<span class="status">${isIn ? 'Clocked in' : 'Clocked out'}</span></button>`;
  }).join('');

  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Knott's Shift Board</title><style>${PAGE_STYLE}</style></head>
  <body>
    <div>
      <h1>Knott's Shift Board</h1>
      <p class="sub">Calico Wood Signs &middot; select your name</p>
      <div class="board">
        <div class="grid">${buttons}</div>
        <p class="msg" id="msg">&nbsp;</p>
      </div>
      <a class="admin-link" href="/admin">Admin summary &rarr;</a>
    </div>

    <div class="overlay" id="overlay" hidden>
      <div class="pinbox">
        <h2 id="pinTitle">Enter PIN</h2>
        <p class="pinSub" id="pinSub"></p>
        <div class="dots" id="dots">&nbsp;</div>
        <div class="keypad" id="keypad">
          <button data-k="1" type="button">1</button><button data-k="2" type="button">2</button><button data-k="3" type="button">3</button>
          <button data-k="4" type="button">4</button><button data-k="5" type="button">5</button><button data-k="6" type="button">6</button>
          <button data-k="7" type="button">7</button><button data-k="8" type="button">8</button><button data-k="9" type="button">9</button>
          <button data-k="." id="dotKey" type="button">.</button><button data-k="0" type="button">0</button><button data-k="back" type="button">&larr;</button>
        </div>
        <div class="pinActions">
          <button id="skipBtn" type="button" hidden>Skip</button>
          <button id="cancelBtn" type="button">Cancel</button>
          <button id="enterBtn" type="button">Enter</button>
        </div>
        <p class="pinErr" id="pinErr">&nbsp;</p>
      </div>
    </div>

    <script>
      const EMP_NAMES = ${JSON.stringify(Object.fromEntries(EMPLOYEES.map(e => [e.id, e.name])))};
      let state = null;
      const overlay = document.getElementById('overlay');
      const dotsEl = document.getElementById('dots');
      const pinTitle = document.getElementById('pinTitle');
      const pinSub = document.getElementById('pinSub');
      const pinErr = document.getElementById('pinErr');
      const skipBtn = document.getElementById('skipBtn');
      const dotKey = document.getElementById('dotKey');

      function renderBuffer() {
        if (!state) return;
        if (state.stage === 'drawer') {
          dotsEl.classList.add('drawerDisplay');
          dotsEl.textContent = state.buffer ? ('$' + state.buffer) : '$0';
        } else {
          dotsEl.classList.remove('drawerDisplay');
          dotsEl.textContent = state.buffer.split('').map(() => '●').join(' ') || ' ';
        }
      }

      function openPin(employeeId, stage) {
        state = { employeeId, stage, buffer: '', newPin: '', verifiedPin: null };
        pinErr.textContent = ' ';
        skipBtn.hidden = true;
        dotKey.style.visibility = 'hidden';
        if (stage === 'verify') {
          pinTitle.textContent = EMP_NAMES[employeeId];
          pinSub.textContent = 'Enter your PIN';
        }
        renderBuffer();
        overlay.hidden = false;
      }

      function closeOverlay() {
        overlay.hidden = true;
        state = null;
      }

      document.getElementById('keypad').addEventListener('click', (e) => {
        const btn = e.target.closest('button[data-k]');
        if (!btn || !state) return;
        const k = btn.dataset.k;
        if (k === 'back') {
          state.buffer = state.buffer.slice(0, -1);
        } else if (k === '.') {
          if (state.stage === 'drawer' && !state.buffer.includes('.')) state.buffer += '.';
        } else {
          if (state.stage !== 'drawer' && state.buffer.length >= 8) return;
          state.buffer += k;
        }
        renderBuffer();
      });

      document.getElementById('cancelBtn').addEventListener('click', closeOverlay);

      skipBtn.addEventListener('click', () => {
        submitClock(state.employeeId, state.verifiedPin, null);
      });

      document.getElementById('enterBtn').addEventListener('click', async () => {
        if (!state) return;
        if (state.stage === 'verify') {
          if (state.buffer.length < 4) { pinErr.textContent = 'Enter at least 4 digits.'; return; }
          await submitClock(state.employeeId, state.buffer, undefined);
        } else if (state.stage === 'newpin') {
          if (state.buffer.length < 4) { pinErr.textContent = 'At least 4 digits.'; return; }
          if (state.buffer === '1111') { pinErr.textContent = 'Pick a different PIN.'; return; }
          state.newPin = state.buffer;
          state.buffer = '';
          state.stage = 'confirmpin';
          pinTitle.textContent = 'Confirm your PIN';
          pinSub.textContent = 'Enter it again';
          pinErr.textContent = ' ';
          renderBuffer();
        } else if (state.stage === 'confirmpin') {
          if (state.buffer !== state.newPin) {
            pinErr.textContent = 'Did not match — try again.';
            state.buffer = '';
            state.stage = 'newpin';
            pinTitle.textContent = 'Set your PIN';
            pinSub.textContent = 'Choose a PIN (4+ digits), not 1111';
            renderBuffer();
            return;
          }
          const employeeId = state.employeeId;
          const newPin = state.newPin;
          const res = await fetch('/api/set-pin', {
            method: 'POST', headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ employeeId, currentPin: '1111', newPin })
          });
          const data = await res.json();
          if (!res.ok) { pinErr.textContent = data.message || 'Could not set PIN.'; return; }
          state.stage = 'verify';
          state.buffer = '';
          await submitClock(employeeId, newPin, undefined);
        } else if (state.stage === 'drawer') {
          const val = state.buffer.trim();
          const drawerTotal = val === '' ? null : parseFloat(val);
          await submitClock(state.employeeId, state.verifiedPin, drawerTotal);
        }
      });

      async function submitClock(employeeId, pin, drawerTotal) {
        const body = { employeeId, pin };
        if (drawerTotal !== undefined) body.drawerTotal = drawerTotal;
        const res = await fetch('/api/clock', {
          method: 'POST', headers: { 'content-type': 'application/json' },
          body: JSON.stringify(body)
        });
        const data = await res.json();
        if (res.status === 409 && data.needsSetup) {
          state.stage = 'newpin';
          state.buffer = '';
          pinTitle.textContent = 'Set your PIN';
          pinSub.textContent = 'Choose a PIN (4+ digits), not 1111';
          pinErr.textContent = ' ';
          renderBuffer();
          return;
        }
        if (res.status === 409 && data.needsDrawer) {
          state.stage = 'drawer';
          state.verifiedPin = pin;
          state.buffer = '';
          pinTitle.textContent = EMP_NAMES[employeeId];
          pinSub.textContent = 'Drawer total ($) - optional';
          skipBtn.hidden = false;
          dotKey.style.visibility = 'visible';
          pinErr.textContent = ' ';
          renderBuffer();
          return;
        }
        if (!res.ok) {
          pinErr.textContent = data.message || 'Something went wrong.';
          state.buffer = '';
          renderBuffer();
          return;
        }
        document.getElementById('msg').textContent = data.message || '';
        closeOverlay();
        setTimeout(() => location.reload(), 700);
      }

      document.querySelectorAll('button.emp').forEach(btn => {
        btn.addEventListener('click', () => openPin(btn.dataset.id, 'verify'));
      });
    </script>
  </body></html>`;
}

app.get('/', async (req, res) => {
  const { rows } = await pool.query(`
    SELECT DISTINCT ON (employee_id) employee_id, clock_in, clock_out
    FROM time_entries ORDER BY employee_id, clock_in DESC;
  `);
  const statusByEmp = {};
  rows.forEach(r => { statusByEmp[r.employee_id] = r; });
  res.send(boardPage(statusByEmp));
});

app.post('/api/clock', async (req, res) => {
  const { employeeId, pin } = req.body || {};
  const hasDrawerField = req.body && Object.prototype.hasOwnProperty.call(req.body, 'drawerTotal');
  const drawerTotal = hasDrawerField ? req.body.drawerTotal : undefined;

  const empRes = await pool.query(`SELECT * FROM employees WHERE id=$1;`, [employeeId]);
  const emp = empRes.rows[0];
  if (!emp) return res.status(404).json({ message: 'Unknown employee.' });

  if (typeof pin !== 'string' || pin !== emp.pin) {
    return res.status(401).json({ message: 'Incorrect PIN.' });
  }

  if (emp.pin_is_temp) {
    return res.status(409).json({ needsSetup: true, message: 'First time in — set your own PIN.' });
  }

  const open = await pool.query(
    `SELECT id FROM time_entries WHERE employee_id=$1 AND clock_out IS NULL ORDER BY clock_in DESC LIMIT 1;`,
    [employeeId]
  );

  if (open.rows.length) {
    if (!hasDrawerField) {
      return res.status(409).json({ needsDrawer: true });
    }
    await pool.query(
      `UPDATE time_entries SET clock_out=now(), drawer_total=$2 WHERE id=$1;`,
      [open.rows[0].id, drawerTotal]
    );
    const when = new Date().toLocaleString('en-US', { timeZone: TZ });
    const totalText = (drawerTotal === null || drawerTotal === undefined || Number.isNaN(drawerTotal))
      ? 'not entered' : ('$' + Number(drawerTotal).toFixed(2));
    sendMail(
      `Shift Board: ${emp.name} clocked out`,
      `${emp.name} clocked out at ${when}.\nDrawer total: ${totalText}`
    );
    return res.json({ message: `${emp.name} clocked out.` });
  } else {
    await pool.query(
      `INSERT INTO time_entries (employee_id, clock_in) VALUES ($1, now());`,
      [employeeId]
    );
    const when = new Date().toLocaleString('en-US', { timeZone: TZ });
    sendMail(`Shift Board: ${emp.name} clocked in`, `${emp.name} clocked in at ${when}.`);
    return res.json({ message: `${emp.name} clocked in.` });
  }
});

app.post('/api/set-pin', async (req, res) => {
  const { employeeId, currentPin, newPin } = req.body || {};
  const empRes = await pool.query(`SELECT * FROM employees WHERE id=$1;`, [employeeId]);
  const emp = empRes.rows[0];
  if (!emp) return res.status(404).json({ message: 'Unknown employee.' });
  if (typeof currentPin !== 'string' || currentPin !== emp.pin) {
    return res.status(401).json({ message: 'Current PIN incorrect.' });
  }
  if (typeof newPin !== 'string' || !/^\d{4,}$/.test(newPin)) {
    return res.status(400).json({ message: 'PIN must be at least 4 digits.' });
  }
  if (newPin === '1111') {
    return res.status(400).json({ message: 'Choose a PIN other than 1111.' });
  }
  await pool.query(`UPDATE employees SET pin=$2, pin_is_temp=false WHERE id=$1;`, [employeeId, newPin]);
  const when = new Date().toLocaleString('en-US', { timeZone: TZ });
  sendMail(`Shift Board: ${emp.name} set a new PIN`, `${emp.name} set a new personal PIN at ${when}.`);
  res.json({ ok: true });
});

app.get('/api/daily-summary', async (req, res) => {
  if (req.query.key !== CRON_KEY) return res.status(401).send('Unauthorized');

  const { rows } = await pool.query(`
    SELECT e.name, t.clock_in, t.clock_out, t.drawer_total
    FROM time_entries t JOIN employees e ON e.id = t.employee_id
    WHERE (t.clock_in AT TIME ZONE '${TZ}')::date = (now() AT TIME ZONE '${TZ}')::date
    ORDER BY e.name, t.clock_in;
  `);

  if (!rows.length) {
    await sendMail(`Shift Board: no shifts today`, `No one clocked in today.`);
    return res.json({ ok: true, entries: 0 });
  }

  const byEmp = {};
  for (const r of rows) {
    if (!byEmp[r.name]) byEmp[r.name] = { hours: 0, drawer: 0, shifts: [] };
    const start = new Date(r.clock_in);
    const end = r.clock_out ? new Date(r.clock_out) : new Date();
    const hrs = (end - start) / 3600000;
    byEmp[r.name].hours += hrs;
    if (r.drawer_total != null) byEmp[r.name].drawer += Number(r.drawer_total);
    byEmp[r.name].shifts.push(
      `${start.toLocaleTimeString('en-US', { timeZone: TZ })} - ${r.clock_out ? end.toLocaleTimeString('en-US', { timeZone: TZ }) : 'still in'}`
    );
  }

  let totalHours = 0, totalDrawer = 0;
  const lines = Object.entries(byEmp).map(([name, d]) => {
    totalHours += d.hours;
    totalDrawer += d.drawer;
    return `${name}: ${d.hours.toFixed(2)} hrs, drawer $${d.drawer.toFixed(2)} (${d.shifts.join('; ')})`;
  });

  const dateStr = new Date().toLocaleDateString('en-US', { timeZone: TZ });
  const body = `Shift Board Daily Summary — ${dateStr}\n\n${lines.join('\n')}\n\nTotal hours: ${totalHours.toFixed(2)}\nTotal drawer: $${totalDrawer.toFixed(2)}`;
  await sendMail(`Shift Board: Daily Summary — ${dateStr}`, body);
  res.json({ ok: true, entries: rows.length });
});

app.get('/admin', async (req, res) => {
  if (req.query.key !== ADMIN_KEY) {
    return res.send(`<!doctype html><html><head><style>${PAGE_STYLE}</style></head><body>
      <div class="board"><h1 style="font-size:1.4rem;">Admin key required</h1>
      <form method="get"><input name="key" placeholder="Admin key" style="width:100%;margin-top:1rem;"><button class="emp" style="width:100%;margin-top:1rem;" type="submit">Enter</button></form>
      </div></body></html>`);
  }
  const { rows } = await pool.query(`
    SELECT t.id, e.name, t.clock_in, t.clock_out, t.drawer_total,
      ROUND(EXTRACT(EPOCH FROM (COALESCE(t.clock_out, now()) - t.clock_in))/3600.0, 2) AS hours
    FROM time_entries t JOIN employees e ON e.id = t.employee_id
    ORDER BY t.clock_in DESC LIMIT 100;
  `);
  const entryRows = rows.map(r => `<tr>
    <td>${r.name}</td>
    <td>${new Date(r.clock_in).toLocaleString()}</td>
    <td>${r.clock_out ? new Date(r.clock_out).toLocaleString() : '<em>— still in —</em>'}</td>
    <td>${r.hours}</td>
    <td>${r.drawer_total != null ? '$' + Number(r.drawer_total).toFixed(2) : ''}</td>
  </tr>`).join('');

  res.send(`<!doctype html><html><head><meta charset="utf-8"><style>${PAGE_STYLE}</style>
    <title>Shift Board Admin</title></head><body><div class="wrap">
    <h1 style="text-align:left;">Shift Board — Admin</h1>
    <table><thead><tr><th>Employee</th><th>Clock In</th><th>Clock Out</th><th>Hours</th><th>Drawer</th></tr></thead>
    <tbody>${entryRows || '<tr><td colspan="5">No entries yet.</td></tr>'}</tbody></table>
    <a class="admin-link" href="/">&larr; Back to board</a>
    </div></body></html>`);
});

const PORT = process.env.PORT || 3000;
init().then(() => {
  app.listen(PORT, () => console.log('Shift board running on', PORT));
}).catch(err => {
  console.error('Failed to init DB', err);
  process.exit(1);
});
