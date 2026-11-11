// Full submission document (Arabic, RTL) with every result, table, figure and log.
// Needs `npm install docx@9.5.1`. Run from the repo root after running all experiments:
//   node docs/build_submission.js . docs/TP3_submission_ar.docx
const fs = require("fs");
const path = require("path");
const {
  Document, Packer, Paragraph, TextRun, ImageRun, Table, TableRow, TableCell, WidthType,
  ShadingType, AlignmentType, BorderStyle, LevelFormat, Footer, PageNumber, HeadingLevel,
  TableOfContents, PageBreak,
} = require("docx");

const ROOT = process.argv[2];
const OUT = process.argv[3];
const R = (...p) => path.join(ROOT, ...p);
const read = (...p) => fs.readFileSync(R(...p), "utf8");
const json = (...p) => JSON.parse(read(...p));

const FONT = "Arial";
const BODY = 21, SMALL = 17;
const PAGE_W = 11906, MARGIN = 1000, CONTENT_W = PAGE_W - 2 * MARGIN;

// ------------------------------------------------------------------ helpers
function runs(text, o = {}) {
  const size = o.size || BODY;
  return String(text).split(/(\*\*[^*]+\*\*|`[^`]+`)/).filter(Boolean).map((part) => {
    if (part.startsWith("`")) {
      return new TextRun({ text: part.slice(1, -1), font: "Consolas", size: size - 2, sizeComplexScript: size - 2 });
    }
    const marked = /^\*\*[^*]+\*\*$/.test(part);
    const bold = marked || !!o.bold;
    const t = marked ? part.slice(2, -2) : part;
    return new TextRun({ text: t, rightToLeft: true, bold, boldComplexScript: bold,
      font: { ascii: FONT, hAnsi: FONT, cs: FONT }, size, sizeComplexScript: size, color: o.color });
  });
}
const P = (text, o = {}) => new Paragraph({ bidirectional: true, alignment: o.align || AlignmentType.BOTH,
  spacing: { before: o.before ?? 0, after: o.after ?? 100, line: 276 }, keepNext: o.keepNext, children: runs(text, o) });
const H1 = (t, brk = false) => new Paragraph({ heading: HeadingLevel.HEADING_1, bidirectional: true, pageBreakBefore: brk,
  children: runs(t, { size: 30, bold: true, color: "1F3864" }) });
const H2 = (t) => new Paragraph({ heading: HeadingLevel.HEADING_2, bidirectional: true,
  children: runs(t, { size: 24, bold: true, color: "2E5496" }) });
const H3 = (t) => new Paragraph({ heading: HeadingLevel.HEADING_3, bidirectional: true,
  children: runs(t, { size: 21, bold: true, color: "2E5496" }) });
const LI = (t) => new Paragraph({ bidirectional: true, alignment: AlignmentType.BOTH,
  numbering: { reference: "bullets", level: 0 }, spacing: { after: 50, line: 264 }, children: runs(t) });
const NUM = (t, ref = "steps") => new Paragraph({ bidirectional: true, alignment: AlignmentType.BOTH,
  numbering: { reference: ref, level: 0 }, spacing: { after: 50, line: 264 }, children: runs(t) });
const gap = (n = 80) => new Paragraph({ spacing: { after: n }, children: [] });
const caption = (t) => P(t, { align: AlignmentType.CENTER, size: SMALL, after: 160, color: "404040" });

function table(headers, rows, widths, o = {}) {
  const total = widths.reduce((a, b) => a + b, 0);
  const w = widths.map((x) => Math.round((x * CONTENT_W) / total));
  w[w.length - 1] += CONTENT_W - w.reduce((a, b) => a + b, 0);
  const b = { style: BorderStyle.SINGLE, size: 4, color: "8EAADB" };
  const borders = { top: b, bottom: b, left: b, right: b };
  const size = o.size || SMALL;
  const cell = (text, i, head, hl) => new TableCell({
    width: { size: w[i], type: WidthType.DXA }, borders,
    shading: head ? { type: ShadingType.CLEAR, fill: "D9E2F3", color: "auto" }
                  : hl ? { type: ShadingType.CLEAR, fill: "FFF2CC", color: "auto" } : undefined,
    margins: { top: 30, bottom: 30, left: 60, right: 60 },
    children: [new Paragraph({ bidirectional: true, alignment: AlignmentType.CENTER,
      children: runs(String(text), { size, bold: head }) })],
  });
  const hlRows = o.highlight || [];
  return new Table({
    width: { size: CONTENT_W, type: WidthType.DXA }, columnWidths: w, visuallyRightToLeft: true,
    rows: [new TableRow({ tableHeader: true, children: headers.map((h, i) => cell(h, i, true)) }),
      ...rows.map((r, ri) => new TableRow({ cantSplit: true,
        children: r.map((c, i) => cell(c, i, false, hlRows.includes(ri))) }))],
  });
}

function figure(file, widthPx, caption_) {
  const buf = fs.readFileSync(R(file));
  const wPx = buf.readUInt32BE(16), hPx = buf.readUInt32BE(20);   // PNG IHDR
  return [
    new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 80, after: 40 }, keepNext: true,
      children: [new ImageRun({ type: "png", data: buf,
        transformation: { width: widthPx, height: Math.round((widthPx * hPx) / wPx) } })] }),
    caption(caption_),
  ];
}

// Monospace block (LTR), one paragraph per line, light grey background.
function code(text, size = 13) {
  const lines = String(text).replace(/\r/g, "").replace(/\s+$/, "").split("\n");
  return lines.map((line, i) => new Paragraph({
    alignment: AlignmentType.LEFT, bidirectional: false, spacing: { after: 0, line: 240 },
    shading: { type: ShadingType.CLEAR, fill: "F2F2F2", color: "auto" },
    keepLines: true, keepNext: i < lines.length - 1 && lines.length < 30,
    children: [new TextRun({ text: line.length ? line : " ", font: "Consolas", size, sizeComplexScript: size })],
  })).concat([gap(120)]);
}

// Pretty JSON with long strings shortened, for excerpts.
function shortJSON(obj, max = 46) {
  const cut = (v) => typeof v === "string" && v.length > max ? v.slice(0, max - 12) + "…" + v.slice(-8) : v;
  const walk = (v) => Array.isArray(v) ? v.map(walk)
    : v && typeof v === "object" ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, walk(x)])) : cut(v);
  return JSON.stringify(walk(obj), null, 2);
}
const b64uDecode = (s) => Buffer.from(s.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8");
const pct = (x, d = 1) => `${(x * 100).toFixed(d)}%`;
const f = (x, d = 3) => Number(x).toFixed(d);
function csv(file) {
  const [head, ...rows] = read(file).trim().split(/\r?\n/).map((l) => l.split(","));
  return rows.map((r) => Object.fromEntries(head.map((h, i) => [h, r[i]])));
}

// ------------------------------------------------------------------ data
const link = json("results", "linkage_attack.json");
const examples = csv("results/linkage_examples.csv");
const kres = json("results", "k_anonymity_results.json");
const dp = csv("results/dp_results.csv");
const dpMeta = json("results", "dp_meta.json");
const bounds = csv("results/dp_bound_study.csv");
const demoRes = json("results", "part_b", "demo_results.json");
const cred = json("results", "part_b", "credential.json");
const pres = json("results", "part_b", "presentation_lock.json");
const didDoc = json("results", "part_b", "did_document_holder.json");
const status = json("results", "part_b", "status_list.json");
const oauth = json("results", "part_b", "oauth_vs_ssi.json");
const log = (n) => read("results", "logs", n);

const c = [];

// ================================================================== cover
c.push(gap(1400));
c.push(P("جامعة الشهيد حمه لخضر — الوادي", { align: AlignmentType.CENTER, size: 26, bold: true, after: 60 }));
c.push(P("ماستر إنترنت الأشياء والأمن السيبراني", { align: AlignmentType.CENTER, size: 24, after: 40 }));
c.push(P("مقياس: أمن إنترنت الأشياء والأمن السيبراني — الأعمال التطبيقية", { align: AlignmentType.CENTER, size: 22, after: 900 }));
c.push(new Paragraph({ bidirectional: true, alignment: AlignmentType.CENTER, spacing: { after: 120 },
  children: runs("TP3", { size: 56, bold: true, color: "1F3864" }) }));
c.push(new Paragraph({ bidirectional: true, alignment: AlignmentType.CENTER, spacing: { after: 120 },
  children: runs("إخفاء هوية بيانات إنترنت الأشياء والهوية ذاتية السيادة", { size: 40, bold: true, color: "1F3864" }) }));
c.push(new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 900 },
  children: [new TextRun({ text: "Anonymization and Self-Sovereign Identity", font: FONT, size: 28, italics: true, color: "2E5496" })] }));
