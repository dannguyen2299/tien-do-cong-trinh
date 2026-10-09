function api_getBootstrap(ctx) {
  return handle_(function () {
    requirePerm(ctx, 'view');
    const data = loadDashboardData_();
    const summaries = getProjectSummaries_(today_(), data);
    const payload = {
      companyName: data.settings.TEN_CONG_TY,
      projects: summaries.map(function (project) {
        return {
          id: project.id,
          ten: project.ten,
          trangThai: project.trangThai,
          ptThucTe: project.ptThucTe,
          ptKeHoach: project.ptKeHoach,
          trangThaiTienDo: project.trangThaiTienDo,
          duToan: project.duToan,
          thucChi: project.thucChi,
          ptChi: project.ptChi,
          trangThaiChiPhi: project.trangThaiChiPhi
        };
      }),
      workItems: summaries.reduce(function (all, project) {
        return all.concat(project.hangMuc.map(function (item) {
          return {
            id: item.id,
            congTrinhId: item.congTrinhId,
            stt: item.stt,
            ten: item.ten,
            donVi: item.donVi,
            klKeHoach: item.klKeHoach,
            klLuyKe: item.klLuyKe,
            ngayBatDau: item.ngayBatDau,
            ngayKetThuc: item.ngayKetThuc
          };
        }));
      }, []),
      enums: ENUMS,
      settings: data.settings,
      roles: ROLES
    };
    return ctx.role === 'KY_THUAT' ? stripMoneyFields_(payload) : payload;
  });
}

function api_listProjects(ctx, filter) {
  return handle_(function () {
    requirePerm(ctx, 'view');
    const query = String(filter && filter.q || '').trim().toLowerCase();
    const status = filter && filter.trangThai;
    let projects = getProjectSummaries_(today_()).filter(function (project) {
      return (!status || project.trangThai === status) &&
        (!query || project.ten.toLowerCase().indexOf(query) !== -1 ||
          String(project.diaDiem || '').toLowerCase().indexOf(query) !== -1);
    });
    if (ctx.role === 'KY_THUAT') {
      projects = stripMoneyFields_(projects);
    }
    return projects;
  });
}

function api_getProjectDetail(ctx, id) {
  return handle_(function () {
    requirePerm(ctx, 'view');
    const data = loadDashboardData_();
    const project = data.projects.find(function (row) { return row.id === id; });
    if (!project) {
      throw new Error('Không tìm thấy công trình.');
    }
    const summary = calculateProjectSummary_(project, today_(), data);
    const projectReports = data.reports.filter(function (report) {
      return report.congTrinhId === id;
    }).sort(function (a, b) {
      return String(b.ngay + ' ' + b.createdAt).localeCompare(String(a.ngay + ' ' + a.createdAt));
    }).slice(0, 20).map(function (report) {
      return Object.assign({}, report, {
        photoUrls: String(report.anh || '').split(',').filter(Boolean).map(function (fileId) {
          return 'https://drive.google.com/thumbnail?id=' + encodeURIComponent(fileId) + '&sz=w800';
        })
      });
    });
    const budgetRows = data.budgets.filter(function (row) { return row.congTrinhId === id; });
    const costRows = data.costs.filter(function (row) { return row.congTrinhId === id; });
    const result = {
      project: summary,
      workItems: summary.hangMuc,
      progressCurve: buildProgressCurve_(project, data),
      recentReports: projectReports,
      costBreakdown: getCostBreakdown_(budgetRows, costRows),
      budgetRows: budgetRows
    };
    return ctx.role === 'KY_THUAT' ? stripMoneyFields_(result) : result;
  });
}

function validateProject_(obj) {
  assert_(obj && String(obj.ten || '').trim(), 'Tên công trình là bắt buộc.');
  assert_(obj.ngayKhoiCong && obj.ngayHoanThanh, 'Ngày khởi công và hoàn thành là bắt buộc.');
  assert_(obj.ngayHoanThanh >= obj.ngayKhoiCong, 'Ngày hoàn thành phải từ ngày khởi công trở đi.');
  assert_(ENUMS.projectStatus.indexOf(obj.trangThai) !== -1, 'Trạng thái công trình không hợp lệ.');
  assert_(number_(obj.giaTriHopDong) >= 0, 'Giá trị hợp đồng không hợp lệ.');
}

function getPhotoRootFolder_() {
  const folders = DriveApp.getFoldersByName('Ảnh công trình');
  return folders.hasNext() ? folders.next() : DriveApp.createFolder('Ảnh công trình');
}

