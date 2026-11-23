/**
 * Wedding Planner - Sync API
 *
 * PETUNJUK DEPLOY:
 * 1. Tambahkan file ini sebagai file baru bernama Sync.gs di proyek Apps Script
 *    yang sudah berisi skrip setup Wedding Planner (termasuk META dan SHEETS).
 * 2. Project Settings > Script Properties: buat API_TOKEN dengan nilai acak panjang.
 * 3. Jalankan SYNC_installSettingsTrigger() satu kali untuk mencatat edit manual
 *    pada sheet Pengaturan (sheet ini memang tidak memiliki kolom metadata).
 * 4. Deploy > New deployment > Web app; Execute as: Me; Who has access: Anyone.
 * 5. Salin URL /exec ke aplikasi. Setiap perubahan kode: Deploy > Manage deployments
 *    > Edit > New version > Deploy.
 *
 * Catatan: doPost/doGet adalah entry point wajib Apps Script. Semua helper baru
 * memakai awalan SYNC_ agar tidak bertabrakan dengan skrip setup yang sudah ada.
 */

function doGet() {
  return ContentService.createTextOutput('OK').setMimeType(ContentService.MimeType.TEXT);
}

function doPost(e) {
  var lock = null;
  try {
    var bodyText = e && e.postData && e.postData.contents ? e.postData.contents : '{}';
    var request = JSON.parse(bodyText);
    var expectedToken = PropertiesService.getScriptProperties().getProperty('API_TOKEN') || '';
    var providedToken = String(request.token || '');
    if (!SYNC_constantTimeEqual_(expectedToken, providedToken)) {
      return SYNC_json_({ ok: false, error: 'UNAUTHORIZED' });
    }

    var action = String(request.action || '');
    if (action === 'ping') {
      return SYNC_json_({ ok: true, serverTime: new Date().toISOString(), message: 'Koneksi valid.' });
    }
    if (action !== 'sync') {
      return SYNC_json_({ ok: false, error: 'Aksi tidak dikenal. Gunakan ping atau sync.' });
    }

    lock = LockService.getScriptLock();
    if (!lock.tryLock(20000)) {
      return SYNC_json_({ ok: false, error: 'Server sedang memproses sinkronisasi lain. Coba lagi.' });
    }

    var spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
    if (!spreadsheet) throw new Error('Spreadsheet aktif tidak ditemukan. Pastikan Apps Script terikat ke spreadsheet Wedding Planner.');
    var allowed = SYNC_allowedSheets_();
    var changes = request.changes && typeof request.changes === 'object' ? request.changes : {};
    var applied = {};
    var skipped = {};
    var snapshots = {};

    allowed.forEach(function(sheetName) {
      if (sheetName === 'Pengaturan') return;
      var sheet = spreadsheet.getSheetByName(sheetName);
      if (!sheet) return;
      var incoming = Array.isArray(changes[sheetName]) ? changes[sheetName] : [];
      var stats = SYNC_upsertDataSheet_(sheet, incoming);
      snapshots[sheetName] = stats.snapshot;
      if (incoming.length || stats.repaired) {
        applied[sheetName] = stats.applied;
        skipped[sheetName] = stats.skipped;
      }
    });

    if (allowed.indexOf('Pengaturan') !== -1 && Array.isArray(changes.Pengaturan) && changes.Pengaturan.length) {
      var settingsSheet = spreadsheet.getSheetByName('Pengaturan');
      if (!settingsSheet) throw new Error('Sheet tidak ditemukan: Pengaturan');
      var settingStats = SYNC_upsertSettings_(settingsSheet, changes.Pengaturan);
      snapshots.Pengaturan = settingStats.snapshot;
      applied.Pengaturan = settingStats.applied;
      skipped.Pengaturan = settingStats.skipped;
    }

    var since = request.since ? Date.parse(String(request.since)) : null;
    if (since !== null && !isFinite(since)) since = null;
    var data = {};
    allowed.forEach(function(sheetName) {
      var sheet = spreadsheet.getSheetByName(sheetName);
      if (!sheet) return;
      if (sheetName === 'Pengaturan') {
        var settingSnapshot = snapshots.Pengaturan || SYNC_getSettingsSnapshot_(sheet);
        data.Pengaturan = SYNC_readSettingsFromSnapshot_(settingSnapshot);
      } else {
        var dataSnapshot = snapshots[sheetName] || SYNC_getSheetSnapshot_(sheet);
        data[sheetName] = SYNC_pullDataFromSnapshot_(dataSnapshot, since);
      }
    });

    return SYNC_json_({
      ok: true,
      serverTime: new Date().toISOString(),
      data: data,
      applied: applied,
      skipped: skipped
    });
  } catch (error) {
    var message = error && error.message ? error.message : String(error);
    return SYNC_json_({ ok: false, error: message });
  } finally {
    if (lock && lock.hasLock()) lock.releaseLock();
  }
}

