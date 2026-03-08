import { useEffect, useState } from 'react'

function App() {
  const [message, setMessage] = useState('Loading...')

  useEffect(() => {
    fetch('http://localhost:5000/api/hello')
      .then(res => res.json())
      .then(data => setMessage(data.message))
      .catch(err => setMessage("Error connecting to backend"))
  }, [])

  return (
    <div style={{ textAlign: 'center', marginTop: '50px' }}>
      <h1>Club Project Dashboard</h1>
      <p>Backend says: <strong>{message}</strong></p>
    </div>
  )
}

export default App