c.push(P("الملف الكامل للنتائج: المنهجية، كل الجداول والمنحنيات، مخرجات البرامج والاختبارات", { align: AlignmentType.CENTER, size: 22, after: 600 }));
c.push(P("**إعداد:**", { align: AlignmentType.CENTER, size: 24, after: 60 }));
c.push(new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 40 },
  children: [new TextRun({ text: "Abderrazzak Aiba", font: FONT, size: 28, bold: true })] }));
c.push(new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 900 },
  children: [new TextRun({ text: "Abdelhakim Berrim", font: FONT, size: 28, bold: true })] }));
c.push(P("السنة الجامعية ‪2026/2027‬", { align: AlignmentType.CENTER, size: 22 }));

// ================================================================== TOC
c.push(new Paragraph({ bidirectional: true, pageBreakBefore: true, spacing: { after: 200 },
  children: runs("المحتويات", { size: 30, bold: true, color: "1F3864" }) }));
// Static TOC from a headings file "level<TAB>page<TAB>title" produced by a first Word pass
// (updating Word's own TOC field hangs under automation for this RTL document).
const HEADINGS = process.argv[4];
if (HEADINGS && fs.existsSync(HEADINGS)) {
  const rows = fs.readFileSync(HEADINGS, "utf8").replace(/^﻿/, "").trim().split(/\r?\n/)
    .map((l) => l.split("\t")).filter((r) => r.length === 3);
  const none = { style: BorderStyle.NONE, size: 0, color: "FFFFFF" };
  const dot = { style: BorderStyle.DOTTED, size: 4, color: "BFBFBF" };
  const wT = CONTENT_W - 900;
  const borders = { top: none, left: none, right: none, bottom: dot };
  c.push(new Table({
    width: { size: CONTENT_W, type: WidthType.DXA }, columnWidths: [wT, 900], visuallyRightToLeft: true,
    rows: rows.map(([lvl, page, title]) => new TableRow({ children: [
      new TableCell({ width: { size: wT, type: WidthType.DXA }, borders,
        margins: { top: 25, bottom: 25, right: lvl === "1" ? 40 : 450 },
        children: [new Paragraph({ bidirectional: true,
          children: runs(title, { size: lvl === "1" ? 21 : 19, bold: lvl === "1" }) })] }),
      new TableCell({ width: { size: 900, type: WidthType.DXA }, borders, margins: { top: 25, bottom: 25 },
        children: [new Paragraph({ alignment: AlignmentType.CENTER,
          children: [new TextRun({ text: page, font: FONT, size: 19, bold: lvl === "1" })] })] }),
    ] })),
  }));
} else {
  c.push(P("(جدول المحتويات يُولَّد في المرور الثاني)", { align: AlignmentType.CENTER }));
}

// ================================================================== 1. intro
c.push(H1("1. مقدمة وأهداف العمل", true));
c.push(P("تجمع أجهزة إنترنت الأشياء، كالعدادات الذكية، قراءات دقيقة ومتكررة تكشف عن حياة أصحابها أكثر مما يتوقعون: أوقات النوم والغياب عن البيت، وعدد الساكنين، وحتى الأجهزة المستعملة. يتناول هذا العمل التطبيقي حماية الخصوصية من زاويتين متكاملتين:"));
c.push(LI("**الجزء A — حماية البيانات المنشورة:** كيف تنشر شركة كهرباء بيانات عملائها أو إحصاءاتها دون أن تكشف هوياتهم؟ نُثبت أولاً أن حذف الأسماء لا يكفي (هجوم الربط)، ثم نطبّق k-anonymity والخصوصية التفاضلية ونقيس ثمن كل منهما على فائدة البيانات."));
c.push(LI("**الجزء B — حماية الهوية عند الاستعمال:** كيف يُثبت مواطن صفة واحدة عنه (الإقامة، أو السن) لقفل ذكي دون كشف بقية بياناته، ودون أن تعرف الجهة المُصدِرة متى وأين استعمل شهادته؟ نبني تدفّق هوية ذاتية السيادة (SSI) كاملاً ونقارنه بتسجيل الدخول المركزي OAuth 2.0."));
c.push(P("الخيط المشترك بين الجزأين هو **المفاضلة بين الخصوصية والفائدة**: لكل حماية ثمن، والهدف قياسه بالأرقام لا وصفه."));
c.push(H2("1.1 المطلوب في نص العمل التطبيقي وأين تحقق"));
c.push(table(["المطلوب", "القسم في هذا الملف", "الحالة"], [
  ["A1 — اختيار مجموعة بيانات عامة فيها آثار شخصية", "3.1", "✓"],
  ["A2 — تصنيف الأعمدة وعرض هجوم ربط", "3.2 و 3.3", "✓"],
  ["A3 — k-anonymity بـ k = 2، 5، 10", "3.4", "✓"],
  ["A4 — الخصوصية التفاضلية بـ ε = 0.1، 1، 10", "3.5", "✓"],
  ["A5 — قياس الفائدة مقابل الخصوصية ورسم المفاضلتين", "3.4، 3.5، 3.6", "✓"],
  ["B1 — نمذجة المُصدِر والحامل والمتحقّق", "4.1", "✓"],
  ["B2 — DID للحامل وشهادة موقّعة من المُصدِر", "4.2 و 4.3", "✓"],
  ["B3 — تحقق دون الاتصال بالمُصدِر في كل طلب", "4.5", "✓"],
  ["B4 — الإفصاح الانتقائي (salted hash commitments)", "4.4", "✓"],
  ["B5 — الإلغاء وإثبات رفض الشهادة الملغاة", "4.6", "✓"],
  ["B6 — المقارنة مع OAuth 2.0", "4.9", "✓"],
  ["مخطط تتابع تبادل الشهادة", "4.7", "✓"],
  ["خيار الجهاز الحقيقي (Raspberry Pi قفلاً ذكياً)", "4.10", "مُعَدّ في الكود"],
], [5, 2, 1.2]));
c.push(caption("جدول 1 — مطابقة متطلبات نص TP3 مع أقسام هذا الملف."));

// ================================================================== 2. environment
c.push(H1("2. بيئة العمل وطريقة إعادة الإنتاج"));
c.push(H2("2.1 الأدوات والمكتبات"));
c.push(table(["الأداة", "الإصدار", "الاستعمال"], [
  ["Python", "3.13", "لغة كل الشيفرة"],
  ["pandas / NumPy", "3.1.1 / 2.5.4", "معالجة البيانات وهجوم الربط"],
  ["pycanon", "1.3.6", "تحقق مستقل من k-anonymity و l-diversity"],
  ["diffprivlib (IBM)", "0.6.6", "مقارنة آلية Laplace بتنفيذنا"],
  ["cryptography", "50.0.2", "توقيعات Ed25519 ودالة SHA-256"],
  ["matplotlib", "3.11.2", "كل المنحنيات ومخطط التتابع"],
  ["pytest", "9.2.0", "26 اختباراً آلياً"],
], [2.2, 2, 4]));
c.push(caption("جدول 2 — الأدوات المستعملة، وكلها مجانية ومفتوحة المصدر."));
c.push(H2("2.2 بنية المشروع"));
c.push(...code(
`part_a/   config.py · prepare_data.py · linkage_attack.py · k_anonymity.py
          differential_privacy.py · run_all.py
part_b/   ssi/encoding.py · ssi/did.py · ssi/proofs.py · ssi/disclosure.py
          ssi/status_list.py · ssi/roles.py
          demo.py · oauth_comparison.py · smart_lock.py · sequence_diagram.py
tests/    test_anonymization.py · test_ssi.py
docs/     TP3_report_ar.docx · sequence_diagram.md · build_*.js
results/  *.csv · *.json · figures/*.png · part_b/*.json · logs/*.txt`, 15));
c.push(H2("2.3 أوامر إعادة إنتاج كل النتائج"));
c.push(...code(
`python -m venv .venv
.venv\\Scripts\\activate
pip install -r requirements.txt
pip install --no-deps pycanon==1.3.6

python -m part_a.run_all              # Part A: data, linkage, k-anonymity, DP
python -m part_b.demo                 # Part B: SSI flow, attacks, revocation
python -m part_b.oauth_comparison     # OAuth 2.0 vs SSI
python -m part_b.sequence_diagram     # sequence diagram figure
python -m pytest -q                   # 26 tests`, 15));
c.push(P("كل الاختيارات العشوائية في الجزء A مثبّتة بالبذرة `2026`، فتخرج الجداول والمنحنيات نفسها في كل تشغيل. أما الجزء B فيولّد مفاتيح جديدة في كل تشغيل، لذلك تتغيّر المعرّفات والتوقيعات وتبقى النتائج نفسها."));