function SYNC_allowedSheets_() {
  var names = ['Pengaturan'];
  if (typeof SHEETS !== 'undefined' && SHEETS) {
    if (Array.isArray(SHEETS)) {
      SHEETS.forEach(function(value) { if (typeof value === 'string') names.push(value); });
    } else if (typeof SHEETS === 'object') {
      Object.keys(SHEETS).forEach(function(key) {
        names.push(key);
        var value = SHEETS[key];
        if (typeof value === 'string') names.push(value);
        else if (value && typeof value === 'object') {
          if (typeof value.name === 'string') names.push(value.name);
          if (typeof value.sheetName === 'string') names.push(value.sheetName);
        }
      });
    }
  }
  return names.filter(function(name, index, array) {
    return typeof name === 'string' && name.trim() !== '' && array.indexOf(name) === index;
  });
}

function SYNC_constantTimeEqual_(a, b) {
  a = String(a || '');
  b = String(b || '');
  var difference = a.length ^ b.length;
  var length = Math.max(a.length, b.length);
  for (var i = 0; i < length; i++) {
    difference |= (a.charCodeAt(i % Math.max(1, a.length)) || 0) ^ (b.charCodeAt(i % Math.max(1, b.length)) || 0);
  }
  return difference === 0 && a.length > 0;
}

function SYNC_json_(object) {
  return ContentService.createTextOutput(JSON.stringify(object)).setMimeType(ContentService.MimeType.JSON);
}

function SYNC_headerMap_(headerRow) {
  var map = {};
  headerRow.forEach(function(header, index) {
    var key = String(header || '').trim();
    if (key) map[key] = index;
  });
  return map;
}

function SYNC_getSheetSnapshot_(sheet) {
  var values = sheet.getDataRange().getValues();
  if (!values || values.length === 0) throw new Error('Header baris pertama kosong pada sheet ' + sheet.getName());
  var headers = values[0].map(function(value) { return String(value || '').trim(); });
  var map = SYNC_headerMap_(headers);
  if (map.id === undefined || map.updated_at === undefined || map.created_at === undefined || map.deleted === undefined) {
    throw new Error('Header metadata id, created_at, updated_at, deleted tidak lengkap pada sheet ' + sheet.getName());
  }
  return { values: values, headers: headers, map: map };
}

function SYNC_upsertDataSheet_(sheet, incomingRows) {
  var snapshot = SYNC_getSheetSnapshot_(sheet);
  var values = snapshot.values;
  var headers = snapshot.headers;
  var map = snapshot.map;
  var rowById = {};
  var dirty = false;
  var repaired = 0;
  var now = new Date();

  for (var r = 1; r < values.length; r++) {
    var hasData = values[r].some(function(cell) { return cell !== '' && cell !== null; });
    if (!hasData) continue;
    var id = String(values[r][map.id] || '').trim();
    var updated = values[r][map.updated_at];
    if (!id || !updated || !values[r][map.created_at]) {
      if (!id) values[r][map.id] = Utilities.getUuid().slice(0, 8);
      if (!updated) values[r][map.updated_at] = now.toISOString();
      if (values[r][map.created_at] === '' || values[r][map.created_at] === null) values[r][map.created_at] = now.toISOString();
      if (values[r][map.deleted] === '' || values[r][map.deleted] === null) values[r][map.deleted] = false;
      id = String(values[r][map.id]);
      dirty = true;
      repaired++;
    }
    rowById[id] = r;
  }

  var applied = 0;
  var skipped = 0;
  incomingRows.forEach(function(record) {
    if (!record || typeof record !== 'object') { skipped++; return; }
    var id = String(record.id || '').trim();
    if (!id) { skipped++; return; }
    var index = rowById[id];
    var incomingTime = SYNC_time_(record.updated_at);
    if (!incomingTime) incomingTime = now;
    var targetRow;
    if (index === undefined) {
      targetRow = new Array(headers.length).fill('');
      if (map.created_at !== undefined) targetRow[map.created_at] = record.created_at || incomingTime;
      if (map.id !== undefined) targetRow[map.id] = id;
      values.push(targetRow);
      index = values.length - 1;
      rowById[id] = index;
    } else {
      targetRow = values[index];
      var serverTime = SYNC_time_(targetRow[map.updated_at]);
      if (serverTime && incomingTime.getTime() <= serverTime.getTime()) { skipped++; return; }
    }

    headers.forEach(function(header, column) {
      if (Object.prototype.hasOwnProperty.call(record, header)) {
        targetRow[column] = SYNC_valueForSheet_(header, record[header]);
      }
    });
    targetRow[map.id] = id;
    targetRow[map.updated_at] = incomingTime.toISOString();
    if (!targetRow[map.created_at]) targetRow[map.created_at] = record.created_at || incomingTime.toISOString();
    if (record.deleted === undefined && (targetRow[map.deleted] === '' || targetRow[map.deleted] === null)) targetRow[map.deleted] = false;
    else targetRow[map.deleted] = SYNC_boolean_(record.deleted !== undefined ? record.deleted : targetRow[map.deleted]);
    values[index] = targetRow;
    applied++;
    dirty = true;
  });

  if (dirty) {
    sheet.getRange(1, 1, values.length, headers.length).setValues(values);
  }
  return { applied: applied, skipped: skipped, repaired: repaired, snapshot: { values: values, headers: headers, map: map } };
}

