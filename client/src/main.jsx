import React from 'react'
import ReactDOM from 'react-dom/client'
import { Toaster } from 'react-hot-toast'
import App from './App.jsx'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
    <Toaster
      position="top-center"
      toastOptions={{
        duration: 4000,
        style: {
          fontFamily: 'Inter, sans-serif',
          borderRadius: '12px',
          padding: '14px 18px',
          fontSize: '0.9rem',
          fontWeight: '500',
          boxShadow: '0 10px 40px rgba(0,0,0,0.12)'
        },
        success: {
          iconTheme: { primary: '#0E9F6E', secondary: 'white' }
        },
        error: {
          iconTheme: { primary: '#DC2626', secondary: 'white' }
        }
      }}
    />
  </React.StrictMode>
)
