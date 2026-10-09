function getSettings_() {
  const settings = Object.assign({}, DEFAULT_SETTINGS);
  Db.getAll(TABS.CAU_HINH).forEach(function (row) {
    if (Object.prototype.hasOwnProperty.call(settings, row.key)) {
      settings[row.key] = row.key === 'TEN_CONG_TY' ? row.value : number_(row.value);
    }
  });
  return settings;
}

function calculatePlanPercent_(workItem, dateValue) {
  const date = typeof dateValue === 'string' ? parseDate_(dateValue) : dateValue;
  const start = parseDate_(workItem.ngayBatDau);
  const end = parseDate_(workItem.ngayKetThuc);
  if (date.getTime() < start.getTime()) {
    return 0;
  }
  if (date.getTime() >= end.getTime()) {
    return 100;
  }
  return clamp_(((daysBetween_(start, date) + 1) / (daysBetween_(start, end) + 1)) * 100, 0, 100);
}

function getProgressStatus_(actual, plan, endDate, dateValue, settings) {
  const date = typeof dateValue === 'string' ? parseDate_(dateValue) : dateValue;
  if (actual >= 100) {
    return { code: 'HOAN_THANH', label: 'Hoàn thành', color: 'green' };
  }
  if (date.getTime() > parseDate_(endDate).getTime()) {
    return { code: 'QUA_HAN', label: 'Quá hạn', color: 'red' };
  }
  const difference = plan - actual;
  if (difference >= number_(settings.NGUONG_CHAM_DO)) {
    return { code: 'CHAM', label: 'Chậm', color: 'red' };
  }
  if (difference >= number_(settings.NGUONG_CHAM_VANG)) {
    return { code: 'CAN_CHU_Y', label: 'Cần chú ý', color: 'yellow' };
  }
  return { code: 'DUNG_TIEN_DO', label: 'Đúng tiến độ', color: 'green' };
}

function getCostStatus_(percent, hasBudget, settings) {
  if (!hasBudget) {
    return { code: 'CHUA_CO_DU_TOAN', label: 'Chưa có dự toán', color: 'muted' };
  }
  if (percent >= number_(settings.NGUONG_CHI_PHI_DO)) {
    return { code: 'VUOT_DU_TOAN', label: 'Vượt dự toán', color: 'red' };
  }
  if (percent >= number_(settings.NGUONG_CHI_PHI_VANG)) {
    return { code: 'SAP_VUOT', label: 'Sắp vượt', color: 'yellow' };
  }
  return { code: 'TRONG_NGAN_SACH', label: 'Trong ngân sách', color: 'green' };
}

function calculateWorkItemSummaries_(project, dateValue, data) {
  const projectItems = data.workItems.filter(function (item) { return item.congTrinhId === project.id; });
  const projectReports = data.reports.filter(function (report) {
    return report.congTrinhId === project.id && report.trangThai === 'DA_DUYET' && report.ngay <= dateValue;
  });
  const projectBudgets = data.budgets.filter(function (row) { return row.congTrinhId === project.id; });
  const projectCosts = data.costs.filter(function (row) { return row.congTrinhId === project.id; });
  const budgetByItem = groupBudgetByWorkItem_(projectBudgets);
  const costByItem = groupCostsByWorkItem_(projectCosts);

  return projectItems.map(function (item) {
    const cumulative = projectReports.reduce(function (total, report) {
      return report.hangMucId === item.id ? total + number_(report.klThucHien) : total;
    }, 0);
    const actual = number_(item.klKeHoach) > 0
      ? Math.min(100, cumulative / number_(item.klKeHoach) * 100)
      : 0;
    const plan = calculatePlanPercent_(item, dateValue);
    const budget = budgetByItem[item.id] || 0;
    const actualCost = costByItem[item.id] || 0;
    const costPercent = budget > 0 ? actualCost / budget * 100 : null;
    return Object.assign({}, item, {
      klLuyKe: round_(cumulative, 2),
      ptThucTe: round_(actual, 2),
      ptKeHoach: round_(plan, 2),
      trangThaiTienDo: getProgressStatus_(actual, plan, item.ngayKetThuc, dateValue, data.settings),
      duToan: Math.round(budget),
      thucChi: Math.round(actualCost),
      conLai: Math.round(budget - actualCost),
      ptChi: costPercent === null ? null : round_(costPercent, 2),
      trangThaiChiPhi: getCostStatus_(costPercent || 0, budget > 0, data.settings),
      chiVuotTienDo: costPercent === null ? null : round_(costPercent - actual, 2),
      canhBaoChiPhi: costPercent !== null && costPercent - actual > 10
        ? 'Chi tiêu nhanh hơn tiến độ thi công'
        : ''
    });
  }).sort(function (a, b) { return number_(a.stt) - number_(b.stt); });
}

