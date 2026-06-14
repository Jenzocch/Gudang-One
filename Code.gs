// ═══════════════════════════════════════════════════
// GUDANG PABRIK — Google Apps Script Backend
// Sheet ID: 1cyyNcaF_eQwdgytsG-U2UGkni8ibgjj4F4Uo2Kgbm-8
// ═══════════════════════════════════════════════════

var SHEET_ID       = '1cyyNcaF_eQwdgytsG-U2UGkni8ibgjj4F4Uo2Kgbm-8';
var TELEGRAM_TOKEN = 'ISI_BOT_TOKEN_KAMU';
var TELEGRAM_CHAT  = 'ISI_CHAT_ID_ADMIN';
var CLAUDE_KEY     = 'ISI_CLAUDE_API_KEY';

var SH_ITEMS  = 'Items';
var SH_TRX    = 'Transactions';
var SH_REQ    = 'Requests';
var SH_PEOPLE = 'People';

// ── CORS HELPER ──
function cors(data) {
  var output = ContentService.createTextOutput(JSON.stringify(data));
  output.setMimeType(ContentService.MimeType.JSON);
  output.addHeader('Access-Control-Allow-Origin', '*');
  output.addHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  output.addHeader('Access-Control-Allow-Headers', 'Content-Type');
  return output;
}

// ── GET ROUTER (supports JSONP + GET-based POST) ──
function doGet(e) {
  try {
    var callback = e.parameter.callback || '';
    var action   = e.parameter.action   || '';
    var jsondata = e.parameter.jsondata || '';

    var result;

    // GET-based POST (for CORS bypass)
    if (jsondata) {
      var body = JSON.parse(decodeURIComponent(jsondata));
      action = body.action || '';
      switch(action) {
        case 'ambil':      result = recordAmbil(body);      break;
        case 'masuk':      result = recordMasuk(body);      break;
        case 'request':    result = submitRequest(body);    break;
        case 'approveReq': result = approveRequest(body);   break;
        case 'rejectReq':  result = rejectRequest(body);    break;
        case 'identify':   result = identifyPhoto(body);    break;
        case 'addItem':    result = addItem(body);          break;
        case 'updateItem': result = updateItem(body);       break;
        default:           result = {ok:false, error:'Unknown action'};
      }
    } else {
      // Normal GET
      switch(action) {
        case 'items':    result = getItems();       break;
        case 'people':   result = getPeople();      break;
        case 'requests': result = getRequests();    break;
        case 'trx':      result = getTransactions(); break;
        default:         result = {ok:true, msg:'Gudang API ready'};
      }
    }

    // JSONP response
    var json = JSON.stringify(result);
    if (callback) {
      var resp = ContentService
        .createTextOutput(callback + '(' + json + ')')
        .setMimeType(ContentService.MimeType.JAVASCRIPT);
      resp.addHeader('Access-Control-Allow-Origin', '*');
      return resp;
    }
    return cors(result);

  } catch(err) {
    var errJson = JSON.stringify({ok:false, error: err.message});
    var cb = e.parameter.callback || '';
    if (cb) {
      var resp = ContentService
        .createTextOutput(cb + '(' + errJson + ')')
        .setMimeType(ContentService.MimeType.JAVASCRIPT);
      resp.addHeader('Access-Control-Allow-Origin', '*');
      return resp;
    }
    return cors({ok:false, error: err.message});
  }
}

// ── POST ROUTER ──
function doPost(e) {
  try {
    var body   = JSON.parse(e.postData.contents);
    var action = body.action || '';
    switch(action) {
      case 'ambil':      return cors(recordAmbil(body));
      case 'masuk':      return cors(recordMasuk(body));
      case 'request':    return cors(submitRequest(body));
      case 'approveReq': return cors(approveRequest(body));
      case 'rejectReq':  return cors(rejectRequest(body));
      case 'identify':   return cors(identifyPhoto(body));
      case 'addItem':    return cors(addItem(body));
      case 'updateItem': return cors(updateItem(body));
      default:           return cors({ok:false, error:'Unknown action'});
    }
  } catch(err) {
    return cors({ok:false, error: err.message});
  }
}

