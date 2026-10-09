# SPEC — Web App Quản lý Tiến độ & Chi phí Công trình (bản DEMO)

> Nền tảng: **Google Apps Script Web App** + **Google Sheets** (lưu dữ liệu) + **Google Drive** (lưu ảnh).
> Mục tiêu bản demo: cho khách hàng xem đủ chức năng với dữ liệu mẫu. **Chưa có đăng nhập.**
> Ngôn ngữ giao diện: **tiếng Việt**. Múi giờ: `Asia/Ho_Chi_Minh`. Tiền tệ: VNĐ.

---

## 0. Quy tắc chung cho người triển khai

1. Làm **lần lượt từng bước ở mục 9**. Xong mỗi bước thì dừng lại, kiểm theo checklist của bước đó rồi mới sang bước tiếp.
2. Không thêm thư viện ngoài danh sách ở mục 2.3. Không dùng bundler, TypeScript hay npm cho phần chạy trên Apps Script.
3. Mọi thao tác đọc/ghi Sheet chỉ đi qua module `Db.gs`. Các service khác không được gọi `SpreadsheetApp` trực tiếp.
4. Mọi hàm ghi dữ liệu phải dùng `LockService.getScriptLock()` (chờ tối đa 10 giây).
5. Ngày lưu dạng **chuỗi `yyyy-MM-dd`**, không lưu đối tượng Date, để tránh lệch múi giờ. Thời điểm tạo bản ghi lưu dạng `yyyy-MM-dd HH:mm:ss`.
6. Số tiền lưu dạng số nguyên VNĐ. Khối lượng lưu dạng số thực, hiển thị 2 chữ số thập phân.
7. Mọi hàm server trả về theo định dạng thống nhất: `{ ok: true, data: ... }` hoặc `{ ok: false, error: "Thông báo tiếng Việt" }`. Không ném lỗi thô ra client.
8. Code phải dễ thay "vai trò demo" bằng đăng nhập thật về sau (xem mục 4).

---

## 1. Phạm vi demo

**Có trong demo:**
- Dashboard tổng quan nhiều công trình.
- Danh sách công trình và trang chi tiết từng công trình (hạng mục, tiến độ, báo cáo, dự toán và chi phí).
- Nhập báo cáo ngày (giao diện ưu tiên điện thoại), có đính kèm ảnh.
- Duyệt hoặc trả lại báo cáo ngày.
- Nhập chi phí thực tế.
- Import dự toán bằng cách dán dữ liệu từ Excel.
- Quản lý danh mục: thêm/sửa công trình và hạng mục.
- Bộ chọn "Xem với vai trò" để trình diễn phân quyền.
- Nút "Tạo lại dữ liệu mẫu".

**Không có trong demo:** đăng nhập, xuất PDF/Excel, thông báo Zalo/Telegram/email, nhật ký thay đổi chi tiết.

---

## 2. Kiến trúc & cấu trúc thư mục

### 2.1 Sơ đồ
```
Trình duyệt (điện thoại / PC)
   │  google.script.run (bọc thành Promise)
   ▼
Apps Script (container-bound vào Google Sheet)
   ├── Db.gs          → đọc/ghi các tab Sheet
   ├── *Service.gs    → nghiệp vụ
   └── DriveApp       → thư mục ảnh theo công trình
```

### 2.2 Cấu trúc repo
```
tien-do-thi-cong/
├── AGENTS.md
├── docs/SPEC.md
├── .clasp.json            # tạo bởi clasp, rootDir = "src"
└── src/
    ├── appsscript.json
    ├── Code.gs            # doGet, include(), onOpen (menu)
    ├── Config.gs          # tên tab, cột, hằng số, ngưỡng cảnh báo, ROLES
    ├── Db.gs              # repository chung
    ├── Utils.gs           # ngày, id, format, response helpers
    ├── ProjectService.gs  # công trình + hạng mục
    ├── ReportService.gs   # báo cáo ngày + duyệt + ảnh
    ├── BudgetService.gs   # dự toán + chi phí thực tế
    ├── DashboardService.gs# tính toán tổng hợp
    ├── Seed.gs            # tạo dữ liệu mẫu
    ├── Index.html         # khung trang, nạp các partial
    ├── Styles.html        # <style>
    ├── App.html           # <script> chính: router, state, api wrapper
    └── views/
        ├── Dashboard.html
        ├── Projects.html
        ├── ProjectDetail.html
        ├── ReportForm.html
        ├── Approvals.html
        ├── Costs.html
        ├── BudgetImport.html
        └── Catalog.html
```
> Ghi chú: clasp đẩy file trong `src/views/` lên với tên `views/Dashboard`. Hàm `include('views/Dashboard')` vẫn hoạt động.