// ================================================================== 3. Part A
c.push(H1("3. الجزء A — إخفاء هوية بيانات العدادات الذكية"));
c.push(H2("3.1 مجموعة البيانات"));
c.push(P("**المصدر:** مجموعة ElectricityLoadDiagrams20112014 من مستودع UCI (رخصة CC BY 4.0)، وتضم استهلاك 370 عميلاً لشركة كهرباء برتغالية. تعذّر تحميل الملف الأصلي (250 MB) لأن الاتصال ينقطع بعد نحو 20 MB والخادم لا يدعم الاستئناف، فاستعملنا نسختها الساعية من أرشيف Monash على Zenodo (DOI 10.5281/zenodo.4656140، حجمها 11.8 MB، وتضم 321 عميلاً بين 2012 و2014). يتحقق البرنامج من بصمة MD5 للملف قبل استعماله."));
c.push(table(["الخاصية", "القيمة"], [
  ["السنة المستعملة", "2014 (8760 ساعة)"],
  ["العملاء المحتفظ بهم", "313 (أقل من 5% من الساعات بقيمة صفر)"],
  ["الوحدة", "kWh لكل ساعة = قيمة الأرشيف ÷ 4 (مجموع أربع قراءات kW كل ربع ساعة)"],
  ["وسيط الاستهلاك السنوي", "1.26 GWh — كثير من العملاء مؤسسات لا منازل"],
  ["أكبر استهلاك ساعي", "78 000 kWh تقريباً — توزيع شديد الالتواء"],
], [2, 5]));
c.push(caption("جدول 3 — خصائص البيانات بعد المعالجة."));
c.push(P("**الجزء المركّب (من بنائنا):** لا تحتوي البيانات الأصلية أي معلومة ديموغرافية. لمحاكاة السيناريو الذي يطلبه العمل (شركة تنشر جدولاً لكل عميل فيه أشباه معرّفات)، ولّدنا ببذرة ثابتة لكل عميل اسماً وعمراً (18–92) وجنساً ورمزاً بريدياً برتغالياً من 4 أرقام (25 رمزاً في منطقة لشبونة). وولّدنا أيضاً **سجلاً عاماً ثانياً** من 2000 ساكن (العملاء الـ313 و1687 شخصاً آخرين) يمثّل قائمة انتخابية أو سجلاً بلدياً يملكه المهاجم. أما الصفات الحساسة فمحسوبة كلها من **القراءات الحقيقية**."));

c.push(H2("3.2 تصنيف الأعمدة"));
c.push(table(["الفئة", "العمود", "الوصف", "المعالجة"], [
  ["معرّف مباشر", "`household_id`", "رقم العداد", "حذف"],
  ["معرّف مباشر", "`owner_name`", "اسم صاحب العقد (مركّب)", "حذف"],
  ["شبه معرّف", "`age`", "العمر (مركّب)", "تعميم في فئات"],
  ["شبه معرّف", "`zip`", "الرمز البريدي (مركّب)", "حذف أرقام من اليمين"],
  ["شبه معرّف", "`sex`", "الجنس (مركّب)", "تعميم إلى *"],
  ["صفة حساسة", "`annual_kwh`", "الاستهلاك السنوي (حقيقي)", "تُنشر / DP"],
  ["صفة حساسة", "`night_share`", "حصة الاستهلاك بين 0:00 و 6:00 (حقيقي)", "تُنشر"],
  ["صفة حساسة", "`occupancy_profile`", "نمط الإشغال المستنتج من شكل الاستهلاك (حقيقي)", "تُنشر، ونقيس l-diversity عليها"],
], [1.6, 2, 3.4, 2.2]));
c.push(caption("جدول 4 — تصنيف أعمدة الجدول المنشور."));
c.push(P("**أنماط الإشغال:** `evening_peak` (استهلاك مرتفع مساءً، فالمكان فارغ نهاراً غالباً)، `daytime_active` (نشاط نهاري)، `flat` (استهلاك ثابت). توزيعها عندنا: 130 مسطّح، 105 ذروة مسائية، 78 نشاط نهاري. هذه الصفة خطيرة: تخبر لصاً متى يكون المكان فارغاً."));

c.push(H2("3.3 هجوم الربط (Linkage Attack)"));
c.push(P("**المنهج:** نحذف المعرّفات المباشرة فقط ونخلط ترتيب السجلات (النشر «الساذج»). يرى المهاجم هذا الجدول والسجل العام فقط، ويربط بينهما بالدالة `pandas.merge` على أشباه المعرّفات. يُعدّ السجل مُعاداً التعرّف عليه إذا طابق **شخصاً واحداً فقط** في السجل العام. ثم نقيس صحة الادعاءات بجدول حقيقة لا يراه المهاجم. كررنا الهجوم بأربع تركيبات من أشباه المعرّفات."));
const L = (k) => link[k];
c.push(table(["أشباه المعرّفات", "سجلات فريدة في الجدول", "نسبة الفريدة", "تطابقات فريدة", "إعادة تعرّف صحيحة", "النسبة"],
  ["zip", "age+sex", "age+zip", "age+zip+sex"].map((k) => [k.replace(/\+/g, " + "), L(k).unique_in_release,
    pct(L(k).unique_share), L(k).unique_matches, L(k).correct_reidentifications, pct(L(k).reidentification_rate)]),
  [2.2, 1.8, 1.4, 1.5, 1.7, 1.2], { highlight: [3] }));
c.push(caption("جدول 5 — نتائج هجوم الربط على 313 سجلاً منشوراً."));
c.push(P("**أمثلة على عملاء أُعيد التعرّف عليهم** (الأسماء مركّبة، والصفات الحساسة حقيقية):", { keepNext: true }));
c.push(table(["السجل", "العمر", "الجنس", "الرمز", "الاسم المستعاد", "الاستهلاك السنوي (kWh)", "حصة الليل", "نمط الإشغال"],
  examples.map((e) => [e.record_id, e.age, e.sex, e.zip, e.full_name, Number(e.annual_kwh).toLocaleString("en"), e.night_share, e.occupancy_profile]),
  [1, 0.8, 0.8, 0.9, 3, 1.9, 1, 1.6]));
c.push(caption("جدول 6 — ثمانية من الـ150 عميلاً الذين كُشفت أسماؤهم مع بياناتهم الحساسة."));
c.push(H3("تحليل النتائج"));
c.push(LI("**كل صفة وحدها ضعيفة:** الرمز البريدي وحده لا يكشف أحداً، والعمر مع الجنس يكشفان 1% فقط."));
c.push(LI("**اجتماعها قاتل:** الثلاثة معاً تجعل 87.9% من السجلات فريدة، وتكشف **150 عميلاً (47.9%)**."));
c.push(LI("**دقة المهاجم 100%:** كل تطابق فريد كان صحيحاً، فحين يدّعي المهاجم معرفة شخص فهو محق دائماً."));
c.push(LI("**لماذا 47.9% لا 87.9%؟** السجل الفريد بين العملاء قد يشاركه في السجل العام أشخاص آخرون من غير العملاء (1687 شخصاً)، فيجد المهاجم أكثر من مرشح ولا يستطيع الجزم."));
c.push(LI("**الأثر الملموس:** يحصل المهاجم على الاسم مع نمط الإشغال، أي متى يكون المكان فارغاً، وهذه معلومة تهمّ لصاً."));
c.push(P("**الخلاصة:** حذف الأسماء ليس إخفاءً للهوية. هذه هي النتيجة التي بيّنتها Latanya Sweeney سنة 1997 حين تعرّفت على الملف الطبي لحاكم ولاية Massachusetts بالطريقة نفسها."));

