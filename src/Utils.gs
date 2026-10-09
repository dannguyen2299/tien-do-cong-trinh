function ok_(data) {
  return { ok: true, data: data };
}

function fail_(error) {
  return { ok: false, error: String(error || 'Đã xảy ra lỗi.') };
}

function handle_(fn) {
  try {
    return ok_(fn());
  } catch (error) {
    console.error(error && error.stack ? error.stack : error);
    return fail_(error && error.message ? error.message : 'Đã xảy ra lỗi.');
  }
}

function formatDate_(date) {
  return Utilities.formatDate(date || new Date(), APP_CONFIG.timeZone, 'yyyy-MM-dd');
}

function formatDateTime_(date) {
  return Utilities.formatDate(date || new Date(), APP_CONFIG.timeZone, 'yyyy-MM-dd HH:mm:ss');
}

function assert_(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function parseDate_(value) {
  const parts = String(value || '').split('-').map(Number);
  if (parts.length !== 3 || parts.some(function (part) { return !Number.isFinite(part); })) {
    throw new Error('Ngày không hợp lệ: ' + value);
  }
  return new Date(parts[0], parts[1] - 1, parts[2], 12, 0, 0, 0);
}

function addDays_(value, days) {
  const date = value instanceof Date ? new Date(value.getTime()) : parseDate_(value);
  date.setDate(date.getDate() + days);
  return date;
}

function daysBetween_(from, to) {
  const start = from instanceof Date ? from : parseDate_(from);
  const end = to instanceof Date ? to : parseDate_(to);
  return Math.round((end.getTime() - start.getTime()) / 86400000);
}

function today_() {
  return formatDate_(new Date());
}

function clamp_(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function round_(value, digits) {
  const factor = Math.pow(10, digits || 0);
  return Math.round((Number(value) + Number.EPSILON) * factor) / factor;
}

function number_(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}
