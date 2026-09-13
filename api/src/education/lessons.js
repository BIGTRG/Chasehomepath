/**
 * Lesson content keyed by modules.content_ref. Short, phone-first, and each ends in a
 * three-question check; pass mark is 2 of 3 (Deon: "keep the training short, but make
 * sure they pass"). Education only: nothing here promises a credit or loan outcome.
 * Figures cited are the 2026 program rules also used by the readiness engine.
 */
const L = (points, quiz) => ({ points, quiz });
const Q = (q, options, answer) => ({ q, options, answer });

export const LESSONS = {
  'mod/before/how-it-works': L([
    'A mortgage is a loan secured by the home. You pay principal, interest, taxes, and insurance every month; together that is PITI.',
    'Lenders look at four things: credit, income, debts, and cash to close. Every step in your plan moves one of those four.',
    'Buying takes longer than most people expect: pre-approval, shopping, offer, inspection, underwriting, closing. Your timeline track shows the order.',
    'Nothing is placed before day 90 of your plan. That window is for the file work that makes the loan smooth later.',
  ], [
    Q('What does PITI stand for?', ['Price, Interest, Title, Insurance', 'Principal, Interest, Taxes, Insurance', 'Payment, Income, Taxes, Inspection'], 1),
    Q('Which four things do lenders weigh?', ['Credit, income, debts, cash to close', 'Age, job title, zip code, car', 'Rent history only'], 0),
    Q('When does your plan start placing you with a lender?', ['Day 1', 'Not before day 90', 'Only after 12 months'], 1),
  ]),
  'mod/before/credit-report': L([
    'Your report lists accounts, balances, payment history, and public records. Your score is a summary of that report, not a separate thing.',
    'Payment history and how much of your credit limits you use (utilization) are the two biggest score factors.',
    'You have the right to dispute anything inaccurate or incomplete directly with the bureaus; they must investigate, usually within 30 days.',
    'Accurate negative items cannot be removed by disputing. They age off over time and are outweighed by new on-time history.',
  ], [
    Q('Which two factors matter most to your score?', ['Payment history and utilization', 'Income and age', 'Number of bank accounts'], 0),
    Q('How long does a bureau usually have to investigate a dispute?', ['24 hours', 'About 30 days', 'One year'], 1),
    Q('Can an accurate late payment be removed by disputing it?', ['Yes, always', 'No; it ages off and new on-time history outweighs it', 'Only if you pay a fee'], 1),
  ]),
  'mod/before/budget': L([
    'Start with take-home pay, not gross. List every fixed bill, then the true average of variable spending from your linked bank, not a guess.',
    'Your target house payment should fit inside the budget you live today, not the budget you hope to have.',
    'Lenders cap debt-to-income: FHA typically 31% housing and 43% total, USDA 29% and 41%, conventional up to 45% and sometimes 50% with strong credit.',
    'Every dollar you free up does double duty: it lowers your debt ratio and it becomes savings.',
  ], [
    Q('Which number should a budget start from?', ['Gross pay', 'Take-home pay', 'Last year\'s tax refund'], 1),
    Q('Typical USDA debt ratios are:', ['50 / 60', '29 / 41', '10 / 15'], 1),
    Q('Freed-up money helps in two ways because it:', ['Lowers debt ratio and grows savings', 'Raises your score instantly', 'Removes collections'], 0),
  ]),
  'mod/before/down-payment': L([
    'FHA needs 3.5% down with a 580 or higher score, 10% between 500 and 579. Conventional programs start at 3%. USDA and VA can be zero down.',
    'Closing costs run roughly 2% to 5% of the price on top of the down payment. Plan for both.',
    'Gift funds from family are allowed on most programs with a letter. Undocumented cash deposits are not.',
    'Keep savings in an account you can show two months of statements for. Seasoned money is usable money.',
  ], [
    Q('FHA minimum down payment with a 600 score is:', ['3.5%', '10%', '20%'], 0),
    Q('Closing costs typically run:', ['0%', '2% to 5% of the price', 'Half the price'], 1),
    Q('Which savings can a lender count?', ['Cash under the mattress', 'Money in an account with two months of statements', 'A friend\'s promise'], 1),
  ]),
  'mod/before/assistance': L([
    'North Carolina and many cities offer down payment help, often as a second loan that is forgiven if you stay a set number of years.',
    'Most programs need a homebuyer education certificate, income under a limit, and a first-time-buyer status, defined as no ownership in the last three years.',
    'USDA has a household income limit that changes by county; for most of North Carolina it is $122,800 for a household of 1 to 4 in FY2026.',
    'Assistance stacks: a state program plus a lender program plus a seller credit can cover most of the cash to close.',
  ], [
    Q('A first-time buyer is usually defined as:', ['Never owned anything', 'No home ownership in the last three years', 'Under 30 years old'], 1),
    Q('Most assistance programs require:', ['A homebuyer education certificate', 'A 760 score', 'A 20% down payment'], 0),
    Q('Assistance programs can:', ['Never be combined', 'Stack with lender and seller credits', 'Only be used for new construction'], 1),
  ]),
  'mod/before/credit-deep-dive': L([
    'Scores weigh payment history about 35%, amounts owed about 30%, length of history 15%, new credit 10%, and mix 10%.',
    'A 30-day late payment can cost 60 to 100 points on a good score. One on-time year rebuilds most of it.',
    'Utilization is measured per card and overall. Getting each card under 30%, then under 10%, moves the score fastest.',
    'Do not close old cards; age and available limit help you. Do not open new accounts in the six months before applying.',
  ], [
    Q('The biggest score factor is:', ['Payment history', 'Number of cards', 'Your income'], 0),
    Q('Utilization targets, in order:', ['Under 30%, then under 10%', 'Over 50%', 'It does not matter'], 0),
    Q('Before applying for a mortgage you should:', ['Open new accounts to look active', 'Avoid new accounts for six months', 'Close every old card'], 1),
  ]),
  'mod/before/rebuild-580': L([
    'Below 580 the plan is the same every month: every bill on time, every card balance down, no new debt.',
    'A secured card or a credit-builder loan adds positive history when you have few open accounts.',
    'Collections: verify the debt, dispute what is wrong, and for what is accurate ask for pay-for-delete in writing or settle. FHA may ask for payment plans on open collections.',
    'Twelve months of clean history is what lenders and scoring models both respond to. That is why Steady is a twelve-month plan.',
  ], [
    Q('The monthly rule when rebuilding is:', ['Pay on time, pay down, no new debt', 'Open three cards', 'Ignore collections'], 0),
    Q('A secured card helps by:', ['Adding positive payment history', 'Erasing old late payments', 'Raising your income'], 0),
    Q('How much clean history do lenders respond to?', ['One week', 'Twelve months', 'Ten years'], 1),
  ]),
  'mod/before/debt-paydown': L([
    'Two orders work: highest interest first saves the most money; smallest balance first builds momentum. Pick one and stay on it.',
    'For your score, revolving balances (cards) matter far more than installment loans. Pay cards first when the goal is a mortgage.',
    'Never pay a collection before you confirm it is yours and the amount is right. Get every agreement in writing.',
    'Your budget track shows the payoff order and the month each account clears.',
  ], [
    Q('For a mortgage goal, pay down first:', ['Credit cards', 'Student loans', 'A car loan'], 0),
    Q('Before paying a collection you should:', ['Pay immediately by phone', 'Confirm it is yours and the amount is right, in writing', 'Ignore it'], 1),
    Q('Highest interest first vs smallest balance first:', ['Only one is allowed', 'Either works if you stay consistent', 'Neither helps'], 1),
  ]),
  'mod/before/utilization': L([
    'Utilization is your balance divided by your limit, on each card and in total. It resets every month, so it is the fastest lever you control.',
    'Cards report the statement balance, not the balance after you pay. Paying before the statement date lowers what gets reported.',
    'A limit increase you do not spend lowers utilization too. Ask only where a soft pull is used.',
    'Zero balances on every card can score slightly lower than one small balance paid on time. Aim for one card under 10%, the rest at zero.',
  ], [
    Q('Utilization is:', ['Balance divided by limit', 'Number of cards', 'Interest rate'], 0),
    Q('To lower what gets reported, pay:', ['After the due date', 'Before the statement date', 'Once a year'], 1),
    Q('The ideal pattern is:', ['Every card maxed', 'One card under 10%, the rest at zero', 'All cards closed'], 1),
  ]),
  'mod/before/saving-system': L([
    'Automate a transfer the day you are paid. Money you never see is money you keep.',
    'Name the account for its job: "House cash". Named accounts get raided less.',
    'Start with the amount your budget track shows, even if small. Consistency counts more than size for the first six months.',
    'Windfalls (tax refund, bonus) go 80% to house cash, 20% to you. That rule keeps you on the plan.',
  ], [
    Q('When should the savings transfer happen?', ['Whenever money is left over', 'The day you are paid, automatically', 'At year end'], 1),
    Q('Why name the account?', ['Banks require it', 'Named accounts get raided less', 'It raises the interest rate'], 1),
    Q('The windfall rule is:', ['Spend it all', '80% to house cash, 20% to you', 'Hold it in cash'], 1),
  ]),
  'mod/during/offer': L([
    'A pre-approval letter goes with every offer. Sellers weigh certainty as much as price.',
    'Earnest money shows you are serious, usually 1% to 3%, and is credited back at closing.',
    'Contingencies protect you: inspection, appraisal, and financing. Waiving them saves the seller risk, not you.',
    'Ask for seller-paid closing costs when the market allows; FHA permits up to 6% of the price.',
  ], [
    Q('Earnest money is:', ['A fee you lose at closing', 'A deposit credited back at closing', 'The agent\'s commission'], 1),
    Q('Contingencies protect:', ['The buyer', 'Only the seller', 'The lender only'], 0),
    Q('FHA allows seller-paid closing costs up to:', ['0%', '6% of the price', '50%'], 1),
  ]),
  'mod/during/mortgage': L([
    'Underwriting verifies what pre-approval assumed: income, assets, credit, and the property. Respond to document requests the same day.',
    'Do not change jobs, open credit, move money between accounts, or make large deposits during underwriting without telling your loan officer.',
    'The Loan Estimate comes within three business days of applying; the Closing Disclosure at least three business days before closing. Compare them line by line.',
    'Rate locks have expiration dates. Know yours and what an extension costs.',
  ], [
    Q('During underwriting you should not:', ['Answer document requests', 'Open new credit or move money unannounced', 'Read your Loan Estimate'], 1),
    Q('The Closing Disclosure arrives:', ['At the table', 'At least three business days before closing', 'A month after'], 1),
    Q('A rate lock:', ['Never expires', 'Has an expiration date', 'Is free to extend forever'], 1),
  ]),
  'mod/during/inspection': L([
    'An inspection is for you, not the lender. It covers structure, roof, electrical, plumbing, HVAC, and safety.',
    'Every house has findings. Sort them into safety, expensive, and cosmetic; negotiate the first two.',
    'Ask for repairs, a credit, or a price reduction. A credit at closing is often simplest.',
    'Attend the inspection. Two hours with the inspector is the best education you will get on that house.',
  ], [
    Q('The inspection protects:', ['The lender', 'You, the buyer', 'The seller'], 1),
    Q('Findings should be sorted into:', ['Safety, expensive, cosmetic', 'Old and new', 'Inside and outside'], 0),
    Q('Should you attend the inspection?', ['Yes', 'No, it is not allowed', 'Only if paying cash'], 0),
  ]),
  'mod/during/closing': L([
    'Bring government ID and your cash to close by wire or cashier\'s check; verify wire instructions by phone before sending.',
    'You sign the note (the promise to pay) and the deed of trust (the security). Read the numbers against your Closing Disclosure.',
    'Do a final walk-through the day before to confirm repairs and condition.',
    'Keys come after funding and recording, sometimes hours after signing. Plan the move for the next day.',
  ], [
    Q('Wire instructions should be:', ['Trusted from email', 'Verified by phone before sending', 'Ignored'], 1),
    Q('The note is:', ['Your promise to pay', 'The inspection report', 'The listing'], 0),
    Q('Keys are handed over after:', ['Signing only', 'Funding and recording', 'The first mortgage payment'], 1),
  ]),
  'mod/after/first-90-days': L([
    'Confirm your first payment date and where to pay; servicing often transfers in the first months. Watch for the transfer notice.',
    'Set up autopay and a maintenance fund of about 1% of the home value per year.',
    'Change locks, test smoke and CO detectors, find the water shutoff and breaker panel.',
    'File your homestead or property tax exemption where offered; deadlines vary by county.',
  ], [
    Q('Servicing transfers mean:', ['Your loan is cancelled', 'Where you pay may change; watch for the notice', 'Your rate changes'], 1),
    Q('A maintenance fund target is about:', ['1% of home value per year', '25% of income', 'Nothing'], 0),
    Q('First-week safety tasks include:', ['Changing locks and testing detectors', 'Repainting everything', 'Refinancing'], 0),
  ]),
  'mod/after/escrow-taxes': L([
    'Escrow collects taxes and insurance monthly and pays them for you. Once a year the servicer re-analyzes and your payment may change.',
    'A shortage means taxes or insurance rose; you can pay it in a lump or spread it over 12 months.',
    'Shop homeowners insurance every renewal. Premiums vary widely for the same house.',
    'Property tax reassessments can be appealed; the notice states the deadline.',
  ], [
    Q('Escrow pays:', ['Your credit cards', 'Property taxes and insurance', 'Utilities'], 1),
    Q('An escrow shortage can be:', ['Ignored', 'Paid in a lump or spread over 12 months', 'Refunded'], 1),
    Q('Insurance should be shopped:', ['Never', 'Every renewal', 'Only at purchase'], 1),
  ]),
  'mod/after/maintenance': L([
    'Change HVAC filters every 1 to 3 months and service the system yearly. It is the most expensive thing to neglect.',
    'Clean gutters twice a year and check that downspouts carry water away from the foundation.',
    'Test the sump pump, water heater relief valve, and GFCI outlets twice a year.',
    'Keep a home file: warranties, receipts, paint colors, and the inspection report.',
  ], [
    Q('HVAC filters should change every:', ['1 to 3 months', '5 years', 'Never'], 0),
    Q('Gutters matter because they:', ['Look nice', 'Carry water away from the foundation', 'Raise your score'], 1),
    Q('A home file should hold:', ['Warranties, receipts, inspection report', 'Only photos', 'Nothing'], 0),
  ]),
  'mod/after/refinance': L([
    'A refinance replaces your loan. It makes sense when the monthly savings repay the closing costs within the time you will stay.',
    'FHA borrowers often refinance to conventional once they reach 20% equity to drop mortgage insurance.',
    'Cash-out refinancing raises your balance and often your rate; treat it as new debt, not free money.',
    'Break-even months = closing costs divided by monthly savings. Under 36 is usually worth a look.',
  ], [
    Q('A refinance makes sense when:', ['Rates rise', 'Savings repay the costs within your stay', 'A friend did it'], 1),
    Q('FHA borrowers often refinance to conventional to:', ['Drop mortgage insurance at 20% equity', 'Get a longer term only', 'Skip payments'], 0),
    Q('Break-even months equals:', ['Closing costs / monthly savings', 'Rate x balance', 'Years owned'], 0),
  ]),
};

export const PASS_MARK = 2;

export function lessonFor(contentRef) {
  return LESSONS[contentRef] ?? null;
}

/** Score answers (array of option indexes). Never returns the answer key. */
export function grade(contentRef, answers) {
  const lesson = lessonFor(contentRef);
  if (!lesson) return { score: 0, total: 0, passed: false };
  const total = lesson.quiz.length;
  const score = lesson.quiz.reduce((n, q, i) => n + (Number(answers?.[i]) === q.answer ? 1 : 0), 0);
  return { score, total, passed: score >= PASS_MARK };
}

/** Public shape: points + questions without the answer key. */
export function publicLesson(contentRef) {
  const lesson = lessonFor(contentRef);
  if (!lesson) return null;
  return { points: lesson.points, quiz: lesson.quiz.map((q) => ({ q: q.q, options: q.options })), passMark: PASS_MARK };
}
