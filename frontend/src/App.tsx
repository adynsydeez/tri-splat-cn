import { FC, useEffect, useState } from 'react'
import TrainingPanel from './components/TrainingPanel'
import ModelList from './components/ModelList'

const App: FC = () => {
  const [hasError, setHasError] = useState(false);

  useEffect(() => {
    const handleError = (e: ErrorEvent) => {
      console.error("App Crash:", e.error);
      setHasError(true);
    };
    window.addEventListener('error', handleError);
    return () => window.removeEventListener('error', handleError);
  }, []);

  if (hasError) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-red-50 text-red-900 p-10">
        <div className="max-w-md bg-white p-8 rounded-2xl shadow-xl border border-red-200 text-center">
          <h1 className="text-2xl font-black mb-4">GUI CRASHED</h1>
          <p className="opacity-70 mb-6">A frontend error prevented the interface from loading. Please check the browser console (F12) for details.</p>
          <button onClick={() => window.location.reload()} className="bg-red-600 text-white px-6 py-2 rounded-lg font-bold">Reload UI</button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 py-10">
      <div className="max-w-4xl mx-auto">
        <TrainingPanel />
        <div className="my-12 border-t border-gray-200" />
        <ModelList />
      </div>
    </div>
  )
}

export default App
