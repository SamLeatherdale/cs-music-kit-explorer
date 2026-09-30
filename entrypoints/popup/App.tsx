import { useEffect, useRef } from 'react';
import './App.css';

export default function App() {
  const opened = useRef(false);

  function openApp() {
    if (opened.current) return;
    opened.current = true;
    void browser.tabs.create({ url: browser.runtime.getURL('/app.html') });
    window.close();
  }

  useEffect(() => {
    openApp();
  }, []);

  return (
    <main className="launcher">
      <p className="launcher__eyebrow">CS2 MUSIC KITS</p>
      <h1>{browser.runtime.getManifest().name}</h1>
      <p>Open your full comparison board.</p>
      <button type="button" onClick={openApp}>
        Open explorer
      </button>
    </main>
  );
}