c.push(H2("3.4 إخفاء الهوية بـ k-anonymity"));
c.push(H3("المنهج"));
c.push(P("**التعريف:** يكون الجدول k-anonymous إذا كان لكل سجل k−1 سجلاً آخر على الأقل يطابقه في كل أشباه المعرّفات، فلا يستطيع المهاجم تمييزه بين k أشخاص."));
c.push(table(["شبه المعرّف", "المستوى 0", "المستوى 1", "المستوى 2", "المستوى 3", "المستوى 4"], [
  ["العمر", "34", "[30-34]", "[30-39]", "[20-39]", "*"],
  ["الرمز البريدي", "1069", "106*", "10**", "1***", "****"],
  ["الجنس", "M", "*", "—", "—", "—"],
], [2, 1.2, 1.2, 1.2, 1.2, 1.2]));
c.push(caption("جدول 7 — أهرام التعميم (مثال على قيمة واحدة)."));
c.push(NUM("شبكة التعميم فيها 5 × 5 × 2 = **50 تركيبة**، وهي صغيرة بما يكفي لفحصها **كلها** (وهي فكرة البحث الأمثل في أداة ARX)."));
c.push(NUM("لكل تركيبة: نعمّم، ثم **نحذف** السجلات الواقعة في مجموعات أصغر من k، ونرفض التركيبة إذا تجاوز الحذف **5%** من السجلات."));
c.push(NUM("من التركيبات المقبولة نختار ذات **أقل خسارة معلومات NCP**."));
c.push(NUM("نتحقق من النتيجة **بشكل مستقل** بمكتبة pycanon (قيمة k الفعلية و l-diversity على نمط الإشغال)."));
c.push(NUM("نعيد **هجوم الربط** على الجدول المحمي، بعد تعميم السجل العام بالمستوى نفسه."));
c.push(P("**مقاييس الخسارة:** NCP (Normalized Certainty Penalty) = عرض المجال المعمَّم ÷ عرض المجال الكامل، متوسطاً على السجلات والأعمدة، والسجل المحذوف = 1. ومقياس التمييز DM = (Σ|E|² + عدد المحذوف × n) ÷ n². **مقاييس الخطر:** أقصى خطر = 1 ÷ حجم أصغر مجموعة، ونسبة السجلات في مجموعات متجانسة (l = 1)."));
c.push(H3("النتائج"));
c.push(table(["k", "التعميم المختار", "محذوف", "NCP", "DM", "عدد المجموعات", "متوسط المجموعة", "k الفعلي", "l", "أقصى خطر", "متجانس", "مكشوفون"],
  kres.map((r) => [r.k, r.generalization.replace("age=", "عمر: ").replace("zip=", "رمز: ").replace("sex=", "جنس: ").replace(/exact/g, "دقيق").replace(/-year bands/g, " سنوات").replace(/1-digit prefix/g, "رقم واحد").replace(/,/g, "،"),
    r.suppressed, f(r.ncp_loss), f(r.discernibility_norm), r.n_classes, f(r.avg_class_size, 1), r.pycanon_k,
    r.pycanon_l_occupancy, f(r.max_prosecutor_risk), pct(r.homogeneous_share), r.linkage_correct]),
  [0.6, 3.2, 0.8, 0.8, 0.8, 0.9, 0.9, 0.7, 0.5, 0.9, 0.9, 0.9], { size: 15, highlight: [1, 4, 6] }));
c.push(caption("جدول 8 — k-anonymity لكل قيم k المجرّبة (الأسطر المظلّلة: k = 2، 5، 10 المطلوبة في النص)."));
c.push(...figure("results/figures/k_anonymity_tradeoff.png", 640,
  "شكل 1 — يسار: ثمن k-anonymity على الفائدة (NCP، DM، نسبة الحذف). يمين: الخطر المتبقي (إعادة التعرّف، أقصى خطر، السجلات في مجموعات متجانسة)."));
c.push(H3("تحليل النتائج"));
c.push(LI("**k = 2 يكفي لإيقاف هجوم الربط:** من 150 مكشوفاً إلى **0**، بثمن 25% من دقة المعلومات وحذف 10 سجلات."));
c.push(LI("**هجوم التجانس عند k = 2:** يقع 2.3% من السجلات في مجموعات كل أفرادها لهم نمط الإشغال نفسه (l = 1)، فيعرف المهاجم صفتهم الحساسة دون أن يحدد هويتهم. من k = 3 يصير l = 2 ويختفي هذا الخطر. **k-anonymity وحدها لا تكفي، ويجب قياس l-diversity.**"));
c.push(LI("**k = 4 و k = 5 متطابقان:** التعميم نفسه (فئات 20 سنة) يحقق الشرطين، وأصغر مجموعة فيها فعلياً 6 أشخاص، فالحماية أقوى من المطلوب."));
c.push(LI("**القفزة عند k = 10:** الخسارة تقفز من 0.31 إلى 0.54 لأن الهرم خشن: الخطوة بعد فئات العشرين سنة هي حذف العمر كله. وبعد k = 10 لا يتغيّر شيء."));
c.push(LI("**الجنس بقي دقيقاً دائماً:** حذفه يكلّف ثلث الخسارة دفعة واحدة، بينما تعميم العمر والرمز البريدي أرخص، فاختار البحث الأقل كلفة."));
c.push(LI("**أفضل توازن في بياناتنا: k = 3** — لا هجوم ربط، ولا تجانس، وخسارة 27%."));

c.push(H2("3.5 الخصوصية التفاضلية (Differential Privacy)"));
c.push(H3("المنهج"));
c.push(P("بدل نشر الجدول، نجيب عن **سؤال إحصائي** ونضيف إلى الجواب ضجيجاً محسوباً. الاستعلام: **متوسط استهلاك العملاء في كل ساعة من اليوم** (q_h لـ h = 0..23) خلال 2014."));
c.push(...code(
`noisy_q(h) = mean( clip(x_i(h), 0, U) ) + Laplace(0, Delta / epsilon)
U = ${dpMeta.bound_kwh} kWh     (public bound, fixed in advance, never read from the data)
n = ${dpMeta.n}            (public number of clients)
Delta = U / n = ${(dpMeta.bound_kwh / dpMeta.n).toFixed(3)} kWh     (sensitivity of a bounded mean)
E|Laplace(b)| = b = U / (n * epsilon)      (expected absolute error)`, 15));
c.push(LI("**الحالة 1 — ساعة واحدة (19:00):** تُنشر بميزانية ε كاملة."));
c.push(LI("**الحالة 2 — الملف الكامل (24 ساعة):** كل عميل يشارك في الساعات الـ24، فبحسب **التركيب المتتالي** تُقسَّم الميزانية: ε/24 لكل ساعة."));
c.push(LI("قارنّا **تنفيذنا** للآلية بدالة `diffprivlib.tools.mean` من IBM وبالقيمة النظرية، وكررنا كل تجربة **300 مرة**."));
c.push(LI("نقيس الخطأ بالنسبة إلى المتوسط **بعد القصّ** (الكمية التي تحسبها الآلية فعلاً)، ونعرض **تحيّز القصّ** منفصلاً."));
c.push(H3("النتائج"));
c.push(table(["ε", "خطأ ساعة واحدة (تنفيذنا)", "diffprivlib", "النظرية", "الخطأ النسبي", "خطأ 24 ساعة", "النظرية (24 ساعة)", "الخطأ النسبي (24 ساعة)"],
  dp.map((r) => [r.epsilon, f(r.single_mae_own, 2), f(r.single_mae_diffprivlib, 2), f(r.single_theory_mae, 2),
    pct(r.single_rel_error, 2), f(r.profile_mae_own, 1), f(r.profile_theory_mae, 1), pct(r.profile_rel_error, 1)]),
  [0.6, 1.6, 1.2, 1, 1.1, 1.2, 1.3, 1.4]));
