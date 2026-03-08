from flask import Flask, jsonify
from flask_cors import CORS

app = Flask(__name__)
CORS(app) # Allows React app to talk to this API

@app.route('/api/hello', methods=['GET'])
def hello_world():
    return jsonify({"message": "Hello from the Flask backend!"})

if __name__ == '__main__':
    app.run(debug=True, port=5000)