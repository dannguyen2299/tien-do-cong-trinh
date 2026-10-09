# Quản lý Tiến độ & Chi phí Công trình

Bản demo tĩnh dành cho khách hàng, chạy hoàn toàn bằng HTML, CSS và JavaScript trên GitHub Pages.

## Chạy tại máy

```bash
python3 -m http.server 8080
```

Mở `http://localhost:8080`.

## Dữ liệu demo

- Dữ liệu được tạo tự động trong trình duyệt và lưu bằng `localStorage`.
- Có thể nhập báo cáo, duyệt báo cáo, nhập chi phí, import dự toán và chỉnh danh mục.
- Nút **Tạo lại dữ liệu mẫu** ở trang Danh mục khôi phục trạng thái ban đầu.
- Đây là bản demo không có đăng nhập và không dùng cơ sở dữ liệu thật.

## Deploy GitHub Pages

Trong repository GitHub, mở **Settings → Pages**, chọn **Deploy from a branch**, sau đó chọn nhánh `main` và thư mục `/ (root)`.

Các file dùng để deploy:

- `index.html`
- `styles.css`
- `app.js`
- `demo-api.js`
- `og-cover.png`

Trang public: <https://dannguyen2299.github.io/tien-do-cong-trinh/>
