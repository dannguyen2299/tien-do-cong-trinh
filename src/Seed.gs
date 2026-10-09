function mulberry32_(seed) {
  return function () {
    let value = seed += 0x6D2B79F5;
    value = Math.imul(value ^ value >>> 15, value | 1);
    value ^= value + Math.imul(value ^ value >>> 7, value | 61);
    return ((value ^ value >>> 14) >>> 0) / 4294967296;
  };
}

function seedPlanPercent_(workItem, dateValue) {
  const date = parseDate_(dateValue);
  const start = parseDate_(workItem.ngayBatDau);
  const end = parseDate_(workItem.ngayKetThuc);
  if (date < start) return 0;
  if (date >= end) return 100;
  return (daysBetween_(start, date) + 1) / (daysBetween_(start, end) + 1) * 100;
}

function buildSeedProjects_(today) {
  const definitions = [
    ['CT-0001', 'Nhà xưởng KCN Yên Phong – Bắc Ninh', 'Công ty Sản xuất Yên Phong', 'KCN Yên Phong, Bắc Ninh', -90, 60, 18500000000, 'Trần Minh Đức'],
    ['CT-0002', 'Trường mầm non Hoa Sen – Hà Đông', 'Ban QLDA quận Hà Đông', 'Hà Đông, Hà Nội', -60, 90, 9200000000, 'Đỗ Văn Hùng'],
    ['CT-0003', 'Nhà phố 5 tầng – Cầu Giấy', 'Nguyễn Thị Mai', 'Cầu Giấy, Hà Nội', -45, 75, 4800000000, 'Phạm Quốc Bảo']
  ];
  return definitions.map(function (row) {
    return {
      id: row[0], ten: row[1], chuDauTu: row[2], diaDiem: row[3],
      ngayKhoiCong: formatDate_(addDays_(today, row[4])),
      ngayHoanThanh: formatDate_(addDays_(today, row[5])),
      giaTriHopDong: row[6], chiHuyTruong: row[7], trangThai: 'DANG_THI_CONG',
      driveFolderId: '', createdAt: formatDateTime_(addDays_(today, row[4] - 10))
    };
  });
}

function buildSeedWorkItems_(projects) {
  const templates = [
    ['Chuẩn bị mặt bằng', 'm2', 4000, 0.00, 0.13, 0.05],
    ['Ép cọc BTCT 300x300', 'md', 900, 0.08, 0.30, 0.12],
    ['Đào đất móng', 'm3', 1800, 0.19, 0.39, 0.10],
    ['Bê tông móng', 'm3', 700, 0.30, 0.53, 0.15],
    ['Kết cấu thân / khung thép', 'tấn', 500, 0.43, 0.80, 0.32],
    ['Xây tường và hoàn thiện', 'm2', 3200, 0.63, 1.00, 0.26]
  ];
  const volumeFactors = [1, 0.62, 0.28];
  const items = [];
  projects.forEach(function (project, projectIndex) {
    const duration = daysBetween_(project.ngayKhoiCong, project.ngayHoanThanh);
    templates.forEach(function (template, itemIndex) {
      const sequence = projectIndex * templates.length + itemIndex + 1;
      items.push({
        id: 'HM-' + String(sequence).padStart(4, '0'),
        congTrinhId: project.id,
        stt: itemIndex + 1,
        ten: template[0],
        donVi: template[1],
        klKeHoach: round_(template[2] * volumeFactors[projectIndex], 2),
        ngayBatDau: formatDate_(addDays_(project.ngayKhoiCong, Math.round(duration * template[3]))),
        ngayKetThuc: formatDate_(addDays_(project.ngayKhoiCong, Math.round(duration * template[4]))),
        createdAt: project.createdAt
      });
    });
  });
  return items;
}

function buildSeedBudgets_(projects, workItems) {
  const itemWeights = [0.05, 0.12, 0.10, 0.15, 0.32, 0.26];
  const parts = [
    { code: 'AF.11213', label: 'Vật liệu thi công', field: 'dgVatLieu', ratio: 0.65 },
    { code: 'AB.25112', label: 'Nhân công thi công', field: 'dgNhanCong', ratio: 0.25 },
    { code: 'AF.61130', label: 'Máy thi công', field: 'dgMay', ratio: 0.10 }
  ];
  const rows = [];
  let sequence = 1;
  projects.forEach(function (project) {
    const target = project.giaTriHopDong * 0.88;
    workItems.filter(function (item) { return item.congTrinhId === project.id; }).forEach(function (item) {
      const itemTarget = target * itemWeights[number_(item.stt) - 1];
      parts.forEach(function (part) {
        const unitPrice = Math.max(1, Math.round(itemTarget * part.ratio / number_(item.klKeHoach)));
        const row = {
          id: 'DT-' + String(sequence++).padStart(5, '0'),
          congTrinhId: project.id,
          hangMucId: item.id,
          maHieu: part.code,
          noiDung: part.label + ' – ' + item.ten,
          donVi: item.donVi,
          khoiLuong: item.klKeHoach,
          dgVatLieu: 0,
          dgNhanCong: 0,
          dgMay: 0
        };
        row[part.field] = unitPrice;
        row.thanhTien = Math.round(number_(row.khoiLuong) *
          (row.dgVatLieu + row.dgNhanCong + row.dgMay));
        rows.push(row);
      });
    });
  });
  return rows;
}

