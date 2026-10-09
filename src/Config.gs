const APP_CONFIG = Object.freeze({
  timeZone: 'Asia/Ho_Chi_Minh',
  title: 'Quản lý Công trình',
  companyName: 'Công ty CP Xây dựng Demo',
  dashboardCacheKey: 'dashboard:v1'
});

const TABS = Object.freeze({
  CONG_TRINH: 'CongTrinh',
  HANG_MUC: 'HangMuc',
  BAO_CAO_NGAY: 'BaoCaoNgay',
  DU_TOAN: 'DuToan',
  CHI_PHI: 'ChiPhi',
  CAU_HINH: 'CauHinh'
});

const SHEET_SCHEMAS = Object.freeze({
  CongTrinh: [
    ['id', 'str'], ['ten', 'str'], ['chuDauTu', 'str'], ['diaDiem', 'str'],
    ['ngayKhoiCong', 'date'], ['ngayHoanThanh', 'date'], ['giaTriHopDong', 'int'],
    ['chiHuyTruong', 'str'], ['trangThai', 'enum'], ['driveFolderId', 'str'],
    ['createdAt', 'datetime']
  ],
  HangMuc: [
    ['id', 'str'], ['congTrinhId', 'str'], ['stt', 'int'], ['ten', 'str'],
    ['donVi', 'str'], ['klKeHoach', 'num'], ['ngayBatDau', 'date'],
    ['ngayKetThuc', 'date'], ['createdAt', 'datetime']
  ],
  BaoCaoNgay: [
    ['id', 'str'], ['ngay', 'date'], ['congTrinhId', 'str'], ['hangMucId', 'str'],
    ['klThucHien', 'num'], ['soNhanCong', 'int'], ['mayMoc', 'str'],
    ['thoiTiet', 'enum'], ['vuongMac', 'str'], ['anh', 'str'],
    ['nguoiBaoCao', 'str'], ['trangThai', 'enum'], ['nguoiDuyet', 'str'],
    ['ghiChuDuyet', 'str'], ['ngayDuyet', 'datetime'], ['createdAt', 'datetime']
  ],
  DuToan: [
    ['id', 'str'], ['congTrinhId', 'str'], ['hangMucId', 'str'], ['maHieu', 'str'],
    ['noiDung', 'str'], ['donVi', 'str'], ['khoiLuong', 'num'], ['dgVatLieu', 'int'],
    ['dgNhanCong', 'int'], ['dgMay', 'int'], ['thanhTien', 'int']
  ],
  ChiPhi: [
    ['id', 'str'], ['ngay', 'date'], ['congTrinhId', 'str'], ['hangMucId', 'str'],
    ['loai', 'enum'], ['noiDung', 'str'], ['soTien', 'int'], ['nhaCungCap', 'str'],
    ['soChungTu', 'str'], ['nguoiNhap', 'str'], ['createdAt', 'datetime']
  ],
  CauHinh: [['key', 'str'], ['value', 'str']]
});

const ID_RULES = Object.freeze({
  CongTrinh: { prefix: 'CT-', digits: 4 },
  HangMuc: { prefix: 'HM-', digits: 4 },
  BaoCaoNgay: { prefix: 'BC-', digits: 6 },
  DuToan: { prefix: 'DT-', digits: 5 },
  ChiPhi: { prefix: 'CP-', digits: 6 }
});

const DEFAULT_SETTINGS = Object.freeze({
  NGUONG_CHI_PHI_VANG: 80,
  NGUONG_CHI_PHI_DO: 100,
  NGUONG_CHAM_VANG: 5,
  NGUONG_CHAM_DO: 10,
  TEN_CONG_TY: 'Công ty CP Xây dựng Demo'
});

const ROLES = Object.freeze({
  GIAM_DOC: 'Giám đốc',
  CHT: 'Chỉ huy trưởng',
  KY_THUAT: 'Kỹ thuật / Giám sát',
  KE_TOAN: 'Kế toán'
});

const ENUMS = Object.freeze({
  projectStatus: ['CHUAN_BI', 'DANG_THI_CONG', 'TAM_DUNG', 'HOAN_THANH'],
  weather: ['NANG', 'MUA', 'AM_U', 'MUA_LON'],
  reportStatus: ['CHO_DUYET', 'DA_DUYET', 'TRA_LAI'],
  costType: ['VAT_LIEU', 'NHAN_CONG', 'MAY', 'KHAC']
});

const PERMISSIONS = Object.freeze({
  view: ['GIAM_DOC', 'CHT', 'KY_THUAT', 'KE_TOAN'],
  'money.view': ['GIAM_DOC', 'CHT', 'KE_TOAN'],
  'report.create': ['CHT', 'KY_THUAT'],
  'report.review': ['GIAM_DOC', 'CHT'],
  'cost.create': ['KE_TOAN'],
  'budget.import': ['GIAM_DOC', 'KE_TOAN'],
  'catalog.manage': ['GIAM_DOC', 'CHT'],
  'demo.reset': ['GIAM_DOC']
});

function requirePerm(ctx, permission) {
  const allowedRoles = PERMISSIONS[permission] || [];
  const role = ctx && ctx.role;
  if (allowedRoles.indexOf(role) === -1) {
    throw new Error('Bạn không có quyền thực hiện thao tác này.');
  }
}

function test_Permissions() {
  const expected = {
    view: ['GIAM_DOC', 'CHT', 'KY_THUAT', 'KE_TOAN'],
    'money.view': ['GIAM_DOC', 'CHT', 'KE_TOAN'],
    'report.create': ['CHT', 'KY_THUAT'],
    'report.review': ['GIAM_DOC', 'CHT'],
    'cost.create': ['KE_TOAN'],
    'budget.import': ['GIAM_DOC', 'KE_TOAN'],
    'catalog.manage': ['GIAM_DOC', 'CHT'],
    'demo.reset': ['GIAM_DOC']
  };
  Object.keys(expected).forEach(function (permission) {
    Object.keys(ROLES).forEach(function (role) {
      let allowed = true;
      try {
        requirePerm({ role: role }, permission);
      } catch (error) {
        allowed = false;
      }
      assert_(allowed === (expected[permission].indexOf(role) !== -1),
        'Sai quyền ' + permission + ' cho vai trò ' + role + '.');
    });
  });
  console.log('✅ test_Permissions thành công.');
}
