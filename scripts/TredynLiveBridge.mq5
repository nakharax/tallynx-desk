//+------------------------------------------------------------------+
//|                                             TredynLiveBridge.mq5 |
//|                     Copyright 2026, Tredyn Trading Systems (GHR) |
//|                                              https://tredyn.com  |
//+------------------------------------------------------------------+
#property copyright "Tredyn (tredyn.com) · GHR v3.2 Desk & Trade Journal"
#property link      "https://desk.tallynx.com"
#property version   "3.20"
#property strict
#property description "Tredyn Live Bridge Read-Only Trade Journal Reporter"
#property description "ซิงก์ประวัติออเดอร์ที่ปิดแล้วเข้าสมุดเทรด Tredyn แบบ Realtime (Read-Only 100%)"

input string InpTredynApiKey      = "YOUR_TREDYN_API_KEY";              // tredyn-api-key (คัดลอกจากหน้าเว็บ Tredyn)
input string InpServerUrl         = "https://desk.tallynx.com";         // Tredyn Desk URL (ต้องเปิด Allow WebRequest)
input int    InpLookbackDays      = 90;                                 // ดึงประวัติย้อนหลัง (วัน)
input int    InpSyncIntervalSec   = 15;                                 // รอบซิงก์อัตโนมัติ (วินาที)
input bool   InpShowChartHud      = true;                               // แสดงสถานะมุมซ้ายบนของกราฟ

datetime g_lastSyncTime = 0;
int      g_lastDealCount = -1;
string   g_lastSyncStatus = "กำลังเริ่มต้น...";
bool     g_initialSyncDone = false;

//+------------------------------------------------------------------+
//| Helper: Escape JSON String                                       |
//+------------------------------------------------------------------+
string EscapeJson(string text)
{
   string out = text;
   StringReplace(out, "\\", "\\\\");
   StringReplace(out, "\"", "\\\"");
   StringReplace(out, "\r", " ");
   StringReplace(out, "\n", " ");
   StringReplace(out, "\t", " ");
   return out;
}

//+------------------------------------------------------------------+
//| Render status HUD on chart                                       |
//+------------------------------------------------------------------+
void UpdateHud()
{
   if(!InpShowChartHud)
   {
      Comment("");
      return;
   }
   long login = AccountInfoInteger(ACCOUNT_LOGIN);
   string srv = AccountInfoString(ACCOUNT_SERVER);
   string brk = AccountInfoString(ACCOUNT_COMPANY);
   double bal = AccountInfoDouble(ACCOUNT_BALANCE);
   string hud = StringFormat(
      "=== Tredyn Live Bridge v3.2 (Read-Only) ===\n"
      "Account : #%I64d (%s · %s)\n"
      "Balance : $%.2f\n"
      "Status  : %s\n"
      "LastSync: %s",
      login, brk, srv, bal, g_lastSyncStatus,
      (g_lastSyncTime > 0 ? TimeToString(g_lastSyncTime, TIME_DATE|TIME_SECONDS) : "-")
   );
   Comment(hud);
}

//+------------------------------------------------------------------+
//| Write local JSON snapshot in MQL5/Files for VPS Gateway mode     |
//+------------------------------------------------------------------+
void WriteLocalSyncFile(long login, string jsonBody)
{
   string fileByLogin = "tredyn_sync_" + IntegerToString(login) + ".json";
   int h1 = FileOpen(fileByLogin, FILE_WRITE | FILE_TXT | FILE_ANSI);
   if(h1 != INVALID_HANDLE)
   {
      FileWriteString(h1, jsonBody);
      FileClose(h1);
   }

   int h2 = FileOpen("tredyn_sync_latest.json", FILE_WRITE | FILE_TXT | FILE_ANSI);
   if(h2 != INVALID_HANDLE)
   {
      FileWriteString(h2, jsonBody);
      FileClose(h2);
   }
}