// ── OPTIONS HANDLER (for preflight requests) ──
function doOptions(e) {
  var output = ContentService.createTextOutput('');
  output.addHeader('Access-Control-Allow-Origin', '*');
  output.addHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  output.addHeader('Access-Control-Allow-Headers', 'Content-Type');
  return output;
}

function getItems() {
  var ss    = SpreadsheetApp.openById(SHEET_ID);
  var sheet = ss.getSheetByName(SH_ITEMS);
  var rows  = sheet.getDataRange().getValues();
  var headers = rows[0];
  var items = [];
  for (var i = 1; i < rows.length; i++) {
    var row = rows[i];
    if (!row[0] || row[14] === false || row[14] === 'FALSE') continue;
    var obj = {};
    headers.forEach(function(h, idx) { obj[h] = row[idx]; });
    obj.qty     = Number(obj.qty)     || 0;
    obj.min_qty = Number(obj.min_qty) || 0;
    items.push(obj);
  }
  return {ok:true, items:items};
}

function getPeople() {
  var ss    = SpreadsheetApp.openById(SHEET_ID);
  var sheet = ss.getSheetByName(SH_PEOPLE);
  var rows  = sheet.getDataRange().getValues();
  var headers = rows[0];
  var people = [];
  for (var i = 1; i < rows.length; i++) {
    var row = rows[i];
    if (!row[0] || row[4] === false || row[4] === 'FALSE') continue;
    var obj = {};
    headers.forEach(function(h, idx) { obj[h] = row[idx]; });
    people.push(obj);
  }
  return {ok:true, people:people};
}

function getRequests() {
  var ss    = SpreadsheetApp.openById(SHEET_ID);
  var sheet = ss.getSheetByName(SH_REQ);
  var rows  = sheet.getDataRange().getValues();
  var headers = rows[0];
  var reqs = [];
  for (var i = 1; i < rows.length; i++) {
    var row = rows[i];
    if (!row[0]) continue;
    var obj = {};
    headers.forEach(function(h, idx) { obj[h] = row[idx]; });
    if (obj.timestamp instanceof Date) {
      obj.timestamp = Utilities.formatDate(obj.timestamp, 'Asia/Jakarta', 'dd/MM/yyyy HH:mm');
    }
    reqs.push(obj);
  }
  var urgOrder = {darurat:0, segera:1, biasa:2};
  reqs.sort(function(a,b){
    if (a.status==='pending' && b.status!=='pending') return -1;
    if (a.status!=='pending' && b.status==='pending') return 1;
    return (urgOrder[a.urgency]||9) - (urgOrder[b.urgency]||9);
  });
  return {ok:true, requests:reqs};
}

function getTransactions() {
  var ss    = SpreadsheetApp.openById(SHEET_ID);
  var sheet = ss.getSheetByName(SH_TRX);
  var rows  = sheet.getDataRange().getValues();
  var headers = rows[0];
  var trx = [];
  for (var i = 1; i < rows.length; i++) {
    var row = rows[i];
    if (!row[0]) continue;
    var obj = {};
    headers.forEach(function(h, idx) { obj[h] = row[idx]; });
    if (obj.timestamp instanceof Date) {
      obj.timestamp = Utilities.formatDate(obj.timestamp, 'Asia/Jakarta', 'dd/MM/yyyy HH:mm');
    }
    trx.push(obj);
  }
  trx.reverse();
  return {ok:true, transactions: trx.slice(0,50)};
}

