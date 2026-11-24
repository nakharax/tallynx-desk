---
name: Weekly Security & Deps Audit
cron: "0 9 * * 1"
permission: Draft PR (Patch only)
target_branch: master
---

# Weekly Security & Deps Audit (TallyNX Desk & Mall)

รันคำสั่งตรวจสอบ Security Vulnerability และ Dependency ที่ล้าสมัยใน Worktree แยก (ห้ามแตะ `master`):

1. รัน Dependency Audit (`npm audit`) เพื่อตรวจช่องโหว่ CVE ใน `package.json` / `package-lock.json`
2. ตรวจสอบความสอดคล้องด้านความปลอดภัยและ Policy:
   - ตรวจว่ามี Secret หลุดในโค้ดหรือไม่ และเทียบตัวแปร `process.env` / `import.meta.env` ที่ใช้จริงกับไฟล์ `.env.example`
   - รัน `node scripts/ci-policy-guard.mjs` เพื่อตรวจ Legal Safe Harbor, Brand Hygiene และ EA Binary Parity
   - รัน `npx eslint firestore.rules` เพื่อตรวจ Firestore Security Rules
3. หากมีเฉพาะ Security Patch ที่ไม่ทำให้ Breaking Change ให้สร้าง Branch `chore/security-patch-YYYYMMDD` รัน Verification Gate (`npm run lint`, `npx tsx --test src/utils/*.test.ts`, `node scripts/ci-policy-guard.mjs`, `npm run build`) ให้ผ่านทั้งหมด แล้วเปิด **Draft PR** เข้า `master` ด้วยชื่อ PR แบบ Conventional Commits พร้อมสรุปผล
4. หากมี Major Upgrade หรือความเสี่ยงสูง ให้ทำเป็นรายงานแจ้งเตือนอย่างเดียว ห้ามอัปเกรดอัตโนมัติ
