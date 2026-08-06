IT HELPDESK - CHAY TOAN BO TRONG TERMINAL CUA VS CODE

CACH DUNG KHUYEN NGHI:
1. Tat cac cua so Backend/ngrok PowerShell cu bang Ctrl+C.
2. Giai nen patch vao thu muc chua zalo-helpdesk-ai.
3. Nhan dup START_HELPDESK_VSCODE.bat.
4. Neu VS Code hoi Workspace Trust / Automatic Tasks, chon Trust va Allow.
5. VS Code se mo 3 terminal rieng trong panel Terminal:
   - HelpDesk: Backend
   - HelpDesk: ngrok
   - HelpDesk: Dong bo URL + Deploy
6. Neu ZMP hoi moi truong, chon Development.

CHAY THU CONG TRONG VS CODE:
- Nhan Ctrl+Shift+B.
- Hoac Terminal > Run Build Task.

DUNG HE THONG:
- Terminal > Run Task > HelpDesk: Dung backend va ngrok.
- Hoac bam nut thung rac cua cac terminal task.

LUU Y:
- Khong chay START_HELPDESK_AUTO.bat nua. File cu dung Start-Process powershell.exe,
  nen tao cac cua so PowerShell ben ngoai VS Code.
- Neu ngrok.exe chuyen sang vi tri khac, sua command cua task HelpDesk: ngrok
  trong .vscode/tasks.json.
