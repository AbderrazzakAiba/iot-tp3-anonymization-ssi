// Builds the Arabic RTL report for TP3 (needs `npm install docx@9.5.1`):
//   node docs/build_report.js . docs/TP3_report_ar.docx
const fs = require("fs");
const path = require("path");
const {
  Document, Packer, Paragraph, TextRun, ImageRun, Table, TableRow, TableCell, WidthType,
  ShadingType, AlignmentType, BorderStyle, LevelFormat, Footer, PageNumber, HeadingLevel,
} = require("docx");

const ROOT = process.argv[2];
const OUT = process.argv[3];
const FONT = "Arial";
const BODY = 20;     // half-points (10 pt)
const SMALL = 17;    // tables 8.5 pt
const PAGE_W = 11906, MARGIN = 1000, CONTENT_W = PAGE_W - 2 * MARGIN;

// ------------------------------------------------------------------ inline markup
// **bold**  and  `code` (Latin, monospace)
function runs(text, opts = {}) {
  const size = opts.size || BODY;
  return text.split(/(\*\*[^*]+\*\*|`[^`]+`)/).filter(Boolean).map((part) => {
    if (part.startsWith("`")) {
      return new TextRun({ text: part.slice(1, -1), font: "Consolas", size: size - 2,
                           sizeComplexScript: size - 2 });
    }
    const bold = part.startsWith("**") || !!opts.bold;
    const t = part.startsWith("**") ? part.slice(2, -2) : part;
    return new TextRun({ text: t, rightToLeft: true, bold, boldComplexScript: bold,
                         font: { ascii: FONT, hAnsi: FONT, cs: FONT }, size,
                         sizeComplexScript: size, color: opts.color });
  });
}

const P = (text, o = {}) => new Paragraph({
  bidirectional: true, alignment: o.align || AlignmentType.BOTH,
  spacing: { after: o.after ?? 80, line: 264 }, children: runs(text, o),
});
const H1 = (text) => new Paragraph({
  heading: HeadingLevel.HEADING_1, bidirectional: true, children: runs(text, { size: 26, bold: true, color: "1F3864" }),
});
const H2 = (text) => new Paragraph({
  heading: HeadingLevel.HEADING_2, bidirectional: true, children: runs(text, { size: 22, bold: true, color: "2E5496" }),
});
const LI = (text) => new Paragraph({
  bidirectional: true, alignment: AlignmentType.BOTH, numbering: { reference: "bullets", level: 0 },
  spacing: { after: 40, line: 252 }, children: runs(text),
});

function table(headers, rows, widths) {
  const total = widths.reduce((a, b) => a + b, 0);
  const scale = CONTENT_W / total;
  const w = widths.map((x) => Math.round(x * scale));
  w[w.length - 1] += CONTENT_W - w.reduce((a, b) => a + b, 0);
  const border = { style: BorderStyle.SINGLE, size: 4, color: "8EAADB" };
  const borders = { top: border, bottom: border, left: border, right: border };
  const cell = (text, i, head) => new TableCell({
    width: { size: w[i], type: WidthType.DXA }, borders,
    shading: head ? { type: ShadingType.CLEAR, fill: "D9E2F3", color: "auto" } : undefined,
    margins: { top: 30, bottom: 30, left: 70, right: 70 },
    children: [new Paragraph({ bidirectional: true, alignment: AlignmentType.CENTER,
                               children: runs(String(text), { size: SMALL, bold: head }) })],
  });
  return new Table({
    width: { size: CONTENT_W, type: WidthType.DXA }, columnWidths: w, visuallyRightToLeft: true,
    rows: [new TableRow({ tableHeader: true, children: headers.map((h, i) => cell(h, i, true)) }),
           ...rows.map((r) => new TableRow({ cantSplit: true, children: r.map((c, i) => cell(c, i, false)) }))],
  });
}
const gap = () => new Paragraph({ spacing: { after: 60 }, children: [] });

function figure(file, widthPx, ratio, caption) {
  return [
    new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 60, after: 20 }, keepNext: true,
      children: [new ImageRun({ type: "png", data: fs.readFileSync(path.join(ROOT, file)),
        transformation: { width: widthPx, height: Math.round(widthPx * ratio) } })] }),
    P(caption, { align: AlignmentType.CENTER, size: SMALL, after: 100 }),
  ];
}
const caption = (t) => P(t, { align: AlignmentType.CENTER, size: SMALL, after: 120 });

