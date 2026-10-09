# Quản lý Tiến độ & Chi phí Công trình

Ứng dụng demo chạy trên Google Apps Script, dùng Google Sheets để lưu dữ liệu và Google Drive để lưu ảnh.

## Khởi tạo với clasp

1. Cài `clasp`:

   ```bash
   npm i -g @google/clasp
   ```

2. Đăng nhập tài khoản Google:

   ```bash
   clasp login
   ```

3. Tạo Apps Script gắn với một Google Sheet mới (chạy tại thư mục gốc của repo):

   ```bash
   clasp create --type sheets --title "Quản lý Công trình" --rootDir src
   ```

   Lệnh này tạo file `.clasp.json` chứa `scriptId`. Không commit `scriptId` nếu dự án dùng repo công khai.

4. Đẩy mã nguồn lên Apps Script:

   ```bash
   clasp push
   ```

5. Mở Google Sheet vừa tạo, tải lại trang rồi chọn menu **🏗 Công trình → Khởi tạo các tab**.

6. Deploy Web App:

   ```bash
   clasp deploy
   ```

Trong Apps Script, có thể chạy hàm `test_Db` để kiểm tra chuỗi thao tác thêm → tìm → sửa → xoá.
