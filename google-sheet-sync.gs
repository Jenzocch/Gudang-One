/**
 * Gudang Inventory → Google Sheet 自動同步
 * ───────────────────────────────────────────
 * 安裝步驟：
 * 1. 開新的 Google Sheet
 * 2. 選單 Extensions → Apps Script
 * 3. 刪掉預設代碼，貼上這整個檔案
 * 4. 按 💾 儲存
 * 5. 上方函式選 "setupDailyTrigger" → 按 ▶ Run（第一次會要求授權，按允許）
 * 6. 完成！每天會自動同步。也可手動選 "syncAll" → Run 立即執行一次
 */

// ══════════════════════════════════
var SUPA_URL = 'https://klswfuzuhlowzrbncreu.supabase.co';
var SUPA_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imtsc3dmdXp1aGxvd3pyYm5jcmV1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE1MjM5NTEsImV4cCI6MjA5NzA5OTk1MX0.yfqyBjGFwMsryWZszo-nONINYG8QdcIAUGL97TEWgDk';
// ══════════════════════════════════

/** Supabase REST 抓全部資料（自動分頁，每頁 1000 筆） */
function fetchAll(table, select, order) {
  var rows = [];
  var from = 0;
  var pageSize = 1000;
  while (true) {
    var url = SUPA_URL + '/rest/v1/' + table + '?select=' + (select || '*');
    if (order) url += '&order=' + order;
    var res = UrlFetchApp.fetch(url, {
      method: 'get',
      headers: {
        'apikey': SUPA_KEY,
        'Authorization': 'Bearer ' + SUPA_KEY,
        'Range-Unit': 'items',
        'Range': from + '-' + (from + pageSize - 1)
      },
      muteHttpExceptions: true
    });
    var data = JSON.parse(res.getContentText() || '[]');
    if (!data.length) break;
    rows = rows.concat(data);
    if (data.length < pageSize) break;
    from += pageSize;
  }
  return rows;
}

/** 把 2D 陣列寫到指定 tab（先清空再寫） */
function writeTab(tabName, header, rows) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(tabName);
  if (!sheet) sheet = ss.insertSheet(tabName);
  sheet.clearContents();
  var all = [header].concat(rows);
  if (all.length && all[0].length) {
    sheet.getRange(1, 1, all.length, all[0].length).setValues(all);
  }
  // 標題列粗體 + 凍結
  sheet.getRange(1, 1, 1, header.length).setFontWeight('bold').setBackground('#4F46E5').setFontColor('#ffffff');
  sheet.setFrozenRows(1);
}

/** 同步「庫存」 */
function syncItems() {
  var items = fetchAll('items', '*', 'warehouse_id.asc,name.asc');
  var header = ['Nama Barang', 'Qty', 'Satuan', 'Min', 'Supplier', 'Gudang', 'Kondisi Simpan', 'Deskripsi', 'COA URL', 'Tags'];
  var rows = items.map(function (i) {
    return [
      i.name || '', i.qty || 0, i.unit || '', i.critical_qty || 0,
      i.supplier_name || '', i.warehouse_id || '', i.storage_condition || '',
      i.description || '', i.coa_url || '', (i.tags || []).join(', ')
    ];
  });
  writeTab('Items', header, rows);
  return items;
}

/** 同步「交易記錄」 */
function syncTransactions(itemsMap) {
  var tx = fetchAll('transactions', '*', 'created_at.desc');
  var header = ['Tanggal', 'Tipe', 'Nama Barang', 'Qty', 'Satuan', 'Karyawan', 'Gudang'];
  var rows = tx.map(function (t) {
    var unit = itemsMap[t.item_id] ? itemsMap[t.item_id].unit : '';
    return [
      t.created_at ? new Date(t.created_at) : '',
      t.type || '', t.item_name || '', t.qty || 0, unit,
      t.person_name || '', t.warehouse_id || ''
    ];
  });
  writeTab('Transactions', header, rows);
}

/** 同步「批號追蹤」 */
function syncBatches(itemsMap) {
  var bats = fetchAll('item_batches', '*', 'warehouse_id.asc,expiry_date.asc');
  var header = ['Nama Barang', 'Lot No', 'Code Produksi', 'PO No', 'DO No', 'Tgl Produksi', 'Tgl Kadaluarsa', 'QC Status', 'Qty Awal', 'Qty Sisa', 'Gudang'];
  var rows = bats.map(function (b) {
    var name = itemsMap[b.item_id] ? itemsMap[b.item_id].name : '?';
    return [
      name, b.lot_no || '', b.code_produksi || '', b.po_no || '', b.do_no || '',
      b.production_date || '', b.expiry_date || '', b.qc_status || '',
      b.qty_initial || 0, b.qty_remaining || 0, b.warehouse_id || ''
    ];
  });
  writeTab('Batches', header, rows);
}

/** 一次同步全部 + 寫入更新時間 */
function syncAll() {
  var items = syncItems();
  var itemsMap = {};
  items.forEach(function (i) { itemsMap[i.id] = i; });
  syncTransactions(itemsMap);
  syncBatches(itemsMap);

  // 在 Items tab 右上角寫更新時間
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName('Items');
  sheet.getRange(1, 12).setValue('Update terakhir:');
  sheet.getRange(1, 13).setValue(new Date()).setNumberFormat('yyyy-mm-dd hh:mm');
}

/** Setup auto-sync every 12 hours */
function setupDailyTrigger() {
  // Remove old triggers to avoid duplicates
  var triggers = ScriptApp.getProjectTriggers();
  triggers.forEach(function (t) {
    if (t.getHandlerFunction() === 'syncAll') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('syncAll').timeBased().everyHours(12).create();
  syncAll(); // Sync immediately once
  SpreadsheetApp.getActiveSpreadsheet().toast('Auto-sync setiap 12 jam aktif, sudah sync sekali!');
}