function calculateProjectSummary_(project, dateValue, data) {
  const items = calculateWorkItemSummaries_(project, dateValue, data);
  const hasBudget = items.reduce(function (total, item) { return total + item.duToan; }, 0) > 0;
  let totalWeight = 0;
  let weightedActual = 0;
  let weightedPlan = 0;
  items.forEach(function (item) {
    const weight = hasBudget ? item.duToan : 1;
    totalWeight += weight;
    weightedActual += item.ptThucTe * weight;
    weightedPlan += item.ptKeHoach * weight;
  });
  const actual = totalWeight > 0 ? weightedActual / totalWeight : 0;
  const plan = totalWeight > 0 ? weightedPlan / totalWeight : 0;
  const budget = items.reduce(function (total, item) { return total + item.duToan; }, 0);
  const actualCost = items.reduce(function (total, item) { return total + item.thucChi; }, 0);
  const costPercent = budget > 0 ? actualCost / budget * 100 : null;
  return Object.assign({}, project, {
    ptThucTe: round_(actual, 2),
    ptKeHoach: round_(plan, 2),
    lechTienDo: round_(plan - actual, 2),
    trangThaiTienDo: getProgressStatus_(actual, plan, project.ngayHoanThanh, dateValue, data.settings),
    duToan: Math.round(budget),
    thucChi: Math.round(actualCost),
    conLai: Math.round(budget - actualCost),
    ptChi: costPercent === null ? null : round_(costPercent, 2),
    trangThaiChiPhi: getCostStatus_(costPercent || 0, budget > 0, data.settings),
    chiVuotTienDo: costPercent === null ? null : round_(costPercent - actual, 2),
    canhBaoChiPhi: costPercent !== null && costPercent - actual > 10
      ? 'Chi tiêu nhanh hơn tiến độ thi công'
      : '',
    hangMuc: items
  });
}

function loadDashboardData_() {
  return {
    projects: Db.getAll(TABS.CONG_TRINH),
    workItems: Db.getAll(TABS.HANG_MUC),
    reports: Db.getAll(TABS.BAO_CAO_NGAY),
    budgets: Db.getAll(TABS.DU_TOAN),
    costs: Db.getAll(TABS.CHI_PHI),
    settings: getSettings_()
  };
}

function getProjectSummaries_(dateValue, data) {
  const source = data || loadDashboardData_();
  return source.projects.map(function (project) {
    return calculateProjectSummary_(project, dateValue || today_(), source);
  });
}

function buildProgressCurve_(project, data) {
  const today = parseDate_(today_());
  const end = parseDate_(project.ngayHoanThanh);
  const points = [];
  let cursor = parseDate_(project.ngayKhoiCong);
  while (cursor.getTime() <= end.getTime()) {
    const dateText = formatDate_(cursor);
    const summary = calculateProjectSummary_(project, dateText, data);
    points.push({
      ngay: dateText,
      keHoach: summary.ptKeHoach,
      thucTe: cursor.getTime() <= today.getTime() ? summary.ptThucTe : null
    });
    cursor = addDays_(cursor, 7);
  }
  if (points.length === 0 || points[points.length - 1].ngay !== project.ngayHoanThanh) {
    const finishSummary = calculateProjectSummary_(project, project.ngayHoanThanh, data);
    points.push({
      ngay: project.ngayHoanThanh,
      keHoach: finishSummary.ptKeHoach,
      thucTe: end.getTime() <= today.getTime() ? finishSummary.ptThucTe : null
    });
  }
  return points;
}

