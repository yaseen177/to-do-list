import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css'; // <--- THIS LINE IS LIKELY MISSING

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);