### 2.3 Thư viện frontend (chỉ những cái này, nạp qua CDN, ghim phiên bản)
- Alpine.js `3.14.1`: `https://cdn.jsdelivr.net/npm/alpinejs@3.14.1/dist/cdn.min.js`
- Chart.js `4.4.1`: `https://cdn.jsdelivr.net/npm/chart.js@4.4.1/dist/chart.umd.min.js`
- CSS tự viết trong `Styles.html` (không dùng Tailwind).

### 2.4 `appsscript.json`
```json
{
  "timeZone": "Asia/Ho_Chi_Minh",
  "runtimeVersion": "V8",
  "exceptionLogging": "STACKDRIVER",
  "webapp": { "executeAs": "USER_DEPLOYING", "access": "ANYONE_ANONYMOUS" }
}
```
(Bản demo cho khách xem bằng link nên để `ANYONE_ANONYMOUS`. Khi có đăng nhập thật sẽ đổi.)

### 2.5 `Code.gs`
- `doGet()`: render `Index.html` bằng `HtmlService.createTemplateFromFile`, title "Quản lý Công trình", `addMetaTag('viewport','width=device-width, initial-scale=1')`, `setXFrameOptionsMode(ALLOWALL)`.
- `include(name)`: trả về nội dung file HTML con.
- `onOpen()`: tạo menu "🏗 Công trình" trong Sheet, gồm "Khởi tạo các tab", "Tạo dữ liệu mẫu", "Mở Web App".

---

## 3. Mô hình dữ liệu (các tab trong Google Sheet)

Dòng 1 của mỗi tab là tiêu đề cột, viết **đúng tên như dưới đây**. `Db.gs` ánh xạ theo tên cột, không theo vị trí cột.
Kiểu dữ liệu: `str`, `int`, `num`, `date` (`yyyy-MM-dd`), `datetime`, `enum`.

### 3.1 `CongTrinh`
| Cột | Kiểu | Ghi chú |
|---|---|---|
| id | str | `CT-0001` |
| ten | str | bắt buộc |
| chuDauTu | str | |
| diaDiem | str | |
| ngayKhoiCong | date | bắt buộc |
| ngayHoanThanh | date | bắt buộc, ≥ ngày khởi công |
| giaTriHopDong | int | VNĐ |
| chiHuyTruong | str | tên người |
| trangThai | enum | `CHUAN_BI` / `DANG_THI_CONG` / `TAM_DUNG` / `HOAN_THANH` |
| driveFolderId | str | thư mục ảnh, tạo tự động |
| createdAt | datetime | |

### 3.2 `HangMuc`
| Cột | Kiểu | Ghi chú |
|---|---|---|
| id | str | `HM-0001` |
| congTrinhId | str | FK → CongTrinh.id |
| stt | int | thứ tự hiển thị |
| ten | str | ví dụ "Bê tông móng" |
| donVi | str | m3, m2, tấn, md, cọc, bộ… |
| klKeHoach | num | > 0 |
| ngayBatDau | date | kế hoạch |
| ngayKetThuc | date | kế hoạch, ≥ ngày bắt đầu |
| createdAt | datetime | |

### 3.3 `BaoCaoNgay`
| Cột | Kiểu | Ghi chú |
|---|---|---|
| id | str | `BC-000001` |
| ngay | date | không được ở tương lai |
| congTrinhId | str | |
| hangMucId | str | phải thuộc công trình đã chọn |
| klThucHien | num | ≥ 0 |
| soNhanCong | int | ≥ 0 |
| mayMoc | str | tự do, ví dụ "1 máy xúc, 1 cẩu" |
| thoiTiet | enum | `NANG` / `MUA` / `AM_U` / `MUA_LON` |
| vuongMac | str | |
| anh | str | danh sách fileId Drive, cách nhau bởi dấu `,` |
| nguoiBaoCao | str | tên người (demo: lấy theo vai trò đang chọn) |
| trangThai | enum | `CHO_DUYET` / `DA_DUYET` / `TRA_LAI` |
| nguoiDuyet | str | |
| ghiChuDuyet | str | bắt buộc khi trả lại |
| ngayDuyet | datetime | |
| createdAt | datetime | |