//+------------------------------------------------------------------+
//| Collect closed deals & push to Tredyn                            |
//+------------------------------------------------------------------+
bool SyncClosedDealsToTredyn(bool forcePush)
{
   long login = AccountInfoInteger(ACCOUNT_LOGIN);
   if(login <= 0)
   {
      g_lastSyncStatus = "รอการล็อกอินเข้าพอร์ต MT5...";
      UpdateHud();
      return false;
   }

   int lookbackDays = (InpLookbackDays > 0 ? InpLookbackDays : 90);
   datetime toTime   = TimeCurrent() + 86400 * 2;
   datetime fromTime = TimeCurrent() - (datetime)lookbackDays * 86400;

   if(!HistorySelect(fromTime, toTime))
   {
      g_lastSyncStatus = "ไม่สามารถอ่าน HistorySelect จาก MT5 ได้";
      UpdateHud();
      return false;
   }

   int totalDeals = HistoryDealsTotal();
   if(!forcePush && totalDeals == g_lastDealCount && g_lastSyncTime > 0 && (TimeCurrent() - g_lastSyncTime) < 60)
   {
      return true;
   }

   string holderName = EscapeJson(AccountInfoString(ACCOUNT_NAME));
   string brokerName = EscapeJson(AccountInfoString(ACCOUNT_COMPANY));
   string serverName = EscapeJson(AccountInfoString(ACCOUNT_SERVER));
   string currency   = EscapeJson(AccountInfoString(ACCOUNT_CURRENCY));
   double balance    = AccountInfoDouble(ACCOUNT_BALANCE);

   string positionsJson = "";
   int exportedCount = 0;

   for(int i = 0; i < totalDeals; i++)
   {
      ulong dealTicket = HistoryDealGetTicket(i);
      if(dealTicket == 0) continue;

      long dealEntry = HistoryDealGetInteger(dealTicket, DEAL_ENTRY);
      // เก็บเฉพาะจังหวะปิดออเดอร์ (DEAL_ENTRY_OUT หรือ DEAL_ENTRY_INOUT)
      if(dealEntry != DEAL_ENTRY_OUT && dealEntry != DEAL_ENTRY_INOUT) continue;

      long dealType = HistoryDealGetInteger(dealTicket, DEAL_TYPE);
      if(dealType != DEAL_TYPE_BUY && dealType != DEAL_TYPE_SELL) continue;

      long posId       = HistoryDealGetInteger(dealTicket, DEAL_POSITION_ID);
      string symbol    = EscapeJson(HistoryDealGetString(dealTicket, DEAL_SYMBOL));
      double volume    = HistoryDealGetDouble(dealTicket, DEAL_VOLUME);
      double closePrice= HistoryDealGetDouble(dealTicket, DEAL_PRICE);
      datetime closeTm = (datetime)HistoryDealGetInteger(dealTicket, DEAL_TIME);
      double profit    = HistoryDealGetDouble(dealTicket, DEAL_PROFIT);
      double comm      = HistoryDealGetDouble(dealTicket, DEAL_COMMISSION);
      double swap      = HistoryDealGetDouble(dealTicket, DEAL_SWAP);
      string comment   = EscapeJson(HistoryDealGetString(dealTicket, DEAL_COMMENT));

      // ค้นหาไม้เปิด (DEAL_ENTRY_IN) ของ Position นี้เพื่อดึงราคา Entry และเวลาเปิดจริง
      double openPrice = closePrice;
      datetime openTm  = closeTm;
      string origDir   = (dealType == DEAL_TYPE_SELL ? "BUY" : "SELL");

      if(posId > 0 && HistorySelectByPosition(posId))
      {
         int posDeals = HistoryDealsTotal();
         for(int j = 0; j < posDeals; j++)
         {
            ulong inTicket = HistoryDealGetTicket(j);
            if(inTicket == 0) continue;
            long inEntry = HistoryDealGetInteger(inTicket, DEAL_ENTRY);
            if(inEntry == DEAL_ENTRY_IN)
            {
               openPrice = HistoryDealGetDouble(inTicket, DEAL_PRICE);
               openTm    = (datetime)HistoryDealGetInteger(inTicket, DEAL_TIME);
               long inType = HistoryDealGetInteger(inTicket, DEAL_TYPE);
               origDir   = (inType == DEAL_TYPE_BUY ? "BUY" : "SELL");
               comm     += HistoryDealGetDouble(inTicket, DEAL_COMMISSION);
               break;
            }
         }
         // คืนค่า HistorySelect กลับเป็นช่วงเวลาหลัก
         HistorySelect(fromTime, toTime);
      }

      string itemJson = StringFormat(
         "{\"ticket\":\"%I64u\",\"positionId\":\"%I64d\",\"symbol\":\"%s\",\"dir\":\"%s\","
         "\"openTime\":%I64d,\"closeTime\":%I64d,\"volume\":%.2f,"
         "\"openPrice\":%.5f,\"closePrice\":%.5f,\"commission\":%.2f,\"swap\":%.2f,"
         "\"rawProfit\":%.2f,\"comment\":\"%s\"}",
         dealTicket, posId, symbol, origDir,
         (long)openTm, (long)closeTm, volume,
         openPrice, closePrice, comm, swap,
         profit, comment
      );

      if(exportedCount > 0) positionsJson += ",";
      positionsJson += itemJson;
      exportedCount++;
   }

   string apiKey = InpTredynApiKey;
   StringTrimLeft(apiKey);
   StringTrimRight(apiKey);

   string jsonBody = StringFormat(
      "{\"tredynApiKey\":\"%s\",\"meta\":{\"holderName\":\"%s\",\"login\":\"%I64d\","
      "\"broker\":\"%s\",\"server\":\"%s\",\"currency\":\"%s\",\"initialDeposit\":%.2f},"
      "\"positions\":[%s]}",
      EscapeJson(apiKey), holderName, login, brokerName, serverName, currency, balance, positionsJson
   );

   // เขียนไฟล์ JSON ลงใน MQL5/Files เสมอ (รองรับทั้งโหมด VPS Gateway และตรวจสอบย้อนหลัง)
   WriteLocalSyncFile(login, jsonBody);

   if(StringLen(apiKey) < 6 || apiKey == "YOUR_TREDYN_API_KEY" || apiKey == "GATEWAY_LOCAL")
   {
      g_lastDealCount  = totalDeals;
      g_lastSyncTime   = TimeCurrent();
      g_initialSyncDone = true;
      g_lastSyncStatus = StringFormat("บันทึก Local Snapshot สำเร็จ (%d ออเดอร์)", exportedCount);
      UpdateHud();
      return true;
   }

   string baseUrl = InpServerUrl;
   StringTrimLeft(baseUrl);
   StringTrimRight(baseUrl);
   if(StringSubstr(baseUrl, StringLen(baseUrl) - 1, 1) == "/")
      baseUrl = StringSubstr(baseUrl, 0, StringLen(baseUrl) - 1);

   string endpoint = baseUrl + "/api/mt5/live-bridge/push";
   string headers  = "Content-Type: application/json\r\nX-Tredyn-Api-Key: " + apiKey + "\r\n";

   char postData[];
   char resultData[];
   string resultHeaders;
   int dataLen = StringToCharArray(jsonBody, postData, 0, WHOLE_ARRAY, CP_UTF8);
   if(dataLen > 0) ArrayResize(postData, dataLen - 1); // ตัด null-terminator

   ResetLastError();
   int res = WebRequest("POST", endpoint, headers, 8000, postData, resultData, resultHeaders);

   if(res == 200 || res == 201)
   {
      g_lastDealCount  = totalDeals;
      g_lastSyncTime   = TimeCurrent();
      g_initialSyncDone = true;
      g_lastSyncStatus = StringFormat("ซิงก์สำเร็จ (%d ออเดอร์ที่ปิดแล้ว)", exportedCount);
      UpdateHud();
      return true;
   }
   else
   {
      int err = GetLastError();
      if(err == 4014)
         g_lastSyncStatus = "กรุณาเปิด Tools -> Options -> Expert Advisors -> Allow WebRequest: " + baseUrl;
      else
         g_lastSyncStatus = StringFormat("ส่งข้อมูลไม่สำเร็จ (HTTP %d / Error %d)", res, err);
      UpdateHud();
      return false;
   }
}

