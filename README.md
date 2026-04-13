Please also view `README.md` in [core engine submodule](https://github.com/trianglesplatting/triangle-splatting/tree/685ff270a8273afc3a2b094ae3148dd0b98e31e9).

### 1. Clone Repo
``` bash
git clone https://github.com/adynsydeez/tri-splat-cn --recursive
```

### 2. Backend Setup (Python/Flask)

The backend handles data processing and interfaces with CUDA kernels.

#### Environment Setup:
``` Bash
cd backend
python -m venv venv
# Linux/WSL: source venv/bin/activate
# Windows: .\venv\Scripts\activate
```

#### Install Dependencies:
``` Bash
pip install -r requirements.txt
```
#### Run the Server:
``` Bash
python app.py
```
### 3. Frontend Setup (React/Vite)
The frontend provides the interactive 3D viewport.

#### Install Packages:
``` Bash 
cd frontend
npm install
```
#### Environment Configuration:
Create a .env file in the frontend root:
``` Plaintext
VITE_API_URL=http://localhost:5000
```
#### Start Development Server:
``` Bash
npm run dev
```