**Quy tắc:** báo cáo `DA_DUYET` bị khoá, không ai được sửa hay xoá. Báo cáo `TRA_LAI` được người báo cáo sửa và gửi lại; khi gửi lại thì trạng thái quay về `CHO_DUYET`. **Chỉ báo cáo đã duyệt mới được tính vào tiến độ.**

### 3.4 `DuToan`
| Cột | Kiểu | Ghi chú |
|---|---|---|
| id | str | `DT-00001` |
| congTrinhId | str | |
| hangMucId | str | gắn dòng dự toán vào hạng mục |
| maHieu | str | mã định mức, ví dụ `AF.11213` (có thể trống) |
| noiDung | str | |
| donVi | str | |
| khoiLuong | num | |
| dgVatLieu | int | đơn giá vật liệu |
| dgNhanCong | int | đơn giá nhân công |
| dgMay | int | đơn giá máy |
| thanhTien | int | = khoiLuong × (dgVatLieu + dgNhanCong + dgMay), làm tròn; **server tự tính, không lấy theo giá trị client gửi lên** |

### 3.5 `ChiPhi` (chi phí thực tế)
| Cột | Kiểu | Ghi chú |
|---|---|---|
| id | str | `CP-000001` |
| ngay | date | |
| congTrinhId | str | |
| hangMucId | str | |
| loai | enum | `VAT_LIEU` / `NHAN_CONG` / `MAY` / `KHAC` |
| noiDung | str | |
| soTien | int | > 0 |
| nhaCungCap | str | |
| soChungTu | str | |
| nguoiNhap | str | |
| createdAt | datetime | |

### 3.6 `CauHinh` (key–value)
| key | value mặc định |
|---|---|
| NGUONG_CHI_PHI_VANG | 80 |
| NGUONG_CHI_PHI_DO | 100 |
| NGUONG_CHAM_VANG | 5 |
| NGUONG_CHAM_DO | 10 |
| TEN_CONG_TY | Công ty CP Xây dựng Demo |

### 3.7 `Db.gs` — API bắt buộc
```js
Db.getAll(tab)                 // → Array<Object>, bỏ qua dòng trống
Db.findById(tab, id)           // → Object | null
Db.where(tab, predicateFn)     // → Array<Object>
Db.insert(tab, obj)            // tự sinh id theo tiền tố, set createdAt; → obj
Db.update(tab, id, patch)      // chỉ ghi các cột có trong patch; → obj mới
Db.remove(tab, id)
Db.bulkInsert(tab, arr)        // ghi 1 lần bằng setValues (dùng cho seed / import)
Db.clear(tab)                  // xoá dữ liệu, giữ dòng tiêu đề
Db.ensureSheets()              // tạo tab + tiêu đề nếu thiếu, định dạng cột date/number là text/number
```
- Đọc cả tab trong **1 lần gọi** `getDataRange().getValues()`.
- Cache theo từng request (biến trong bộ nhớ). Dashboard cache thêm bằng `CacheService` 60 giây; xoá cache khi có ghi vào `BaoCaoNgay`, `ChiPhi`, `DuToan`, `HangMuc`, `CongTrinh`.
- Sinh id: tìm số lớn nhất hiện có trong tab rồi cộng 1, đệm 0 theo độ dài ở mục 3. Thao tác này chạy bên trong lock.
- Các cột id, date, mã hiệu đặt định dạng `@` (plain text) để Sheet không tự đổi kiểu.

---

## 4. Vai trò (demo, không đăng nhập)

Thanh trên cùng có dropdown **"Xem với vai trò"**. Giá trị chọn lưu ở `localStorage` và gửi kèm mọi lệnh gọi server dưới dạng tham số `ctx = { role, userName }`.

| Vai trò | `role` | Tên hiển thị mẫu |
|---|---|---|
| Giám đốc | `GIAM_DOC` | Nguyễn Văn An |
| Chỉ huy trưởng | `CHT` | Trần Minh Đức |
| Kỹ thuật / Giám sát | `KY_THUAT` | Lê Hoàng Nam |
| Kế toán | `KE_TOAN` | Phạm Thu Hà |

**Ma trận quyền** (server **và** UI đều phải kiểm tra; UI ẩn nút, server từ chối và trả lỗi):