c.push(caption("جدول 9 — متوسط الخطأ المطلق (kWh) بدلالة ε. القيم المقيسة تطابق النظرية."));
c.push(...figure("results/figures/dp_error_vs_epsilon.png", 470,
  "شكل 2 — الخطأ بدلالة ε بمقياس لوغاريتمي. تنفيذنا (أزرق) و diffprivlib (برتقالي) والنظرية (منقّط) متطابقة. ملف 24 ساعة (أخضر) أسوأ بـ 24 مرة. الخط الأحمر تحيّز القصّ ولا يتغيّر مع ε."));
c.push(...figure("results/figures/dp_hourly_profiles.png", 640,
  "شكل 3 — الملف الساعي المنشور (أحمر) مقابل المتوسط الحقيقي بعد القصّ (أسود) وقبله (رمادي) لـ ε = 0.1، 1، 10 (ε/24 لكل ساعة)."));
c.push(H3("اختيار الحد العام U"));
c.push(table(["U (kWh)", "عملاء مقصوصون عند 19:00", "تحيّز القصّ (kWh)", "الضجيج المتوقع عند ε = 1", "الخطأ الكلي النسبي"],
  bounds.map((r) => [r.bound_kwh, r.clients_clipped, r.clipping_bias_kwh, r.expected_noise_kwh, pct(r.bias_plus_noise_rel, 1)]),
  [1, 1.8, 1.5, 1.8, 1.5], { highlight: [2] }));
c.push(caption(`جدول 10 — المفاضلة في اختيار U. المتوسط الحقيقي عند 19:00 = ${f(dpMeta.true_peak_mean_kwh, 0)} kWh.`));
c.push(H3("تحليل النتائج"));
c.push(LI("**الخطأ يتناسب عكسياً مع ε:** كل ضرب لـ ε في 10 يقسم الخطأ على 10 (30 ← 3 ← 0.3 kWh)، وهي خطوط مستقيمة في الشكل 2."));
c.push(LI("**صحة التنفيذ:** تنفيذنا ومكتبة diffprivlib والنظرية متطابقة في حدود التذبذب العشوائي."));
c.push(LI("**سؤال واحد رخيص:** عند ε = 1 الخطأ أقل من 1% من الجواب."));
c.push(LI("**الميزانية تُستهلك:** نشر 24 ساعة بالميزانية نفسها يرفع الخطأ 24 مرة (28% عند ε = 1، و275% عند ε = 0.1 أي جواب عديم الفائدة)."));
c.push(LI("**القيم السالبة** الظاهرة عند ε = 0.1 تُصحَّح بمعالجة لاحقة (قصّ إلى الصفر) **دون أي كلفة على الخصوصية**، لأن أي عملية على مخرجات DP تبقى DP."));
c.push(LI("**تحيّز القصّ هو المشكلة الحقيقية:** البيانات شديدة الالتواء، فيتجاوز 41 عميلاً الحد U = 1000 ويُنتج القصّ تحيّزاً قدره **520 kWh (61%)**، أكبر من ضجيج Laplace عند كل ε. U صغير = ضجيج أقل وتحيّز أكبر، و U كبير = العكس. **في بيانات IoT غير المتجانسة، اختيار الحد أو تقسيم العملاء إلى شرائح أهم من اختيار ε.**"));

c.push(H2("3.6 مقارنة k-anonymity والخصوصية التفاضلية"));
c.push(table(["المعيار", "k-anonymity", "الخصوصية التفاضلية"], [
  ["ماذا يُنشر؟", "الجدول نفسه بعد التعميم", "إجابات إحصائية فقط"],
  ["نوع الضمان", "نحوي: شكل الجدول", "رياضي: مستقل عن معرفة المهاجم"],
  ["مقاومة المعرفة المسبقة", "ضعيفة (هجوم التجانس، الخلفية)", "قوية"],
  ["المعامل", "k", "ε (ميزانية تُستهلك)"],
  ["الثمن عندنا", "NCP = 0.25 (k=2) إلى 0.54 (k=10)", "خطأ 9% / 0.9% / 0.09% لساعة واحدة"],
  ["متى نستعمله؟", "حين يحتاج المحلّل سجلات فردية", "حين تكفي الإحصاءات المجمّعة"],
], [2, 3, 3]));
c.push(caption("جدول 11 — مقارنة الطريقتين."));

// ================================================================== 4. Part B
c.push(H1("4. الجزء B — الهوية ذاتية السيادة (SSI)", true));
c.push(H2("4.1 الأدوار والسيناريو"));
c.push(table(["الدور", "في السيناريو", "ما يملكه"], [
  ["المُصدِر (Issuer)", "بلدية الوادي", "مفتاح توقيع Ed25519، سجل الإصدار، قائمة الإلغاء"],
  ["الحامل (Holder)", "المواطن أحمد ومحفظته (حاسوب أو Raspberry Pi)", "مفتاحه الخاص، الشهادة، الأملاح والقيم"],
  ["المتحقّق 1 (Verifier)", "قفل ذكي لعمارة سكنية", "قائمة المُصدِرين الموثوقين، نسخة من قائمة الإلغاء، السياسة: الإقامة في El Oued"],
  ["المتحقّق 2", "خدمة محدودة بالسن", "السياسة: over_18 = true"],
], [2, 3, 4]));
c.push(caption("جدول 12 — الأدوار الثلاثة."));
c.push(P("الشهادة تحتوي خمس صفات: `given_name` و `family_name` و `birth_date` و `resident_city` و `over_18`. وضعنا `over_18` صفة مستقلة كي تثبت الخدمة أن أحمد بالغ دون أن تعرف تاريخ ميلاده (مبدأ تقليل البيانات)."));

c.push(H2("4.2 المعرّفات اللامركزية did:key"));
c.push(P("لكل طرف زوج مفاتيح Ed25519 يولّده بنفسه، ومنه المعرّف: `did:key:z` + base58btc(0xed 0x01 ‖ المفتاح العام 32 بايت). تبدأ كل المعرّفات بـ `z6Mk` لأن هذه البادئة هي ترميز 0xed01 (Ed25519). **المعرّف هو المفتاح العام**، فاستخراج المفتاح منه عملية محلية لا تحتاج سلسلة كتل ولا خادماً، وهذا ما يسمح بالتحقق دون اتصال. وثيقة DID للحامل كما ولّدها البرنامج:"));
c.push(...code(shortJSON(didDoc, 60), 13));

c.push(H2("4.3 الإصدار"));
c.push(NUM("**إثبات التحكم في المعرّف (DID-Auth):** ترسل البلدية nonce عشوائياً، ويوقّعه أحمد بمفتاحه مع معرّف البلدية. تتحقق البلدية من التوقيع وتُتلف الـ nonce.", "issue"));
c.push(NUM("**الالتزامات المملّحة:** لكل صفة ملح عشوائي من 128 بت، و disclosure = base64url(JSON[salt, name, value])، ثم digest = SHA-256(disclosure).", "issue"));
c.push(NUM("**digests وهمية:** تضاف قيمتان عشوائيتان لإخفاء عدد الصفات، ثم تُرتَّب القائمة كي لا يكشف الترتيب شيئاً.", "issue"));
c.push(NUM("**موقع في قائمة الإلغاء:** يُختار عشوائياً من 131 072 موقعاً.", "issue"));
c.push(NUM("**التوقيع:** توقّع البلدية الشهادة بـ Ed25519 على JSON مرتّب المفاتيح، ويتحقق أحمد من كل شيء قبل تخزينها.", "issue"));
c.push(P("**الشهادة كما ولّدها البرنامج** (السلاسل الطويلة مختصرة). لاحظ غياب أي قيمة: لا اسم ولا مدينة، بل سبع digests فقط:", { keepNext: true }));
c.push(...code(shortJSON(cred), 13));
c.push(P("**لماذا الملح ضروري؟** بدونه تكون digest الصفة `over_18` إحدى قيمتين فقط، SHA-256(true) أو SHA-256(false)، فيكسرها أي أحد بتجربتين."));