// ------------------------------------------------------------------ content
const c = [];
c.push(new Paragraph({ bidirectional: true, alignment: AlignmentType.CENTER, spacing: { after: 40 },
  children: runs("تقرير TP3 — إخفاء هوية بيانات إنترنت الأشياء والهوية ذاتية السيادة", { size: 32, bold: true, color: "1F3864" }) }));
c.push(P("ماستر إنترنت الأشياء والأمن السيبراني — جامعة الشهيد حمه لخضر، الوادي — السنة الجامعية ‪2026/2027‬", { align: AlignmentType.CENTER, size: 18, after: 20 }));
c.push(new Paragraph({ bidirectional: true, alignment: AlignmentType.CENTER, spacing: { after: 160 },
  border: { bottom: { style: BorderStyle.SINGLE, size: 8, color: "2E5496", space: 4 } },
  children: runs("إعداد: Abderrazzak Aiba — Abdelhakim Berrim", { size: 18, bold: true }) }));

c.push(P("**ملخص.** نعالج خطر تسرّب الحياة الخاصة في بيانات العدادات الذكية من زاويتين. في الجزء A نثبت أن حذف الأسماء لا يكفي: هجوم ربط بسيط أعاد التعرّف على 47.9% من العملاء، ثم نقيس كلفة k-anonymity (k = 2، 5، 10) والخصوصية التفاضلية (ε = 0.1، 1، 10) على الفائدة. في الجزء B نبني تدفّق هوية ذاتية السيادة كاملاً (did:key، شهادة موقّعة، إفصاح انتقائي، ربط بالحامل، حماية من إعادة الإرسال، إلغاء) يسمح لقفل ذكي بالتحقق من صفة واحدة دون الاتصال بالمُصدِر، ونقارنه بتسجيل الدخول المركزي OAuth 2.0. كل الشيفرة بلغة Python، و26 اختباراً آلياً ناجحاً، وكل نتيجة تُعاد بأمر موثّق في README."));

// ---------------- Part A
c.push(H1("1. الجزء A — إخفاء هوية بيانات العدادات الذكية"));
c.push(H2("1.1 البيانات وتصنيف الأعمدة"));
c.push(P("استعملنا مجموعة **ElectricityLoadDiagrams20112014** (مستودع UCI، رخصة CC BY 4.0) لعملاء شركة كهرباء برتغالية، في نسختها الساعية المنشورة في أرشيف Monash على Zenodo (321 عميلاً، 2012–2014)، لأن الملف الأصلي (250 MB) تعذّر تحميله. احتفظنا بسنة 2014 و**313 عميلاً** متصلين طوال السنة (8760 ساعة لكل عميل)، والطاقة بالـ kWh = القيمة ÷ 4 لأن الأرشيف يجمع أربع قراءات kW لكل ساعة. كثير من هؤلاء العملاء مؤسسات لا منازل (الوسيط 1.26 GWh في السنة)."));
c.push(P("لا تحتوي البيانات على معلومات ديموغرافية، لذلك **ولّدنا** (بزرع ثابت 2026) اسماً وعمراً وجنساً ورمزاً بريدياً من 4 أرقام لكل عميل، وسجلاً عاماً ثانياً من 2000 ساكن (المالكون الـ313 و1687 آخرون) يمثّل قائمة انتخابية أو سجلاً بلدياً. أما الصفات الحساسة فمحسوبة من **القراءات الحقيقية**."));
c.push(table(["الفئة", "الأعمدة", "المعالجة"], [
  ["معرّفات مباشرة", "`household_id`، `owner_name`", "حذف كامل"],
  ["أشباه معرّفات", "`age`، `zip`، `sex`", "تعميم وحذف سجلات (k-anonymity)"],
  ["صفات حساسة", "`annual_kwh`، `night_share`، `occupancy_profile`", "تُنشر كما هي، أو كإحصاءات مشوّشة (DP)"],
], [2, 4, 4]));
c.push(caption("جدول 1 — تصنيف الأعمدة. `occupancy_profile` نمط الإشغال المستنتج من شكل الاستهلاك (نهاري، ذروة مسائية، مسطّح)."));