| Chức năng | GIAM_DOC | CHT | KY_THUAT | KE_TOAN |
|---|:-:|:-:|:-:|:-:|
| Xem dashboard, công trình | ✔ | ✔ | ✔ | ✔ |
| Xem số tiền (dự toán, chi phí) | ✔ | ✔ | ✘ | ✔ |
| Tạo / sửa báo cáo ngày | ✘ | ✔ | ✔ | ✘ |
| Duyệt / trả lại báo cáo | ✔ | ✔ | ✘ | ✘ |
| Nhập chi phí thực tế | ✘ | ✘ | ✘ | ✔ |
| Import dự toán | ✔ | ✘ | ✘ | ✔ |
| Quản lý danh mục công trình / hạng mục | ✔ | ✔ | ✘ | ✘ |
| Tạo lại dữ liệu mẫu | ✔ | ✘ | ✘ | ✘ |

Cài đặt: trong `Config.gs` có `PERMISSIONS = { 'report.create': ['CHT','KY_THUAT'], ... }` và hàm `requirePerm(ctx, perm)`.
Sau này khi có đăng nhập thật, chỉ cần thay chỗ lấy `ctx` (đọc từ session thay vì từ client), các service giữ nguyên.
Khi vai trò là `KY_THUAT`, server **không trả về** các trường tiền. UI không chỉ ẩn trường mà phải không nhận được dữ liệu đó.

---

## 5. Công thức nghiệp vụ

Ký hiệu: `today` = ngày hiện tại (Asia/Ho_Chi_Minh). Chỉ tính báo cáo có `trangThai = DA_DUYET`.

### 5.1 Tiến độ hạng mục
- `klLuyKe(HM) = Σ klThucHien` của các báo cáo đã duyệt thuộc hạng mục.
- `ptThucTe(HM) = min(100, klLuyKe / klKeHoach × 100)`.
- `ptKeHoach(HM, d)`: tuyến tính theo thời gian.
  - `d < ngayBatDau` → 0
  - `d ≥ ngayKetThuc` → 100
  - còn lại → `(d − ngayBatDau + 1) / (ngayKetThuc − ngayBatDau + 1) × 100` (tính theo ngày)

### 5.2 Trọng số & tiến độ công trình
- `trongSo(HM) = Σ thanhTien` của dòng dự toán thuộc HM. Nếu cả công trình chưa có dự toán thì mọi HM có trọng số bằng nhau (= 1).
- `ptThucTe(CT) = Σ(ptThucTe(HM) × trongSo) / Σ trongSo`
- `ptKeHoach(CT, d)` tính tương tự.

### 5.3 Trạng thái tiến độ (cho cả HM và CT)
`lech = ptKeHoach(today) − ptThucTe`
- `ptThucTe = 100` → **Hoàn thành** (xanh lá)
- `today > ngayKetThuc` và `ptThucTe < 100` → **Quá hạn** (đỏ)
- `lech ≥ NGUONG_CHAM_DO` → **Chậm** (đỏ)
- `lech ≥ NGUONG_CHAM_VANG` → **Cần chú ý** (vàng)
- còn lại → **Đúng tiến độ** (xanh)

### 5.4 Chi phí
- `duToan(HM|CT) = Σ thanhTien`, `thucChi(HM|CT) = Σ soTien`
- `ptChi = thucChi / duToan × 100` (nếu `duToan = 0` thì hiển thị "—")
- Trạng thái: `ptChi ≥ NGUONG_CHI_PHI_DO` → **Vượt dự toán** (đỏ); `≥ NGUONG_CHI_PHI_VANG` → **Sắp vượt** (vàng); còn lại **Trong ngân sách** (xanh).
- Chỉ số **"Chi vượt tiến độ"**: `ptChi − ptThucTe`. Nếu > 10 điểm % thì hiển thị cảnh báo "Chi tiêu nhanh hơn tiến độ thi công".
- Tách theo loại: dự toán chia thành VL / NC / Máy theo `khoiLuong × dgX`; thực chi chia theo `loai` (loại `KHAC` hiển thị riêng).

### 5.5 Đường cong tiến độ (cho biểu đồ)
Theo tuần, từ `ngayKhoiCong` đến `min(today, ngayHoanThanh)`, mỗi điểm cuối tuần tính:
- `keHoach` = `ptKeHoach(CT, d)`
- `thucTe` = `ptThucTe(CT)` chỉ tính các báo cáo có `ngay ≤ d`
Đường kế hoạch kéo dài tới `ngayHoanThanh`; đường thực tế dừng ở `today`.

---

## 6. Hàm server (gọi từ client qua `google.script.run`)

Tham số đầu tiên của mọi hàm là `ctx`. Trả về `{ok, data|error}`. Bọc mọi hàm bằng `handle_(fn)` để bắt lỗi và log.