c.push(H2("4.4 التقديم والإفصاح الانتقائي"));
const disc = pres.disclosures.map((d) => JSON.parse(b64uDecode(d)));
c.push(P(`عند الباب يرسل القفل nonce صالحاً دقيقتين ولمرة واحدة مع معرّفه. يقدّم أحمد الشهادة مع **إفصاح واحد فقط**، ويوقّع كل شيء بمفتاحه. التقديم كما أرسله البرنامج للقفل:`, { keepNext: true }));
c.push(...code(shortJSON({ ...pres, verifiableCredential: "{ … the signed credential shown above … }" }), 13));
c.push(P("**فكّ الإفصاح الوحيد** (base64url ← JSON) يعطي:", { keepNext: true }));
c.push(...code(JSON.stringify(disc[0]) + "      # [salt, name, value]", 14));
c.push(P("يحسب القفل SHA-256 لهذا الإفصاح فيجده بين الـ digests الموقّعة، فيعرف أن البلدية شهدت بأن المدينة El Oued، **ولا يعرف شيئاً عن الصفات الأربع الأخرى**."));

c.push(H2("4.5 التحقق دون الاتصال بالمُصدِر"));
c.push(P("يجري القفل ستة فحوص بالترتيب، **دون أي اتصال بالبلدية**:"));
c.push(table(["#", "الفحص", "يمنع"], [
  ["1", "الـ nonce صادر عن القفل، لم ينتهِ، ولم يُستعمل؛ والـ audience = معرّف القفل", "إعادة الإرسال، وتمرير تقديم موجّه لمتحقّق آخر"],
  ["2", "المُصدِر في قائمة الثقة، وتوقيعه صحيح (المفتاح من did:key نفسه)، والتاريخ ساري", "المُصدِر المزيّف، وتعديل الشهادة"],
  ["3", "معرّف المقدِّم = credentialSubject.id، والتقديم موقّع بمفتاحه", "سرقة الشهادة وانتحال الهوية"],
  ["4", "SHA-256 لكل إفصاح موجود بين الـ digests الموقّعة", "اختراع صفات أو تعديل قيمها"],
  ["5", "قائمة الإلغاء المخزّنة موقّعة وحديثة (≤ ساعة) والبت = 0", "استعمال شهادة ملغاة"],
  ["6", "الصفات المكشوفة تحقق السياسة", "الدخول دون الصفة المطلوبة"],
], [0.4, 5, 3]));
c.push(caption("جدول 13 — فحوص المتحقّق."));

c.push(H2("4.6 الإلغاء"));
c.push(P("قائمة الإلغاء سلسلة من 131 072 بت (فكرة W3C Bitstring Status List)، مضغوطة بـ gzip وموقّعة من البلدية. لكل شهادة موقع عشوائي فيها، والقيمة 1 تعني ملغاة. يحمّل المتحقّق القائمة **كاملة** ودورياً، فلا تعرف البلدية أي شهادة يجري فحصها (**خصوصية القطيع**)، بعكس سؤال «هل الشهادة X صالحة؟» عبر الشبكة. وإذا كانت القائمة غائبة أو أقدم من ساعة، يرفض القفل (**fail closed**). مقتطف من القائمة المنشورة:", { keepNext: true }));
c.push(...code(shortJSON(status), 13));

c.push(H2("4.7 مخطط التتابع"));
c.push(...figure("results/figures/sequence_diagram.png", 640,
  "شكل 4 — مخطط تتابع تبادل الشهادة: الإصدار (مرة واحدة)، تحميل قائمة الإلغاء (دورياً)، التقديم والتحقق (كل دخول، والبلدية غائبة)، ثم الإلغاء."));
c.push(P("**النقطة الجوهرية في المخطط:** عمود البلدية فارغ تماماً في مرحلة «كل دخول»، فلا سهم يصل إليها أثناء فتح الباب. لذلك لا تعرف أبداً متى ولا أين استعمل أحمد شهادته. هذا هو الفرق البنيوي عن OAuth."));

c.push(H2("4.8 نتائج السيناريو الكامل والهجمات"));
const S = (k) => (demoRes[k] ? "قبول ✓" : "رفض ✗");
c.push(table(["#", "السيناريو", "ما فعله الطرف", "النتيجة", "الفحص الذي قرّر"], [
  ["1", "القفل يطلب الإقامة", "أحمد يكشف resident_city", S("lock_resident_city"), "كل الفحوص — تعلّم المدينة فقط"],
  ["2", "الخدمة تطلب السن", "أحمد يكشف over_18", S("service_over_18"), "كل الفحوص — تاريخ الميلاد مخفي"],
  ["3", "إعادة الإرسال (replay)", "مهاجم يعيد تقديماً التقطه", S("replay"), "1 — nonce مستعمل"],
  ["4", "إفصاح مخترع", "أحمد يصنع إفصاحاً بملح جديد ويوقّع بمفتاحه", S("fake_disclosure"), "4 — digest غير موقّعة"],
  ["5", "شهادة مسروقة", "Mallory تقدّم شهادة أحمد بمعرّفها", S("stolen_credential"), "3 — المقدِّم ليس صاحب الشهادة"],
  ["6", "انتحال الهوية", "Mallory تدّعي معرّف أحمد وتوقّع بمفتاحها", S("stolen_impersonation"), "3 — توقيع الحامل غير صالح"],
  ["7", "مُصدِر مزيّف", "Mallory تصدر لنفسها شهادة إقامة", S("untrusted_issuer"), "2 — المُصدِر غير موثوق"],
  ["8", "كشف صفة خطأ", "أحمد يكشف given_name فقط", S("policy_not_met"), "6 — الصفة المطلوبة غير مكشوفة"],
  ["9", "تقديم لمتحقّق آخر", "تقديم الخدمة يُمرَّر للقفل", S("wrong_audience"), "1 — audience خاطئ"],
  ["10", "بعد الإلغاء، قبل التحديث", "القفل يعمل بقائمة قديمة", S("revoked_but_cache_old") + " (مقصود)", "نافذة التقادم"],
  ["11", "بعد تحديث القائمة", "القفل حمّل القائمة الجديدة", S("revoked"), "5 — الشهادة ملغاة"],
  ["12", "قائمة عمرها ساعتان", "الخدمة لم تحدّث قائمتها", S("stale_status_list"), "5 — fail closed"],
], [0.4, 1.8, 3.2, 1.2, 2.6], { highlight: [9] }));
c.push(caption("جدول 14 — نتائج `python -m part_b.demo`: السيناريوهات الـ12 مطابقة للمتوقع."));
c.push(P("**ما تعلّمه كل طرف** (من سجلات البرنامج): سجل البلدية فيه **حدثان فقط** (الإصدار والإلغاء) ولا أثر للاستعمال. وسجل القفل يُظهر أنه تعلّم `resident_city` فقط في حالات القبول، ولم يتعلّم شيئاً في الهجمات المرفوضة، إلا `given_name` حين كشفه أحمد خطأً، وهو تذكير بأن ما يُكشف لا يُسترجع."));