c.push(H2("1.2 هجوم الربط (Linkage attack)"));
c.push(P("حذفنا المعرّفات فقط (النشر «الساذج»)، ثم ربطنا الجدول بالسجل العام بالدالة `pandas.merge` على أشباه المعرّفات. يُعدّ السجل مُعاداً التعرّف عليه إذا طابق شخصاً واحداً فقط في السجل، وتُقاس الصحة بجدول حقيقة لا يراه المهاجم."));
c.push(table(["أشباه المعرّفات المستعملة", "سجلات فريدة في الجدول المنشور", "إعادة تعرّف صحيحة"], [
  ["zip", "0", "0 (0%)"],
  ["age + sex", "42", "3 (1.0%)"],
  ["age + zip", "238", "88 (28.1%)"],
  ["**age + zip + sex**", "**275 (87.9%)**", "**150 (47.9%)**"],
], [3, 3, 3]));
c.push(caption("جدول 2 — نتيجة هجوم الربط على 313 سجلاً. كل تطابق فريد كان صحيحاً (دقة 100%)."));
c.push(P("كل صفة وحدها ضعيفة، لكن اجتماعها يجعل 87.9% من السجلات فريدة. لا تتحوّل كلها إلى إعادة تعرّف لأن السجل العام يضم أشخاصاً آخرين يشاركونهم القيم نفسها. النتيجة ملموسة: يحصل المهاجم على اسم العميل مع استهلاكه السنوي ونمط إشغاله، أي متى يكون المكان فارغاً."));

c.push(H2("1.3 إخفاء الهوية بـ k-anonymity"));
c.push(P("**المنهج (من بنائنا):** هرم تعميم لكل شبه معرّف: العمر (دقيق ← 5 سنوات ← 10 ← 20 ← *)، الرمز البريدي (حذف رقم في كل مستوى حتى *)، الجنس (دقيق ← *). شبكة التعميم صغيرة (5×5×2 = 50 عقدة)، لذلك نفحصها كلها ونختار العقدة ذات أقل خسارة معلومات **NCP** مع حذف 5% من السجلات كحدّ أقصى، وهي فكرة البحث الأمثل في أداة ARX. نقيس أيضاً مقياس التمييز **DM** (ΣE²/n²)، ثم نتحقق بشكل مستقل بمكتبة **pycanon** من k ومن l-diversity على نمط الإشغال، ونعيد هجوم الربط بعد تعميم السجل العام بالمستوى نفسه."));
c.push(table(["k", "التعميم المختار", "سجلات محذوفة", "NCP", "DM", "k الفعلي (pycanon)", "l", "أقصى خطر", "إعادة تعرّف"], [
  ["1 (أصلي)", "بدون تعميم", "0", "0.000", "0.004", "1", "1", "1.00", "150"],
  ["2", "عمر 5 سنوات، zip رقم واحد", "10", "0.252", "0.062", "2", "1", "0.50", "0"],
  ["5", "عمر 20 سنة، zip رقم واحد", "4", "0.301", "0.118", "6", "2", "0.17", "0"],
  ["10", "العمر محذوف، zip رقم واحد", "0", "0.539", "0.340", "29", "3", "0.03", "0"],
], [1.1, 3.2, 1.2, 0.9, 0.9, 1.4, 0.6, 1.1, 1.2]));
c.push(caption("جدول 3 — k-anonymity على 313 سجلاً. «أقصى خطر» = 1 / حجم أصغر فئة تكافؤ."));
c.push(...figure("results/figures/k_anonymity_tradeoff.png", 620, 675 / 1800,
  "شكل 1 — يسار: كلفة الفائدة (NCP، DM، نسبة الحذف) بدلالة k. يمين: الخطر (نسبة إعادة التعرّف، أقصى خطر، السجلات في فئات متجانسة)."));