function recordAmbil(body) {
  var ss        = SpreadsheetApp.openById(SHEET_ID);
  var trxSheet  = ss.getSheetByName(SH_TRX);
  var itemSheet = ss.getSheetByName(SH_ITEMS);
  var itemRows  = itemSheet.getDataRange().getValues();
  var headers   = itemRows[0];
  var idCol     = headers.indexOf('id');
  var qtyCol    = headers.indexOf('qty');
  var itemRow   = -1;
  for (var i = 1; i < itemRows.length; i++) {
    if (String(itemRows[i][idCol]) === String(body.item_id)) { itemRow = i+1; break; }
  }
  if (itemRow < 0) return {ok:false, error:'Item not found'};
  var curQty = Number(itemSheet.getRange(itemRow, qtyCol+1).getValue()) || 0;
  var newQty = Math.max(0, curQty - Number(body.qty));
  itemSheet.getRange(itemRow, qtyCol+1).setValue(newQty);
  var now   = new Date();
  var trxId = 'TRX-' + now.getTime();
  trxSheet.appendRow([trxId, now, 'KELUAR', body.item_id, body.item_name, body.qty, body.unit, body.person, body.dept||'', body.notes||'']);
  var minCol = headers.indexOf('min_qty');
  var minQty = Number(itemSheet.getRange(itemRow, minCol+1).getValue()) || 0;
  if (newQty <= minQty) {
    var linkCol  = headers.indexOf('link');
    var priceCol = headers.indexOf('price');
    sendTelegram('⚠️ *STOK KRITIS: ' + body.item_name + '*\nSisa: *' + newQty + ' ' + body.unit + '* (min ' + minQty + ')\n🛒 ' + itemSheet.getRange(itemRow, linkCol+1).getValue());
  }
  return {ok:true, new_qty: newQty, trx_id: trxId};
}

function recordMasuk(body) {
  var ss        = SpreadsheetApp.openById(SHEET_ID);
  var trxSheet  = ss.getSheetByName(SH_TRX);
  var itemSheet = ss.getSheetByName(SH_ITEMS);
  var itemRows  = itemSheet.getDataRange().getValues();
  var headers   = itemRows[0];
  var idCol     = headers.indexOf('id');
  var qtyCol    = headers.indexOf('qty');
  var priceCol  = headers.indexOf('price');
  var lastPCol  = headers.indexOf('last_price');
  var buyCol    = headers.indexOf('buy_type');
  var itemRow   = -1;
  for (var i = 1; i < itemRows.length; i++) {
    if (String(itemRows[i][idCol]) === String(body.item_id)) { itemRow = i+1; break; }
  }
  if (itemRow < 0) return {ok:false, error:'Item not found'};
  var curQty = Number(itemSheet.getRange(itemRow, qtyCol+1).getValue()) || 0;
  var newQty = curQty + Number(body.qty);
  itemSheet.getRange(itemRow, qtyCol+1).setValue(newQty);
  if (body.price) {
    var oldPrice = itemSheet.getRange(itemRow, priceCol+1).getValue();
    if (oldPrice) itemSheet.getRange(itemRow, lastPCol+1).setValue(oldPrice);
    itemSheet.getRange(itemRow, priceCol+1).setValue(body.price);
  }
  if (body.buy_type) itemSheet.getRange(itemRow, buyCol+1).setValue(body.buy_type);
  var now = new Date();
  var trxId = 'TRX-' + now.getTime();
  trxSheet.appendRow([trxId, now, 'MASUK', body.item_id, body.item_name, body.qty, body.unit, body.person, body.dept||'', (body.notes||'')+(body.price?' | Harga: '+body.price:'')+(body.buy_type?' | '+body.buy_type:'')]);
  return {ok:true, new_qty: newQty, trx_id: trxId};
}

function submitRequest(body) {
  var ss    = SpreadsheetApp.openById(SHEET_ID);
  var sheet = ss.getSheetByName(SH_REQ);
  var now   = new Date();
  var reqId = 'REQ-' + now.getTime();
  sheet.appendRow([reqId, now, body.person, body.dept, body.item_name, body.qty, body.unit, body.urgency||'biasa', body.notes||'', body.link||'', 'pending']);
  var urgEmoji = {darurat:'🔴', segera:'🟡', biasa:'🟢'};
  sendTelegram((urgEmoji[body.urgency]||'⚪') + ' *PERMINTAAN BARU*\nDari: ' + body.person + ' (' + body.dept + ')\nBarang: *' + body.item_name + '* × ' + body.qty + ' ' + body.unit + '\nUrgensi: ' + (body.urgency||'biasa').toUpperCase());
  return {ok:true, req_id: reqId};
}

function approveRequest(body) { return updateRequestStatus(body.req_id, 'approved'); }
function rejectRequest(body)  { return updateRequestStatus(body.req_id, 'rejected'); }