function api_saveProject(ctx, obj) {
  return handle_(function () {
    requirePerm(ctx, 'catalog.manage');
    validateProject_(obj);
    const payload = {
      ten: String(obj.ten).trim(),
      chuDauTu: String(obj.chuDauTu || '').trim(),
      diaDiem: String(obj.diaDiem || '').trim(),
      ngayKhoiCong: obj.ngayKhoiCong,
      ngayHoanThanh: obj.ngayHoanThanh,
      giaTriHopDong: Math.round(number_(obj.giaTriHopDong)),
      chiHuyTruong: String(obj.chiHuyTruong || '').trim(),
      trangThai: obj.trangThai
    };
    if (obj.id) {
      const existing = Db.findById(TABS.CONG_TRINH, obj.id);
      assert_(existing, 'Không tìm thấy công trình.');
      return Db.update(TABS.CONG_TRINH, obj.id, payload);
    }
    const created = Db.insert(TABS.CONG_TRINH, Object.assign(payload, { driveFolderId: '' }));
    const folder = getPhotoRootFolder_().createFolder(created.id + ' - ' + created.ten);
    return Db.update(TABS.CONG_TRINH, created.id, { driveFolderId: folder.getId() });
  });
}

function api_deleteProject(ctx, id) {
  return handle_(function () {
    requirePerm(ctx, 'catalog.manage');
    assert_(Db.findById(TABS.CONG_TRINH, id), 'Không tìm thấy công trình.');
    const hasReferences = Db.where(TABS.HANG_MUC, function (row) { return row.congTrinhId === id; }).length ||
      Db.where(TABS.BAO_CAO_NGAY, function (row) { return row.congTrinhId === id; }).length ||
      Db.where(TABS.DU_TOAN, function (row) { return row.congTrinhId === id; }).length ||
      Db.where(TABS.CHI_PHI, function (row) { return row.congTrinhId === id; }).length;
    assert_(!hasReferences, 'Không thể xoá công trình đã có hạng mục hoặc dữ liệu phát sinh.');
    Db.remove(TABS.CONG_TRINH, id);
    return true;
  });
}

function validateWorkItem_(obj) {
  const project = Db.findById(TABS.CONG_TRINH, obj && obj.congTrinhId);
  assert_(project, 'Công trình không tồn tại.');
  assert_(String(obj.ten || '').trim(), 'Tên hạng mục là bắt buộc.');
  assert_(number_(obj.stt) > 0, 'Số thứ tự phải lớn hơn 0.');
  assert_(number_(obj.klKeHoach) > 0, 'Khối lượng kế hoạch phải lớn hơn 0.');
  assert_(obj.ngayBatDau && obj.ngayKetThuc && obj.ngayKetThuc >= obj.ngayBatDau,
    'Khoảng thời gian hạng mục không hợp lệ.');
}

function api_saveWorkItem(ctx, obj) {
  return handle_(function () {
    requirePerm(ctx, 'catalog.manage');
    validateWorkItem_(obj);
    const payload = {
      congTrinhId: obj.congTrinhId,
      stt: Math.round(number_(obj.stt)),
      ten: String(obj.ten).trim(),
      donVi: String(obj.donVi || '').trim(),
      klKeHoach: number_(obj.klKeHoach),
      ngayBatDau: obj.ngayBatDau,
      ngayKetThuc: obj.ngayKetThuc
    };
    if (obj.id) {
      assert_(Db.findById(TABS.HANG_MUC, obj.id), 'Không tìm thấy hạng mục.');
      return Db.update(TABS.HANG_MUC, obj.id, payload);
    }
    return Db.insert(TABS.HANG_MUC, payload);
  });
}

function api_deleteWorkItem(ctx, id) {
  return handle_(function () {
    requirePerm(ctx, 'catalog.manage');
    assert_(Db.findById(TABS.HANG_MUC, id), 'Không tìm thấy hạng mục.');
    const hasReferences = Db.where(TABS.BAO_CAO_NGAY, function (row) { return row.hangMucId === id; }).length ||
      Db.where(TABS.DU_TOAN, function (row) { return row.hangMucId === id; }).length ||
      Db.where(TABS.CHI_PHI, function (row) { return row.hangMucId === id; }).length;
    assert_(!hasReferences, 'Không thể xoá hạng mục đã có báo cáo, dự toán hoặc chi phí.');
    Db.remove(TABS.HANG_MUC, id);
    return true;
  });
}
