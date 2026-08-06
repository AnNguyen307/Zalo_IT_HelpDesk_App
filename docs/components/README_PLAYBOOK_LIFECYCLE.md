# Playbook Governance — Nguyên tắc vận hành

Hệ thống không sử dụng “continual learning” tự do. Cụm từ “AI học” trong dự án có nghĩa là:

1. Nhân sự tạo nội dung có cấu trúc.
2. Nội dung được review và publish.
3. Runtime Playbook chuyển sang version Published.
4. Embedding index được rebuild tự động.
5. AI truy xuất version mới ở request tiếp theo.

Đây là RAG có kiểm soát, không fine-tune model và không đưa ticket thô vào model training.
