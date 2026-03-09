##Prerequisites
GPU: NVIDIA GPU with CUDA support (required for high-performance rendering).
Drivers: Latest NVIDIA Drivers installed.
Environment: * Recommended: WSL2 (Windows Subsystem for Linux) or Native Linux. Developing in a Linux-based environment generally simplifies the compilation of CUDA kernels and avoids many common pathing issues.
Alternative: Windows Native. While possible, this requires a correctly configured Visual Studio C++ Build Tools environment and manual management of CUDA environment variables.

1. Backend Setup (Python/Flask)

The backend handles data processing and interfaces with CUDA kernels.

Environment Setup:
``` Bash
cd backend
python -m venv venv
# Linux/WSL: source venv/bin/activate
# Windows: .\venv\Scripts\activate
```

Install Dependencies:
``` Bash
pip install -r requirements.txt
```
Run the Server:
``` Bash
python app.py
```
2. Frontend Setup (React/Vite)
The frontend provides the interactive 3D viewport.

Install Packages:
``` Bash 
cd frontend
npm install
```
Environment Configuration:
Create a .env file in the frontend root:
``` Plaintext
VITE_API_URL=http://localhost:5000
```
Start Development Server:
``` Bash
npm run dev
```
