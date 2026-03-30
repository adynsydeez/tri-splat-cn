import { useEffect, useState, FC } from 'react'
import TrainingPanel from './components/TrainingPanel'

const App: FC = () => {
  const [message, setMessage] = useState<string>('Loading...')

  useEffect(() => {
    fetch('http://localhost:5000/api/hello')
      .then(res => res.json())
      .then(data => setMessage(data.message))
      .catch(err => setMessage("Error connecting to backend"))
  }, [])

  return (
    // <div style={{ textAlign: 'center', marginTop: '50px' }}>
    //   <h1>Club Project Dashboard</h1>
    //   <p>Backend says: <strong>{message}</strong></p>
    // </div>
    <TrainingPanel></TrainingPanel>
  )
}

export default App
