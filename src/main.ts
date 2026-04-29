import React from 'react'
import ReactDOM from 'react-dom/client'
import './styles.css'
import App from './App'

ReactDOM.createRoot(document.getElementById('app')!).render(
  React.createElement(React.StrictMode, null, React.createElement(App)),
)
