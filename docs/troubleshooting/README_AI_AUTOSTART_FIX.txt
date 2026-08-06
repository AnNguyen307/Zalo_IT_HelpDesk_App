AI AUTOSTART FIX

1. Extract this patch into the parent folder Zalo_IT_HelpDesk_Zero_Cost_v2.
2. Reload VS Code: Ctrl+Shift+P -> Developer: Reload Window.
3. Press Ctrl+Shift+B and run "HelpDesk: Khoi dong toan bo".
4. Four integrated terminals should appear: Ollama AI, Backend, ngrok, URL sync/deploy.
5. Verify:
   Invoke-RestMethod http://127.0.0.1:11434/api/tags
   (Invoke-RestMethod http://127.0.0.1:8080/health).agent | ConvertTo-Json -Depth 5

This patch does not modify .env, db.json, uploads, or application source code.