c.push(H2("4.9 المقارنة مع تسجيل الدخول المركزي OAuth 2.0 / OpenID Connect"));
c.push(P("أعدنا أسبوعاً واحداً من حياة أحمد بالنظامين: فتح الباب يومياً (7 مرات)، وزيارتان للخدمة ذات السن، وزيارة للصيدلية."));
const ol = oauth.oauth.services_learned, sl = oauth.ssi.services_learned;
c.push(table(["", "OAuth 2.0 / OIDC", "SSI (عملنا)"], [
  ["ما يعرفه مزوّد الهوية / المُصدِر", `${oauth.oauth.idp_log.length} أحداث دخول: من، وأين، ومتى`, `${oauth.ssi.issuer_log.length} حدث: الإصدار فقط`],
  ["ما يتلقاه القفل", ol["smart-lock"].join("، "), sl["smart-lock"].join("، ")],
  ["ما تتلقاه خدمة السن", ol["age-restricted-service"].join("، "), sl["age-restricted-service"].join("، ")],
  ["ما تتلقاه الصيدلية", ol["pharmacy"].join("، "), sl["pharmacy"].join("، ")],
  ["الاتصال بالمزوّد عند كل دخول", "ضروري", "غير ضروري"],
  ["إذا تعطّل المزوّد", "لا دخول لأي خدمة", "القفل يعمل عادياً"],
  ["إذا اختُرق المزوّد", "تسريب سجل حياة كل المستخدمين", "لا يوجد سجل استعمال ليُسرق"],
  ["أين تقع الثقة", "في المزوّد، في كل لحظة", "في توقيع المُصدِر مرة واحدة + حماية الحامل لمفتاحه"],
  ["الخطر الجديد", "التتبّع المركزي", "ضياع المفتاح = ضياع الهوية (تلزم آلية استرداد)"],
], [2.4, 3.4, 3.2]));
c.push(caption("جدول 15 — من يعرف ماذا، وأين تقع الثقة."));
c.push(LI("**لماذا يعطي OAuth كل هذا؟** لأن OpenID Connect يجمع الصفات في حِزم (scopes): طلب `profile` يعطي الاسم وتاريخ الميلاد معاً، ولا يمكن طلب «هل هو فوق 18» وحده."));
c.push(LI("**خطر المعرّف `sub`:** إذا تلقّت الخدمات الثلاث القيمة نفسها، تستطيع التواطؤ وربط سجلاتها: هجوم ربط من النوع الذي رأيناه في الجزء A."));
c.push(LI("**إنصافاً لـ OAuth:** يمكن تقليص الـ scopes، لكن مزوّد الهوية يبقى يرى كل عملية دخول، لأن ذلك من طبيعة البروتوكول."));

c.push(H2("4.10 خيار الجهاز الحقيقي (Raspberry Pi)"));
c.push(P("الكود جاهز لتشغيل القفل على Raspberry Pi: ملف `part_b/smart_lock.py` يقود LED أو relay عبر مكتبة gpiozero إذا عُرّف المتغيّر `TP3_GPIO_PIN`. يُوصَل LED (مع مقاومة) أو relay بالمنفذ BCM 17، ثم يُشغَّل: `TP3_GPIO_PIN=17 python -m part_b.demo`، فيضيء ثانيتين عند كل قبول. لم نجرّبه على جهاز حقيقي، لأن هذا الخيار اختياري في نص العمل."));

// ================================================================== 5. tests
c.push(H1("5. الاختبارات الآلية", true));
c.push(P("كتبنا **26 اختباراً** بـ pytest تغطي صحة الخوارزميات وخصائصها الأمنية، ولا تحتاج تحميل البيانات (الجزء A يُختبر على بيانات مركّبة صغيرة). **النتيجة: 26 ناجحة من 26.**"));
c.push(table(["الملف", "الاختبار", "ما يتحقق منه"], [
  ["test_anonymization", "naive_release_is_linkable", "هجوم الربط ينجح على النشر الساذج وكل تطابق فريد صحيح"],
  ["test_anonymization", "k_anonymity_holds_and_blocks_linkage [2, 5, 10]", "pycanon تؤكد k، الحذف ≤ 5%، هجوم الربط يفشل"],
  ["test_anonymization", "information_loss_grows_with_k", "الخسارة صفر عند k = 1 وتتزايد مع k"],
  ["test_anonymization", "laplace_error_matches_theory", "الخطأ المقيس = U/(nε) بدقة 10%"],
  ["test_ssi", "base58_roundtrip / did_key_format / rejects_garbage", "ترميز did:key صحيح ويرفض المدخلات الفاسدة"],
  ["test_ssi", "document_proof_detects_any_change", "أي تعديل في الوثيقة أو الغرض أو الموقّع يُبطل التوقيع"],
  ["test_ssi", "disclosures_are_salted / credential_hides_all_values", "الأملاح مختلفة، ولا قيمة ظاهرة في الشهادة"],
  ["test_ssi", "issuance_requires_did_control / challenge_single_use", "الإصدار يتطلب إثبات المعرّف، والـ nonce لمرة واحدة"],
  ["test_ssi", "valid_presentation_reveals_only_chosen_claim", "القبول مع كشف صفة واحدة فقط"],
  ["test_ssi", "replay / expired_challenge / wrong_audience", "رفض إعادة الإرسال، والـ nonce المنتهي، والوجهة الخطأ"],
  ["test_ssi", "tampered_credential / forged_disclosure", "رفض الشهادة المعدّلة والإفصاح المزوّر"],
  ["test_ssi", "stolen_credential / untrusted_issuer", "رفض الشهادة المسروقة والمُصدِر غير الموثوق"],
  ["test_ssi", "policy_requires_disclosure", "رفض الدخول دون الصفة المطلوبة"],
  ["test_ssi", "revocation / stale_status_list / forged_status_list", "الإلغاء يعمل، القائمة القديمة تُرفض، والمزوّرة لا تُقبل"],
], [1.8, 3.4, 3.8], { size: 15 }));
c.push(caption("جدول 16 — الاختبارات الآلية (المخرجات الكاملة في الملحق F)."));

// ================================================================== 6. discussion
c.push(H1("6. نقاش أمني وحدود العمل"));
c.push(LI("**أشباه المعرّفات مركّبة:** نسبة 47.9% تتبع التوزيع الذي ولّدناه، فما يثبته العمل هو **الآلية** لا الرقم بالضبط. على بيانات ديموغرافية حقيقية قد تكون النسبة أعلى أو أقل."));
c.push(LI("**حدود k-anonymity:** ضمانها يتعلق بشكل الجدول فقط، فلا تصمد أمام المعرفة المسبقة ولا التجانس (رأيناه عند k = 2). الحل: l-diversity أو t-closeness، أو الانتقال إلى DP."));
c.push(LI("**حدود الخصوصية التفاضلية:** الميزانية تُستهلك مع كل استعلام، ويجب تتبّعها على مدى حياة البيانات. والحد U يجب أن يكون عاماً، وفي البيانات الملتوية يولّد تحيّزاً كبيراً."));
c.push(LI("**قابلية الربط في SSI:** الإفصاح بالـ hash يكشف التوقيع نفسه ومعرّف الشهادة ومعرّف الحامل في كل تقديم، فيستطيع متحقّقون متواطئون ربط زيارات أحمد. الحل: توقيعات BBS+ (إثبات بلا معرفة، كل تقديم يبدو مختلفاً) أو معرّف DID مختلف لكل علاقة."));
c.push(LI("**الإلغاء والتوفّر:** نافذة الإلغاء تساوي فترة تحديث القائمة، و fail closed يمنع قبول شهادة ملغاة لكنه قد يُبقي صاحب البيت خارجه عند انقطاع الشبكة. هذه مفاضلة يجب حسمها لكل جهاز."));
c.push(LI("**حماية المفاتيح:** في العرض تبقى المفاتيح في الذاكرة فقط. في جهاز حقيقي يجب حفظها في عنصر آمن (secure element) أو TPM، مع آلية استرداد."));
c.push(LI("**تبسيطات معلنة:** صيغة التوقيع (JSON مرتّب المفاتيح + Ed25519) ليست معياراً مسجّلاً. الشهادة على شكل W3C VC 2.0 دون اختبار توافق. وفحص هوية المواطن الحقيقية قبل الإصدار (في مكتب البلدية) خارج البروتوكول."));

