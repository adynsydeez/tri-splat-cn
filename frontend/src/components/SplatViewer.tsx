import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";

interface SplatViewerProps {
  url: string;
  onClose: () => void;
}

export default function SplatViewer({ url, onClose }: SplatViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [loadingPhase, setLoadingPhase] = useState<"downloading" | "parsing" | "ready">("downloading");
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [stats, setStats] = useState({ count: 0, size: "" });

  const geometryRef = useRef<THREE.BufferGeometry | null>(null);
  const materialRef = useRef<THREE.ShaderMaterial | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0f0f12); 

    const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.01, 10000);
    const renderer = new THREE.WebGLRenderer({ antialias: true, logarithmicDepthBuffer: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(window.devicePixelRatio);
    containerRef.current.appendChild(renderer.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;

    const loadSplats = async () => {
      try {
        // --- 1. Progress-aware Download ---
        const response = await fetch(url);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        
        const contentLength = +(response.headers.get('Content-Length') || 0);
        const reader = response.body?.getReader();
        if (!reader) throw new Error("ReadableStream not supported");

        let receivedLength = 0;
        let chunks = [];
        
        while(true) {
          const {done, value} = await reader.read();
          if (done) break;
          chunks.push(value);
          receivedLength += value.length;
          if (contentLength) {
            setProgress(Math.round((receivedLength / contentLength) * 100));
          }
        }

        const buffer = new Uint8Array(receivedLength);
        let pos = 0;
        for(let chunk of chunks) {
          buffer.set(chunk, pos);
          pos += chunk.length;
        }

        const view = new DataView(buffer.buffer);
        const header = new TextDecoder().decode(buffer.slice(0, 6));
        if (header !== "TSPLAT") throw new Error("Not a TSPLAT file");

        const count = view.getUint32(8, true);
        setStats({ count, size: (receivedLength / 1024 / 1024).toFixed(2) + " MB" });
        setLoadingPhase("parsing");
        setProgress(0);

        // --- 2. Chunked Parsing (to keep UI responsive) ---
        const geometry = new THREE.BufferGeometry();
        geometryRef.current = geometry;

        const positions = new Float32Array(count * 3 * 3);
        const colors = new Float32Array(count * 3 * 3);
        const opacities = new Float32Array(count * 3);

        const stride = 56; 
        const dataOffset = 12;

        const CHUNK_SIZE = 50000;
        for (let i = 0; i < count; i++) {
          const offset = dataOffset + i * stride;
          
          for (let v = 0; v < 9; v++) {
            positions[i * 9 + v] = view.getFloat32(offset + v * 4, true);
          }

          const r = view.getFloat32(offset + 36, true);
          const g = view.getFloat32(offset + 40, true);
          const b = view.getFloat32(offset + 44, true);
          for (let v = 0; v < 3; v++) {
            colors[i * 9 + v * 3 + 0] = r;
            colors[i * 9 + v * 3 + 1] = g;
            colors[i * 9 + v * 3 + 2] = b;
          }

          const opacity = view.getFloat32(offset + 48, true);
          for (let v = 0; v < 3; v++) {
            opacities[i * 3 + v] = opacity;
          }

          if (i % CHUNK_SIZE === 0 && i > 0) {
            setProgress(Math.round((i / count) * 100));
            await new Promise(r => setTimeout(r, 0)); // Yield to UI
          }
        }

        geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
        geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
        geometry.setAttribute("opacity", new THREE.BufferAttribute(opacities, 1));

        geometry.computeBoundingBox();
        const center = new THREE.Vector3();
        geometry.boundingBox!.getCenter(center);
        const size = new THREE.Vector3();
        geometry.boundingBox!.getSize(size);
        const maxDim = Math.max(size.x, size.y, size.z);

        console.log("Model Center:", center);
        console.log("Model Size:", size);

        camera.position.set(center.x, center.y, center.z + maxDim * 2.5);
        controls.target.copy(center);
        camera.near = maxDim * 0.001;
        camera.far = maxDim * 1000;
        camera.updateProjectionMatrix();

        const material = new THREE.ShaderMaterial({
          transparent: true,
          depthWrite: true,
          depthTest: true,
          blending: THREE.NormalBlending, // Changed from Additive to be more visible
          vertexColors: true,
          side: THREE.DoubleSide,
          vertexShader: `
            attribute float opacity;
            varying vec3 vColor;
            varying float vOpacity;
            void main() {
              vColor = color;
              vOpacity = opacity;
              gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
            }
          `,
          fragmentShader: `
            varying vec3 vColor;
            varying float vOpacity;
            void main() {
              // Ensure even low opacities are somewhat visible
              float alpha = mix(vOpacity, 1.0, 0.1); 
              gl_FragColor = vec4(vColor, alpha);
            }
          `
        });
        materialRef.current = material;

        const mesh = new THREE.Mesh(geometry, material);
        scene.add(mesh);
        
        scene.add(new THREE.AxesHelper(maxDim * 0.5));
        
        setLoadingPhase("ready");

      } catch (e: any) {
        console.error("Viewer Error:", e);
        setError(e.message);
      }
    };

    loadSplats();

    let frameId: number;
    const animate = () => {
      frameId = requestAnimationFrame(animate);
      controls.update();
      renderer.render(scene, camera);
    };
    animate();

    const handleResize = () => {
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight);
    };
    window.addEventListener("resize", handleResize);

    return () => {
      cancelAnimationFrame(frameId);
      window.removeEventListener("resize", handleResize);
      if (containerRef.current && renderer.domElement) {
        containerRef.current.removeChild(renderer.domElement);
      }
      geometryRef.current?.dispose();
      materialRef.current?.dispose();
    };
  }, [url]);

  return (
    <div className="fixed inset-0 z-[100] bg-[#0f0f12] text-white font-sans overflow-hidden">
      <div ref={containerRef} className="w-full h-full" />
      
      {/* HUD */}
      <div className="absolute top-6 left-6 pointer-events-none select-none">
        <div className="flex items-center gap-3 bg-black/40 backdrop-blur-md px-4 py-2 rounded-xl border border-white/10">
          <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
          <h3 className="font-bold tracking-tight text-lg">Web Splat Viewer</h3>
        </div>
        
        {loadingPhase === "ready" && (
          <div className="mt-3 space-y-1.5 bg-black/40 backdrop-blur-md p-4 rounded-xl border border-white/10 text-[11px] font-mono opacity-80">
            <div className="flex justify-between gap-8"><span>Triangles</span> <span className="text-white font-bold">{stats.count.toLocaleString()}</span></div>
            <div className="flex justify-between gap-8"><span>VRAM Size</span> <span className="text-white font-bold">{stats.size}</span></div>
            <div className="mt-3 pt-3 border-t border-white/5 space-y-1 opacity-60 italic">
              <p>• Orbit: Left Click</p>
              <p>• Pan: Right Click</p>
              <p>• Zoom: Scroll Wheel</p>
            </div>
          </div>
        )}
      </div>

      <button 
        onClick={onClose}
        className="absolute top-6 right-6 bg-white/10 hover:bg-white/20 text-white px-6 py-2 rounded-full transition-all backdrop-blur-md border border-white/20 font-bold active:scale-95 shadow-xl"
      >
        Close
      </button>

      {/* Loading Overlay */}
      {loadingPhase !== "ready" && !error && (
        <div className="absolute inset-0 flex items-center justify-center bg-[#0f0f12]/80 backdrop-blur-xl transition-all duration-500">
          <div className="max-w-xs w-full text-center px-6">
            <div className="relative mb-8">
               <div className="w-20 h-20 border-4 border-white/5 rounded-full mx-auto" />
               <div 
                 className="absolute inset-0 w-20 h-20 border-4 border-t-blue-500 rounded-full animate-spin mx-auto" 
                 style={{ animationDuration: '0.8s' }}
               />
            </div>
            
            <h4 className="text-xl font-bold mb-2">
              {loadingPhase === "downloading" ? "Downloading Data" : "Processing Triangles"}
            </h4>
            
            <div className="w-full h-1.5 bg-white/10 rounded-full overflow-hidden mb-3">
              <div 
                className="h-full bg-blue-500 transition-all duration-300" 
                style={{ width: `${progress}%` }}
              />
            </div>
            
            <p className="text-sm font-mono opacity-50">
              {progress}% {loadingPhase === "downloading" ? "(Buffering Stream)" : "(Building Geometry)"}
            </p>
          </div>
        </div>
      )}

      {/* Error State */}
      {error && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/90 p-6">
          <div className="bg-red-500/10 border border-red-500/50 p-10 rounded-3xl max-w-md text-center shadow-2xl">
            <div className="text-red-500 text-5xl mb-6">✕</div>
            <p className="text-xl font-bold mb-3">Viewer Failed</p>
            <p className="text-sm opacity-60 leading-relaxed mb-10">{error}</p>
            <button 
              onClick={onClose} 
              className="w-full bg-white text-black py-4 rounded-2xl font-black hover:bg-gray-200 transition-colors"
            >
              Exit Viewer
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