c.push(P("**الملاحظات.** (1) k = 2 تكفي لإيقاف هجوم الربط كلياً (من 150 إلى 0) بخسارة NCP قدرها 0.25. (2) تقفز الخسارة بين k = 7 و k = 10 من 0.31 إلى 0.54 لأن الهرم خشن: الخطوة التالية بعد فئات العشرين سنة هي حذف العمر كله. (3) يبقى الجنس دقيقاً في كل الحالات لأن تعميمه مكلف قليل الفائدة. (4) عند k = 2 يقع 2.3% من السجلات في فئات لها نمط إشغال واحد (l = 1)، فيعرف المهاجم صفتهم الحساسة دون أن يحدّد هويتهم (هجوم التجانس)، ولهذا قسنا l-diversity أيضاً."));

c.push(H2("1.4 الخصوصية التفاضلية (Differential Privacy)"));
c.push(P("**الاستعلام:** متوسط استهلاك العملاء في كل ساعة من اليوم، q_h. **الآلية (من بنائنا):** q̃_h = q_h + Lap(Δ/ε) مع حد علوي عام **U = 1000 kWh** يُثبَّت مسبقاً ولا يُستخرج من البيانات، وعدد عملاء معلن n = 313، فالحساسية Δ = U/n = 3.19 kWh. قارنّا تنفيذنا بالدالة `diffprivlib.tools.mean`. درسنا حالتين: ساعة واحدة (19:00) بميزانية ε، وملف 24 ساعة كاملاً تُقسَّم فيه الميزانية إلى ε/24 لكل ساعة (التركيب المتتالي). كررنا كل تجربة 300 مرة وقسنا الخطأ المطلق بالنسبة إلى المتوسط بعد القصّ، وهو ما تحسبه الآلية فعلاً."));
c.push(table(["ε", "MAE ساعة واحدة (تنفيذنا)", "diffprivlib", "النظرية U/(nε)", "خطأ نسبي", "MAE ملف 24 ساعة", "خطأ نسبي (24 ساعة)"], [
  ["0.1", "30.07", "30.87", "31.95", "9.0%", "763.2", "275%"],
  ["1", "3.07", "2.96", "3.19", "0.92%", "77.4", "27.9%"],
  ["10", "0.29", "0.35", "0.32", "0.09%", "7.6", "2.7%"],
], [0.8, 2, 1.4, 1.5, 1.2, 1.7, 1.8]));
c.push(caption("جدول 4 — الخطأ (kWh) بدلالة ε. القيم المقيسة تطابق القيمة النظرية E|Lap(b)| = b."));
c.push(...figure("results/figures/dp_error_vs_epsilon.png", 430, 675 / 1050,
  "شكل 2 — الخطأ بدلالة ε (مقياس لوغاريتمي): الخطأ ∝ 1/ε، وملف 24 ساعة أسوأ بـ 24 مرة. الخط الأحمر تحيّز القصّ، وهو لا يتغيّر مع ε."));
c.push(P("**أثر الحد U.** البيانات شديدة الالتواء (عميل واحد يصل إلى 78 000 kWh في الساعة)، فيتجاوز 41 عميلاً الحد U عند الساعة 19:00، وينتج عن القصّ **تحيّز قدره 520 kWh** (61% من المتوسط الحقيقي 852 kWh)، وهو أكبر من ضجيج Laplace عند أي ε في دراستنا. رفع U إلى 5000 kWh يخفض التحيّز إلى 327 kWh لكنه يرفع الضجيج المتوقع عند ε = 1 من 3.19 إلى 15.97 kWh (الملف `dp_bound_study.csv`). الخلاصة: في بيانات IoT غير المتجانسة، **اختيار الحد أو تقسيم السكان (مثلاً حسب شريحة التعريفة) أهم من اختيار ε**. أما القيم السالبة الظاهرة عند ε = 0.1 فتُصحَّح بمعالجة لاحقة (قصّ إلى الصفر) دون أي كلفة على الخصوصية."));

