let dbRequestCache_ = {};

const Db = (function () {
  function getSchema_(tab) {
    const schema = SHEET_SCHEMAS[tab];
    if (!schema) {
      throw new Error('Tab dữ liệu không hợp lệ: ' + tab);
    }
    return schema;
  }

  function getSheet_(tab) {
    getSchema_(tab);
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(tab);
    if (!sheet) {
      throw new Error('Chưa có tab ' + tab + '. Hãy chạy “Khởi tạo các tab”.');
    }
    return sheet;
  }

  function headers_(tab) {
    return getSchema_(tab).map(function (column) { return column[0]; });
  }

  function sheetHeaders_(sheet) {
    const lastColumn = Math.max(sheet.getLastColumn(), 1);
    return sheet.getRange(1, 1, 1, lastColumn).getValues()[0].map(function (header) {
      return String(header || '').trim();
    });
  }

  function clone_(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function invalidate_(tab) {
    delete dbRequestCache_[tab];
    if ([TABS.CONG_TRINH, TABS.HANG_MUC, TABS.BAO_CAO_NGAY, TABS.DU_TOAN, TABS.CHI_PHI].indexOf(tab) !== -1) {
      CacheService.getScriptCache().remove(APP_CONFIG.dashboardCacheKey);
    }
  }

  function withWriteLock_(fn) {
    const lock = LockService.getScriptLock();
    if (!lock.tryLock(10000)) {
      throw new Error('Hệ thống đang bận ghi dữ liệu. Vui lòng thử lại.');
    }
    try {
      return fn();
    } finally {
      lock.releaseLock();
    }
  }

  function rowToObject_(headers, row) {
    const obj = {};
    headers.forEach(function (header, index) {
      obj[header] = row[index];
    });
    return obj;
  }

  function objectToRow_(headers, obj) {
    return headers.map(function (header) {
      return Object.prototype.hasOwnProperty.call(obj, header) ? obj[header] : '';
    });
  }

  function getAll_(tab) {
    if (dbRequestCache_[tab]) {
      return clone_(dbRequestCache_[tab]);
    }
    const sheet = getSheet_(tab);
    const values = sheet.getDataRange().getValues();
    if (values.length === 0) {
      return [];
    }
    const actualHeaders = values[0].map(function (header) { return String(header || '').trim(); });
    const rows = values.slice(1).filter(function (row) {
      return row.some(function (cell) { return cell !== ''; });
    }).map(function (row) {
      return rowToObject_(actualHeaders, row);
    });
    dbRequestCache_[tab] = rows;
    return clone_(rows);
  }

  function nextId_(tab, rows) {
    const rule = ID_RULES[tab];
    if (!rule) {
      return '';
    }
    const maxNumber = rows.reduce(function (max, row) {
      const id = String(row.id || '');
      if (id.indexOf(rule.prefix) !== 0) {
        return max;
      }
      const number = Number(id.slice(rule.prefix.length));
      return Number.isFinite(number) ? Math.max(max, number) : max;
    }, 0);
    return rule.prefix + String(maxNumber + 1).padStart(rule.digits, '0');
  }

  function prepareInsert_(tab, obj, existingRows) {
    const record = Object.assign({}, obj);
    const headers = headers_(tab);
    if (headers.indexOf('id') !== -1 && !record.id) {
      record.id = nextId_(tab, existingRows);
    }
    if (headers.indexOf('createdAt') !== -1 && !record.createdAt) {
      record.createdAt = formatDateTime_();
    }
    return record;
  }

  function formatSheet_(sheet, tab) {
    const schema = getSchema_(tab);
    const actualHeaders = sheetHeaders_(sheet);
    schema.forEach(function (column) {
      const name = column[0];
      const type = column[1];
      const columnIndex = actualHeaders.indexOf(name);
      if (columnIndex === -1) {
        return;
      }
      const dataRange = sheet.getRange(1, columnIndex + 1, Math.max(sheet.getMaxRows(), 2), 1);
      if (name === 'id' || name === 'maHieu' || type === 'date' || type === 'datetime') {
        dataRange.setNumberFormat('@');
      } else if (type === 'int') {
        dataRange.setNumberFormat('#,##0');
      } else if (type === 'num') {
        dataRange.setNumberFormat('#,##0.00');
      }
    });
    sheet.setFrozenRows(1);
    sheet.getRange(1, 1, 1, sheet.getLastColumn()).setFontWeight('bold').setBackground('#dbe4ea');
  }

  return {
    getAll: function (tab) {
      return getAll_(tab);
    },

    findById: function (tab, id) {
      const found = getAll_(tab).find(function (row) { return String(row.id) === String(id); });
      return found || null;
    },

    where: function (tab, predicateFn) {
      return getAll_(tab).filter(predicateFn);
    },

    insert: function (tab, obj) {
      return withWriteLock_(function () {
        const sheet = getSheet_(tab);
        const headers = sheetHeaders_(sheet);
        const existingRows = getAll_(tab);
        const record = prepareInsert_(tab, obj, existingRows);
        sheet.appendRow(objectToRow_(headers, record));
        invalidate_(tab);
        return clone_(record);
      });
    },

    update: function (tab, id, patch) {
      return withWriteLock_(function () {
        const sheet = getSheet_(tab);
        const headers = sheetHeaders_(sheet);
        const values = sheet.getDataRange().getValues();
        const idColumn = headers.indexOf('id');
        const rowIndex = values.slice(1).findIndex(function (row) { return String(row[idColumn]) === String(id); });
        if (rowIndex === -1) {
          throw new Error('Không tìm thấy bản ghi ' + id + '.');
        }
        const current = rowToObject_(headers, values[rowIndex + 1]);
        headers.forEach(function (header) {
          if (header !== 'id' && Object.prototype.hasOwnProperty.call(patch, header)) {
            current[header] = patch[header];
          }
        });
        sheet.getRange(rowIndex + 2, 1, 1, headers.length).setValues([objectToRow_(headers, current)]);
        invalidate_(tab);
        return clone_(current);
      });
    },

    remove: function (tab, id) {
      return withWriteLock_(function () {
        const sheet = getSheet_(tab);
        const headers = sheetHeaders_(sheet);
        const idColumn = headers.indexOf('id');
        const values = sheet.getDataRange().getValues();
        const rowIndex = values.slice(1).findIndex(function (row) { return String(row[idColumn]) === String(id); });
        if (rowIndex === -1) {
          throw new Error('Không tìm thấy bản ghi ' + id + '.');
        }
        sheet.deleteRow(rowIndex + 2);
        invalidate_(tab);
        return true;
      });
    },

    bulkInsert: function (tab, items) {
      if (!items || items.length === 0) {
        return [];
      }
      return withWriteLock_(function () {
        const sheet = getSheet_(tab);
        const headers = sheetHeaders_(sheet);
        const existingRows = getAll_(tab);
        const prepared = [];
        items.forEach(function (item) {
          const record = prepareInsert_(tab, item, existingRows.concat(prepared));
          prepared.push(record);
        });
        const startRow = Math.max(sheet.getLastRow() + 1, 2);
        sheet.getRange(startRow, 1, prepared.length, headers.length)
          .setValues(prepared.map(function (record) { return objectToRow_(headers, record); }));
        invalidate_(tab);
        return clone_(prepared);
      });
    },

    clear: function (tab) {
      return withWriteLock_(function () {
        const sheet = getSheet_(tab);
        const lastRow = sheet.getLastRow();
        if (lastRow > 1) {
          sheet.getRange(2, 1, lastRow - 1, sheet.getLastColumn()).clearContent();
        }
        invalidate_(tab);
        return true;
      });
    },

    ensureSheets: function () {
      return withWriteLock_(function () {
        const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
        Object.keys(SHEET_SCHEMAS).forEach(function (tab) {
          let sheet = spreadsheet.getSheetByName(tab);
          if (!sheet) {
            sheet = spreadsheet.insertSheet(tab);
          }
          const expectedHeaders = headers_(tab);
          const currentHeaders = sheetHeaders_(sheet).filter(function (header) { return header !== ''; });
          if (currentHeaders.length === 0) {
            sheet.getRange(1, 1, 1, expectedHeaders.length).setValues([expectedHeaders]);
          } else {
            const missingHeaders = expectedHeaders.filter(function (header) {
              return currentHeaders.indexOf(header) === -1;
            });
            if (missingHeaders.length > 0) {
              sheet.getRange(1, sheet.getLastColumn() + 1, 1, missingHeaders.length).setValues([missingHeaders]);
            }
          }
          formatSheet_(sheet, tab);
          if (tab === TABS.CAU_HINH && sheet.getLastRow() === 1) {
            const configHeaders = sheetHeaders_(sheet);
            const configRows = Object.keys(DEFAULT_SETTINGS).map(function (key) {
              return objectToRow_(configHeaders, { key: key, value: DEFAULT_SETTINGS[key] });
            });
            sheet.getRange(2, 1, configRows.length, configHeaders.length).setValues(configRows);
          }
          invalidate_(tab);
        });
        return Object.keys(SHEET_SCHEMAS);
      });
    }
  };
})();

function test_Db() {
  Db.ensureSheets();
  const created = Db.insert(TABS.CONG_TRINH, {
    ten: 'Công trình kiểm thử Db',
    chuDauTu: 'Chủ đầu tư kiểm thử',
    diaDiem: 'Hà Nội',
    ngayKhoiCong: '2026-01-01',
    ngayHoanThanh: '2026-12-31',
    giaTriHopDong: 1000000,
    chiHuyTruong: 'Người kiểm thử',
    trangThai: 'CHUAN_BI',
    driveFolderId: ''
  });
  assert_(created.id, 'Không sinh được id.');

  const found = Db.findById(TABS.CONG_TRINH, created.id);
  assert_(found && found.ten === 'Công trình kiểm thử Db', 'findById không trả đúng bản ghi.');

  const updated = Db.update(TABS.CONG_TRINH, created.id, { ten: 'Công trình đã cập nhật' });
  assert_(updated.ten === 'Công trình đã cập nhật', 'update không cập nhật đúng dữ liệu.');

  Db.remove(TABS.CONG_TRINH, created.id);
  assert_(Db.findById(TABS.CONG_TRINH, created.id) === null, 'remove không xoá bản ghi.');
  console.log('✅ test_Db thành công: insert → findById → update → remove.');
}
