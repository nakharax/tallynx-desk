---
name: Daily Health & Error Triage
cron: "0 8 * * *"
permission: Read-Only + Report
target_branch: master
---

# Daily Health & Error Triage (TallyNX Desk & Mall)

ตรวจสอบ Error Log และสถานะระบบย้อนหลัง 24 ชั่วโมง (Read-Only ห้ามแก้โค้ดหรือรันคำสั่งบน Production):

1. ตรวจสอบสถานะ `/api/health`, Vercel Function Logs, Express/Worker Logs (`server.ts`, `worker/index.ts`), และ Firestore Security Rule Denials (ถ้ามีข้อมูลให้เข้าถึงได้)
2. จัดกลุ่ม Error ตาม Root Cause และเรียงตามความถี่/ผลกระทบ:
   - **P0:** กระทบผู้ใช้หลัก, Risk/Position Sizing Calculation, License/Entitlements, หรือ Auth/Workspace Data Isolation
   - **P1:** ฟีเจอร์รอง (เช่น Community Mall, News Radar, AI Behavioral Review, MT5 Bridge Telemetry)
   - **P2:** Noise / Transient Warnings
3. สำหรับ P0 และ P1 ให้ไล่หาไฟล์และบรรทัดที่น่าจะเป็นต้นเหตุ พร้อมร่างแผนการแก้ไขสั้น ๆ
4. ส่งสรุปเป็นตารางไม่เกิน 10 บรรทัด ถ้าไม่มี Error ระดับ P0/P1 ให้รายงานสั้น ๆ ว่า `"All Green"`
