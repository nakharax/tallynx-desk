# Feature Spec: [ชื่อฟีเจอร์]

> ใช้ไฟล์นี้เป็นต้นทางก่อนพิมพ์คำสั่ง `/plan` ใน Antigravity 2.0 เพื่อบังคับให้ Scope แคบและชัดตั้งแต่นาทีแรก

## 1. Problem & Goal
- **ปัญหาที่แก้:** [อธิบายใน 1-2 ประโยค]
- **เป้าหมาย / ตัววัดผลสำเร็จ:** [เช่น ลดเวลาทำงานเหลือ < 1 นาที / คำนวณ 3-TP Ladder แม่นยำด้วย `decimal.js`]

## 2. Scope
- **In-Scope (ไม่เกิน 3 ข้อ):**
  1. [ฟีเจอร์หลักที่ต้องมี]
  2. [ฟีเจอร์ประกอบที่ขาดไม่ได้]
- **Out-of-Scope (ยังไม่ทำในรอบนี้):**
  - [ตัดสิ่งที่ไม่จำเป็นออกให้ชัด เพื่อกัน Agent คิดเผื่อเอง]

## 3. Data & Interface Changes
- **Firestore / Schema / Rules:** [มี Collection, Field หรือการแก้ `firestore.rules` / `firebase-blueprint.json` ไหม]
- **API / UI Flow:** [จุดเริ่มต้น -> การทำงาน (`server.ts` / `server/` / `src/`) -> ผลลัพธ์]

## 4. Critical Path & Acceptance Criteria
- [ ] **Happy Path:** [เงื่อนไขที่ต้องทำงานได้สมบูรณ์ และผ่าน `npx tsx --test src/utils/*.test.ts`]
- [ ] **Edge Case / Failure Mode:** [เมื่อ Input ผิด, ตัวเลขทศนิยมสุดโต่ง หรือระบบภายนอก/AI ล่ม ต้องจัดการอย่างไร]
- [ ] **Security / Permission / Safe Harbor:** [ตรวจสอบ UID isolation ตาม `security_spec.md`, Non-Custodial boundary และผ่าน `node scripts/ci-policy-guard.mjs`]
