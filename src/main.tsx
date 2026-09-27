import { createRoot } from 'react-dom/client'
import App from './App.tsx'
import './index.css'

createRoot(document.getElementById("root")!).render(<App />);

// Retire the old cache-first service worker. It could serve an outdated JS
// bundle after a deployment, leaving the application blank in some browsers.
if ("serviceWorker" in navigator) {
  void navigator.serviceWorker.getRegistrations().then((registrations) =>
    Promise.all(registrations.map((registration) => registration.unregister()))
  );
}

if ("caches" in window) {
  void caches.keys().then((keys) =>
    Promise.all(keys.filter((key) => key.startsWith("kurchi-projects-local-")).map((key) => caches.delete(key)))
  );
}
