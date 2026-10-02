import messages from './renderer/i18n/ar.json'
import './App.css'

function App() {
  return (
    <main className="app-shell">
      <section className="welcome-card" aria-labelledby="welcome-title">
        <p className="eyebrow">{messages.app.phase}</p>
        <h1 id="welcome-title">{messages.app.title}</h1>
        <p className="description">{messages.app.description}</p>
        <div className="status" role="status">
          <span className="status-dot" aria-hidden="true" />
          {messages.app.status}
        </div>
      </section>
    </main>
  )
}

export default App
