function enrichReports_(reports) {
  const projects = Db.getAll(TABS.CONG_TRINH).reduce(function (map, row) { map[row.id] = row; return map; }, {});
  const items = Db.getAll(TABS.HANG_MUC).reduce(function (map, row) { map[row.id] = row; return map; }, {});
  return reports.map(function (report) {
    return Object.assign({}, report, {
      congTrinhTen: projects[report.congTrinhId] ? projects[report.congTrinhId].ten : '',
      hangMucTen: items[report.hangMucId] ? items[report.hangMucId].ten : '',
      donVi: items[report.hangMucId] ? items[report.hangMucId].donVi : '',
      photoUrls: String(report.anh || '').split(',').filter(Boolean).map(function (id) {
        return 'https://drive.google.com/thumbnail?id=' + encodeURIComponent(id) + '&sz=w800';
      })
    });
  });
}

function api_listReports(ctx, filter) {
  return handle_(function () {
    requirePerm(ctx, 'view');
    const conditions = filter || {};
    let rows = Db.where(TABS.BAO_CAO_NGAY, function (row) {
      return (!conditions.congTrinhId || row.congTrinhId === conditions.congTrinhId) &&
        (!conditions.trangThai || row.trangThai === conditions.trangThai) &&
        (!conditions.tuNgay || row.ngay >= conditions.tuNgay) &&
        (!conditions.denNgay || row.ngay <= conditions.denNgay) &&
        (!conditions.nguoiBaoCao || row.nguoiBaoCao === conditions.nguoiBaoCao);
    });
    rows.sort(function (a, b) {
      return String(b.ngay + ' ' + b.createdAt).localeCompare(String(a.ngay + ' ' + a.createdAt));
    });
    return enrichReports_(rows.slice(0, 50));
  });
}

function validateReport_(obj) {
  assert_(obj && obj.ngay, 'Ngày báo cáo là bắt buộc.');
  assert_(obj.ngay <= today_(), 'Ngày báo cáo không được ở tương lai.');
  const project = Db.findById(TABS.CONG_TRINH, obj.congTrinhId);
  const item = Db.findById(TABS.HANG_MUC, obj.hangMucId);
  assert_(project, 'Công trình không tồn tại.');
  assert_(item && item.congTrinhId === obj.congTrinhId, 'Hạng mục không thuộc công trình đã chọn.');
  assert_(number_(obj.klThucHien) >= 0, 'Khối lượng thực hiện không được âm.');
  assert_(Number.isInteger(number_(obj.soNhanCong)) && number_(obj.soNhanCong) >= 0,
    'Số nhân công phải là số nguyên không âm.');
  assert_(ENUMS.weather.indexOf(obj.thoiTiet) !== -1, 'Thời tiết không hợp lệ.');
  return { project: project, item: item };
}

function saveReportPhotos_(project, report, photos) {
  if (!photos || photos.length === 0) return [];
  assert_(photos.length <= 5, 'Mỗi báo cáo chỉ được đính kèm tối đa 5 ảnh.');
  let folder;
  if (project.driveFolderId) {
    folder = DriveApp.getFolderById(project.driveFolderId);
  } else {
    folder = getPhotoRootFolder_().createFolder(project.id + ' - ' + project.ten);
    Db.update(TABS.CONG_TRINH, project.id, { driveFolderId: folder.getId() });
  }
  return photos.map(function (photo, index) {
    const base64 = String(photo.base64 || '').replace(/^data:[^;]+;base64,/, '');
    const bytes = Utilities.base64Decode(base64);
    assert_(bytes.length < 1.5 * 1024 * 1024, 'Ảnh số ' + (index + 1) + ' vượt quá 1,5 MB.');
    const mimeType = photo.mimeType === 'image/png' ? 'image/png' : 'image/jpeg';
    const name = report.ngay + '_' + report.hangMucId + '_' + (index + 1) + '.jpg';
    const file = folder.createFile(Utilities.newBlob(bytes, mimeType, name));
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    return file.getId();
  });
}

function api_saveReport(ctx, obj, photos) {
  return handle_(function () {
    requirePerm(ctx, 'report.create');
    const related = validateReport_(obj);
    let existing = null;
    if (obj.id) {
      existing = Db.findById(TABS.BAO_CAO_NGAY, obj.id);
      assert_(existing, 'Không tìm thấy báo cáo.');
      assert_(existing.trangThai !== 'DA_DUYET', 'Báo cáo đã duyệt không thể sửa.');
      assert_(existing.trangThai === 'TRA_LAI', 'Chỉ báo cáo bị trả lại mới được sửa và gửi lại.');
      assert_(existing.nguoiBaoCao === ctx.userName, 'Bạn chỉ có thể sửa báo cáo của mình.');
    }
    const uploadedIds = saveReportPhotos_(related.project, obj, photos || []);
    const previousIds = existing && existing.anh ? String(existing.anh).split(',').filter(Boolean) : [];
    const payload = {
      ngay: obj.ngay,
      congTrinhId: obj.congTrinhId,
      hangMucId: obj.hangMucId,
      klThucHien: number_(obj.klThucHien),
      soNhanCong: Math.round(number_(obj.soNhanCong)),
      mayMoc: String(obj.mayMoc || '').trim(),
      thoiTiet: obj.thoiTiet,
      vuongMac: String(obj.vuongMac || '').trim(),
      anh: previousIds.concat(uploadedIds).join(','),
      nguoiBaoCao: ctx.userName,
      trangThai: 'CHO_DUYET',
      nguoiDuyet: '',
      ghiChuDuyet: '',
      ngayDuyet: ''
    };
    return existing ? Db.update(TABS.BAO_CAO_NGAY, existing.id, payload) : Db.insert(TABS.BAO_CAO_NGAY, payload);
  });
}

function api_reviewReport(ctx, id, action, note) {
  return handle_(function () {
    requirePerm(ctx, 'report.review');
    assert_(['APPROVE', 'RETURN'].indexOf(action) !== -1, 'Thao tác duyệt không hợp lệ.');
    const report = Db.findById(TABS.BAO_CAO_NGAY, id);
    assert_(report, 'Không tìm thấy báo cáo.');
    assert_(report.trangThai === 'CHO_DUYET', 'Báo cáo này không còn ở trạng thái chờ duyệt.');
    if (action === 'RETURN') {
      assert_(String(note || '').trim(), 'Vui lòng nhập lý do trả lại báo cáo.');
    }
    return Db.update(TABS.BAO_CAO_NGAY, id, {
      trangThai: action === 'APPROVE' ? 'DA_DUYET' : 'TRA_LAI',
      nguoiDuyet: ctx.userName,
      ghiChuDuyet: action === 'RETURN' ? String(note).trim() : '',
      ngayDuyet: formatDateTime_()
    });
  });
}

function api_getPhotoUrls(ctx, fileIds) {
  return handle_(function () {
    requirePerm(ctx, 'view');
    return (fileIds || []).filter(Boolean).map(function (id) {
      return { id: id, url: 'https://drive.google.com/thumbnail?id=' + encodeURIComponent(id) + '&sz=w800' };
    });
  });
}