| Hàm | Quyền | Mô tả |
|---|---|---|
| `api_getBootstrap(ctx)` | xem | Danh sách công trình rút gọn, hạng mục, enum, cấu hình, tên công ty |
| `api_getDashboard(ctx)` | xem | KPI + bảng công trình + dữ liệu biểu đồ (mục 7.1) |
| `api_listProjects(ctx, filter)` | xem | filter: `{trangThai?, q?}` |
| `api_getProjectDetail(ctx, id)` | xem | CT + HM (kèm tiến độ, chi phí) + đường cong + 20 báo cáo gần nhất + tổng hợp chi phí theo loại |
| `api_saveProject(ctx, obj)` | danh mục | Tạo/sửa. Khi tạo mới thì tạo thư mục Drive `Ảnh công trình/<id> - <ten>` |
| `api_saveWorkItem(ctx, obj)` | danh mục | Tạo/sửa hạng mục |
| `api_deleteWorkItem(ctx, id)` | danh mục | Từ chối nếu hạng mục đã có báo cáo, dự toán hoặc chi phí |
| `api_listReports(ctx, filter)` | xem | filter: `{congTrinhId?, trangThai?, tuNgay?, denNgay?}`, mới nhất trước, phân trang 50 |
| `api_saveReport(ctx, obj, photos)` | report.create | `photos`: mảng `{name, mimeType, base64}`, tối đa 5 ảnh. Kiểm tra theo mục 3.3 |
| `api_reviewReport(ctx, id, action, note)` | report.review | `action`: `APPROVE` / `RETURN`; `RETURN` bắt buộc có `note` |
| `api_getPhotoUrls(ctx, fileIds)` | xem | Trả về URL thumbnail `https://drive.google.com/thumbnail?id=<id>&sz=w800`; file được set chia sẻ "anyone with link – view" khi upload |
| `api_saveCost(ctx, obj)` | cost.create | |
| `api_listCosts(ctx, filter)` | xem tiền | |
| `api_previewBudgetImport(ctx, congTrinhId, tsvText)` | budget.import | Parse dữ liệu, trả về các dòng hợp lệ và các dòng lỗi (kèm lý do), **chưa ghi** |
| `api_commitBudgetImport(ctx, congTrinhId, rows, mode)` | budget.import | `mode`: `APPEND` / `REPLACE` (REPLACE xoá dự toán cũ của công trình) |
| `api_resetDemo(ctx)` | demo.reset | Xoá dữ liệu rồi chạy seed |

### 6.1 Import dự toán (dán từ Excel)
Người dùng copy vùng dữ liệu trong Excel (G8, Eta, file tự làm…) rồi dán vào textarea. Dữ liệu dán vào là text phân cách bằng tab. Thứ tự cột mặc định:
`Mã hạng mục | Mã hiệu | Nội dung | Đơn vị | Khối lượng | ĐG Vật liệu | ĐG Nhân công | ĐG Máy`
- Bỏ dòng tiêu đề nếu ô "Khối lượng" của dòng đầu không phải số.
- Số có thể chứa dấu `.` hoặc `,` làm phân cách hàng nghìn, ví dụ `1.250.000` hoặc `1,250,000`. Khối lượng có thể dùng `,` làm dấu thập phân, ví dụ `12,5`. Quy tắc parse: nếu có cả `.` và `,` thì ký tự xuất hiện sau cùng là dấu thập phân; nếu chỉ có `.` và sau nó đúng 3 chữ số thì coi là phân cách hàng nghìn.
- "Mã hạng mục" phải trùng `HangMuc.stt` **hoặc** `HangMuc.id` của công trình. Nếu không trùng thì đánh dấu lỗi.
- Màn hình preview hiển thị bảng: dòng hợp lệ màu bình thường, dòng lỗi tô đỏ kèm lý do. Có tổng thành tiền.

### 6.2 Upload ảnh
- Client nén ảnh bằng canvas: cạnh dài tối đa 1600px, JPEG chất lượng 0.8. Mỗi ảnh sau nén phải < 1.5MB, tối đa 5 ảnh mỗi báo cáo.
- Server: `Utilities.newBlob(Utilities.base64Decode(b64), mime, name)` rồi lưu vào thư mục Drive của công trình. Tên file: `<ngay>_<hangMucId>_<n>.jpg`.

---

## 7. Giao diện