function buildDashboard_() {
  const cached = CacheService.getScriptCache().get(APP_CONFIG.dashboardCacheKey);
  if (cached) {
    return JSON.parse(cached);
  }
  const dateValue = today_();
  const data = loadDashboardData_();
  const projects = getProjectSummaries_(dateValue, data);
  const activeProjects = projects.filter(function (project) { return project.trangThai === 'DANG_THI_CONG'; });
  const totalBudget = projects.reduce(function (total, project) { return total + project.duToan; }, 0);
  const totalCost = projects.reduce(function (total, project) { return total + project.thucChi; }, 0);
  const slowItems = projects.reduce(function (all, project) {
    return all.concat(project.hangMuc.filter(function (item) {
      return item.trangThaiTienDo.code === 'CHAM' || item.trangThaiTienDo.code === 'QUA_HAN';
    }).map(function (item) {
      return {
        type: 'TIEN_DO',
        congTrinhId: project.id,
        congTrinhTen: project.ten,
        hangMucId: item.id,
        title: item.ten,
        status: item.trangThaiTienDo
      };
    }));
  }, []);
  const costWarnings = projects.filter(function (project) {
    return project.trangThaiChiPhi.code === 'VUOT_DU_TOAN' || project.trangThaiChiPhi.code === 'SAP_VUOT';
  }).map(function (project) {
    return {
      type: 'CHI_PHI',
      congTrinhId: project.id,
      title: project.ten,
      status: project.trangThaiChiPhi
    };
  });
  const result = {
    generatedAt: formatDateTime_(),
    kpis: {
      congTrinhDangThiCong: activeProjects.length,
      tienDoTrungBinh: activeProjects.length
        ? round_(activeProjects.reduce(function (sum, project) { return sum + project.ptThucTe; }, 0) / activeProjects.length, 2)
        : 0,
      duToan: Math.round(totalBudget),
      thucChi: Math.round(totalCost),
      ptChi: totalBudget > 0 ? round_(totalCost / totalBudget * 100, 2) : null,
      baoCaoChoDuyet: data.reports.filter(function (report) { return report.trangThai === 'CHO_DUYET'; }).length,
      hangMucCham: slowItems.length
    },
    projects: projects,
    progressChart: projects.map(function (project) {
      return { id: project.id, ten: project.ten, keHoach: project.ptKeHoach, thucTe: project.ptThucTe };
    }),
    costChart: projects.map(function (project) {
      return { id: project.id, ten: project.ten, duToan: project.duToan, thucChi: project.thucChi };
    }),
    attention: slowItems.concat(costWarnings).slice(0, 10)
  };
  CacheService.getScriptCache().put(APP_CONFIG.dashboardCacheKey, JSON.stringify(result), 60);
  return result;
}

function api_getDashboard(ctx) {
  return handle_(function () {
    requirePerm(ctx, 'view');
    const dashboard = buildDashboard_();
    return ctx.role === 'KY_THUAT' ? stripMoneyFields_(dashboard) : dashboard;
  });
}

function test_Dashboard() {
  const dashboard = buildDashboard_();
  const byId = dashboard.projects.reduce(function (result, project) {
    result[project.id] = project;
    return result;
  }, {});
  assert_(byId['CT-0001'], 'Thiếu CT-0001. Hãy chạy “Tạo dữ liệu mẫu” trước.');
  assert_(byId['CT-0001'].trangThaiTienDo.code === 'DUNG_TIEN_DO', 'CT-0001 chưa đúng tiến độ.');
  assert_(byId['CT-0002'].trangThaiTienDo.code === 'CHAM', 'CT-0002 chưa có trạng thái Chậm.');
  assert_(['VUOT_DU_TOAN', 'SAP_VUOT'].indexOf(byId['CT-0003'].trangThaiChiPhi.code) !== -1,
    'CT-0003 chưa vượt hoặc sắp vượt dự toán.');
  assert_(byId['CT-0003'].canhBaoChiPhi === 'Chi tiêu nhanh hơn tiến độ thi công',
    'CT-0003 chưa có cảnh báo chi vượt tiến độ.');
  const technicalResponse = api_getDashboard({ role: 'KY_THUAT', userName: 'Lê Hoàng Nam' });
  assert_(technicalResponse.ok, 'Không lấy được dashboard cho vai trò Kỹ thuật.');
  const technicalJson = JSON.stringify(technicalResponse.data);
  ['giaTriHopDong', 'duToan', 'thucChi', 'ptChi', 'costChart'].forEach(function (field) {
    assert_(technicalJson.indexOf('"' + field + '"') === -1,
      'Dữ liệu vai trò Kỹ thuật còn chứa trường tiền: ' + field);
  });
  console.log(JSON.stringify({
    CT_0001: byId['CT-0001'].trangThaiTienDo.label,
    CT_0002: byId['CT-0002'].trangThaiTienDo.label,
    CT_0003: {
      chiPhi: byId['CT-0003'].trangThaiChiPhi.label,
      canhBao: byId['CT-0003'].canhBaoChiPhi
    }
  }, null, 2));
  console.log('✅ test_Dashboard thành công.');
}