function updateRequestStatus(reqId, status) {
  var ss    = SpreadsheetApp.openById(SHEET_ID);
  var sheet = ss.getSheetByName(SH_REQ);
  var rows  = sheet.getDataRange().getValues();
  var headers = rows[0];
  var idCol = headers.indexOf('id');
  var stCol = headers.indexOf('status');
  for (var i = 1; i < rows.length; i++) {
    if (String(rows[i][idCol]) === String(reqId)) {
      sheet.getRange(i+1, stCol+1).setValue(status);
      return {ok:true, req_id:reqId, status:status};
    }
  }
  return {ok:false, error:'Not found'};
}

function addItem(body) {
  var ss    = SpreadsheetApp.openById(SHEET_ID);
  var sheet = ss.getSheetByName(SH_ITEMS);
  var itemId = 'ITM-' + new Date().getTime();
  sheet.appendRow([itemId, body.name||'', body.code||'', body.emoji||'⚙️', body.category||'', body.location||'', Number(body.qty)||0, body.unit||'pcs', Number(body.min_qty)||5, body.price||'', body.last_price||'', body.buy_type||'Perusahaan', body.link||'', body.notes||'', true]);
  return {ok:true, item_id: itemId};
}

function updateItem(body) {
  var ss    = SpreadsheetApp.openById(SHEET_ID);
  var sheet = ss.getSheetByName(SH_ITEMS);
  var rows  = sheet.getDataRange().getValues();
  var headers = rows[0];
  var idCol = headers.indexOf('id');
  for (var i = 1; i < rows.length; i++) {
    if (String(rows[i][idCol]) === String(body.id)) {
      ['name','code','emoji','category','location','qty','unit','min_qty','price','last_price','buy_type','link','notes','active'].forEach(function(f) {
        var col = headers.indexOf(f);
        if (col >= 0 && body[f] !== undefined) sheet.getRange(i+1, col+1).setValue(body[f]);
      });
      return {ok:true, id: body.id};
    }
  }
  return {ok:false, error:'Not found'};
}

function identifyPhoto(body) {
  var itemsResult = getItems();
  var itemNames = itemsResult.items.map(function(i){ return i.name+' ('+i.code+')'; }).join(', ');
  var prompt = 'Kamu adalah sistem identifikasi barang gudang pabrik.\nDaftar barang: '+itemNames+'\n\nLihat foto dan jawab HANYA dalam format JSON:\n{"match": "nama barang", "code": "kode", "confidence": "tinggi/sedang/rendah", "reason": "alasan"}\nJika tidak cocok, match = "tidak ditemukan".';
  try {
    var response = UrlFetchApp.fetch('https://api.anthropic.com/v1/messages', {
      method: 'post',
      contentType: 'application/json',
      headers: {'x-api-key': CLAUDE_KEY, 'anthropic-version': '2023-06-01'},
      payload: JSON.stringify({
        model: 'claude-sonnet-4-6', max_tokens: 200,
        messages: [{role:'user', content:[
          {type:'image', source:{type:'base64', media_type: body.media_type||'image/jpeg', data: body.image_base64}},
          {type:'text', text: prompt}
        ]}]
      }),
      muteHttpExceptions: true
    });
    var result = JSON.parse(response.getContentText());
    if (result.content && result.content[0]) {
      var jsonMatch = result.content[0].text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        var parsed = JSON.parse(jsonMatch[0]);
        var found = itemsResult.items.find(function(i){ return i.name===parsed.match||i.code===parsed.code; });
        return {ok:true, result:parsed, item:found||null};
      }
    }
    return {ok:false, error:'Parse error'};
  } catch(err) {
    return {ok:false, error:err.message};
  }
}

function sendTelegram(text) {
  try {
    if (!TELEGRAM_TOKEN || TELEGRAM_TOKEN === 'ISI_BOT_TOKEN_KAMU') return;
    UrlFetchApp.fetch('https://api.telegram.org/bot'+TELEGRAM_TOKEN+'/sendMessage', {
      method:'post', contentType:'application/json',
      payload: JSON.stringify({chat_id: TELEGRAM_CHAT, text: text, parse_mode:'Markdown'}),
      muteHttpExceptions: true
    });
  } catch(e) {}
}

