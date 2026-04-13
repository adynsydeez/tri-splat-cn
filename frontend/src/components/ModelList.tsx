import { useEffect, useState } from "react";
import SplatViewer from "./SplatViewer";

const API_URL = (import.meta as ImportMeta & { env: Record<string, string> }).env.VITE_API_URL || "http://localhost:5000";

interface Model {
  name: string;
  has_off: boolean;
  has_tsplat: boolean;
  checkpoints: string[];
}

export default function ModelList() {
  const [models, setModels] = useState<Model[]>([]);
  const [loading, setLoading] = useState(false);
  const [converting, setConverting] = useState<string | null>(null);
  const [viewerUrl, setViewerUrl] = useState<string | null>(null);

  const fetchModels = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/models`);
      const data = await res.json();
      setModels(data);
    } catch (err) {
      console.error("Failed to fetch models", err);
    } finally {
      setLoading(false);
    }
  };

  const handleConvert = async (modelName: string, checkpoint: string, type: "off" | "tsplat") => {
    setConverting(`${type}_${modelName}`);
    const endpoint = type === "off" ? "/api/convert" : "/api/convert_tsplat";
    try {
      const res = await fetch(`${API_URL}${endpoint}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model_name: modelName, checkpoint }),
      });
      const data = await res.json();
      if (data.error) alert(data.error);
      else {
        if (type === "tsplat") {
          setViewerUrl(`${API_URL}/api/serve/${modelName}/model.tsplat?t=${Date.now()}`);
        } else {
          alert("Conversion successful!");
        }
        fetchModels();
      }
    } catch (err) {
      alert("Action failed. Check backend logs.");
    } finally {
      setConverting(null);
    }
  };

  useEffect(() => {
    fetchModels();
  }, []);

  return (
    <div className="max-w-2xl mx-auto px-4 py-6">
      {viewerUrl && <SplatViewer url={viewerUrl} onClose={() => setViewerUrl(null)} />}

      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-bold text-gray-900">Trained Models</h2>
        <button 
          onClick={fetchModels}
          className="text-sm bg-gray-100 hover:bg-gray-200 px-3 py-1 rounded transition-colors"
          disabled={loading || !!converting}
        >
          {loading ? "Refreshing..." : "Refresh"}
        </button>
      </div>

      {loading && <p className="text-gray-500">Loading models...</p>}
      {!loading && models.length === 0 && <p className="text-gray-500">No models found yet.</p>}

      <div className="space-y-4">
        {models.map((model) => (
          <div key={model.name} className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm">
            <div className="flex justify-between items-start mb-3">
              <div>
                <h3 className="font-bold text-lg text-gray-900">{model.name}</h3>
                <div className="flex gap-3 mt-1">
                  <span className="text-xs text-gray-500 font-mono">
                    {model.has_off ? "✓ OFF" : "No OFF"}
                  </span>
                  <span className="text-xs text-gray-500 font-mono">
                    {model.has_tsplat ? "✓ TSPLAT" : "No TSPLAT"}
                  </span>
                </div>
              </div>
              <div className="flex flex-col items-end gap-2">
                {model.has_tsplat && (
                  <button 
                    onClick={() => setViewerUrl(`${API_URL}/api/serve/${model.name}/model.tsplat?t=${Date.now()}`)}
                    className="text-xs bg-primary text-white px-3 py-1.5 rounded-full font-bold shadow-sm hover:shadow-md transition-all active:scale-95"
                  >
                    Open Viewer
                  </button>
                )}
                {model.has_off && (
                  <a 
                    href={`${API_URL}/api/serve/${model.name}/model.off`}
                    target="_blank"
                    rel="noreferrer"
                    className="text-xs text-primary font-semibold hover:underline"
                  >
                    Download .OFF
                  </a>
                )}
              </div>
            </div>

            <div className="mt-4">
              <label className="block text-xs font-semibold text-gray-600 mb-2 uppercase tracking-wider">
                Generate Splat / Mesh
              </label>
              <div className="flex flex-wrap gap-2">
                {model.checkpoints.map((cp) => (
                  <div key={cp} className="flex border border-gray-100 rounded overflow-hidden">
                    <button
                      onClick={() => handleConvert(model.name, cp, "tsplat")}
                      disabled={!!converting}
                      className={`text-[10px] px-2 py-1 transition-colors ${
                        converting === `tsplat_${model.name}`
                          ? "bg-amber-100 text-amber-700" 
                          : "bg-amber-50 text-amber-800 hover:bg-amber-100"
                      }`}
                      title="Generate Web Splat"
                    >
                      {cp.replace("iteration_", "")} (Splat)
                    </button>
                    <button
                      onClick={() => handleConvert(model.name, cp, "off")}
                      disabled={!!converting}
                      className={`text-[10px] px-2 py-1 border-l border-gray-100 transition-colors ${
                        converting === `off_${model.name}`
                          ? "bg-blue-100 text-blue-700" 
                          : "bg-blue-50 text-blue-800 hover:bg-blue-100"
                      }`}
                      title="Generate OFF Mesh"
                    >
                      (Mesh)
                    </button>
                  </div>
                ))}
                {model.checkpoints.length === 0 && <span className="text-xs text-gray-400">No checkpoints found</span>}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