function SYNC_upsertSettings_(sheet, incomingRows) {
  var values = sheet.getDataRange().getValues();
  if (!values.length) throw new Error('Header baris pertama kosong pada sheet Pengaturan.');
  var headers = values[0].map(function(value) { return String(value || '').trim(); });
  var map = SYNC_headerMap_(headers);
  if (map.key === undefined || map.value === undefined) throw new Error('Sheet Pengaturan harus memiliki header key dan value.');
  var props = PropertiesService.getScriptProperties();
  var rowByKey = {};
  for (var r = 1; r < values.length; r++) {
    var key = String(values[r][map.key] || '').trim();
    if (key) rowByKey[key] = r;
  }
  var applied = 0;
  var skipped = 0;
  var dirty = false;
  var timestampUpdates = [];
  incomingRows.forEach(function(record) {
    if (!record || typeof record !== 'object') { skipped++; return; }
    var key = String(record.key || '').trim();
    if (!key) { skipped++; return; }
    var propKey = SYNC_settingTimestampKey_(key);
    var previous = props.getProperty(propKey) || '';
    var previousTime = SYNC_time_(previous);
    var incomingTime = SYNC_time_(record.updated_at) || new Date();
    if (previousTime && incomingTime.getTime() <= previousTime.getTime()) { skipped++; return; }
    var index = rowByKey[key];
    if (index === undefined) {
      var newRow = new Array(headers.length).fill('');
      newRow[map.key] = key;
      values.push(newRow);
      index = values.length - 1;
      rowByKey[key] = index;
    }
    var settingValue = record.value;
    if (key === 'target_budget' || key === 'target_tabungan') {
      var numericSetting = Number(settingValue);
      settingValue = isFinite(numericSetting) ? numericSetting : 0;
    } else if (settingValue === null || settingValue === undefined) {
      settingValue = '';
    } else {
      settingValue = String(settingValue);
    }
    values[index][map.value] = settingValue;
    timestampUpdates.push({ key: propKey, value: incomingTime.toISOString() });
    applied++;
    dirty = true;
  });
  if (dirty) {
    sheet.getRange(1, 1, values.length, headers.length).setValues(values);
    timestampUpdates.forEach(function(update) { props.setProperty(update.key, update.value); });
  }
  return { applied: applied, skipped: skipped, snapshot: { values: values, headers: headers, map: map } };
}

function SYNC_getSettingsSnapshot_(sheet) {
  var values = sheet.getDataRange().getValues();
  if (!values.length) throw new Error('Header baris pertama kosong pada sheet Pengaturan.');
  var headers = values[0].map(function(value) { return String(value || '').trim(); });
  var map = SYNC_headerMap_(headers);
  if (map.key === undefined || map.value === undefined) throw new Error('Sheet Pengaturan harus memiliki header key dan value.');
  return { values: values, headers: headers, map: map };
}

function SYNC_readSettingsFromSnapshot_(snapshot) {
  var values = snapshot.values;
  var map = snapshot.map;
  var props = PropertiesService.getScriptProperties();
  var result = [];
  for (var r = 1; r < values.length; r++) {
    var key = String(values[r][map.key] || '').trim();
    if (!key) continue;
    var updated = props.getProperty(SYNC_settingTimestampKey_(key)) || '';
    var settingValue = values[r][map.value];
    if (settingValue instanceof Date && !isNaN(settingValue.getTime())) {
      if (key === 'tanggal_nikah' || key === 'tenggat_tabungan') settingValue = Utilities.formatDate(settingValue, 'Asia/Jakarta', 'yyyy-MM-dd');
      else settingValue = Utilities.formatDate(settingValue, 'UTC', "yyyy-MM-dd'T'HH:mm:ss.SSS'Z'");
    }
    if (key === 'target_budget' || key === 'target_tabungan') settingValue = settingValue === '' || settingValue === null ? '' : Number(settingValue);
    result.push({ key: key, value: settingValue === null || settingValue === undefined ? '' : String(settingValue), updated_at: updated });
  }
  return result;
}