// ================================================================== 7. built vs reused
c.push(H1("7. ما بنيناه وما أعدنا استخدامه"));
c.push(table(["المكوّن", "من بنائنا", "معاد استخدامه"], [
  ["البيانات", "الصفات الديموغرافية المركّبة، السجل العام، جدول الحقيقة، الصفات الحساسة المشتقة", "قراءات UCI / Monash الحقيقية"],
  ["هجوم الربط", "منطق الهجوم وتقييمه", "pandas.merge"],
  ["k-anonymity", "أهرام التعميم، البحث الشامل مع الحذف، مقاييس NCP و DM والخطر", "pycanon (تحقق مستقل فقط)"],
  ["الخصوصية التفاضلية", "آلية Laplace للمتوسط المحدود، تقسيم الميزانية، دراسة الخطأ والحد U", "diffprivlib (للمقارنة فقط)"],
  ["SSI", "did:key و base58btc، التوقيع على JSON، الإفصاح الانتقائي مع الـ digests الوهمية، DID-Auth، ربط الحامل، nonce و audience، قائمة الإلغاء، الأدوار الثلاثة", "مكتبة cryptography: Ed25519 و SHA-256"],
  ["المقارنة و الرسوم", "محاكاة OAuth، كل المنحنيات، مخطط التتابع", "matplotlib"],
], [1.6, 4.6, 2.6]));
c.push(caption("جدول 17 — الفصل بين ما بنيناه وما أعدنا استخدامه، كما يشترط نص العمل."));

// ================================================================== 8. conclusion
c.push(H1("8. الخلاصة"));
c.push(table(["الخطوة", "ما أثبتناه"], [
  ["هجوم الربط", "حذف الأسماء لا يحمي: 150 من 313 عميلاً (47.9%) مكشوفون بدقة 100%"],
  ["k-anonymity", "k = 2 يوقف الهجوم بثمن 25% من دقة المعلومات؛ k = 3 يزيل التجانس أيضاً"],
  ["الخصوصية التفاضلية", "الخطأ ∝ 1/ε كما تتنبأ النظرية؛ الميزانية تُستهلك؛ الحد U هو التحدي الأكبر"],
  ["SSI", "إفصاح انتقائي، تحقق دون اتصال، 7 هجمات مرفوضة، إلغاء يعمل بحدود معلنة"],
  ["مقارنة OAuth", "10 أحداث دخول عند المزوّد المركزي مقابل حدث إصدار واحد في SSI"],
], [2, 6]));
c.push(gap(160));
c.push(P("**الخيط الرابط:** في الجزء A رأينا أن **ربط المعلومات المتفرقة** هو ما يكشف الناس. وفي الجزء B بنينا نظاماً **يمنع تكوّن هذه المعلومات المتفرقة أصلاً**: لا سجل مركزي للاستعمال، ولا كشف إلا للضروري. حماية الخصوصية في إنترنت الأشياء لا تكون بإخفاء البيانات بعد جمعها فقط، بل أيضاً بتصميم أنظمة لا تجمع إلا ما يلزم."));
c.push(H2("المراجع"));
for (const r of [
  "L. Sweeney, «k-anonymity: a model for protecting privacy», Int. J. Uncertainty, Fuzziness and Knowledge-Based Systems, 2002.",
  "A. Machanavajjhala et al., «l-diversity: Privacy beyond k-anonymity», ACM TKDD, 2007.",
  "C. Dwork, A. Roth, «The Algorithmic Foundations of Differential Privacy», 2014.",
  "W3C, Verifiable Credentials Data Model v2.0 · Decentralized Identifiers (DIDs) v1.0 · Bitstring Status List.",
  "W3C CCG, The did:key Method. · IETF OAuth WG, Selective Disclosure for JWTs (SD-JWT).",
  "A. Trindade, UCI ElectricityLoadDiagrams20112014 · R. Godahewa et al., Monash Time Series Forecasting Archive, Zenodo 4656140.",
]) c.push(new Paragraph({ alignment: AlignmentType.LEFT, bidirectional: false, spacing: { after: 60 }, numbering: { reference: "refs", level: 0 },
  children: [new TextRun({ text: r, font: FONT, size: 18 })] }));

// ================================================================== appendices
const APP = [
  ["الملحق A — مخرجات هجوم الربط", "python -m part_a.linkage_attack", "1_linkage_attack.txt"],
  ["الملحق B — مخرجات k-anonymity", "python -m part_a.k_anonymity", "2_k_anonymity.txt"],
  ["الملحق C — مخرجات الخصوصية التفاضلية", "python -m part_a.differential_privacy", "3_differential_privacy.txt"],
  ["الملحق D — مخرجات سيناريو SSI الكامل", "python -m part_b.demo", "4_ssi_demo.txt"],
  ["الملحق E — مخرجات المقارنة مع OAuth", "python -m part_b.oauth_comparison", "5_oauth_comparison.txt"],
  ["الملحق F — مخرجات الاختبارات", "python -m pytest -v", "6_pytest.txt"],
];
APP.forEach(([title, cmd, file], i) => {
  c.push(i === 0 ? H1("ملاحق — المخرجات الكاملة للبرامج", true) : gap(0));
  if (i === 0) c.push(P("نصوص المخرجات كما ظهرت على الشاشة، دون تعديل. نسخها محفوظة في `results/logs/`."));
  c.push(H2(title));
  c.push(new Paragraph({ alignment: AlignmentType.LEFT, bidirectional: false, spacing: { after: 60 }, keepNext: true,
    children: [new TextRun({ text: "> " + cmd, font: "Consolas", size: 16, bold: true, color: "2E5496" })] }));
  c.push(...code(log(file), file.startsWith("2_") ? 9 : 11));
});

// ================================================================== document
const bullet = (ref, fmt, text) => ({ reference: ref, levels: [{ level: 0, format: fmt, text,
  alignment: AlignmentType.START, style: { paragraph: { indent: { start: 400, hanging: 280 } } } }] });
const doc = new Document({
  creator: "Abderrazzak Aiba, Abdelhakim Berrim",
  title: "TP3 — Anonymization and self-sovereign identity (full results)",
  styles: {
    default: { document: { run: { font: FONT, size: BODY } } },
    paragraphStyles: [
      { id: "Heading1", name: "Heading 1", basedOn: "Normal", next: "Normal", quickFormat: true,
        run: { font: FONT, size: 30, bold: true }, paragraph: { spacing: { before: 0, after: 200 }, keepNext: true, outlineLevel: 0 } },
      { id: "Heading2", name: "Heading 2", basedOn: "Normal", next: "Normal", quickFormat: true,
        run: { font: FONT, size: 24, bold: true }, paragraph: { spacing: { before: 240, after: 100 }, keepNext: true, outlineLevel: 1 } },
      { id: "Heading3", name: "Heading 3", basedOn: "Normal", next: "Normal", quickFormat: true,
        run: { font: FONT, size: 21, bold: true }, paragraph: { spacing: { before: 160, after: 80 }, keepNext: true, outlineLevel: 2 } },
    ],
  },
  numbering: { config: [
    bullet("bullets", LevelFormat.BULLET, "•"),
    bullet("steps", LevelFormat.DECIMAL, "%1."),
    bullet("issue", LevelFormat.DECIMAL, "%1."),
    { reference: "refs", levels: [{ level: 0, format: LevelFormat.DECIMAL, text: "[%1]", alignment: AlignmentType.LEFT,
      style: { paragraph: { indent: { left: 400, hanging: 400 } } } }] },
  ] },
  sections: [{
    properties: { page: { margin: { top: MARGIN, bottom: MARGIN, left: MARGIN, right: MARGIN } }, titlePage: true },
    footers: {
      first: new Footer({ children: [new Paragraph({ children: [] })] }),
      default: new Footer({ children: [new Paragraph({ alignment: AlignmentType.CENTER, bidirectional: true, children: [
        new TextRun({ text: "صفحة ", rightToLeft: true, size: 16, sizeComplexScript: 16, color: "7F7F7F" }),
        new TextRun({ children: [PageNumber.CURRENT], rightToLeft: true, size: 16, sizeComplexScript: 16, color: "7F7F7F" }),
        new TextRun({ text: " من ", rightToLeft: true, size: 16, sizeComplexScript: 16, color: "7F7F7F" }),
        new TextRun({ children: [PageNumber.TOTAL_PAGES], rightToLeft: true, size: 16, sizeComplexScript: 16, color: "7F7F7F" }),
      ] })] }),
    },
    children: c,
  }],
});
Packer.toBuffer(doc).then((buf) => { fs.writeFileSync(OUT, buf); console.log("written", OUT); });
