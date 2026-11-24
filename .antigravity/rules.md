# Project Rules & Engineering Standards (TallyNX Desk & Mall)

## 1. Operating Mode (Solo Founder Lean SDLC)
- **Plan Before Build:** สำหรับงานที่กระทบมากกว่า 2 ไฟล์ หรือเปลี่ยน Firestore Rules / Schema / API Contract ต้องสร้าง Implementation Plan ให้ Approve ก่อนลงมือแก้โค้ดทุกครั้ง
- **Keep It Simple:** เลือกทางออกที่เรียบง่ายและดูแลต่อได้คนเดียว ห้ามทำ Over-engineering, ห้ามเพิ่ม Abstraction Layer หรือ Microservice โดยไม่จำเป็น
- **Vertical Slice:** สร้างฟีเจอร์ให้จบครบวงจรทีละชิ้น (Data/Rules -> Logic -> UI -> Critical Test) แทนการสร้างโครงสร้างเผื่ออนาคตที่ยังไม่ได้ใช้

## 2. Tech Stack & Conventions
- **Stack:** React 19 + TypeScript 7 + Vite 8 + Tailwind CSS 4 (SPA/PWA), Express + `tsx` (`server.ts`, `server/`), Vercel Serverless API Bundle (`api/index.ts` + `scripts/prepare-api-bundle.mjs`), Firebase / Firestore (`firestore.rules`, `firebase-blueprint.json`), `decimal.js` สำหรับ Risk/Position Sizing Math, Recharts + Three.js, Gemini AI (`@google/genai`), MCP SDK (`@modelcontextprotocol/sdk`), Background Worker (`worker/index.ts`), และ Non-Custodial MT5 Read-Only Bridge (`scripts/TredynLiveBridge.mq5` / `.ex5`)
- **Architecture:** Modular Monolith — แยก Pure Business Logic และ Risk Math ไว้ใน `src/utils/`, Service Layer ใน `src/services/`, Domain Modules ฝั่งเซิร์ฟเวอร์ใน `server/` (`server/fundednext/`, `server/mall/`) แยกออกจาก Route Handler ใน `server.ts` และ UI Components ใน `src/components/`
- **Code Style:**
  - ใช้ Strict Typing ห้ามใช้ `any` หรือปิด Type/Lint rule เพื่อให้บิลด์ผ่าน
  - ใช้ `decimal.js` สำหรับการคำนวณตัวเลขทางการเงิน/ความเสี่ยง/Position Sizing แทน floating-point ดิบ
  - แยก Environment Config ไว้ที่ไฟล์ `.env.example` เสมอเมื่อเพิ่มตัวแปรใหม่
  - เขียน Comment เฉพาะจุดที่เป็น Business Logic ซับซ้อนหรือ Security Invariant (อธิบาย "ทำไม" ไม่ใช่ "ทำอะไร")

## 3. Hard Constraints (ห้ามทำเด็ดขาด)
- ห้ามอ่าน แก้ไข หรือพิมพ์ค่าจริงจากไฟล์ `.env`, `.env.*` (ยกเว้น `.env.example`), `*.key`, `*.pem`, `*serviceAccount*` หรือไฟล์ Credentials ลงใน Log/Chat
- ห้ามแก้ `firestore.rules`, `firebase-blueprint.json`, Database Schema หรือรัน Migration / Deploy บน Production (`vercel --prod`, `firebase deploy`) โดยไม่ได้รับการอนุมัติ และทุกการแก้ `firestore.rules` ต้องรักษา Security Invariants ตาม `security_spec.md`
- ห้ามละเมิด **Non-Custodial & Legal Safe Harbor Policy** (ห้ามใส่คำรับรองผลตอบแทนหรือการผ่านสอบกองทุน, ห้ามให้คำแนะนำการลงทุนหรือสัญญาณซื้อขาย, ห้ามเก็บ Broker Password หรือส่งคำสั่งเทรดอัตโนมัติ) และห้ามนำชื่อแบรนด์เก่ากลับมาใช้ (ตรวจผ่าน `node scripts/ci-policy-guard.mjs`)
- หากมีการแก้ `scripts/TredynLiveBridge.mq5` ต้องอัปเดต `scripts/TredynLiveBridge.ex5` และสำเนาใน `public/scripts/` ให้ตรงกัน (EA Binary Parity)
- ห้ามลบหรือ Skip เทสต์เดิมใน `src/utils/*.test.ts` เพื่อให้ CI/Test ผ่าน ต้องแก้ที่ต้นเหตุหรือรายงานก่อน
- ห้ามลง Dependency/Package ใหม่โดยไม่อธิบายเหตุผลและเปรียบเทียบกับการใช้ของเดิมที่มีอยู่แล้ว

## 4. Verification Gate (เงื่อนไขก่อนปิดงาน)
ก่อนรายงานว่างานเสร็จ Agent ต้องตรวจสอบครบทุกข้อ (ตรงกับ Sentinel CI):
1. รัน Static Typecheck (`npm run lint`) ผ่านโดยไม่มี Error (และรัน `npx eslint firestore.rules` เมื่อแก้ Firestore Rules)
2. รัน Automated Unit Tests ในส่วน Critical Path (`npx tsx --test src/utils/*.test.ts`) ผ่านทั้งหมด
3. รัน Policy & EA Parity Guard (`node scripts/ci-policy-guard.mjs`) ผ่านโดยไม่มี Violation
4. รัน Production Build (`npm run build`) ผ่านโดยไม่มี Error
5. หากมีการแก้ UI ให้ตรวจสอบหน้าจอจริงผ่าน `/browser` (และรัน `npm run test:responsive` หากกระทบ Layout มือถือ/แท็บเล็ต) พร้อมแนบ Screenshot ยืนยัน
6. สรุปรายการไฟล์ที่แก้, ผลเทสต์ และความเสี่ยง/จุดที่ต้องเช็กเพิ่ม (ไม่เกิน 5 บรรทัด)

## 5. Git & Worktree Hygiene
- Default branch ของโปรเจกต์คือ `master`
- แยก Branch/Worktree ตามประเภทงาน: `feat/<name>`, `fix/<name>`, `perf/<name>`, `docs/<name>`, `chore/<name>`
- ทำ Commit ย่อยและตั้งชื่อ PR ตาม Conventional Commits (`feat:`, `fix:`, `perf:`, `refactor:`, `docs:`, `test:`, `chore:`, `ci:`, `build:`, `style:`, `revert:`) เพื่อให้ผ่าน `pr-hygiene` CI
- ห้าม Force Push หรือแก้ประวัติ Commit บน `master`
