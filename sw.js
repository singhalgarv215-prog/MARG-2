self.addEventListener('push', function(event) {
  var payload = {};
  try { payload = event.data ? event.data.json() : {}; } catch(error) { payload = { body:event.data ? event.data.text() : '' }; }
  var title = payload.title || 'Marg';
  var options = {
    body:payload.body || 'The next useful CAT step is ready.',
    icon:payload.icon || '/logo-icon.png',
    badge:payload.badge || '/logo-icon.png',
    tag:payload.tag || 'marg-study-reminder',
    renotify:false,
    data:{ targetPath:payload.targetPath || '/?tab=chat' }
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', function(event) {
  event.notification.close();
  var target = new URL(event.notification.data && event.notification.data.targetPath || '/?tab=chat', self.location.origin).href;
  event.waitUntil(clients.matchAll({ type:'window', includeUncontrolled:true }).then(function(windowClients) {
    for (var i = 0; i < windowClients.length; i++) {
      if ('focus' in windowClients[i]) {
        if ('navigate' in windowClients[i]) return windowClients[i].navigate(target).then(function(client) { return client.focus(); });
        return windowClients[i].focus();
      }
    }
    return clients.openWindow ? clients.openWindow(target) : null;
  }));
});
