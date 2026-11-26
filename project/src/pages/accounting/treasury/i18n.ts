// =============================================================
// src/pages/accounting/treasury/i18n.ts
// قاموس ترجمة موحّد لصفحة الخزن والبنوك — مبني فوق دالة t(en, ar) الموجودة في LanguageContext
// (لا نظام لغة جديد). Single dictionary built on the existing t(en, ar) architecture.
// =============================================================

import { useLang } from "../../../context/LanguageContext";

export function buildTr(t: (en: string, ar: string) => string) {
  return {
    // page
    title: t("Cash & Banks", "الخزن والبنوك"),
    subtitle: t("Manage cash accounts, bank accounts, and financial transactions.", "إدارة الخزن النقدية والحسابات البنكية وحركتها المالية."),
    home: t("Home", "الرئيسية"), accounting: t("Accounting", "الحسابات"), organization: t("Organization", "المؤسسة"),
    currency: t("SAR", "ر.س"),
    // filters
    dateFrom: t("From", "من"), dateTo: t("To", "إلى"), period: t("Period", "الفترة"),
    branch: t("Branch", "الفرع"), allBranches: t("All branches", "كل الفروع"),
    accountType: t("Account type", "نوع الحساب"), allTypes: t("All types", "كل الأنواع"),
    account: t("Account", "الحساب"), allAccountsOpt: t("All accounts", "كل الحسابات"),
    txStatus: t("Status", "الحالة"), statusPosted: t("Posted", "مُرحّل"), statusDraft: t("Draft", "مسودة"), statusAll: t("All", "الكل"),
    statusReversed: t("Reversed", "معكوس"), statusReversal: t("Reversal", "قيد عكسي"),
    apply: t("Apply", "تطبيق"), reset: t("Reset", "إعادة ضبط"), refresh: t("Refresh", "تحديث"),
    // KPIs
    kpiCash: t("Total Cash Balance", "إجمالي الأرصدة النقدية"),
    kpiBank: t("Total Bank Balance", "أرصدة البنوك"),
    kpiReceipts: t("Today's Total Receipts", "إجمالي المقبوضات اليوم"),
    kpiPayments: t("Today's Total Payments", "إجمالي المدفوعات اليوم"),
    kpiNote: t("Internal transfers are excluded from receipts and payments.", "التحويلات الداخلية غير محتسبة ضمن المقبوضات والمدفوعات."),
    // actions
    receiptVoucher: t("Receipt Voucher", "سند قبض"), paymentVoucher: t("Payment Voucher", "سند صرف"),
    transfer: t("Account Transfer", "تحويل بين الخزن والبنوك"), reconciliation: t("Bank Reconciliation", "تسوية بنكية"),
    statement: t("Account Statement", "كشف حساب"), settings: t("Account Settings", "إعدادات الحساب"),
    // tabs
    tabCash: t("Cash Accounts", "الخزن النقدية"), tabBank: t("Bank Accounts", "الحسابات البنكية"), tabAll: t("All Accounts", "جميع الحسابات"),
    // account cards
    cash: t("Cash", "خزنة نقدية"), bank: t("Bank", "بنك"),
    active: t("Active", "نشط"), inactive: t("Inactive", "غير نشط"),
    balance: t("Account Balance", "رصيد الحساب"), todayReceipts: t("Today's receipts", "مقبوضات اليوم"), todayPayments: t("Today's payments", "مدفوعات اليوم"),
    transfersToday: t("Transfers today", "تحويلات اليوم"), in: t("in", "وارد"), out: t("out", "صادر"),
    notLinked: t("Not linked to a ledger account", "غير مرتبط بحساب في الدليل"),
    viewTransactions: t("View transactions", "عرض الحركات"), viewStatement: t("View statement", "كشف الحساب"),
    printStatement: t("Print statement", "طباعة كشف الحساب"), edit: t("Edit", "تعديل"), del: t("Delete", "حذف"), more: t("More", "المزيد"),
    iban: t("IBAN", "الآيبان"), bankName: t("Bank name", "اسم البنك"), accountNumber: t("Account number", "رقم الحساب"),
    noAccounts: t("No cash or bank accounts yet. Add one and link it to a chart-of-accounts account.", "لا توجد خزن أو حسابات بنكية بعد. أضف واحدة واربطها بحساب من دليل الحسابات."),
    noAccountsFiltered: t("No accounts match the current filters.", "لا توجد حسابات مطابقة للفلاتر الحالية."),
    overlapWarn: t("These accounts read the same ledger lines, so totals may double-count: ", "هذه الحسابات تقرأ نفس سطور الدفتر وقد تتكرر الأرصدة في الإجمالي: "),
    // table
    latestTx: t("Latest Financial Transactions", "آخر الحركات المالية"),
    colNo: t("#", "#"), colDate: t("Date", "التاريخ"), colDesc: t("Description", "البيان"), colAccount: t("Account", "الحساب"),
    colReceipt: t("Receipt", "قبض"), colPayment: t("Payment", "صرف"), colBalance: t("Balance", "الرصيد"),
    colRef: t("Reference", "المرجع"), colStatus: t("Status", "الحالة"), colActions: t("Actions", "إجراءات"),
    search: t("Search voucher, reference, account, party, description, amount…", "ابحث: رقم السند، المرجع، الحساب، الطرف، البيان، المبلغ…"),
    txType: t("Type", "النوع"), typeAll: t("All types", "كل الأنواع"), typeReceipts: t("Receipts", "المقبوضات"), typePayments: t("Payments", "المدفوعات"), typeTransfers: t("Transfers", "التحويلات"),
    transferIn: t("Transfer in", "تحويل وارد"), transferOut: t("Transfer out", "تحويل صادر"),
    noTx: t("No transactions in this period.", "لا توجد حركات في هذه الفترة."),
    noMatch: t("No transactions match your search.", "لا توجد حركات مطابقة للبحث."),
    rows: t("rows", "صف"), page: t("Page", "صفحة"), of: t("of", "من"), prev: t("Previous", "السابق"), next: t("Next", "التالي"),
    totals: t("Totals (filtered)", "الإجماليات (بعد الفلترة)"),
    balanceAfterNote: t("Balance after each posted movement, per account.", "الرصيد بعد كل حركة مُرحّلة لكل حساب."),
    view: t("View", "عرض"), print: t("Print", "طباعة"), exportCsv: t("Export CSV", "تصدير CSV"),
    // generic
    loading: t("Loading…", "جارٍ التحميل…"), loadError: t("Could not load data", "تعذّر تحميل البيانات"), retry: t("Retry", "إعادة المحاولة"),
    save: t("Save", "حفظ"), cancel: t("Cancel", "إلغاء"), close: t("Close", "إغلاق"), saving: t("Saving…", "جارٍ الحفظ…"), select: t("Select…", "اختر…"),
    required: t("This field is required", "هذا الحقل مطلوب"), none: t("— None —", "— بدون —"), confirm: t("Confirm", "تأكيد"),
    // voucher / transfer forms
    voucherNo: t("Voucher No.", "رقم السند"), autoNo: t("Assigned automatically on save", "يُعيَّن تلقائيًا عند الحفظ"),
    date: t("Date", "التاريخ"), cashOrBank: t("Cash / Bank account", "الخزنة / البنك"),
    partyOpt: t("Customer / Supplier (optional — sets the counter account)", "العميل/المورد (اختياري — يحدّد الحساب المقابل)"),
    counterSource: t("Counter account (source)", "الحساب المقابل (المصدر)"), counterTarget: t("Counter account (beneficiary)", "الحساب المقابل (الجهة)"),
    amount: t("Amount", "المبلغ"), payMethod: t("Payment method", "طريقة الدفع"), reference: t("Reference no.", "رقم المرجع"),
    descriptionOpt: t("Description (optional)", "البيان (اختياري)"), costCenter: t("Cost center (branch)", "مركز التكلفة (فرع)"), costDefault: t("— Default —", "— افتراضي —"),
    attachments: t("Receipt / attachment (image or PDF, optional)", "الإيصال / المرفق (صورة أو PDF، اختياري)"), attach: t("Attach file", "إرفاق ملف"),
    willUpload: t("Will upload", "سيُرفع"), fileTooBig: t("File is larger than 10 MB: ", "حجم الملف أكبر من 10 ميجابايت: "),
    journalHintReceipt: t("Entry: Dr Cash/Bank — Cr counter account", "القيد: من ح/ الخزنة إلى ح/ الحساب المقابل"),
    journalHintPayment: t("Entry: Dr counter account — Cr Cash/Bank", "القيد: من ح/ الحساب المقابل إلى ح/ الخزنة"),
    saveVoucher: t("Save & post voucher", "حفظ وترحيل السند"), voucherSaved: t("Voucher saved and posted to the ledger", "تم حفظ السند وترحيله للدفتر"),
    unlinkedAcc: t("This account is not linked to a chart-of-accounts account. Edit it and choose the ledger account first.", "هذه الخزنة غير مرتبطة بحساب في دليل الحسابات. عدّلها وحدّد الحساب أولًا."),
    partyNoAcc: t("This party has no receivable/payable account (nor does its parent).", "هذا الطرف غير مرتبط بحساب ذمة (ولا مركزه)."),
    pickAccount: t("Choose the cash/bank account", "اختر الخزنة/البنك"), pickCounter: t("Choose the counter account", "اختر الحساب المقابل"),
    amountPositive: t("Enter an amount greater than zero", "أدخل مبلغًا أكبر من الصفر"),
    uploadFailed: t("Could not upload: ", "تعذّر رفع: "), saveFailed: t("Could not save: ", "تعذّر الحفظ: "),
    methodCash: t("Cash", "نقدًا"), methodTransfer: t("Bank transfer", "تحويل بنكي"), methodCheque: t("Cheque", "شيك"), methodCard: t("Card", "بطاقة"), methodOther: t("Other", "أخرى"),
    transferNo: t("Transfer No.", "رقم التحويل"), fromAccount: t("From account", "من حساب"), toAccount: t("To account", "إلى حساب"),
    transferAmount: t("Transfer amount", "مبلغ التحويل"), sameAccount: t("Source and destination must be different", "يجب أن يختلف حساب المصدر عن الوجهة"),
    lowBalance: t("Source balance is lower than the amount — the account will go negative.", "رصيد المصدر أقل من المبلغ — سيصبح رصيد الحساب سالبًا."),
    transferSaved: t("Transfer posted. It is not counted as a receipt or payment.", "تم ترحيل التحويل. لا يُحتسب كمقبوضات أو مدفوعات."),
    transferHint: t("Entry: Dr destination — Cr source (single balanced entry)", "القيد: من ح/ الوجهة إلى ح/ المصدر (قيد واحد متوازن)"),
    available: t("Balance", "الرصيد"),
    // details
    txDetails: t("Transaction details", "تفاصيل الحركة"), txNumber: t("Transaction no.", "رقم الحركة"), txDate: t("Transaction date", "تاريخ الحركة"),
    txKind: t("Type", "النوع"), relatedParty: t("Related party", "الطرف المرتبط"), journalLines: t("Related journal entry", "القيد المحاسبي المرتبط"),
    createdAt: t("Created at", "تاريخ الإنشاء"), createdBy: t("Created by", "أنشأه"), createdByNA: t("Not recorded by the system", "غير مسجّل في النظام"),
    debit: t("Debit", "مدين"), credit: t("Credit", "دائن"), notes: t("Notes", "ملاحظات"),
    kindReceipt: t("Receipt voucher", "سند قبض"), kindPayment: t("Payment voucher", "سند صرف"), kindTransfer: t("Transfer", "تحويل"),
    kindOther: t("Journal entry", "قيد يومية"), kindSales: t("Sales", "مبيعات"), kindPurchases: t("Purchases", "مشتريات"),
    attachmentsView: t("View attachments", "عرض المرفقات"), noAttachments: t("No attachments for this entry.", "لا توجد مرفقات لهذا القيد."),
    reverse: t("Reverse (counter-entry)", "عكس القيد (قيد عكسي)"),
    reverseConfirm: t("A posted entry cannot be deleted. Post a reversing entry dated today?", "لا يمكن حذف قيد مُرحّل. هل تريد إنشاء قيد عكسي بتاريخ اليوم؟"),
    reversed: t("Reversing entry posted", "تم إنشاء القيد العكسي"),
    // statement
    statementTitle: t("Account Statement", "كشف حساب"), openingBalance: t("Opening Balance", "الرصيد الافتتاحي"), closingBalance: t("Closing Balance", "الرصيد الختامي"),
    totalReceipts: t("Total Receipts", "إجمالي المقبوضات"), totalPayments: t("Total Payments", "إجمالي المدفوعات"),
    statementNote: t("Posted entries only (drafts excluded). Reversals appear as separate lines.", "القيود المُرحّلة فقط (المسودات مستبعدة). القيود العكسية تظهر كسطور مستقلة."),
    counterAccount: t("Counter account", "الحساب المقابل"), generatedOn: t("Generated on", "تاريخ الإصدار"),
    // manage
    manageTitle: t("Cash & Bank Accounts Settings", "إعدادات الخزن والحسابات البنكية"), newAccount: t("New cash / bank account", "خزنة / بنك جديد"),
    editAccount: t("Edit cash / bank account", "تعديل خزنة / بنك"), name: t("Name", "الاسم"), kind: t("Type", "النوع"),
    openingBal: t("Opening balance", "رصيد افتتاحي"), linkedAccount: t("Linked ledger account", "الحساب المرتبط (من دليل الحسابات)"),
    noLink: t("— None (vouchers cannot be posted) —", "— بدون (لن تُرحّل سندات) —"),
    linkHint: t("Usually the cash account (1101) or the bank account (1102).", "اربطها عادةً بحساب الصندوق (1101) أو البنك (1102)."),
    nameRequired: t("Enter the account name", "أدخل اسم الخزنة/البنك"),
    deleteConfirm: t("Delete this account? Linked journal entries are not deleted.", "حذف هذه الخزنة/البنك؟ (لن تُحذف القيود المرتبطة)"),
    deleted: t("Deleted", "تم الحذف"), saved: t("Saved", "تم الحفظ"),
    openingNote: t("The opening balance is added to the posted ledger movement. Make sure it is not also posted as an opening entry.", "الرصيد الافتتاحي يُضاف إلى حركة الدفتر المُرحّلة. تأكد أنه غير مُرحّل أيضًا كقيد افتتاحي لتجنب التكرار."),
    // reconciliation
    reconTitle: t("Bank Reconciliation", "التسوية البنكية"),
    reconIntro: t("Preview only — nothing is saved and no entries are created. Upload a bank statement CSV (date, description, amount or debit/credit) to compare it with the posted ledger.", "معاينة فقط — لا يُحفظ شيء ولا تُنشأ قيود. ارفع كشف البنك بصيغة CSV (تاريخ، بيان، مبلغ أو مدين/دائن) لمقارنته بالدفتر المُرحّل."),
    stmtDate: t("Statement date", "تاريخ الكشف"), stmtFrom: t("Statement from", "الكشف من"), bankClosing: t("Bank closing balance", "رصيد البنك الختامي"),
    bankOpening: t("Bank opening balance", "رصيد البنك الافتتاحي"), uploadCsv: t("Upload bank statement (CSV)", "رفع كشف البنك (CSV)"),
    bookBalance: t("Book balance (ledger)", "رصيد الدفتر"), difference: t("Difference", "الفرق"),
    matched: t("Matched", "متطابقة"), unmatchedBank: t("In bank only", "في البنك فقط"), unmatchedBook: t("In ledger only", "في الدفتر فقط"),
    dateDiff: t("Date differs", "فرق تاريخ"), toleranceDays: t("Date tolerance (days)", "سماح التاريخ (أيام)"),
    reconNoAdjust: t("Differences are not adjusted automatically. Any adjustment needs an authorized journal entry created manually.", "لا تُسوّى الفروقات تلقائيًا. أي تعديل يحتاج قيدًا يدويًا بصلاحية مخوّلة."),
    csvParseFail: t("Could not read the CSV: need a date column and an amount (or debit/credit) column.", "تعذّرت قراءة الملف: يلزم عمود تاريخ وعمود مبلغ (أو مدين/دائن)."),
    reconStatus: t("Status", "حالة التسوية"), reconDone: t("Reconciled", "مطابقة"), reconDiff: t("Has differences", "بها فروقات"),
    chooseBankAcc: t("Choose a bank account", "اختر حساب بنكي"), bankStmtLines: t("Bank statement lines", "سطور كشف البنك"),
    selectDateRange: t("Date range", "الفترة"),
    // search dropdown
    searchPh: t("Search by name, code, number, IBAN…", "ابحث بالاسم أو الرمز أو الرقم أو الآيبان…"),
    searchParty: t("Search customer / supplier…", "ابحث باسم العميل/المورد…"),
    customer: t("Customer", "عميل"), supplier: t("Supplier", "مورد"),
    typeAsset: t("Asset", "أصول"), typeLiability: t("Liability", "خصوم"), typeEquity: t("Equity", "حقوق ملكية"), typeRevenue: t("Revenue", "إيرادات"), typeExpense: t("Expense", "مصروفات"),
    cashAccounts: t("Cash accounts", "الخزن النقدية"), bankAccounts: t("Bank accounts", "الحسابات البنكية"), ledgerAccounts: t("Ledger accounts", "حسابات الدليل"),
  };
}
export type Tr = ReturnType<typeof buildTr>;
export function useTr(): Tr { const { t } = useLang(); return buildTr(t); }