function SYNC_pullDataFromSnapshot_(snapshot, sinceMillis) {
  var result = [];
  var values = snapshot.values;
  for (var r = 1; r < values.length; r++) {
    var raw = values[r];
    var id = String(raw[snapshot.map.id] || '').trim();
    if (!id) continue;
    var updated = SYNC_time_(raw[snapshot.map.updated_at]);
    if (sinceMillis !== null && updated && updated.getTime() <= sinceMillis) continue;
    result.push(SYNC_normalizeRecord_(snapshot.headers, raw));
  }
  return result;
}

function SYNC_normalizeRecord_(headers, row) {
  var object = {};
  var dateColumns = ['tanggal', 'jatuh_tempo', 'tgl_bayar', 'deadline'];
  var moneyColumns = ['estimasi', 'harga_deal', 'nominal', 'harga', 'biaya', 'skor', 'durasi_menit'];
  headers.forEach(function(header, index) {
    var value = row[index];
    if (value instanceof Date && !isNaN(value.getTime())) {
      if (header === 'created_at' || header === 'updated_at') {
        value = Utilities.formatDate(value, 'UTC', "yyyy-MM-dd'T'HH:mm:ss.SSS'Z'");
      } else if (dateColumns.indexOf(header) !== -1 || header === 'tanggal_nikah' || header === 'tenggat_tabungan') {
        value = Utilities.formatDate(value, 'Asia/Jakarta', 'yyyy-MM-dd');
      } else {
        value = Utilities.formatDate(value, 'UTC', "yyyy-MM-dd'T'HH:mm:ss.SSS'Z'");
      }
    }
    if (header === 'deleted') value = SYNC_boolean_(value);
    else if (moneyColumns.indexOf(header) !== -1) value = value === '' || value === null ? 0 : Number(value);
    else if (value === null || value === undefined) value = '';
    object[header] = value;
  });
  return object;
}

function SYNC_valueForSheet_(header, value) {
  if (header === 'deleted') return SYNC_boolean_(value);
  if (value === null || value === undefined) return '';
  if (header === 'created_at' || header === 'updated_at' || header === 'tanggal' || header === 'jatuh_tempo' || header === 'tgl_bayar' || header === 'deadline') {
    return String(value);
  }
  if (['estimasi', 'harga_deal', 'nominal', 'harga', 'biaya', 'skor', 'durasi_menit'].indexOf(header) !== -1) {
    var numeric = Number(value);
    return isFinite(numeric) ? numeric : 0;
  }
  return value;
}

function SYNC_boolean_(value) {
  if (value === true) return true;
  if (value === false) return false;
  var normalized = String(value || '').trim().toLowerCase();
  return normalized === 'true' || normalized === '1' || normalized === 'yes';
}

function SYNC_time_(value) {
  if (value instanceof Date && !isNaN(value.getTime())) return value;
  if (value === '' || value === null || value === undefined) return null;
  var millis = Date.parse(String(value));
  return isFinite(millis) ? new Date(millis) : null;
}

function SYNC_settingTimestampKey_(key) {
  return 'SYNC_SETTING_TS_' + Utilities.base64EncodeWebSafe(String(key));
}

/** Trigger helper: jalankan SYNC_installSettingsTrigger() satu kali. */
function SYNC_installSettingsTrigger() {
  var spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  if (!spreadsheet) throw new Error('Spreadsheet aktif tidak ditemukan.');
  var exists = ScriptApp.getProjectTriggers().some(function(trigger) {
    return trigger.getHandlerFunction() === 'SYNC_onEditSettings';
  });
  if (!exists) {
    ScriptApp.newTrigger('SYNC_onEditSettings').forSpreadsheet(spreadsheet).onEdit().create();
  }
}

/** Memperbarui timestamp key Pengaturan saat diedit langsung di Google Sheets. */
function SYNC_onEditSettings(e) {
  try {
    if (!e || !e.range) return;
    var sheet = e.range.getSheet();
    if (sheet.getName() !== 'Pengaturan' || e.range.getRow() < 2) return;
    var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0].map(function(value) { return String(value || '').trim(); });
    var map = SYNC_headerMap_(headers);
    if (map.key === undefined || map.value === undefined) return;
    var startRow = e.range.getRow();
    var endRow = e.range.getLastRow();
    var keyColumn = map.key + 1;
    var props = PropertiesService.getScriptProperties();
    var now = new Date().toISOString();
    var keys = sheet.getRange(startRow, keyColumn, endRow - startRow + 1, 1).getValues();
    keys.forEach(function(row) {
      var key = String(row[0] || '').trim();
      if (key) props.setProperty(SYNC_settingTimestampKey_(key), now);
    });
  } catch (error) {
    console.error('SYNC_onEditSettings: ' + error);
  }
}
