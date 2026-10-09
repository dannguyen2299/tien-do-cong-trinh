function doGet() {
  return HtmlService.createTemplateFromFile('Index')
    .evaluate()
    .setTitle(APP_CONFIG.title)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function include(name) {
  return HtmlService.createHtmlOutputFromFile(name).getContent();
}

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('🏗 Công trình')
    .addItem('Khởi tạo các tab', 'initializeSheets')
    .addItem('Tạo dữ liệu mẫu', 'seedDemo')
    .addSeparator()
    .addItem('Mở Web App', 'openWebApp')
    .addToUi();
}

function initializeSheets() {
  const tabs = Db.ensureSheets();
  SpreadsheetApp.getUi().alert('Đã khởi tạo đủ ' + tabs.length + ' tab dữ liệu.');
}

function openWebApp() {
  const url = ScriptApp.getService().getUrl();
  const message = url
    ? 'Link Web App:\n' + url
    : 'Chưa có bản deploy Web App. Hãy deploy ứng dụng trước.';
  SpreadsheetApp.getUi().alert(message);
}
