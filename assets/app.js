/* ScanOrder — customer menu, cart, online ordering. No framework. */
(function () {
  'use strict';

  var config = window.SCANORDER_CONFIG;
  var menu = window.SCANORDER_MENU || [];
  var cart = Object.create(null); // { itemId: qty } — held in memory only
  var activeCategory = 'All';
  var mode = 'table';
  var lastPlacedId = '';

  var el = {
    categories: document.getElementById('categories'),
    menu: document.getElementById('menu'),
    tablePill: document.getElementById('tablePill'),
    cartBar: document.getElementById('cartBar'),
    cartCount: document.getElementById('cartCount'),
    cartTotal: document.getElementById('cartTotal'),
    cartItemsLabel: document.getElementById('cartItemsLabel'),
    cartSummary: document.getElementById('cartSummary'),
    cartOpen: document.getElementById('cartOpen'),
    cartClose: document.getElementById('cartClose'),
    cartBackdrop: document.getElementById('cartBackdrop'),
    cartSheet: document.getElementById('cartSheet'),
    cartBody: document.getElementById('cartBody'),
    sheetTotal: document.getElementById('sheetTotal'),
    emailOrderBtn: document.getElementById('emailOrderBtn'),
    telegramBtn: document.getElementById('telegramBtn'),
    clearCart: document.getElementById('clearCart'),
    customerName: document.getElementById('customerName'),
    customerPhone: document.getElementById('customerPhone'),
    customerAddress: document.getElementById('customerAddress'),
    orderNote: document.getElementById('orderNote'),
    deliveryFields: document.getElementById('deliveryFields'),
    placeOnline: document.getElementById('placeOnline'),
    orderError: document.getElementById('orderError'),
    successView: document.getElementById('successView'),
    placedId: document.getElementById('placedId'),
    placedEta: document.getElementById('placedEta'),
    trackBtn: document.getElementById('trackBtn'),
    copyTrackLink: document.getElementById('copyTrackLink'),
    newOrder: document.getElementById('newOrder'),
    toast: document.getElementById('toast')
  };

  function money(value) {
    return config.currency + value.toLocaleString('en-IN');
  }

  // Only allow safe characters from the URL to prevent injection.
  function getTable() {
    try {
      var value = new URLSearchParams(window.location.search).get('table') || config.defaultTable;
      return /^[A-Za-z0-9_-]{1,8}$/.test(value) ? value.toUpperCase() : config.defaultTable;
    } catch (err) {
      return config.defaultTable;
    }
  }

  var table = getTable();
  el.tablePill.textContent = 'Table ' + table;

  function categories() {
    var list = ['All'];
    menu.forEach(function (item) {
      if (list.indexOf(item.category) === -1) list.push(item.category);
    });
    return list;
  }

  function renderCategories() {
    el.categories.innerHTML = '';
    categories().forEach(function (cat) {
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'chip' + (cat === activeCategory ? ' is-active' : '');
      btn.textContent = cat;
      btn.addEventListener('click', function () {
        activeCategory = cat;
        renderCategories();
        renderMenu();
      });
      el.categories.appendChild(btn);
    });
  }

  function renderMenu() {
    el.menu.innerHTML = '';
    var visible = menu.filter(function (item) {
      return activeCategory === 'All' || item.category === activeCategory;
    });

    visible.forEach(function (item) {
      var card = document.createElement('article');
      card.className = 'card';

      var art = document.createElement('div');
      art.className = 'card-art';
      art.setAttribute('aria-hidden', 'true');
      art.textContent = item.emoji;

      var body = document.createElement('div');
      body.className = 'card-body';

      var top = document.createElement('div');
      top.className = 'card-top';
      var title = document.createElement('h3');
      title.textContent = item.name;
      top.appendChild(title);
      if (item.popular) {
        var pop = document.createElement('span');
        pop.className = 'pop';
        pop.textContent = 'Popular';
        top.appendChild(pop);
      }

      var desc = document.createElement('p');
      desc.className = 'card-desc';
      desc.textContent = item.desc;

      var meta = document.createElement('div');
      meta.className = 'card-meta';
      var price = document.createElement('strong');
      price.className = 'price';
      price.textContent = money(item.price);
      var dot = document.createElement('span');
      dot.className = 'food-dot ' + (item.veg ? 'veg' : 'nonveg');
      dot.setAttribute('role', 'img');
      dot.setAttribute('aria-label', item.veg ? 'Vegetarian' : 'Non vegetarian');
      var tag = document.createElement('span');
      tag.className = 'cat-tag';
      tag.textContent = item.category;
      meta.appendChild(price);
      meta.appendChild(dot);
      meta.appendChild(tag);

      var add = document.createElement('button');
      add.type = 'button';
      add.className = 'add-btn';
      add.textContent = 'Add +';
      add.setAttribute('aria-label', 'Add ' + item.name + ' to cart');
      add.addEventListener('click', function () {
        cart[item.id] = (cart[item.id] || 0) + 1;
        sync();
        flash('Added: ' + item.name);
      });

      body.appendChild(top);
      body.appendChild(desc);
      body.appendChild(meta);
      body.appendChild(add);
      card.appendChild(art);
      card.appendChild(body);
      el.menu.appendChild(card);
    });
  }

  function cartLines() {
    return Object.keys(cart)
      .map(function (id) {
        var item = menu.find(function (m) { return m.id === id; });
        return item ? { item: item, qty: cart[id] } : null;
      })
      .filter(Boolean);
  }

  function totals() {
    var lines = cartLines();
    var count = 0;
    var amount = 0;
    lines.forEach(function (line) {
      count += line.qty;
      amount += line.qty * line.item.price;
    });
    return { lines: lines, count: count, amount: amount };
  }

  function showError(message) {
    el.orderError.textContent = message || '';
    el.orderError.hidden = !message;
  }

  function sync() {
    var t = totals();
    el.cartCount.textContent = String(t.count);
    el.cartTotal.textContent = money(t.amount);
    el.sheetTotal.textContent = money(t.amount);
    el.cartItemsLabel.textContent = t.count === 0 ? 'Cart is empty' : t.count + ' item' + (t.count > 1 ? 's' : '');
    el.cartBar.hidden = t.count === 0;
    renderCartBody(t.lines);

    if (t.count === 0) {
      el.emailOrderBtn.setAttribute('aria-disabled', 'true');
      el.emailOrderBtn.href = 'mailto:' + config.contactEmail;
      el.emailOrderBtn.classList.add('is-disabled');
      el.placeOnline.disabled = true;
      el.placeOnline.classList.add('is-disabled');
    } else {
      el.emailOrderBtn.setAttribute('aria-disabled', 'false');
      el.emailOrderBtn.classList.remove('is-disabled');
      el.emailOrderBtn.href = buildEmailLink(t);
      el.placeOnline.disabled = false;
      el.placeOnline.classList.remove('is-disabled');
    }
    el.telegramBtn.href = config.telegramUrl;
  }

  function renderCartBody(lines) {
    el.cartBody.innerHTML = '';
    if (lines.length === 0) {
      var empty = document.createElement('div');
      empty.className = 'empty';
      empty.innerHTML = '<div class="empty-icon" aria-hidden="true">🛒</div><p>Your cart is empty.</p><small>Add something from the menu above.</small>';
      el.cartBody.appendChild(empty);
      return;
    }

    lines.forEach(function (line) {
      var row = document.createElement('div');
      row.className = 'cart-row';

      var emoji = document.createElement('div');
      emoji.className = 'cart-emoji';
      emoji.setAttribute('aria-hidden', 'true');
      emoji.textContent = line.item.emoji;

      var info = document.createElement('div');
      info.className = 'cart-info';
      var name = document.createElement('strong');
      name.textContent = line.item.name;
      var sub = document.createElement('small');
      sub.textContent = money(line.item.price) + ' each';
      info.appendChild(name);
      info.appendChild(sub);

      var qty = document.createElement('div');
      qty.className = 'qty';
      var minus = document.createElement('button');
      minus.type = 'button';
      minus.textContent = '−';
      minus.setAttribute('aria-label', 'Decrease quantity of ' + line.item.name);
      minus.addEventListener('click', function () {
        cart[line.item.id] -= 1;
        if (cart[line.item.id] <= 0) delete cart[line.item.id];
        sync();
      });
      var num = document.createElement('span');
      num.textContent = String(line.qty);
      var plus = document.createElement('button');
      plus.type = 'button';
      plus.textContent = '+';
      plus.setAttribute('aria-label', 'Increase quantity of ' + line.item.name);
      plus.addEventListener('click', function () {
        cart[line.item.id] += 1;
        sync();
      });
      qty.appendChild(minus);
      qty.appendChild(num);
      qty.appendChild(plus);

      row.appendChild(emoji);
      row.appendChild(info);
      row.appendChild(qty);
      el.cartBody.appendChild(row);
    });
  }

  function buildEmailLink(t) {
    var lines = t.lines.map(function (line) {
      return '• ' + line.qty + ' x ' + line.item.name + ' = ' + money(line.qty * line.item.price);
    });

    var message = [
      'Hello! Here is my order:',
      '',
      'Restaurant: ' + config.businessName
    ];
    if (mode === 'delivery') {
      message.push('Order type: Home delivery');
      if (el.customerPhone.value.trim()) message.push('Phone: ' + el.customerPhone.value.trim());
      if (el.customerAddress.value.trim()) message.push('Address: ' + el.customerAddress.value.trim());
    } else {
      message.push('Table: ' + table);
    }
    message.push('');

    lines.forEach(function (line) { message.push(line); });

    var name = el.customerName.value.trim();
    var note = el.orderNote.value.trim();
    if (name) message.push('', 'Name: ' + name);
    if (note) message.push('Note: ' + note);
    message.push('', 'Total: ' + money(t.amount), 'Thank you!');

    var subject = 'Order request - ' + config.businessName + ' - ' + money(t.amount);
    return 'mailto:' + config.contactEmail +
      '?subject=' + encodeURIComponent(subject) +
      '&body=' + encodeURIComponent(message.join('\n'));
  }

  function validateForOnline(t) {
    if (t.count === 0) return 'Your cart is empty.';
    if (mode === 'delivery') {
      if (!/^\+?[0-9]{7,15}$/.test(el.customerPhone.value.trim())) return 'Enter a valid phone number for delivery.';
      if (el.customerAddress.value.trim().length < 6) return 'Enter a full delivery address.';
    }
    return '';
  }

  async function placeOnline() {
    var t = totals();
    var problem = validateForOnline(t);
    if (problem) { showError(problem); return; }

    showError('');
    el.placeOnline.disabled = true;
    el.placeOnline.textContent = 'Placing order…';

    var payload = {
      mode: mode,
      table: table,
      name: el.customerName.value.trim(),
      phone: el.customerPhone.value.trim(),
      address: el.customerAddress.value.trim(),
      note: el.orderNote.value.trim(),
      items: t.lines.map(function (line) { return { id: line.item.id, qty: line.qty }; })
    };

    try {
      var response = await fetch('/api/orders', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload)
      });
      var data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Could not place the order.');
      showSuccess(data);
    } catch (err) {
      showError((err && err.message ? err.message : 'Network error.') + ' You can still email the order or message us on Telegram.');
    } finally {
      el.placeOnline.disabled = false;
      el.placeOnline.textContent = 'Place order online';
    }
  }

  function showSuccess(data) {
    lastPlacedId = data.id;
    el.placedId.textContent = data.id;
    el.placedEta.textContent = 'Estimated ' + data.etaMinutes + ' minutes. Keep this link to follow your order.';
    el.trackBtn.href = data.trackPath;
    el.successView.hidden = false;
    el.cartSheet.classList.add('is-success');
    cart = Object.create(null);
    sync();
  }

  function leaveSuccess() {
    el.cartSheet.classList.remove('is-success');
    el.successView.hidden = true;
    lastPlacedId = '';
  }

  function openCart() {
    el.cartBackdrop.hidden = false;
    el.cartSheet.classList.add('is-open');
    el.cartSheet.setAttribute('aria-hidden', 'false');
  }

  function closeCart() {
    el.cartBackdrop.hidden = true;
    el.cartSheet.classList.remove('is-open');
    el.cartSheet.setAttribute('aria-hidden', 'true');
    leaveSuccess();
  }

  var toastTimer;
  function flash(text) {
    el.toast.textContent = text;
    el.toast.classList.add('is-visible');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () {
      el.toast.classList.remove('is-visible');
    }, 1800);
  }

  document.querySelectorAll('.mode-btn').forEach(function (btn) {
    btn.addEventListener('click', function () {
      mode = btn.dataset.mode;
      document.querySelectorAll('.mode-btn').forEach(function (b) {
        b.classList.toggle('is-active', b === btn);
      });
      el.deliveryFields.hidden = mode !== 'delivery';
      showError('');
      sync();
    });
  });

  [el.customerPhone, el.customerAddress, el.customerName, el.orderNote].forEach(function (input) {
    input.addEventListener('input', function () {
      showError('');
      sync();
    });
  });

  el.placeOnline.addEventListener('click', placeOnline);
  el.cartOpen.addEventListener('click', openCart);
  el.cartSummary.addEventListener('click', openCart);
  el.cartClose.addEventListener('click', closeCart);
  el.cartBackdrop.addEventListener('click', closeCart);
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') closeCart();
  });
  el.clearCart.addEventListener('click', function () {
    cart = Object.create(null);
    el.customerName.value = '';
    el.customerPhone.value = '';
    el.customerAddress.value = '';
    el.orderNote.value = '';
    showError('');
    sync();
    closeCart();
    flash('Cart cleared');
  });
  el.newOrder.addEventListener('click', function () {
    leaveSuccess();
    closeCart();
  });
  el.copyTrackLink.addEventListener('click', async function () {
    if (!lastPlacedId) return;
    var link = window.location.origin + '/track.html?id=' + lastPlacedId;
    try {
      await navigator.clipboard.writeText(link);
      flash('Tracking link copied');
    } catch (err) {
      window.prompt('Copy this tracking link:', link);
    }
  });

  renderCategories();
  renderMenu();
  sync();
})();