### 7.1 Khung chung
- **Thanh trên**: tên công ty, dropdown vai trò, tên người dùng mẫu.
- **Điều hướng**:
  - Desktop: sidebar bên trái.
  - Điện thoại (< 768px): thanh tab dưới đáy, gồm Tổng quan, Công trình, **+ Báo cáo** (nút nổi bật ở giữa), Duyệt, Thêm. Mục "Thêm" chứa Chi phí, Dự toán, Danh mục.
- Router dùng hash: `#/dashboard`, `#/projects`, `#/project/CT-0001`, `#/report/new`, `#/approvals`, `#/costs`, `#/budget`, `#/catalog`.
- Menu nào vai trò hiện tại không có quyền thì ẩn.
- Có trạng thái đang tải (skeleton), thông báo toast (thành công / lỗi) và hộp xác nhận tự làm (không dùng `confirm()`).
- Phong cách: sạch, tông màu kỹ thuật/xây dựng (xám xanh đậm + điểm nhấn cam an toàn). Badge trạng thái theo màu ở mục 5.3/5.4. Số canh phải, dùng `font-variant-numeric: tabular-nums`. Tiền format `1.250.000.000 ₫`; số lớn trên KPI rút gọn thành `1,25 tỷ` / `850 tr`.

### 7.2 Tổng quan (`#/dashboard`)
- **6 thẻ KPI**: Công trình đang thi công · Tiến độ TB (%) · Tổng dự toán · Tổng thực chi (kèm % so dự toán) · Báo cáo chờ duyệt · Hạng mục chậm/quá hạn.
- **Bảng công trình**: Tên · CHT · % kế hoạch · % thực tế (thanh progress, vạch đánh dấu vị trí kế hoạch) · Trạng thái tiến độ · % chi phí · Trạng thái chi phí. Bấm vào dòng để mở chi tiết.
- **Biểu đồ 1**: cột ngang so sánh % kế hoạch và % thực tế của từng công trình.
- **Biểu đồ 2**: cột nhóm so sánh dự toán và thực chi của từng công trình.
- **Danh sách "Cần chú ý"**: tối đa 10 mục, gồm hạng mục chậm/quá hạn và công trình vượt hoặc sắp vượt chi phí.
- Vai trò `KY_THUAT`: ẩn các KPI và biểu đồ liên quan tới tiền.

### 7.3 Công trình (`#/projects`)
Dạng thẻ hoặc bảng, có ô tìm kiếm theo tên và lọc theo trạng thái. Mỗi mục hiện tên, địa điểm, thời gian, % thực tế và badge trạng thái.

### 7.4 Chi tiết công trình (`#/project/:id`)
- **Header**: thông tin chung, % kế hoạch, % thực tế, số ngày còn lại (hoặc số ngày đã quá hạn).
- **Tab "Tiến độ"**: biểu đồ đường cong (mục 5.5) và bảng hạng mục: STT · Tên · ĐV · KL kế hoạch · KL lũy kế · % thực tế · % kế hoạch · Bắt đầu–Kết thúc · Trạng thái.
- **Tab "Báo cáo"**: danh sách báo cáo của công trình. Bấm vào một báo cáo để mở modal chi tiết, có ảnh (lưới thumbnail, bấm để phóng to).
- **Tab "Dự toán & Chi phí"** (ẩn với KY_THUAT):
  - Bảng theo hạng mục: Dự toán · Thực chi · Còn lại · % chi · Trạng thái.
  - Biểu đồ doughnut cơ cấu thực chi theo loại.
  - Bảng so sánh VL/NC/Máy giữa dự toán và thực chi.
  - Danh sách dòng dự toán chi tiết, thu gọn được.

### 7.5 Báo cáo ngày (`#/report/new`, `#/report/edit/:id`)
Form một cột, tối ưu cho điện thoại, ô nhập cao ≥ 44px:
1. Ngày (mặc định hôm nay)
2. Công trình (chỉ công trình `DANG_THI_CONG`)
3. Hạng mục (lọc theo công trình; hiện kèm "ĐV · đã làm X/Y")
4. Khối lượng thực hiện (bàn phím số), hiện đơn vị bên cạnh. Nếu lũy kế sau khi cộng vượt 110% KL kế hoạch thì cảnh báo vàng nhưng vẫn cho gửi.
5. Số nhân công
6. Máy móc
7. Thời tiết (4 nút chọn có icon)
8. Vướng mắc / ghi chú
9. Ảnh: nút "Chụp / chọn ảnh" (`<input type="file" accept="image/*" capture="environment" multiple>`), hiện preview, có nút xoá từng ảnh
10. Nút **Gửi báo cáo**. Khi đang gửi thì khoá nút và hiện tiến trình. Gửi xong hiện toast, form reset nhưng giữ lại ngày và công trình.