function buildSeedReports_(projects, workItems, today, random) {
  const factors = { 'CT-0001': 1, 'CT-0002': 0.55, 'CT-0003': 1 };
  const weather = ['NANG', 'NANG', 'AM_U', 'MUA', 'MUA_LON'];
  const reporter = { 'CT-0001': 'Lê Hoàng Nam', 'CT-0002': 'Nguyễn Đức Long', 'CT-0003': 'Vũ Minh Tuấn' };
  const allSlots = [];

  projects.forEach(function (project, projectIndex) {
    const items = workItems.filter(function (item) { return item.congTrinhId === project.id; });
    const slots = [];
    let cursor = parseDate_(project.ngayKhoiCong);
    const yesterday = addDays_(today, -1);
    let workingDay = 0;
    while (cursor <= yesterday) {
      if (cursor.getDay() !== 0) {
        const dateText = formatDate_(cursor);
        const active = items.filter(function (item) {
          return item.ngayBatDau <= dateText && item.ngayKetThuc >= dateText;
        });
        if (active.length > 0) {
          const count = Math.min(active.length, 1 + Math.floor(random() * 3));
          for (let offset = 0; offset < count; offset += 1) {
            slots.push({
              project: project,
              item: active[(workingDay + projectIndex + offset) % active.length],
              ngay: dateText
            });
          }
        }
        workingDay += 1;
      }
      cursor = addDays_(cursor, 1);
    }
    const recentStart = Math.max(0, slots.length - 8);
    slots.forEach(function (slot, index) {
      slot.trangThai = index < recentStart ? 'DA_DUYET' : (index === slots.length - 1 ? 'TRA_LAI' : 'CHO_DUYET');
    });
    allSlots.push.apply(allSlots, slots);
  });

  const approvedCounts = allSlots.reduce(function (result, slot) {
    if (slot.trangThai === 'DA_DUYET') {
      result[slot.item.id] = (result[slot.item.id] || 0) + 1;
    }
    return result;
  }, {});
  const targetVolumes = {};
  workItems.forEach(function (item) {
    const plan = seedPlanPercent_(item, formatDate_(today));
    targetVolumes[item.id] = number_(item.klKeHoach) * plan / 100 * factors[item.congTrinhId];
  });

  return allSlots.map(function (slot, index) {
    const approvedCount = approvedCounts[slot.item.id] || 1;
    const approvedQuantity = targetVolumes[slot.item.id] / approvedCount;
    const selectedWeather = weather[Math.floor(random() * weather.length)];
    const hasIssue = slot.project.id === 'CT-0002' &&
      (selectedWeather === 'MUA_LON' || index % 23 === 0);
    return {
      id: 'BC-' + String(index + 1).padStart(6, '0'),
      ngay: slot.ngay,
      congTrinhId: slot.project.id,
      hangMucId: slot.item.id,
      klThucHien: round_(slot.trangThai === 'DA_DUYET' ? approvedQuantity : number_(slot.item.klKeHoach) * 0.01, 3),
      soNhanCong: 8 + Math.floor(random() * 21),
      mayMoc: random() > 0.5 ? '1 máy xúc, 1 cẩu' : '1 máy trộn, 2 đầm dùi',
      thoiTiet: selectedWeather,
      vuongMac: hasIssue ? (index % 2 ? 'Mưa lớn ảnh hưởng thi công' : 'Chậm cấp vật tư') : '',
      anh: '',
      nguoiBaoCao: reporter[slot.project.id],
      trangThai: slot.trangThai,
      nguoiDuyet: slot.trangThai === 'DA_DUYET' ? slot.project.chiHuyTruong : '',
      ghiChuDuyet: slot.trangThai === 'TRA_LAI' ? 'Cần bổ sung mô tả khối lượng thực hiện.' : '',
      ngayDuyet: slot.trangThai === 'DA_DUYET' ? slot.ngay + ' 18:00:00' : '',
      createdAt: slot.ngay + ' 17:30:00'
    };
  });
}

