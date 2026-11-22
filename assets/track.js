/* ScanOrder — public live tracking. Shows no personal data. */
(function () {
  'use strict';

  var config = window.SCANORDER_CONFIG;
  var el = {
    loading: document.getElementById('trackLoading'),
    content: document.getElementById('trackContent'),
    error: document.getElementById('trackError'),
    errorTitle: document.getElementById('errorTitle'),
    errorText: document.getElementById('errorText'),
    id: document.getElementById('trackId'),
    meta: document.getElementById('trackMeta'),
    status: document.getElementById('trackStatus'),
    eta: document.getElementById('etaValue'),
    etaText: document.getElementById('etaText'),
    timeline: document.getElementById('timeline'),
    items: document.getElementById('trackItems'),
    total: document.getElementById('trackTotal'),
    note: document.getElementById('trackNote'),
    map: document.getElementById('trackMap'),
    mapStatus: document.getElementById('mapStatus'),
    form: document.getElementById('idForm'),
    input: document.getElementById('idInput')
  };

  function cleanId(value) {
    var text = String(value || '').trim().toUpperCase();
    return /^SO-[A-F0-9]{8}$/.test(text) ? text : '';
  }

  var id = cleanId(new URLSearchParams(window.location.search).get('id'));
  var map = null;
  var driverMarker = null;
  var dropMarker = null;
  var trailLine = null;

  function money(value) {
    return config.currency + Number(value).toLocaleString('en-IN');
  }

  function showState(which) {
    el.loading.hidden = which !== 'loading';
    el.content.hidden = which !== 'content';
    el.error.hidden = which !== 'error';
  }

  function showError(title, text) {
    el.errorTitle.textContent = title;
    el.errorText.textContent = text;
    showState('error');
  }

  function timeOf(entry) {
    if (!entry || !entry.at) return '';
    try {
      return new Date(entry.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } catch (err) { return ''; }
  }

  function initMap() {
    if (map || typeof L === 'undefined') return;
    map = L.map('trackMap').setView([config.restaurant.lat, config.restaurant.lng], 14);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap contributors'
    }).addTo(map);
    L.marker([config.restaurant.lat, config.restaurant.lng], {
      icon: L.divIcon({ className: 'pin-icon', html: '🏪', iconSize: [30, 30] })
    }).bindTooltip(config.restaurant.name).addTo(map);
  }

  function distanceKm(a, b) {
    var r = 6371;
    var dLat = (b.lat - a.lat) * Math.PI / 180;
    var dLng = (b.lng - a.lng) * Math.PI / 180;
    var la1 = a.lat * Math.PI / 180;
    var la2 = b.lat * Math.PI / 180;
    var h = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(la1) * Math.cos(la2) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
    return 2 * r * Math.asin(Math.sqrt(h));
  }

  function updateMap(order) {
    if (typeof L === 'undefined') {
      el.mapStatus.textContent = 'Map library unavailable.';
      return;
    }
    initMap();
    if (!map) return;
    setTimeout(function () { map.invalidateSize(); }, 0);

    var destination = order.mode === 'delivery' ? config.dropPoint : config.restaurant;
    if (!dropMarker) {
      dropMarker = L.marker([destination.lat, destination.lng], {
        icon: L.divIcon({ className: 'pin-icon', html: '📍', iconSize: [30, 30] })
      }).bindTooltip(order.mode === 'delivery' ? config.dropPoint.label : config.restaurant.name).addTo(map);
    }

    var loc = order.location;
    if (loc && Number.isFinite(Number(loc.lat)) && Number.isFinite(Number(loc.lng))) {
      var point = [Number(loc.lat), Number(loc.lng)];
      if (!driverMarker) {
        driverMarker = L.marker(point, {
          icon: L.divIcon({ className: 'vehicle-icon', html: '🛵', iconSize: [34, 34] })
        }).bindTooltip('Delivery partner').addTo(map);
      } else {
        driverMarker.setLatLng(point);
      }

      var trail = Array.isArray(order.trail) ? order.trail : [];
      if (trail.length > 1) {
        var coords = trail.map(function (p) { return [Number(p.lat), Number(p.lng)]; });
        if (!trailLine) {
          trailLine = L.polyline(coords, { color: '#ff8a3d', weight: 3, opacity: .8 }).addTo(map);
        } else {
          trailLine.setLatLngs(coords);
        }
      }

      var km = distanceKm({ lat: point[0], lng: point[1] }, destination);
      el.mapStatus.textContent = 'Delivery partner last seen ' + timeOf(loc) + ' · about ' + km.toFixed(1) + ' km away';
      map.fitBounds(L.latLngBounds([point, [destination.lat, destination.lng]]).pad(0.15), { padding: [26, 26] });
    } else {
      el.mapStatus.textContent = 'Waiting for the delivery partner to start sharing location…';
      map.setView([destination.lat, destination.lng], 14);
    }
  }

  function render(order) {
    el.id.textContent = order.id;
    el.meta.textContent = order.mode === 'delivery'
      ? 'Home delivery · placed ' + timeOf({ at: order.createdAt })
      : 'Table ' + (order.table || '—') + ' · placed ' + timeOf({ at: order.createdAt });
    el.status.textContent = order.status;
    el.status.classList.toggle('done', order.status === 'Delivered');

    var delivered = order.status === 'Delivered';
    el.eta.textContent = delivered ? 'Completed' : 'About ' + order.etaMinutes + ' min';
    el.etaText.textContent = delivered
      ? 'Thanks for ordering with ScanOrder.'
      : (order.mode === 'delivery' ? 'Estimated delivery time' : 'Estimated time until ready for pickup');

    var steps = ['Pending', 'Preparing', 'Ready', 'Out for delivery', 'Delivered'];
    if (order.mode !== 'delivery') steps = steps.filter(function (s) { return s !== 'Out for delivery'; });
    var current = steps.indexOf(order.status);
    if (current === -1) current = 0;

    el.timeline.innerHTML = '';
    steps.forEach(function (step, index) {
      var li = document.createElement('li');
      if (index < current) li.className = 'done';
      if (index === current) li.className = 'active';

      var node = document.createElement('div');
      node.className = 'node';
      node.textContent = index < current ? '✓' : String(index + 1);
      node.setAttribute('aria-hidden', 'true');

      var text = document.createElement('div');
      text.className = 'step-text';
      var title = document.createElement('strong');
      title.textContent = step === 'Delivered' && order.mode !== 'delivery' ? 'Collected' : step;
      text.appendChild(title);

      var history = Array.isArray(order.history) ? order.history : [];
      var match = history.find(function (h) { return h.status === step; });
      if (match) {
        var when = document.createElement('small');
        when.textContent = timeOf(match);
        text.appendChild(when);
      }
      li.appendChild(node);
      li.appendChild(text);
      el.timeline.appendChild(li);
    });

    el.items.innerHTML = '';
    order.items.forEach(function (item) {
      var li = document.createElement('li');
      var left = document.createElement('span');
      left.textContent = item.qty + ' × ' + (item.name || item.id);
      var right = document.createElement('strong');
      right.textContent = money(item.price * item.qty);
      li.appendChild(left);
      li.appendChild(right);
      el.items.appendChild(li);
    });
    el.total.textContent = money(order.total);

    if (order.note) {
      el.note.textContent = 'Note: ' + order.note;
      el.note.hidden = false;
    } else {
      el.note.hidden = true;
    }

    showState('content');
    updateMap(order);
  }

  async function load() {
    if (!id) {
      showError('Enter your order ID', 'You can find it on the confirmation screen after placing an order.');
      el.input.focus();
      return;
    }

    try {
      var response = await fetch('/api/orders/' + encodeURIComponent(id), { cache: 'no-store' });
      var data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Order not found.');
      render(data);
    } catch (err) {
      showError('Could not load order', (err && err.message ? err.message : 'Please try again.'));
    }
  }

  el.form.addEventListener('submit', function (event) {
    event.preventDefault();
    var next = cleanId(el.input.value);
    if (!next) {
      el.input.setCustomValidity('Use the format SO-A1B2C3D4');
      el.input.reportValidity();
      return;
    }
    el.input.setCustomValidity('');
    id = next;
    window.history.replaceState(null, '', '?id=' + id);
    showState('loading');
    load();
  });

  if (!id) {
    showError('Enter your order ID', 'You can find it on the confirmation screen after placing an order.');
  } else {
    load();
    setInterval(load, 5000);
  }
})();
