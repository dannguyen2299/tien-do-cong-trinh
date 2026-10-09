function getBudgetRows_(congTrinhId, hangMucId) {
  return Db.where(TABS.DU_TOAN, function (row) {
    return (!congTrinhId || row.congTrinhId === congTrinhId) &&
      (!hangMucId || row.hangMucId === hangMucId);
  });
}

function getCostRows_(congTrinhId, hangMucId) {
  return Db.where(TABS.CHI_PHI, function (row) {
    return (!congTrinhId || row.congTrinhId === congTrinhId) &&
      (!hangMucId || row.hangMucId === hangMucId);
  });
}

function sumBudget_(rows) {
  return rows.reduce(function (total, row) { return total + number_(row.thanhTien); }, 0);
}

function sumCosts_(rows) {
  return rows.reduce(function (total, row) { return total + number_(row.soTien); }, 0);
}

function groupBudgetByWorkItem_(rows) {
  return rows.reduce(function (result, row) {
    result[row.hangMucId] = (result[row.hangMucId] || 0) + number_(row.thanhTien);
    return result;
  }, {});
}

function groupCostsByWorkItem_(rows) {
  return rows.reduce(function (result, row) {
    result[row.hangMucId] = (result[row.hangMucId] || 0) + number_(row.soTien);
    return result;
  }, {});
}

function getCostBreakdown_(budgetRows, costRows) {
  const result = {
    VAT_LIEU: { duToan: 0, thucChi: 0 },
    NHAN_CONG: { duToan: 0, thucChi: 0 },
    MAY: { duToan: 0, thucChi: 0 },
    KHAC: { duToan: 0, thucChi: 0 }
  };
  budgetRows.forEach(function (row) {
    const quantity = number_(row.khoiLuong);
    result.VAT_LIEU.duToan += Math.round(quantity * number_(row.dgVatLieu));
    result.NHAN_CONG.duToan += Math.round(quantity * number_(row.dgNhanCong));
    result.MAY.duToan += Math.round(quantity * number_(row.dgMay));
  });
  costRows.forEach(function (row) {
    if (result[row.loai]) {
      result[row.loai].thucChi += number_(row.soTien);
    }
  });
  return result;
}

function stripMoneyFields_(value) {
  if (Array.isArray(value)) {
    return value.map(stripMoneyFields_);
  }
  if (!value || typeof value !== 'object') {
    return value;
  }
  const hidden = {
    giaTriHopDong: true,
    duToan: true,
    thucChi: true,
    conLai: true,
    ptChi: true,
    trangThaiChiPhi: true,
    chiVuotTienDo: true,
    canhBaoChiPhi: true,
    costBreakdown: true,
    budgetRows: true,
    costRows: true,
    costChart: true,
    dgVatLieu: true,
    dgNhanCong: true,
    dgMay: true,
    thanhTien: true,
    soTien: true
  };
  return Object.keys(value).reduce(function (result, key) {
    if (!hidden[key]) {
      result[key] = stripMoneyFields_(value[key]);
    }
    return result;
  }, {});
}

function api_saveCost(ctx, obj) {
  return handle_(function () {
    requirePerm(ctx, 'cost.create');
    assert_(obj && obj.ngay, 'Ngày chi phí là bắt buộc.');
    assert_(obj.ngay <= today_(), 'Ngày chi phí không được ở tương lai.');
    assert_(Db.findById(TABS.CONG_TRINH, obj.congTrinhId), 'Công trình không tồn tại.');
    const item = Db.findById(TABS.HANG_MUC, obj.hangMucId);
    assert_(item && item.congTrinhId === obj.congTrinhId, 'Hạng mục không thuộc công trình đã chọn.');
    assert_(ENUMS.costType.indexOf(obj.loai) !== -1, 'Loại chi phí không hợp lệ.');
    assert_(String(obj.noiDung || '').trim(), 'Nội dung chi phí là bắt buộc.');
    assert_(number_(obj.soTien) > 0, 'Số tiền phải lớn hơn 0.');
    return Db.insert(TABS.CHI_PHI, {
      ngay: obj.ngay,
      congTrinhId: obj.congTrinhId,
      hangMucId: obj.hangMucId,
      loai: obj.loai,
      noiDung: String(obj.noiDung).trim(),
      soTien: Math.round(number_(obj.soTien)),
      nhaCungCap: String(obj.nhaCungCap || '').trim(),
      soChungTu: String(obj.soChungTu || '').trim(),
      nguoiNhap: ctx.userName
    });
  });
}