function checkCritical() {
  var result = getItems();
  var critical = result.items.filter(function(i){ return i.qty <= i.min_qty; });
  if (critical.length === 0) return;
  var msg = '🚨 *STOK KRITIS — '+Utilities.formatDate(new Date(),'Asia/Jakarta','dd/MM HH:mm')+'*\n\n';
  critical.forEach(function(item) {
    msg += '• *'+item.name+'*: sisa '+item.qty+' '+item.unit+' (min '+item.min_qty+')\n';
    if (item.link) msg += '  🛒 '+item.link+'\n';
  });
  sendTelegram(msg);
}

function initSheets() {
  var ss = SpreadsheetApp.openById(SHEET_ID);

  var items = ss.getSheetByName(SH_ITEMS) || ss.insertSheet(SH_ITEMS);
  if (items.getLastRow() === 0) {
    items.appendRow(['id','name','code','emoji','category','location','qty','unit','min_qty','price','last_price','buy_type','link','notes','active']);
    items.getRange(1,1,1,15).setFontWeight('bold').setBackground('#1a1a1a').setFontColor('#ffffff');
    items.appendRow(['ITM-001','Bearing 6205 ZZ','BRG-6205','⚙️','Mekanikal','RAK A-01',2,'pcs',10,'Rp 45.000','Rp 42.000','Perusahaan','https://tokopedia.com','Wajib beli SKF',true]);
    items.appendRow(['ITM-002','V-Belt A-52','VBT-A52','🔄','Mekanikal','RAK A-02',5,'pcs',8,'Rp 28.000','','Perusahaan','https://tokopedia.com','Gates atau Bando OK',true]);
    items.appendRow(['ITM-003','Baut M8×20 SS','BAU-M820','🔩','Fastener','RAK B-01',84,'pcs',50,'Rp 850','','Perusahaan','https://tokopedia.com','Stainless A2-70',true]);
    items.appendRow(['ITM-004','Kabel NYA 2.5mm','KBL-NYA25','⚡','Elektrikal','RAK B-02',32,'m',20,'Rp 4.200/m','','Pribadi (reimburse)','https://tokopedia.com','Eterna atau Supreme',true]);
    items.appendRow(['ITM-005','Oli SAE 40','OLI-SAE40','🛢️','Consumable','RAK C-01',8,'L',12,'Rp 35.000/L','','Perusahaan','https://tokopedia.com','Shell Omala S2',true]);
  }

  var trx = ss.getSheetByName(SH_TRX) || ss.insertSheet(SH_TRX);
  if (trx.getLastRow() === 0) {
    trx.appendRow(['id','timestamp','type','item_id','item_name','qty','unit','person','dept','notes']);
    trx.getRange(1,1,1,10).setFontWeight('bold').setBackground('#1a1a1a').setFontColor('#ffffff');
  }

  var req = ss.getSheetByName(SH_REQ) || ss.insertSheet(SH_REQ);
  if (req.getLastRow() === 0) {
    req.appendRow(['id','timestamp','person','dept','item_name','qty','unit','urgency','notes','link','status']);
    req.getRange(1,1,1,11).setFontWeight('bold').setBackground('#1a1a1a').setFontColor('#ffffff');
  }

  var ppl = ss.getSheetByName(SH_PEOPLE) || ss.insertSheet(SH_PEOPLE);
  if (ppl.getLastRow() === 0) {
    ppl.appendRow(['id','name','dept','code','active']);
    ppl.getRange(1,1,1,5).setFontWeight('bold').setBackground('#1a1a1a').setFontColor('#ffffff');
    ppl.appendRow(['EMP-001','Budi','Produksi','BD',true]);
    ppl.appendRow(['EMP-002','Andi','Maintenance','AN',true]);
    ppl.appendRow(['EMP-003','Siti','Gudang','ST',true]);
    ppl.appendRow(['EMP-004','Roni','QC','RN',true]);
    ppl.appendRow(['EMP-005','Dewi','Admin','DW',true]);
  }

  SpreadsheetApp.getActiveSpreadsheet().toast('✅ Sheets sudah siap!', 'Gudang Init', 5);
}
