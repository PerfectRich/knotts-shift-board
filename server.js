const express = require('express');
const { Pool } = require('pg');

const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
const ADMIN_KEY = process.env.ADMIN_KEY || 'rich';

const EMPLOYEES = [
  { id: 'adam', name: 'Adam', admin: false },
  { id: 'angel', name: 'Angel', admin: false },
  { id: 'johnathan', name: 'Johnathan', admin: false },
  { id: 'marvin', name: 'Marvin', admin: false },
  { id: 'rich', name: 'Rich', admin: true },
  { id: 'ricky', name: 'Ricky', admin: false },
  { id: 'sir-j', name: 'Sir J', admin: false },
];

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
    <script>
      document.querySelectorAll('button.emp').forEach(btn => {
        btn.addEventListener('click', async () => {
          const id = btn.dataset.id;
          let drawerTotal = null;
          if (btn.classList.contains('in')) {
            const v = prompt('Drawer total for this shift ($) - leave blank to skip:');
            if (v !== null && v.trim() !== '') drawerTotal = parseFloat(v);
          }
          const res = await fetch('/api/clock', {
            method: 'POST',
            headers: {'content-type':'application/json'},
            body: JSON.stringify({ employeeId: id, drawerTotal })
          });
          const data = await res.json();
          document.getElementById('msg').textContent = data.message || '';
          setTimeout(() => location.reload(), 700);
        });
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
  const { employeeId, drawerTotal } = req.body || {};
  const emp = EMPLOYEES.find(e => e.id === employeeId);
  if (!emp) return res.status(400).json({ message: 'Unknown employee.' });

  const open = await pool.query(
    `SELECT id FROM time_entries WHERE employee_id=$1 AND clock_out IS NULL ORDER BY clock_in DESC LIMIT 1;`,
    [employeeId]
  );

  if (open.rows.length) {
    await pool.query(
      `UPDATE time_entries SET clock_out=now(), drawer_total=$2 WHERE id=$1;`,
      [open.rows[0].id, drawerTotal]
    );
    return res.json({ message: `${emp.name} clocked out.` });
  } else {
    await pool.query(
      `INSERT INTO time_entries (employee_id, clock_in) VALUES ($1, now());`,
      [employeeId]
    );
    return res.json({ message: `${emp.name} clocked in.` });
  }
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