Bên dưới form: danh sách "Báo cáo của tôi" (theo `nguoiBaoCao`), báo cáo bị trả lại hiện trên cùng kèm lý do và nút Sửa.

### 7.6 Duyệt báo cáo (`#/approvals`)
- Danh sách báo cáo `CHO_DUYET`, lọc được theo công trình.
- Mỗi thẻ hiện: ngày, công trình, hạng mục, khối lượng + đơn vị, nhân công, thời tiết, vướng mắc, thumbnail ảnh.
- Nút **Duyệt** và **Trả lại**. Trả lại thì mở ô nhập lý do (bắt buộc).
- Có checkbox chọn nhiều để **Duyệt hàng loạt**.

### 7.7 Chi phí (`#/costs`)
Form nhập: ngày, công trình, hạng mục, loại, nội dung, số tiền (tự format khi gõ), nhà cung cấp, số chứng từ. Bên dưới là bảng chi phí, lọc theo công trình/loại/khoảng ngày, có dòng tổng.

### 7.8 Dự toán (`#/budget`)
Chọn công trình, dán dữ liệu vào textarea (có hướng dẫn thứ tự cột và nút "Dán dữ liệu mẫu"), bấm **Xem trước** để hiện bảng preview (mục 6.1), chọn chế độ Thêm vào / Thay thế, rồi bấm **Nhập**.

### 7.9 Danh mục (`#/catalog`)
CRUD công trình và hạng mục bằng bảng + modal form. Hạng mục quản lý theo từng công trình, có thể chỉnh số thứ tự `stt`. Có nút **Tạo lại dữ liệu mẫu** (chỉ GIAM_DOC), bấm vào thì hiện hộp xác nhận.

---

## 8. Dữ liệu mẫu (`Seed.gs`)

Dùng bộ sinh số ngẫu nhiên **có seed cố định** (ví dụ mulberry32 với seed 2026) để mỗi lần tạo lại đều ra cùng dữ liệu. Mốc thời gian tính tương đối theo `today`, để dữ liệu luôn "đang diễn ra" vào ngày demo.

| Công trình | Thời gian | Giá trị HĐ | Kịch bản |
|---|---|---|---|
| CT-0001 Nhà xưởng KCN Yên Phong – Bắc Ninh | today−90 → today+60 | 18,5 tỷ | **Đúng tiến độ**, chi phí bình thường (~ khớp tiến độ) |
| CT-0002 Trường mầm non Hoa Sen – Hà Đông | today−60 → today+90 | 9,2 tỷ | **Chậm tiến độ** (thực tế thấp hơn kế hoạch ~15%), có vướng mắc "mưa lớn", "chậm cấp vật tư" |
| CT-0003 Nhà phố 5 tầng – Cầu Giấy | today−45 → today+75 | 4,8 tỷ | Tiến độ ổn nhưng **chi phí vượt** (vật liệu thép tăng giá; % chi > % tiến độ ~20 điểm, có hạng mục vượt dự toán) |

Mỗi công trình có 6–8 hạng mục với tên, đơn vị và khối lượng hợp lý. Ví dụ:
- Chuẩn bị mặt bằng (m2)
- Ép cọc BTCT 300x300 (md)
- Đào đất móng (m3)
- Bê tông móng (m3)
- Cốt thép (tấn)
- Kết cấu thân/khung thép (tấn)
- Xây tường (m3)
- Trát/hoàn thiện (m2)
- Điện nước (bộ/HT)
- Mái tôn (m2)

Các hạng mục gối nhau theo thời gian.

- **Dự toán**: 2–4 dòng cho mỗi hạng mục, có mã hiệu dạng định mức (`AB.25112`, `AF.11213`, `AF.61130`…), đơn giá hợp lý theo thị trường. Tổng dự toán khoảng 85–90% giá trị HĐ.
- **Báo cáo ngày**: mỗi ngày làm việc (bỏ Chủ nhật) mỗi công trình có 1–3 báo cáo cho các hạng mục đang trong kỳ. Báo cáo trước hôm qua đều `DA_DUYET`; khoảng 6–8 báo cáo gần nhất để `CHO_DUYET`; 1–2 báo cáo `TRA_LAI` có lý do. Thời tiết ngẫu nhiên, có mưa. Seed không tạo ảnh (`anh` để trống).
- **Chi phí**: rải theo tuần, theo 4 loại, bám theo kịch bản của từng công trình.
- `Db.bulkInsert` cho mỗi tab, đảm bảo seed chạy xong dưới 60 giây.