// ---------------- Part B
c.push(H1("2. الجزء B — الهوية ذاتية السيادة (SSI)"));
c.push(H2("2.1 الأدوار والمعرّفات اللامركزية"));
c.push(P("ثلاثة أدوار: **المُصدِر** (بلدية الوادي)، و**الحامل** (محفظة المواطن على حاسوب أو Raspberry Pi)، و**المتحقّق** (قفل ذكي يشترط الإقامة، وخدمة ثانية تشترط السن ≥ 18). لكل طرف معرّف **did:key** مبني على مفتاح Ed25519: `did:key:z` + base58btc(0xed01 ‖ المفتاح العام). المعرّف هو المفتاح العام نفسه، فاستخراج المفتاح منه عملية محلية لا تحتاج سلسلة كتل ولا خادماً، وهذا ما يسمح بالتحقق دون اتصال (offline). يُنتج البرنامج وثائق DID في `results/part_b`."));
c.push(H2("2.2 الإصدار والإفصاح الانتقائي"));
c.push(P("قبل الإصدار يثبت الحامل امتلاكه للـ DID بتوقيع nonce يرسله المُصدِر (DID-Auth). لكل صفة يولّد المُصدِر **ملحاً عشوائياً من 128 بت** ويحسب disclosure = base64url(JSON[salt, name, value]) ثم digest = SHA-256(disclosure)، وهي فكرة SD-JWT. لا تحتوي الشهادة الموقّعة أي قيمة، بل قائمة الـ digests مرتّبة، ومعها **digest وهميان** يخفيان عدد الصفات، ورقم موقع عشوائي في قائمة الإلغاء. يوقّع المُصدِر الشهادة بـ Ed25519 على JSON مرتّب المفاتيح، ويتحقق الحامل من كل شيء قبل تخزينها. الملح ضروري: بدونه يكفي تجريب القيمتين true و false لكسر digest الصفة `over_18`."));
c.push(H2("2.3 التقديم والتحقق دون الاتصال بالمُصدِر"));
c.push(P("يرسل القفل nonce صالحاً دقيقتين ولمرة واحدة. يقدّم الحامل الشهادة مع الإفصاحات التي اختارها فقط، ومعها الـ nonce ومعرّف القفل (audience)، ويوقّع كل ذلك بمفتاحه. يفحص القفل بالترتيب: (1) الـ nonce جديد وغير مستعمل والـ audience هو نفسه، (2) المُصدِر ضمن قائمة الثقة وتوقيعه صحيح وتاريخ الصلاحية ساري، (3) الموقّع هو صاحب الشهادة `credentialSubject.id` (ربط بالحامل)، (4) كل إفصاح يطابق digest موقّعاً، (5) قائمة الإلغاء المخزّنة حديثة (≤ ساعة) والبت المقابل غير مفعّل، (6) الصفات المكشوفة تحقق السياسة. لا يتصل القفل بالبلدية أثناء هذه الخطوات (الشكل 3)."));
c.push(...figure("results/figures/sequence_diagram.png", 560, 1306 / 1870,
  "شكل 3 — مخطط تتابع تبادل الشهادة: الإصدار، تحميل قائمة الإلغاء، التقديم والتحقق، ثم الإلغاء (المصدر: `docs/sequence_diagram.md` و `part_b/sequence_diagram.py`)."));
