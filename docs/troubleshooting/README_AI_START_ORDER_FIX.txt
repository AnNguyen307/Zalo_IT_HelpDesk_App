AI START ORDER FIX

This patch makes the Backend task wait until the local Ollama API is reachable
and qwen3.5:9b is installed before running npm start.

After extracting:
1. In VS Code run: Developer: Reload Window
2. Press Ctrl+Shift+B and choose HelpDesk: Khởi động toàn bộ
3. Confirm these terminals exist:
   - HelpDesk: Ollama AI
   - HelpDesk: Backend
   - HelpDesk: ngrok
   - HelpDesk: Đồng bộ URL + Deploy

The Backend terminal should print:
[OK] Ollama API is ready.
[OK] Model installed: qwen3.5:9b
[INFO] Starting HelpDesk backend only after Ollama is ready...