function api_listCosts(ctx, filter) {
  return handle_(function () {
    requirePerm(ctx, 'money.view');
    const conditions = filter || {};
    const projects = Db.getAll(TABS.CONG_TRINH).reduce(function (map, row) { map[row.id] = row; return map; }, {});
    const items = Db.getAll(TABS.HANG_MUC).reduce(function (map, row) { map[row.id] = row; return map; }, {});
    const rows = Db.where(TABS.CHI_PHI, function (row) {
      return (!conditions.congTrinhId || row.congTrinhId === conditions.congTrinhId) &&
        (!conditions.loai || row.loai === conditions.loai) &&
        (!conditions.tuNgay || row.ngay >= conditions.tuNgay) &&
        (!conditions.denNgay || row.ngay <= conditions.denNgay);
    }).sort(function (a, b) { return String(b.ngay).localeCompare(String(a.ngay)); });
    return {
      rows: rows.map(function (row) {
        return Object.assign({}, row, {
          congTrinhTen: projects[row.congTrinhId] ? projects[row.congTrinhId].ten : '',
          hangMucTen: items[row.hangMucId] ? items[row.hangMucId].ten : ''
        });
      }),
      total: sumCosts_(rows)
    };
  });
}

function parseImportNumber_(value, allowDecimal) {
  let text = String(value == null ? '' : value).trim().replace(/\s/g, '');
  if (!text) return NaN;
  const lastDot = text.lastIndexOf('.');
  const lastComma = text.lastIndexOf(',');
  if (lastDot !== -1 && lastComma !== -1) {
    const decimalMark = lastDot > lastComma ? '.' : ',';
    const thousandMark = decimalMark === '.' ? ',' : '.';
    text = text.split(thousandMark).join('').replace(decimalMark, '.');
  } else if (lastDot !== -1 || lastComma !== -1) {
    const mark = lastDot !== -1 ? '.' : ',';
    const parts = text.split(mark);
    if (parts.length > 2 || (!allowDecimal && parts[parts.length - 1].length === 3) ||
        (mark === '.' && parts[parts.length - 1].length === 3)) {
      text = parts.join('');
    } else {
      text = parts.join('.');
    }
  }
  return Number(text);
}