---

## 9. Các bước triển khai & nghiệm thu

### Bước 1 — Khung dự án & dữ liệu
- Tạo các file ở mục 2.2, `appsscript.json`, `Config.gs`, `Utils.gs`, `Db.gs`, `Code.gs` (`onOpen`, `doGet` hiển thị trang "Hello").
- Viết hướng dẫn clasp trong `README.md`: `npm i -g @google/clasp`, `clasp login`, `clasp create --type sheets --title "Quản lý Công trình" --rootDir src`, `clasp push`, `clasp deploy`.
- ✅ Chạy menu "Khởi tạo các tab" thì đủ 6 tab, đúng tiêu đề. Có hàm test thủ công `test_Db()` chạy được: insert → findById → update → remove.

### Bước 2 — Seed & tính toán
- `Seed.gs`, `ProjectService`, `BudgetService` (phần đọc), `DashboardService`.
- ✅ Chạy "Tạo dữ liệu mẫu" xong dưới 60 giây. Hàm `test_Dashboard()` log ra kết quả đúng kịch bản: CT-0001 đúng tiến độ, CT-0002 "Chậm", CT-0003 có trạng thái chi phí "Vượt" hoặc "Sắp vượt" và cảnh báo "Chi tiêu nhanh hơn tiến độ".

### Bước 3 — Khung UI + Dashboard + Công trình
- `Index`, `Styles`, `App` (router, wrapper Promise cho `google.script.run`, toast, modal, chọn vai trò), Dashboard, Projects, ProjectDetail.
- ✅ Mở link Web App thì dashboard hiển thị đủ KPI, bảng và 2 biểu đồ. Bấm vào công trình thì xem được 3 tab. Đổi sang vai trò Kỹ thuật thì mọi số tiền biến mất, kiểm tra cả trong dữ liệu trả về ở tab Network/console. Trang không cuộn ngang ở độ rộng 375px.

### Bước 4 — Báo cáo ngày & Duyệt
- ReportForm, Approvals, upload ảnh, `api_saveReport`, `api_reviewReport`.
- ✅ Với vai trò Kỹ thuật, gửi báo cáo có 2 ảnh từ điện thoại thì ảnh nằm trong thư mục Drive của công trình. Chuyển sang CHT thì thấy báo cáo trong mục Duyệt; bấm duyệt thì % tiến độ trên dashboard tăng tương ứng. Trả lại khi không nhập lý do thì bị chặn. Báo cáo đã duyệt không sửa được, kể cả khi gọi API trực tiếp. Gửi báo cáo có ngày ở tương lai thì bị từ chối.

### Bước 5 — Chi phí & Dự toán
- Costs, BudgetImport, các api tương ứng.
- ✅ Với vai trò Kế toán, nhập chi phí thì % chi trên dashboard thay đổi. Dán dữ liệu mẫu (có 1 dòng sai mã hạng mục, 1 dòng khối lượng `12,5`, 1 dòng đơn giá `1.250.000`) thì preview parse đúng, dòng sai bị tô đỏ. Chế độ Thay thế xoá dự toán cũ.

### Bước 6 — Danh mục, hoàn thiện, deploy
- Catalog, reset demo, kiểm tra quyền toàn bộ, xử lý trạng thái rỗng (công trình chưa có dự toán / chưa có báo cáo).
- ✅ Đi qua toàn bộ ma trận quyền ở mục 4 với từng vai trò. Không có lỗi trong console. Deploy bản Web App, link mở được ở cửa sổ ẩn danh trên điện thoại.

---

## 10. Hướng nâng cấp sau demo (không làm bây giờ)
- Đăng nhập: Google Workspace (`Session.getActiveUser()`) hoặc tài khoản/mật khẩu riêng. Thay nguồn `ctx`, thêm tab `NhanSu`, giới hạn CHT/Kỹ thuật chỉ thấy công trình mình phụ trách.
- Xuất báo cáo tuần/tháng ra PDF (Google Docs template) hoặc Excel.
- Thông báo Telegram/Zalo OA khi có báo cáo chờ duyệt hoặc chi phí vượt ngưỡng.
- Tách file dữ liệu theo năm khi dữ liệu lớn.
