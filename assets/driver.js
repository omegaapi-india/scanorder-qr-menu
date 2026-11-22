/* ScanOrder — delivery partner console. Location is sent only while sharing is on. */
(function () {
  'use strict';

  var config = window.SCANORDER_CONFIG;
  var orderId = '';
  var code = '';
  var watchId = null;
  var lastSent = 0;
  var map = null;
  var driverMarker = null;

  var el = {
    login: document.getElementById('driverLogin'),
    order: document.getElementById('driverOrder'),
    form: document.getElementById('loginForm'),
    idInput: document.getElementById('driverOrderId'),
    codeInput: document.getElementById('driverCode'),
    error: document.getElementById('driverError'),
    idLabel: document.getElementById('driverOrderIdLabel'),
    mode: document.getElementById('driverOrderMode'),
    customer: document.getElementById('driverCustomer'),
    address: document.getElementById('driverAddress'),
    items: document.getElementById('driverItems'),
    total: document.getElementById('driverTotal'),
    note: document.getElementById('driverNote'),
    start: document.getElementById('startSharing'),
    stop: document.getElementById('stopSharing'),
    dot: document.getElementById('sharingDot'),
    sharingTitle: document.getElementById('sharingTitle'),
    sharingStatus: document.getElementById('sharingStatus')
  };

  function cleanId(value) {
    var text = String(value || '').trim().toUpperCase();
    return /^SO-[A-F0-9]{8}$/.test(text) ? text : '';
  }

  function money(value) {
    return config.currency + Number(value).toLocaleString('en-IN');
  }

  function showError(text) {
    el.error.textContent = text || '';
    el.error.hidden = !text;
  }

  function initMap() {
    map = L.map('driverMap').setView([config.restaurant.lat, config.restaurant.lng], 14);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap contributors'
    }).addTo(map);

    L.marker([config.restaurant.lat, config.restaurant.lng], {
      icon: L.divIcon({ className: 'pin-icon', html: '🏪', iconSize: [30, 30] })
    }).bindTooltip(config.restaurant.name).addTo(map);

    L.marker([config.dropPoint.lat, config.dropPoint.lng], {
      icon: L.divIcon({ className: 'pin-icon', html: '📍', iconSize: [30, 30] })
    }).bindTooltip(config.dropPoint.label).addTo(map);
  }

  async function sendLocation(position) {
    var now = Date.now();
    if (now - lastSent < 15000) return; // respect the server throttle and free KV limits
    lastSent = now;

    var payload = {
      lat: position.coords.latitude,
      lng: position.coords.longitude,
      accuracy: position.coords.accuracy
    };

    try {
      var response = await fetch('/api/orders/' + encodeURIComponent(orderId) + '/location', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-driver-code': code
        },
        body: JSON.stringify(payload)
      });
      var data = await response.json();
      if (response.status === 401) {
        stopSharing();
        showError('Driver code rejected. Reload the order and check the code.');
        return;
      }
      if (response.ok) {
        el.sharingStatus.textContent = 'Last update ' + new Date().toLocaleTimeString() +
          ' · customer can see you on the map.';
      }
    } catch (err) {
      el.sharingStatus.textContent = 'Network error — retrying on the next GPS update.';
    }
  }

  function onPosition(position) {
    var lat = position.coords.latitude;
    var lng = position.coords.longitude;

    if (!driverMarker) {
      driverMarker = L.marker([lat, lng], {
        icon: L.divIcon({ className: 'vehicle-icon', html: '🛵', iconSize: [34, 34] })
      }).addTo(map).bindTooltip('You');
      map.setView([lat, lng], 15);
    } else {
      driverMarker.setLatLng([lat, lng]);
    }

    sendLocation(position);
  }

  function onPositionError(err) {
    el.sharingStatus.textContent = 'Location unavailable: ' + (err && err.message ? err.message : 'permission denied');
  }

  function startSharing() {
    if (!navigator.geolocation) {
      el.sharingStatus.textContent = 'This browser does not support geolocation.';
      return;
    }
    lastSent = 0;
    watchId = navigator.geolocation.watchPosition(onPosition, onPositionError, {
      enableHighAccuracy: true,
      maximumAge: 5000,
      timeout: 15000
    });
    el.dot.classList.add('live');
    el.sharingTitle.textContent = 'Sharing live';
    el.sharingStatus.textContent = 'Waiting for the first GPS fix…';
    el.start.hidden = true;
    el.stop.hidden = false;
  }

  function stopSharing() {
    if (watchId !== null) navigator.geolocation.clearWatch(watchId);
    watchId = null;
    el.dot.classList.remove('live');
    el.sharingTitle.textContent = 'Location sharing is off';
    el.sharingStatus.textContent = 'The customer map will stop updating.';
    el.start.hidden = false;
    el.stop.hidden = true;
  }

  el.form.addEventListener('submit', async function (event) {
    event.preventDefault();
    showError('');
    var nextId = cleanId(el.idInput.value);
    var nextCode = String(el.codeInput.value || '').trim();
    if (!nextId || !/^[0-9]{6}$/.test(nextCode)) {
      showError('Use an order ID like SO-A1B2C3D4 and a 6-digit driver code.');
      return;
    }

    el.form.querySelector('button').disabled = true;
    try {
      var response = await fetch('/api/orders/' + encodeURIComponent(nextId) + '/driver', {
        headers: { 'x-driver-code': nextCode },
        cache: 'no-store'
      });
      var data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Could not load order.');
      orderId = nextId;
      code = nextCode;

      el.idLabel.textContent = orderId;
      el.mode.textContent = data.mode === 'delivery' ? '🚚 Home delivery' : '🍽 Table ' + (data.table || '—');
      el.customer.textContent = data.name ? 'Customer: ' + data.name + (data.phone ? ' · ' + data.phone : '') : 'Walk-in customer';
      el.address.textContent = data.address || 'Pickup from the restaurant counter.';
      el.items.innerHTML = '';
      data.items.forEach(function (item) {
        var li = document.createElement('li');
        var left = document.createElement('span');
        left.textContent = item.qty + ' × ' + (item.name || item.id);
        var right = document.createElement('strong');
        right.textContent = money(item.price * item.qty);
        li.appendChild(left);
        li.appendChild(right);
        el.items.appendChild(li);
      });
      el.total.textContent = money(data.total);
      if (data.note) {
        el.note.textContent = 'Note: ' + data.note;
        el.note.hidden = false;
      } else {
        el.note.hidden = true;
      }

      el.login.hidden = true;
      el.order.hidden = false;
      initMap();
    } catch (err) {
      showError(err.message || 'Could not load order.');
    } finally {
      el.form.querySelector('button').disabled = false;
    }
  });

  el.start.addEventListener('click', startSharing);
  el.stop.addEventListener('click', stopSharing);
})();