c.push(H2("2.4 الإلغاء"));
c.push(P("قائمة إلغاء على شكل سلسلة بتات من 131 072 بت (فكرة W3C Bitstring Status List)، مضغوطة وموقّعة من المُصدِر. لكل شهادة موقع عشوائي فيها. يحمّل المتحقّق القائمة دورياً دون أي معلومة عن المستخدم، فلا يعرف المُصدِر أي شهادة يجري فحصها (خصوصية القطيع). إذا كانت القائمة غائبة أو أقدم من ساعة يرفض القفل (fail closed)."));
c.push(table(["السيناريو", "النتيجة", "السبب / ما تعلّمه المتحقّق"], [
  ["القفل يطلب الإقامة", "قبول ✓", "يتعلّم resident_city = El Oued فقط"],
  ["الخدمة تطلب السن", "قبول ✓", "يتعلّم over_18 = true، وتاريخ الميلاد يبقى مخفياً"],
  ["إعادة إرسال تقديم ملتقط", "رفض ✗", "nonce مستعمل (replay)"],
  ["الحامل يخترع إفصاحاً بملح جديد", "رفض ✗", "digest غير موقّع من المُصدِر"],
  ["شهادة مسروقة يقدّمها حامل آخر", "رفض ✗", "المقدِّم ليس صاحب الشهادة"],
  ["السارق ينتحل DID الضحية", "رفض ✗", "توقيع الحامل غير صالح"],
  ["شهادة من مُصدِر مزيّف", "رفض ✗", "المُصدِر خارج قائمة الثقة"],
  ["كشف given_name فقط للقفل", "رفض ✗", "الصفة المطلوبة غير مكشوفة"],
  ["تقديم مُعدّ لمتحقّق آخر", "رفض ✗", "audience خاطئ"],
  ["بعد الإلغاء وقبل تحديث القائمة", "قبول (مقصود)", "نافذة التقادم: القائمة المخزّنة قديمة"],
  ["بعد تحديث قائمة الإلغاء", "رفض ✗", "الشهادة ملغاة"],
  ["قائمة إلغاء عمرها ساعتان", "رفض ✗", "fail closed"],
], [3.2, 1.4, 4.4]));
c.push(caption("جدول 5 — نتائج `python -m part_b.demo`: الـ 12 سيناريو كلها مطابقة للمتوقع، وتغطيها أيضاً الاختبارات الآلية الـ 20 في `tests/test_ssi.py`."));
c.push(H2("2.5 مقارنة مع تسجيل الدخول المركزي OAuth 2.0 / OpenID Connect"));
c.push(P("أعدنا الأسبوع نفسه بالنظامين (`part_b/oauth_comparison.py`): فتح القفل يومياً، وزيارتان للخدمة ذات السن، وزيارة للصيدلية."));
c.push(table(["", "OAuth 2.0 / OIDC (مزوّد مركزي)", "SSI (عملنا)"], [
  ["ما يعرفه مزوّد الهوية / المُصدِر", "10 أحداث دخول: من، وأين، ومتى", "حدث واحد: الإصدار"],
  ["ما يتلقاه القفل", "sub، الاسم، تاريخ الميلاد، العنوان", "resident_city فقط"],
  ["ما تتلقاه خدمة السن", "sub، الاسم، تاريخ الميلاد", "over_18 فقط"],
  ["الاتصال بالمزوّد عند كل دخول", "ضروري", "غير ضروري (offline)"],
  ["أين تقع الثقة", "في المزوّد: نقطة فشل وتتبّع واحدة", "في مفتاح المُصدِر وفي حماية الحامل لمفتاحه"],
], [2.6, 3.4, 3]));
c.push(caption("جدول 6 — من يعرف ماذا. الـ scopes في OAuth هي ما يطلبه تكامل نموذجي، وتقليصها لا يمنع المزوّد من رؤية كل عملية دخول."));

// ---------------- Discussion
c.push(H1("3. نقاش أمني وحدود العمل"));
c.push(LI("**k-anonymity مقابل DP:** الأولى تنشر سجلات قابلة للتحليل، لكن ضمانها نحوي ولا يصمد أمام المعرفة المسبقة ولا التجانس. الثانية تعطي ضماناً رياضياً لا يرتبط بما يعرفه المهاجم، لكنها لا تنشر سجلات، وميزانيتها تُستهلك مع كل استعلام (24 استعلاماً = ε/24 لكل منها)."));
c.push(LI("**أشباه المعرّفات مركّبة:** نسبة 47.9% تتبع التوزيع الذي ولّدناه. ما يثبته العمل هو الآلية، لا الرقم بالضبط."));
c.push(LI("**قابلية الربط في SSI:** الإفصاح بالـ hash يكشف التوقيع نفسه ومعرّف الشهادة ومعرّف الحامل في كل تقديم، فيمكن لمتحقّقين متواطئين ربط زياراته. الحل: توقيعات BBS+ (إثبات بلا معرفة) أو DID مختلف لكل علاقة."));
c.push(LI("**الإلغاء والتوفّر:** نافذة الإلغاء تساوي مدة تحديث القائمة. سياسة fail closed تمنع قبول شهادة ملغاة، لكنها قد تُبقي الباب مغلقاً عند انقطاع الشبكة، وهي مفاضلة يجب حسمها لكل جهاز."));
c.push(LI("**المفاتيح:** في العرض تبقى المفاتيح في الذاكرة فقط. في جهاز حقيقي يجب حفظها في عنصر آمن أو TPM، مع آلية استرداد، لأن ضياع المفتاح يعني ضياع الهوية."));
c.push(LI("**تبسيطات معلنة:** صيغة التوقيع (JSON مرتّب المفاتيح + Ed25519) غير مسجّلة كمعيار. الشهادة على شكل W3C VC 2.0 دون شهادة توافق. التحقق من هوية المواطن الحقيقية قبل الإصدار خارج البروتوكول."));