function parseBudgetImport_(congTrinhId, tsvText) {
  const project = Db.findById(TABS.CONG_TRINH, congTrinhId);
  assert_(project, 'Vui lòng chọn công trình hợp lệ.');
  const workItems = Db.where(TABS.HANG_MUC, function (item) { return item.congTrinhId === congTrinhId; });
  const itemMap = {};
  workItems.forEach(function (item) {
    itemMap[String(item.id)] = item;
    itemMap[String(item.stt)] = item;
  });
  const lines = String(tsvText || '').split(/\r?\n/).filter(function (line) { return line.trim(); });
  if (lines.length && !Number.isFinite(parseImportNumber_((lines[0].split('\t')[4] || ''), true))) {
    lines.shift();
  }
  return lines.map(function (line, index) {
    const columns = line.split('\t');
    const item = itemMap[String(columns[0] || '').trim()];
    const quantity = parseImportNumber_(columns[4], true);
    const material = parseImportNumber_(columns[5], false);
    const labor = parseImportNumber_(columns[6], false);
    const machine = parseImportNumber_(columns[7], false);
    const errors = [];
    if (!item) errors.push('Mã hạng mục không tồn tại trong công trình.');
    if (!String(columns[2] || '').trim()) errors.push('Thiếu nội dung.');
    if (!Number.isFinite(quantity) || quantity < 0) errors.push('Khối lượng không hợp lệ.');
    if (![material, labor, machine].every(function (value) { return Number.isFinite(value) && value >= 0; })) {
      errors.push('Đơn giá không hợp lệ.');
    }
    const row = {
      line: index + 1,
      valid: errors.length === 0,
      errors: errors,
      congTrinhId: congTrinhId,
      hangMucId: item ? item.id : '',
      hangMucTen: item ? item.ten : '',
      maHieu: String(columns[1] || '').trim(),
      noiDung: String(columns[2] || '').trim(),
      donVi: String(columns[3] || '').trim(),
      khoiLuong: Number.isFinite(quantity) ? quantity : 0,
      dgVatLieu: Number.isFinite(material) ? Math.round(material) : 0,
      dgNhanCong: Number.isFinite(labor) ? Math.round(labor) : 0,
      dgMay: Number.isFinite(machine) ? Math.round(machine) : 0
    };
    row.thanhTien = row.valid
      ? Math.round(row.khoiLuong * (row.dgVatLieu + row.dgNhanCong + row.dgMay))
      : 0;
    return row;
  });
}

function api_previewBudgetImport(ctx, congTrinhId, tsvText) {
  return handle_(function () {
    requirePerm(ctx, 'budget.import');
    const rows = parseBudgetImport_(congTrinhId, tsvText);
    return {
      rows: rows,
      validCount: rows.filter(function (row) { return row.valid; }).length,
      errorCount: rows.filter(function (row) { return !row.valid; }).length,
      total: rows.reduce(function (sum, row) { return sum + row.thanhTien; }, 0)
    };
  });
}

function api_commitBudgetImport(ctx, congTrinhId, rows, mode) {
  return handle_(function () {
    requirePerm(ctx, 'budget.import');
    assert_(['APPEND', 'REPLACE'].indexOf(mode) !== -1, 'Chế độ nhập dự toán không hợp lệ.');
    assert_(Db.findById(TABS.CONG_TRINH, congTrinhId), 'Công trình không tồn tại.');
    assert_(Array.isArray(rows) && rows.length > 0, 'Không có dòng hợp lệ để nhập.');
    const prepared = rows.map(function (row, index) {
      const item = Db.findById(TABS.HANG_MUC, row.hangMucId);
      assert_(item && item.congTrinhId === congTrinhId, 'Dòng ' + (index + 1) + ': hạng mục không hợp lệ.');
      const quantity = number_(row.khoiLuong);
      const material = Math.round(number_(row.dgVatLieu));
      const labor = Math.round(number_(row.dgNhanCong));
      const machine = Math.round(number_(row.dgMay));
      assert_(quantity >= 0 && material >= 0 && labor >= 0 && machine >= 0,
        'Dòng ' + (index + 1) + ': số liệu không hợp lệ.');
      return {
        congTrinhId: congTrinhId,
        hangMucId: item.id,
        maHieu: String(row.maHieu || '').trim(),
        noiDung: String(row.noiDung || '').trim(),
        donVi: String(row.donVi || '').trim(),
        khoiLuong: quantity,
        dgVatLieu: material,
        dgNhanCong: labor,
        dgMay: machine,
        thanhTien: Math.round(quantity * (material + labor + machine))
      };
    });
    if (mode === 'REPLACE') {
      Db.where(TABS.DU_TOAN, function (row) { return row.congTrinhId === congTrinhId; })
        .forEach(function (row) { Db.remove(TABS.DU_TOAN, row.id); });
    }
    return Db.bulkInsert(TABS.DU_TOAN, prepared);
  });
}