//+------------------------------------------------------------------+
//| Expert initialization function                                   |
//+------------------------------------------------------------------+
int OnInit()
{
   EventSetTimer(2);
   g_initialSyncDone = false;
   SyncClosedDealsToTredyn(true);
   return(INIT_SUCCEEDED);
}

//+------------------------------------------------------------------+
//| Expert deinitialization function                                 |
//+------------------------------------------------------------------+
void OnDeinit(const int reason)
{
   EventKillTimer();
   Comment("");
}

//+------------------------------------------------------------------+
//| Timer function                                                   |
//+------------------------------------------------------------------+
void OnTimer()
{
   if(!g_initialSyncDone)
   {
      if(SyncClosedDealsToTredyn(true))
      {
         int sec = (InpSyncIntervalSec >= 5 ? InpSyncIntervalSec : 15);
         EventSetTimer(sec);
      }
      return;
   }
   SyncClosedDealsToTredyn(false);
}

//+------------------------------------------------------------------+
//| TradeTransaction function — ซิงก์ทันทีเมื่อมีออเดอร์ปิดใหม่      |
//+------------------------------------------------------------------+
void OnTradeTransaction(const MqlTradeTransaction &trans,
                        const MqlTradeRequest &request,
                        const MqlTradeResult &result)
{
   if(trans.type == TRADE_TRANSACTION_DEAL_ADD)
   {
      SyncClosedDealsToTredyn(true);
   }
}
//+------------------------------------------------------------------+