function buildSeedCosts_(projects, workItems, budgets, today) {
  const ratios = { 'CT-0001': 0.58, 'CT-0002': 0.25, 'CT-0003': 1.03 };
  const typeParts = [
    ['VAT_LIEU', 0.55, 'Vật liệu thi công'],
    ['NHAN_CONG', 0.25, 'Nhân công thi công'],
    ['MAY', 0.15, 'Chi phí máy thi công'],
    ['KHAC', 0.05, 'Chi phí công trường khác']
  ];
  const split = [0.40, 0.35, 0.25];
  const rows = [];
  let sequence = 1;
  projects.forEach(function (project) {
    const projectItems = workItems.filter(function (item) { return item.congTrinhId === project.id; });
    const budget = budgets.filter(function (row) { return row.congTrinhId === project.id; })
      .reduce(function (sum, row) { return sum + number_(row.thanhTien); }, 0);
    const targetCost = Math.round(budget * ratios[project.id]);
    const elapsed = Math.max(1, daysBetween_(project.ngayKhoiCong, formatDate_(today)));
    let localIndex = 0;
    typeParts.forEach(function (typePart) {
      split.forEach(function (part) {
        const item = projectItems[localIndex % projectItems.length];
        const dayOffset = Math.min(elapsed, Math.max(1, Math.round((localIndex + 1) * elapsed / 13)));
        rows.push({
          id: 'CP-' + String(sequence++).padStart(6, '0'),
          ngay: formatDate_(addDays_(project.ngayKhoiCong, dayOffset)),
          congTrinhId: project.id,
          hangMucId: item.id,
          loai: typePart[0],
          noiDung: typePart[2] + ' đợt ' + (localIndex + 1),
          soTien: Math.round(targetCost * typePart[1] * part),
          nhaCungCap: typePart[0] === 'NHAN_CONG' ? 'Đội thi công nội bộ' : 'Nhà cung cấp Demo',
          soChungTu: 'CT-' + project.id.slice(-4) + '-' + String(localIndex + 1).padStart(2, '0'),
          nguoiNhap: 'Phạm Thu Hà',
          createdAt: formatDate_(addDays_(project.ngayKhoiCong, dayOffset)) + ' 16:00:00'
        });
        localIndex += 1;
      });
    });
  });
  return rows;
}

function seedDemoData_() {
  const startedAt = Date.now();
  const today = parseDate_(today_());
  const random = mulberry32_(2026);
  const projects = buildSeedProjects_(today);
  const workItems = buildSeedWorkItems_(projects);
  const budgets = buildSeedBudgets_(projects, workItems);
  const reports = buildSeedReports_(projects, workItems, today, random);
  const costs = buildSeedCosts_(projects, workItems, budgets, today);
  const settings = Object.keys(DEFAULT_SETTINGS).map(function (key) {
    return { key: key, value: DEFAULT_SETTINGS[key] };
  });

  [TABS.BAO_CAO_NGAY, TABS.CHI_PHI, TABS.DU_TOAN, TABS.HANG_MUC, TABS.CONG_TRINH, TABS.CAU_HINH]
    .forEach(function (tab) { Db.clear(tab); });
  Db.bulkInsert(TABS.CONG_TRINH, projects);
  Db.bulkInsert(TABS.HANG_MUC, workItems);
  Db.bulkInsert(TABS.DU_TOAN, budgets);
  Db.bulkInsert(TABS.BAO_CAO_NGAY, reports);
  Db.bulkInsert(TABS.CHI_PHI, costs);
  Db.bulkInsert(TABS.CAU_HINH, settings);

  return {
    elapsedMs: Date.now() - startedAt,
    projects: projects.length,
    workItems: workItems.length,
    budgets: budgets.length,
    reports: reports.length,
    costs: costs.length
  };
}

function seedDemo() {
  try {
    Db.ensureSheets();
    const result = seedDemoData_();
    SpreadsheetApp.getUi().alert(
      'Đã tạo lại dữ liệu mẫu trong ' + (result.elapsedMs / 1000).toFixed(2) + ' giây.\n' +
      result.projects + ' công trình · ' + result.workItems + ' hạng mục · ' +
      result.reports + ' báo cáo.'
    );
  } catch (error) {
    console.error(error && error.stack ? error.stack : error);
    SpreadsheetApp.getUi().alert('Không thể tạo dữ liệu mẫu: ' + error.message);
  }
}

function api_resetDemo(ctx) {
  return handle_(function () {
    requirePerm(ctx, 'demo.reset');
    Db.ensureSheets();
    return seedDemoData_();
  });
}
