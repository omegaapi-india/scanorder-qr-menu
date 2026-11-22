/* Admin dashboard — static demo data only. No fetch, no storage, no network. */
(function () {
  'use strict';

  var chartData = [
    { day: 'Mon', value: 4200 }, { day: 'Tue', value: 5100 },
    { day: 'Wed', value: 3900 }, { day: 'Thu', value: 6400 },
    { day: 'Fri', value: 7200 }, { day: 'Sat', value: 8460 },
    { day: 'Sun', value: 6100 }
  ];

  var topItems = [
    { name: 'Butter Chicken', qty: 38, revenue: 12160 },
    { name: 'Masala Dosa', qty: 31, revenue: 3720 },
    { name: 'Chicken 65', qty: 26, revenue: 5460 },
    { name: 'Biryani', qty: 22, revenue: 5720 },
    { name: 'Gulab Jamun', qty: 19, revenue: 1520 }
  ];

  var orders = [
    { id: '#SO-1042', table: '04', items: 'Butter Chicken, Garlic Naan', amount: 370, status: 'Pending' },
    { id: '#SO-1041', table: '07', items: 'Masala Dosa, Masala Chai', amount: 160, status: 'Preparing' },
    { id: '#SO-1040', table: '02', items: 'Biryani, Gulab Jamun', amount: 340, status: 'Ready' },
    { id: '#SO-1039', table: '11', items: 'Paneer Butter Masala, Naan', amount: 330, status: 'Served' },
    { id: '#SO-1038', table: '05', items: 'Veg Thali, Mango Lassi', amount: 310, status: 'Served' }
  ];

  var max = Math.max.apply(null, chartData.map(function (d) { return d.value; }));
  var chart = document.getElementById('chart');
  chartData.forEach(function (d) {
    var col = document.createElement('div');
    col.className = 'bar-col';
    var bar = document.createElement('div');
    bar.className = 'bar';
    bar.style.height = Math.round((d.value / max) * 100) + '%';
    bar.title = d.day + ': ₹' + d.value.toLocaleString('en-IN');
    var label = document.createElement('span');
    label.textContent = d.day;
    col.appendChild(bar);
    col.appendChild(label);
    chart.appendChild(col);
  });

  var topList = document.getElementById('topList');
  topItems.forEach(function (item, i) {
    var li = document.createElement('li');
    li.innerHTML = '<span class="rank">' + (i + 1) + '</span>' +
      '<span class="top-name">' + item.name + '<small>' + item.qty + ' orders</small></span>' +
      '<strong>₹' + item.revenue.toLocaleString('en-IN') + '</strong>';
    topList.appendChild(li);
  });

  var body = document.getElementById('ordersBody');
  orders.forEach(function (o) {
    var tr = document.createElement('tr');
    var statusClass = o.status.toLowerCase().replace(' ', '-');
    tr.innerHTML = '<td><strong>' + o.id + '</strong></td>' +
      '<td>' + o.table + '</td>' +
      '<td>' + o.items + '</td>' +
      '<td><strong>₹' + o.amount + '</strong></td>' +
      '<td><span class="status ' + statusClass + '">' + o.status + '</span></td>';
    body.appendChild(tr);
  });

  // Small decorative QR pattern (visual only — not a scannable QR code)
  var grid = document.getElementById('qrGrid');
  var pattern = [
    '1111111010101111111', '1000001011101000001', '1011101001011011101',
    '1011101011101011101', '1011101000101011101', '1000001010101000001',
    '1111111010101111111', '0000000011010000000', '1101011100011010110',
    '0010100111100101001', '1110111000111101110', '0101100111010110010',
    '1010011100101001011', '0001110111010011100', '1110100010111101011',
    '0011011101000110101', '1100100110111001010', '0111011010100111011',
    '1000110101111000101', '1111111010101111111', '1000001011101000001',
    '1011101001011011101', '1011101011101011101', '1011101000101011101',
    '1000001010101000001', '1111111010101111111'
  ];
  pattern.forEach(function (row) {
    var padded = (row + '0000000000000000000').slice(0, 19);
    padded.split('').forEach(function (cell) {
      var px = document.createElement('i');
      if (cell === '1') px.className = 'on';
      grid.appendChild(px);
    });
  });

  /* ---- Live online orders (token-gated, polled every 10 seconds) ---- */
  var liveStatuses = ['Pending', 'Preparing', 'Ready', 'Out for delivery', 'Delivered'];
  var adminToken = '';
  var liveTimer = null;
  var lg = {
    gate: document.getElementById('liveGate'),
    content: document.getElementById('liveContent'),
    state: document.getElementById('liveState'),
    token: document.getElementById('adminToken'),
    unlock: document.getElementById('adminUnlock'),
    demoOnly: document.getElementById('demoOnly'),
    gateHint: document.getElementById('gateHint'),
    body: document.getElementById('liveBody'),
    hint: document.getElementById('liveHint')
  };

  function liveHeaders() {
    return {
      'authorization': 'Bearer ' + adminToken,
      'content-type': 'application/json'
    };
  }

  function textCell(text) {
    var td = document.createElement('td');
    td.textContent = text || '—';
    return td;
  }

  function renderLive(orders) {
    lg.body.innerHTML = '';
    orders.forEach(function (o) {
      var tr = document.createElement('tr');
      tr.appendChild(textCell(o.id));

      var type = document.createElement('td');
      type.textContent = o.mode === 'delivery' ? '🚚 Delivery' : '🍽 Table ' + (o.table || '—');
      tr.appendChild(type);

      var customer = document.createElement('td');
      customer.textContent = [o.name, o.phone, o.address].filter(Boolean).join(' · ') || 'Guest';
      tr.appendChild(customer);

      tr.appendChild(textCell(o.driverCode || '—'));

      var items = document.createElement('td');
      items.textContent = (o.items || []).map(function (i) {
        return i.qty + '× ' + (i.name || i.id);
      }).join(', ');
      tr.appendChild(items);

      tr.appendChild(textCell('₹' + Number(o.total).toLocaleString('en-IN')));

      var statusCell = document.createElement('td');
      var select = document.createElement('select');
      select.className = 'status-select';
      select.setAttribute('aria-label', 'Status for ' + o.id);
      liveStatuses.forEach(function (s) {
        var option = document.createElement('option');
        option.value = s;
        option.textContent = s;
        option.selected = s === o.status;
        select.appendChild(option);
      });
      statusCell.appendChild(select);
      tr.appendChild(statusCell);

      var action = document.createElement('td');
      var save = document.createElement('button');
      save.type = 'button';
      save.className = 'save-btn';
      save.textContent = 'Save';
      save.addEventListener('click', async function () {
        save.disabled = true;
        save.textContent = '…';
        try {
          var response = await fetch('/api/admin/orders/' + encodeURIComponent(o.id), {
            method: 'PATCH',
            headers: liveHeaders(),
            body: JSON.stringify({ status: select.value })
          });
          if (response.status === 401) {
            showLiveGate();
            lg.gateHint.textContent = 'Token rejected. Try again.';
            return;
          }
          var data = await response.json();
          if (!response.ok) throw new Error(data.error || 'Update failed.');
          await refreshLive();
        } catch (err) {
          lg.hint.textContent = err.message || 'Update failed.';
        } finally {
          save.disabled = false;
          save.textContent = 'Save';
        }
      });
      action.appendChild(save);
      tr.appendChild(action);
      lg.body.appendChild(tr);
    });
  }

  async function refreshLive() {
    try {
      var response = await fetch('/api/admin/orders', {
        headers: liveHeaders(),
        cache: 'no-store'
      });
      if (response.status === 401) {
        showLiveGate();
        return;
      }
      var data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Request failed.');
      renderLive(data.orders || []);
      lg.content.hidden = false;
      lg.hint.textContent = data.count
        ? data.count + ' order(s) on record. All records expire automatically after 24 hours.'
        : 'No online orders yet. New orders appear here within 10 seconds.';
    } catch (err) {
      lg.hint.textContent = 'API unavailable on this host. Static-only hosting accepts orders by email and Telegram; online ordering needs Cloudflare Pages Functions.';
    }
  }

  function showLiveGate() {
    clearInterval(liveTimer);
    liveTimer = null;
    lg.gate.hidden = false;
    lg.content.hidden = true;
    lg.state.textContent = 'Locked';
  }

  lg.unlock.addEventListener('click', async function () {
    adminToken = lg.token.value.trim();
    if (!adminToken) {
      lg.gateHint.textContent = 'Enter the admin token first.';
      return;
    }
    lg.gateHint.textContent = '';
    lg.unlock.disabled = true;
    lg.unlock.textContent = 'Checking…';
    await refreshLive();
    lg.unlock.disabled = false;
    lg.unlock.textContent = 'Unlock live orders';
    if (lg.content.hidden) return;
    lg.gate.hidden = true;
    lg.state.textContent = 'Live';
    liveTimer = setInterval(refreshLive, 10000);
  });

  lg.token.addEventListener('keydown', function (e) {
    if (e.key === 'Enter') lg.unlock.click();
  });

  lg.demoOnly.addEventListener('click', function () {
    clearInterval(liveTimer);
    liveTimer = null;
    adminToken = '';
    lg.token.value = '';
    lg.gate.hidden = true;
    lg.content.hidden = true;
    lg.state.textContent = 'Demo';
  });
})();
