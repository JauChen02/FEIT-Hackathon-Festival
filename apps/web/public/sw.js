self.addEventListener('push', (event) => {
  let data = { title: 'A little practice?', body: 'Make a little room for learning today.' };
  try {
    if (event.data) data = { ...data, ...event.data.json() };
  } catch {
    /* Use the local reminder. */
  }
  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      tag: 'learnarena-daily',
      data: { url: '/home' },
    }),
  );
});
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windows) => {
      const existing = windows.find(
        (window) => new URL(window.url).origin === self.location.origin,
      );
      return existing ? existing.focus() : clients.openWindow('/home');
    }),
  );
});