c.push(H1("4. ما بنيناه وما أعدنا استخدامه"));
c.push(table(["من بنائنا", "معاد استخدامه"], [
  ["البيانات الديموغرافية المركّبة، السجل العام، جدول الحقيقة، هجوم الربط وتقييمه", "بيانات UCI / Monash الحقيقية، pandas"],
  ["هرم التعميم، البحث الشامل في الشبكة مع الحذف، مقاييس NCP و DM", "pycanon (تحقق مستقل من k و l)"],
  ["آلية Laplace للمتوسط المحدود، تقسيم الميزانية، دراسة الخطأ والحد U", "diffprivlib (للمقارنة)، matplotlib"],
  ["did:key و base58btc، التوقيع على JSON، الإفصاح الانتقائي مع الـ digests الوهمية، DID-Auth، ربط الحامل، nonce و audience، قائمة الإلغاء، الأدوار الثلاثة، مقارنة OAuth", "مكتبة cryptography (Ed25519، SHA-256)"],
], [6, 3]));
c.push(gap());
c.push(P("**إعادة الإنتاج** (التفاصيل في README). يحمّل الأمر الأول البيانات (11.8 MB) ويتحقق من بصمتها MD5، والبذرة 2026 تجعل نتائج الجزء A ثابتة في كل تشغيل:", { after: 30 }));
for (const cmd of ["python -m part_a.run_all", "python -m part_b.demo   |   python -m part_b.oauth_comparison",
                   "python -m pytest -q        # 26 passed"]) {
  c.push(new Paragraph({ alignment: AlignmentType.LEFT, spacing: { after: 0 }, indent: { left: 400 },
    children: [new TextRun({ text: cmd, font: "Consolas", size: 17 })] }));
}
c.push(gap());
c.push(P("**المراجع:** Sweeney, k-anonymity (2002) · Dwork & Roth, The Algorithmic Foundations of Differential Privacy (2014) · W3C Verifiable Credentials Data Model 2.0 · W3C did:key Method · IETF SD-JWT · W3C Bitstring Status List · Godahewa et al., Monash Time Series Archive (Zenodo 4656140).", { size: SMALL }));

// ------------------------------------------------------------------ document
const doc = new Document({
  creator: "TP3", title: "TP3 — Anonymization and self-sovereign identity",
  styles: {
    default: { document: { run: { font: FONT, size: BODY } } },
    paragraphStyles: [
      { id: "Heading1", name: "Heading 1", basedOn: "Normal", next: "Normal", quickFormat: true,
        run: { font: FONT, size: 26, bold: true },
        paragraph: { spacing: { before: 200, after: 80 }, keepNext: true, outlineLevel: 0 } },
      { id: "Heading2", name: "Heading 2", basedOn: "Normal", next: "Normal", quickFormat: true,
        run: { font: FONT, size: 22, bold: true },
        paragraph: { spacing: { before: 120, after: 60 }, keepNext: true, outlineLevel: 1 } },
    ],
  },
  numbering: { config: [{ reference: "bullets", levels: [{ level: 0, format: LevelFormat.BULLET,
    text: "•", alignment: AlignmentType.START,
    style: { paragraph: { indent: { start: 360, hanging: 260 } } } }] }] },
  sections: [{
    properties: { page: { margin: { top: MARGIN, bottom: MARGIN, left: MARGIN, right: MARGIN } } },
    footers: { default: new Footer({ children: [new Paragraph({ alignment: AlignmentType.CENTER,
      bidirectional: true,
      children: [new TextRun({ text: "صفحة ", rightToLeft: true, size: 16, sizeComplexScript: 16 }),
                 new TextRun({ children: [PageNumber.CURRENT], rightToLeft: true, size: 16, sizeComplexScript: 16 }),
                 new TextRun({ text: " من ", rightToLeft: true, size: 16, sizeComplexScript: 16 }),
                 new TextRun({ children: [PageNumber.TOTAL_PAGES], rightToLeft: true, size: 16, sizeComplexScript: 16 })] })] }) },
    children: c,
  }],
});
Packer.toBuffer(doc).then((buf) => { fs.writeFileSync(OUT, buf); console.log("written", OUT); });
