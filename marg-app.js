

const SUPABASE_URL = 'https://kduqtrumhveteyjkyltf.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtkdXF0cnVtaHZldGV5amt5bHRmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkxNjc0MzMsImV4cCI6MjA5NDc0MzQzM30.iUmZLf_GaeTyv2xD0VYY7sYEiTgavQVbITmc-KC6ZPo';
const WORKER_URL = 'https://marg.singhalgarv215.workers.dev/';
const LOGO_ICON = 'https://raw.githubusercontent.com/singhalgarv215-prog/MARG-2/main/logo-icon.png';
let SUPABASE_TOKEN = null;

async function sbFetch(path, method, body) {
  const headers = { 'Content-Type': 'application/json', 'apikey': SUPABASE_ANON_KEY, 'Prefer': 'return=minimal' };
  if (SUPABASE_TOKEN) headers['Authorization'] = 'Bearer ' + SUPABASE_TOKEN;
  const opts = { method: method || 'GET', headers };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(SUPABASE_URL + '/rest/v1/' + path, opts);
  if (method === 'POST' || method === 'PATCH') return { ok: res.ok, status: res.status };
  if (!res.ok) return { data: null, error: res.status };
  const data = await res.json();
  return { data, error: null };
}

const CAT_QUOTES = [
  { quote: "The CAT is not a test of intelligence. It is a test of preparation.", author: "— Every IIM topper ever" },
  { quote: "You don't rise to the level of your goals. You fall to the level of your systems.", author: "— James Clear" },
  { quote: "Consistency is the bridge between who you are and who you want to be.", author: "— For every CAT aspirant" },
  { quote: "Hard work beats talent when talent doesn't work hard.", author: "— Tim Notke" },
  { quote: "CAT is a marathon, not a sprint. Pace yourself.", author: "— Marg" },
  { quote: "Your mock score today is not your CAT score tomorrow.", author: "— Marg" },
  { quote: "Every expert was once a beginner who refused to quit.", author: "— Marg" },
  { quote: "Think clearer. Move better.", author: "— Marg" }
];

const SYSTEM_PROMPT = `RESPONSE FORMAT — READ THIS FIRST AND NEVER BREAK IT:
Write like a person texting a friend. No bold, no bullet points, no headers, no horizontal lines, no numbered lists. Plain conversational sentences only. Exception: step-by-step math/logic solutions only. If you catch yourself writing ** or - or a header — delete it and rewrite as a sentence.

NEVER open with sycophantic words like Excellent, Great, Perfect, Good job, Awesome, Amazing, That's right, Well done. Evaluate first then respond. If correct say simply: "yes that's right." If wrong say directly: "not quite" or "actually that's off." No fake enthusiasm before checking.

NEVER ask a student if they want to stop, rest, switch topics, or take a break unless they explicitly say they are tired. If they are working keep working with them. Never offer an exit they did not ask for.

SECTION SWITCHING — CRITICAL:
When a student says they want to switch to DILR, QA, RC, or VA — switch immediately. No mention of previous section, no mention of time spent, no tiredness assumption. Ask ONE question about the new section and give them dropdown options of the most common problems people face in that section.

For DILR switch, ask: "where are you with DILR right now?" then signal:
[OPTIONS: I cant crack the setup|I run out of time|I stay too long on hard sets|I make calculation errors|I want to practice a set right now]
[CONTEXT: dilr_switch]

For QA switch, ask: "what area of QA do you want to work on?" then signal:
[OPTIONS: Arithmetic — percentages ratios TSD|Algebra — equations functions|Geometry — triangles circles|Number system|P&C and Probability|I want to practice questions right now]
[CONTEXT: qa_switch]

For VARC switch, ask: "RC or VA?" then signal:
[OPTIONS: RC — I want to work through a passage|VA — para jumbles and odd sentences|Both — I need a mixed session]
[CONTEXT: varc_switch]

When student picks "I want to practice right now" — say "go to the Practice tab and come back after, I'll be here" and stop there. When student picks a specific problem — help them with it directly.

NEVER lock a student into one section. Follow the student, not your own agenda.

NEVER assume tiredness based on time spent. 80 minutes of RC does not mean they are tired. 3 hours of study does not mean they need a break. Only the student knows if they are tired. If they keep asking questions they are not tired — keep helping.

You are Marg — a personal AI mentor for CAT aspirants. Not a chatbot, not a question bank, not a coaching platform. A mentor that learns how each student's brain makes mistakes specifically, and builds a preparation journey that evolves every day. The longer a student uses Marg, the better you understand how THEIR brain makes mistakes — not CAT aspirants in general, but this specific person.

CRITICAL RULES — NEVER BREAK:
Never tell a student to stop studying, close books, or sleep. Never assume the time of day — you have zero access to their clock. Never say "it's 11pm" or "go sleep." Help with whatever they ask, don't redirect. You're a mentor not a parent.

When a student pastes a paragraph or question — help immediately. Give the analysis first, ask for their thoughts after, never before. When they say they want to do something new — move on immediately, stop referencing old topics.

Answer first, then ask. Never gate help behind a diagnostic question. Give what they asked for, then if needed ask one follow-up after.

One pushback maximum. If you disagree with what they want (like a timetable) — say your concern once in one sentence, then give them what they asked. Never refuse more than once.

Never say "this is the same pattern again" or "you keep doing this." Observe patterns internally, adjust your approach quietly, never lecture about it.

After generating any content (RC passage, DILR set, QA question) — always follow up. Ask "want to work through this?" Don't drop content and go silent.

Never ask the same diagnostic question twice in a conversation. Never ask more than 2 questions before giving concrete help.

Today is 2026. CAT 2026 is November 29 2026. A 2nd year student graduates in 2027 or 2028. Never give wrong year info.

Use the student profile immediately — weakest section, attempt number, mock percentile, daily hours. Don't start from zero when you have their data.

When a student returns — reference what they were working on last time first. "Welcome back — last time we were on X, did you do the task?" Not "what do you want to work on?"

Complete every response. Never cut off mid-sentence. Shorter and complete beats longer and truncated.

Mention the Practice tab naturally once when working on RC/DILR/QA. Example: "by the way your daily practice tab is already targeting this pattern." Then move on.

PERSONALITY:
Talk like a smart senior friend — casual, direct, warm but not over-the-top. Short responses by default — 2-4 sentences unless they ask for detail. No over-empathizing, no motivational speeches unless they're clearly struggling emotionally. Hindi words when natural — yaar, bilkul, dekho. Match their energy.

WHAT YOU KNOW ABOUT THEM:
Attempt number, weakest section, daily hours, situation, last task, last insight, mock history, VARC/DILR/QA cognitive patterns. Reference the cognitive patterns actively — "you tend to fall for extreme language in RC, let's specifically avoid that today."

COGNITIVE PATTERNS TO TRACK:
VARC: rushes inference, falls for extreme language (always/never/only), answers from memory not passage, second-guesses first instinct, can't distinguish what author says vs implies.
DILR: stays too long on sets, poor set selection, misreads constraints, correct logic but calculation error, can't start solving despite understanding.
QA: arithmetic mistake in final step, too slow on geometry, concept gap vs execution lag vs careless mistake (identify which), attempts low-confidence questions.

When you spot a pattern — name it once clearly: "I'm noticing you consistently pick extreme language options in RC. That's a specific CAT trap. Let's fix that."

DAILY PRACTICE:
Connect today's practice to yesterday's mistakes. Ask what went wrong yesterday, identify the cognitive pattern, give practice targeting that pattern specifically. Never random practice.

For RC practice: generate 300-450 word passage on philosophy/economics/science/social issues/environment/psychology. Dense and argument-driven. 3-4 questions on primary purpose, author's attitude, inference, specific detail. After they answer — reveal answers, explain why each wrong option is a trap, name their cognitive pattern error.

For DILR practice: generate a set combining 2-3 constraint types (arrangements+conditions, scheduling+grouping+ranking, matrix+inequality). After attempt — identify: misread structure, time problem, or calculation error?

For QA practice: generate questions combining 2-3 topics (percentages+TSD, ratios+profit-loss, geometry+mensuration). After attempt — identify: concept gap, execution lag, or careless mistake?

Difficulty: if accuracy >70% increase next time, <40% go back to basics, 40-70% same level different combination.

EXPLANATION FORMAT FOR EVERY QUESTION:
Shortcut — one line, fastest approach.
Solution — 2-3 steps maximum with final answer and time taken.
Why wrong options fail — one line per option.
Marg noticed — one line about what this reveals about their thinking.

For RC always name the trap type: extreme language, out of scope, reversal, or memory trap. For QA give the shortcut formula first. For DILR give the setup approach first.

RC ANSWER INTEGRITY: Never confidently declare you were wrong and switch to a different answer — you might just be replacing one mistake with another. Instead say "let me think through this more carefully" and show your reasoning step by step. On complex inference questions — be honest about difficulty rather than confidently wrong. Never say "I was completely wrong." Show your thinking transparently so the student can judge for themselves.

DIAGNOSIS BEFORE ADVICE:
When someone shares a problem — ask one specific diagnostic question before advising.
VARC: "Did you misread the passage or did the options confuse you despite understanding it?"
DILR: "Did you stay too long on one set or were you slow across all sets?"
QA: "After seeing the solution can you identify your mistake, or even the solution feels unclear?"
Mock analysis: "Walk me through the last 10 minutes of your mock."

THE 4 PATTERNS:
Pattern 1 — Overwhelmed Starter: first attempt, percentile <70, all sections weak. Hypothesis: "You're trying to improve everything simultaneously which means nothing improves. Am I reading that right?"
Pattern 2 — VARC Over-Attempter: VARC weak, percentile 75-90, non-engineer. Hypothesis: "It might not be a reading problem — you could be attempting too many questions at low accuracy. Am I reading that right?"
Pattern 3 — DILR Time Trap: DILR weak, understands concepts, runs out of time. Hypothesis: "It feels like you're spending too long on sets you should leave. Am I reading that right?"
Pattern 4 — Inconsistent Grinder: 2nd/3rd attempt, percentile not moving. Hypothesis: "Each session ends without one specific next action, so momentum dies. Am I reading that right?"

MOCK ANALYSIS:
VARC: above 35 strong, 25-35 average, below 25 weak. DILR: above 30 strong, 20-30 average, below 20 weak. QA: above 30 strong, 20-30 average, below 20 weak.
Three buckets: concept gap → study that topic. Execution lag → timed drills. Careless mistake → checkpoint before submitting.
Format: "Okay — [specific observation]. This tells me [hypothesis]. Am I reading that right?" Then one specific fix + one specific task.

SUNDAY WEEKLY MENTOR:
After mock — answer four things: why did score change from last week, what's improving specifically, what's getting worse specifically, one thing to fix next week. Give honest trajectory: "At this pace you're on track for X percentile by November. Here's what needs to change."

SESSION ENDING:
Only give a tomorrow task when the student signals they're done (bye, thanks, goodnight). ONE specific task — not "practice RC" but "RC99 passage 12 tomorrow, timed, come back and tell me your accuracy." Never push away mid-session.

WHEN THEY COME BACK:
"Welcome back — last time I gave you one task: [task]. What happened?" Build from there. Every session continues the previous one.

RESOURCES:
When a student wants to practice — always mention BOTH Marg's Practice tab AND an external resource. Give them the choice. Example: "you can try today's RC in the Practice tab — it's already targeting your specific pattern. Or if you want more passages, RC99 PDF on Telegram has 99 CAT-level passages." Never mention only external resources without mentioning the Practice tab too.

Practice tab — for daily RC, DILR and QA targeted to their cognitive pattern.
QA external: Arun Sharma LOD 1 then LOD 2, MBA Pathshala YouTube.
DILR external: Rodha YouTube, CAT PYQs 2017-2024 Oswaal.
VARC external: RC99 PDF on Telegram, Aeon.co essays, Hindu editorials.
Mocks: SimCAT or AIMCAT.

For 2nd/3rd attempt: always ask what specifically failed last time before giving advice.

PRACTICE TAB AWARENESS:
Students practice RC, DILR and QA in the Practice tab. When they come back to chat after practicing:
- If they clicked the session complete button — you already have their results. Use them immediately.
- If they paste a question or describe what happened — help them understand exactly where they went wrong.
- If they say "I just did a DILR set and got confused on Q3" — ask them to paste the question or describe the setup and help them solve it step by step.
- Never say "I don't have access to your practice session." Just work with whatever they share.
- When a student seems stuck after practice — suggest they paste the specific question into chat and you will walk through it together.`;

let currentUser = null;
let studentProfile = { attemptNumber: null, monthsLeft: null, weakestSection: null, dailyHours: null, situation: null };
let conversationHistory = [];
let onboardingStep = 0;
let onboardingComplete = false;
let isLoading = false;

const onboardingFlow = [
  { message: "Namaste! 🙏 I'm Marg — your personal CAT mentor.\n\nBefore I give you advice that actually fits your situation, I need to understand you first. Generic CAT tips are everywhere — I want to give you something specific to you.\n\nLet's start: is this your first attempt at CAT, or have you been here before?", key: 'attemptNumber', options: ['1st attempt', '2nd attempt', '3rd attempt or more'], followUp: { '2nd attempt': "Respect for coming back. Second attempt takes real courage — most people give up. I want to make sure this time is different for you.", '3rd attempt or more': "That persistence is rare. Seriously. Let's make sure we understand exactly what hasn't been working, so this attempt is genuinely different." } },

  { message: "Which section gives you the most trouble right now?", key: 'weakestSection', options: ['VARC (Reading & Verbal)', 'DILR (Data & Logic)', 'QA (Quant)', 'All equally weak 😅'] },
  { message: "Realistically, how many hours can you study every day?", key: 'dailyHours', options: ['1-2 hours', '3-4 hours', '5-6 hours', '7+ hours'] },
  { message: "And your current situation — this helps me understand your constraints:", key: 'situation', options: ['Final year college student', 'Working professional', 'Dropped everything for CAT prep', 'Preparing alongside other exams'] }
];

function showRandomQuote() {
  const q = CAT_QUOTES[Math.floor(Math.random() * CAT_QUOTES.length)];
  document.getElementById('loading-quote').textContent = '"' + q.quote + '"';
  document.getElementById('loading-author').textContent = q.author;
}

function showLegalPage(id) {
  document.querySelectorAll('.legal-section').forEach(function(s) { s.classList.remove('active'); });
  document.querySelectorAll('.hero, .pain-section, .how-section, .testimonial-section, .final-cta-section').forEach(function(s) { s.style.display = 'none'; });
  document.getElementById(id).classList.add('active');
  window.scrollTo(0, 0);
}

function showLandingMain() {
  document.querySelectorAll('.legal-section').forEach(function(s) { s.classList.remove('active'); });
  document.querySelectorAll('.hero, .pain-section, .how-section, .testimonial-section, .final-cta-section').forEach(function(s) { s.style.display = ''; });
  window.scrollTo(0, 0);
}

function startLogin() {
  const redirectTo = encodeURIComponent(window.location.href);
  window.location.href = SUPABASE_URL + '/auth/v1/authorize?provider=google&redirect_to=' + redirectTo;
}

async function logout() {
  if (SUPABASE_TOKEN) {
    await fetch(SUPABASE_URL + '/auth/v1/logout', { method: 'POST', headers: { 'apikey': SUPABASE_ANON_KEY, 'Authorization': 'Bearer ' + SUPABASE_TOKEN } });
  }
  localStorage.removeItem('marg_token');
  localStorage.removeItem('marg_user');
  location.href = window.location.origin;
}

async function saveChatMessage(role, msgContent) {
  if (!currentUser || !SUPABASE_TOKEN) return;
  try {
    const result = await sbFetch('chats', 'POST', { 
      user_id: currentUser.id, 
      role: role, 
      content: msgContent
    });
    if (!result.ok) console.error('Chat save failed:', result.status);
  } catch(e) { console.error('Chat save error:', e); }
}


async function saveUserEmail(email) {
  if (!currentUser || !SUPABASE_TOKEN) return;
  try {
    const headers = {
      'Content-Type': 'application/json',
      'apikey': SUPABASE_ANON_KEY,
      'Authorization': 'Bearer ' + SUPABASE_TOKEN,
      'Prefer': 'resolution=merge-duplicates'
    };
    await fetch(SUPABASE_URL + '/rest/v1/profiles', {
      method: 'POST',
      headers,
      body: JSON.stringify({ 
        user_id: currentUser.id, 
        notification_email: email,
        email_notifications: true
      })
    });
    console.log('Email saved for notifications');
  } catch(e) { console.error('saveUserEmail error:', e); }
}

async function saveProfile() {
  if (!currentUser || !SUPABASE_TOKEN) return;
  try {
    const headers = { 'Content-Type': 'application/json', 'apikey': SUPABASE_ANON_KEY, 'Authorization': 'Bearer ' + SUPABASE_TOKEN, 'Prefer': 'resolution=merge-duplicates' };
    await fetch(SUPABASE_URL + '/rest/v1/profiles', { method: 'POST', headers, body: JSON.stringify({ user_id: currentUser.id, attempt_number: studentProfile.attemptNumber, months_left: studentProfile.monthsLeft, weakest_section: studentProfile.weakestSection, daily_hours: studentProfile.dailyHours, situation: studentProfile.situation }) });
  } catch(e) {}
}

async function loadUserData() {
  if (!currentUser || !SUPABASE_TOKEN) return false;
  try {
    const { data: profiles } = await sbFetch('profiles?select=*&user_id=eq.' + currentUser.id, 'GET');
    if (!profiles || profiles.length === 0) return false;
    const profile = profiles[0];
    
    // Check if onboarding was actually completed - need attempt_number to be set
    if (!profile.attempt_number || !profile.weakest_section) return false;
    
    studentProfile = { 
      attemptNumber: profile.attempt_number, 
      monthsLeft: profile.months_left, 
      weakestSection: profile.weakest_section, 
      dailyHours: profile.daily_hours, 
      situation: profile.situation,
      varcPattern: profile.varc_cognitive_pattern || null,
      dilrPattern: profile.dilr_cognitive_pattern || null,
      qaPattern: profile.qa_cognitive_pattern || null,
      mockHistory: profile.mock_history || null,
      sessionsCount: profile.sessions_count || 0,
      lastTask: profile.last_task || null,
      lastInsight: profile.last_insight || null,
      lastSessionDate: profile.last_session_date || null,
      sessionSummary: profile.session_summary || null
    };
    const { data: chats } = await sbFetch('chats?select=*&user_id=eq.' + currentUser.id + '&order=created_at.asc', 'GET');
    if (chats && chats.length > 0) {
      conversationHistory = chats.map(function(c) { return { role: c.role, content: c.content }; });
    }
    return true;
  } catch(e) { return false; }
}

function updateUserUI(user) {
  const name = user.user_metadata && user.user_metadata.full_name ? user.user_metadata.full_name.split(' ')[0] : 'there';
  const avatarUrl = user.user_metadata && user.user_metadata.avatar_url ? user.user_metadata.avatar_url : null;
  document.getElementById('user-name').textContent = name;
  const headerAvatar = document.getElementById('user-avatar');
  const welcomeAvatar = document.getElementById('welcome-avatar');
  if (avatarUrl) {
    headerAvatar.innerHTML = '<img src="' + avatarUrl + '" alt="avatar">';
    welcomeAvatar.innerHTML = '<img src="' + avatarUrl + '" alt="avatar">';
  } else {
    headerAvatar.textContent = name[0].toUpperCase();
    welcomeAvatar.textContent = name[0].toUpperCase();
  }
  document.getElementById('welcome-name').textContent = 'Hey ' + name + ' 👋';
}

function showWelcome(callback) {
  document.getElementById('loading-screen').style.display = 'none';
  // Don't hide landing page yet - wait for new/returning check
  // Check if URL says to open practice tab directly
  const urlParams = new URLSearchParams(window.location.search);
  if (urlParams.get('tab') === 'practice') {
    setTimeout(() => switchTab('practice'), 500);
  }
  
  // Check for pending practice attempt
  const pendingAttempt = localStorage.getItem('marg_pending_attempt');
  if (pendingAttempt) {
    try { window._pendingAttempt = JSON.parse(pendingAttempt); localStorage.removeItem('marg_pending_attempt'); } catch(e) {}
  }
  
  const askQuestion = localStorage.getItem('marg_ask_question');
  if (askQuestion) {
    window._askMargQuestion = askQuestion;
    localStorage.removeItem('marg_ask_question');
  }
  
  const overlay = document.getElementById('welcome-overlay');
  overlay.style.display = 'flex';
  setTimeout(function() {
    overlay.style.opacity = '0';
    overlay.style.transition = 'opacity 0.4s ease';
    setTimeout(function() {
      overlay.style.display = 'none';
      document.getElementById('chat-app').style.display = 'flex';
      if (callback) callback();
    }, 400);
  }, 2500);
}

function showLanding() {
  document.getElementById('loading-screen').style.display = 'none';
  document.getElementById('landing-page').style.display = 'flex';
}

function addMessage(role, html, showAvatar) {
  if (showAvatar === undefined) showAvatar = true;
  const container = document.getElementById('messages');
  const wrap = document.createElement('div');
  wrap.className = 'msg-wrap ' + role + ' fade-in';
  if (role === 'marg' && showAvatar) {
    wrap.innerHTML = '<div class="avatar"><img src="' + LOGO_ICON + '" alt="M"></div><div class="bubble">' + html + '</div>';
  } else if (role === 'user') {
    wrap.innerHTML = '<div class="bubble">' + html + '</div>';
  } else {
    wrap.innerHTML = '<div class="bubble">' + html + '</div>';
    wrap.style.marginLeft = '38px';
  }
  container.appendChild(wrap);
  container.scrollTop = container.scrollHeight;
  return wrap;
}

function addOnboardingCard(step) {
  const container = document.getElementById('messages');
  const card = document.createElement('div');
  card.style.marginLeft = '38px'; card.className = 'fade-in'; card.id = 'onboard-' + step;
  const opts = onboardingFlow[step].options.map(function(o) { return '<button class="opt-btn" onclick="selectOption(\'' + o.replace(/'/g, "\\'") + '\', ' + step + ')">' + o + '</button>'; }).join('');
  card.innerHTML = '<div class="onboard-card"><div class="options-grid">' + opts + '</div></div>';
  container.appendChild(card);
  container.scrollTop = container.scrollHeight;
}

function selectOption(value, step) {
  const card = document.getElementById('onboard-' + step);
  if (card) { card.querySelectorAll('.opt-btn').forEach(function(b) { b.disabled = true; b.style.opacity = b.textContent === value ? '1' : '0.3'; if (b.textContent === value) b.classList.add('selected'); }); }
  studentProfile[onboardingFlow[step].key] = value;
  addMessage('user', value);
  const followUp = onboardingFlow[step].followUp;
  if (followUp && followUp[value]) { setTimeout(function() { addMessage('marg', followUp[value]); proceedOnboarding(step); }, 600); }
  else { proceedOnboarding(step); }
}

function proceedOnboarding(step) {
  const nextStep = step + 1;
  if (nextStep < onboardingFlow.length) { setTimeout(function() { onboardingStep = nextStep; addMessage('marg', onboardingFlow[nextStep].message); addOnboardingCard(nextStep); }, 800); }
  else { setTimeout(finishOnboarding, 800); }
}

async function finishOnboarding() {
  onboardingComplete = true;
  await saveProfile();
  showBottomNav();
  showPathChoiceScreen();
}

function showPathChoiceScreen() {
  // If user came from a daily practice page - skip choice, start with attempt context
  if (window._askMargQuestion) {
    var question = window._askMargQuestion;
    window._askMargQuestion = null;
    setTimeout(async function() {
      addMessage('user', question);
      conversationHistory.push({ role: 'user', content: question });
      if (!isGuestMode) saveChatMessage('user', question);
      showTyping();
      try {
        var res = await fetch(WORKER_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: 'claude-haiku-4-5-20251001',
            max_tokens: 1500,
            system: SYSTEM_PROMPT + profileContext,
            messages: conversationHistory
          })
        });
        var data = await res.json();
        var reply = data.content && data.content[0] ? data.content[0].text : null;
        hideTyping();
        if (reply) {
          var cleanReply = reply.replace(/\[OPTIONS:[^\]]*\]/g, '').replace(/\[CONTEXT:[^\]]*\]/g, '').replace(/\*\*(.*?)\*\*/g, '$1').replace(/\*(.*?)\*/g, '$1').replace(/^#{1,3}\s+/gm, '').replace(/^[-•*]\s+/gm, '').replace(/---+/g, '').trim();
          addMessage('marg', cleanReply.replace(/\n\n/g, '<br><br>').replace(/\n/g, '<br>'));
          conversationHistory.push({ role: 'assistant', content: reply });
          if (!isGuestMode) saveChatMessage('assistant', cleanReply);
        }
      } catch(e) { hideTyping(); }
    }, 800);
    return;
  }

  if (window._pendingAttempt) {
    startFromAttemptContext(window._pendingAttempt);
    window._pendingAttempt = null;
    return;
  }
  
  const messages = document.getElementById('messages');
  const choiceHtml = '<div style="margin:8px 0;display:flex;flex-direction:column;gap:8px;"><button onclick="choosePathDiscuss()" style="background:var(--surface2);border:1.5px solid var(--border2);border-radius:12px;padding:14px 16px;font-family:DM Sans,sans-serif;font-size:14px;color:var(--text);cursor:pointer;text-align:left;transition:border-color 0.2s;">💬 Discuss my strategy with Marg</button><button onclick="choosePathPractice()" style="background:var(--surface2);border:1.5px solid var(--border2);border-radius:12px;padding:14px 16px;font-family:DM Sans,sans-serif;font-size:14px;color:var(--text);cursor:pointer;text-align:left;transition:border-color 0.2s;">📝 Start with today\'s practice</button></div>';
  messages.innerHTML += choiceHtml;
  messages.scrollTop = messages.scrollHeight;
}

async function startFromAttemptContext(attempt) {
  // Save attempt to Supabase
  await savePracticeAttempt(attempt);
  
  // Enable chat
  document.getElementById('user-input').disabled = false;
  document.getElementById('send-btn').disabled = false;
  
  // Build context message for Marg
  var contextMsg = '';
  if (attempt.type === 'rc') {
    contextMsg = 'I just attempted today\'s RC on Marg\'s daily practice page. I ' + (attempt.correct ? 'got it right' : 'got it wrong — I picked option ' + attempt.selectedOption) + '. The question was about: ' + attempt.topic + '. The trap type was: ' + (attempt.trapType || 'not identified') + '. Based on this, can you start my preparation with a quick analysis of what this tells you about my VARC approach?';
  } else if (attempt.type === 'dilr') {
    contextMsg = 'I just attempted a DILR set on Marg\'s daily practice page. I ' + (attempt.correct ? 'got it right' : 'got it wrong') + '. The set type was: ' + attempt.setType + '. Based on this, can you start my preparation with what this tells you about my DILR approach?';
  } else if (attempt.type === 'qa') {
    contextMsg = 'I just attempted a QA question on Marg\'s daily practice page. I ' + (attempt.correct ? 'got it right' : 'got it wrong') + '. Topics: ' + attempt.topics + '. Common mistake: ' + (attempt.commonMistake || 'not identified') + '. Based on this, can you start my preparation with what this tells you about my QA approach?';
  }
  
  // Add to conversation history
  conversationHistory.push({ role: 'user', content: contextMsg });
  showTyping();
  
  try {
    var res = await fetch(WORKER_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 400,
        system: SYSTEM_PROMPT + '\n\nIMPORTANT: This user just signed up after attempting a practice question on the daily practice page. Start by acknowledging what their attempt reveals about their thinking pattern. Then after 2-3 exchanges, naturally ask them to complete their profile setup saying something like "To make tomorrow\'s practice even more targeted — tell me quickly: is this your first CAT attempt or have you given it before?"',
        messages: conversationHistory
      })
    });
    var data = await res.json();
    var response = data.content && data.content[0] ? data.content[0].text : null;
    hideTyping();
    if (response) {
      addMessage('marg', response);
      conversationHistory.push({ role: 'assistant', content: response });
    }
  } catch(e) {
    hideTyping();
    addMessage('marg', 'Hey! I saw you just attempted today\'s practice. Tell me — was that question type familiar or did the approach feel new?');
  }
}

async function savePracticeAttempt(attempt) {
  if (!currentUser || !SUPABASE_TOKEN) return;
  try {
    // Save to varc/dilr/qa cognitive pattern based on attempt
    if (!attempt.correct && attempt.trapType) {
      var col = attempt.type === 'rc' ? 'varc_cognitive_pattern' : 
                attempt.type === 'dilr' ? 'dilr_cognitive_pattern' : 'qa_cognitive_pattern';
      var updates = { user_id: currentUser.id };
      updates[col] = attempt.trapType;
      await fetch(SUPABASE_URL + '/rest/v1/profiles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'apikey': SUPABASE_ANON_KEY, 'Authorization': 'Bearer ' + SUPABASE_TOKEN, 'Prefer': 'resolution=merge-duplicates' },
        body: JSON.stringify(updates)
      });
    }
  } catch(e) { console.error('savePracticeAttempt error:', e); }
}

function showWelcomeMarg() {
  // Skip welcome overlay - go straight to conversational onboarding in chat
  startConversationalOnboarding();
  checkAndShowTour();
}

function showPreviewScreen() {
  var welcome = document.getElementById('welcome-marg-overlay');
  if (welcome) welcome.style.display = 'none';
  var preview = document.getElementById('preview-overlay');
  if (preview) preview.style.display = 'flex';
}

function startConversationalOnboarding() {
  // Enable input
  document.getElementById('user-input').disabled = false;
  document.getElementById('send-btn').disabled = false;
  onboardingComplete = false; // still in onboarding mode
  
  // Show chat app and bottom nav immediately
  document.getElementById('chat-app').style.display = 'flex';
  showBottomNav();
  
  // Marg opens with first message + options
  setTimeout(function() {
    addMessage('marg', "Hi, I'm Marg — your personal CAT mentor. What's bothering you most about your prep right now?");
    showConversationalOptions([
      "My scores aren't improving despite studying",
      "I'm weak in a specific section",
      "I don't know where to start",
      "Time management in the exam",
      "I want to analyse my recent mock"
    ], 'opening');
  }, 600);
}

// Track what we've collected conversationally
var conversationalProfile = {
  openingChoice: null,
  weakSection: null,
  subWeakness: null,
  mockRange: null,
  attempt: null,
  hours: null,
  situation: null,
  email: null
};

function showConversationalOptions(options, context) {
  var chipsDiv = document.createElement('div');
  chipsDiv.id = 'conv-options-' + context;
  chipsDiv.style.cssText = 'display:flex;flex-direction:column;gap:8px;padding:4px 0 4px 38px;max-width:100%;width:100%;';
  
  options.forEach(function(opt) {
    var btn = document.createElement('button');
    btn.textContent = opt;
    btn.style.cssText = [
      'background:#161616',
      'border:1.5px solid rgba(255,255,255,0.1)',
      'border-radius:12px',
      'padding:13px 16px',
      'font-family:DM Sans,sans-serif',
      'font-size:14px',
      'color:#C8C4BC',
      'cursor:pointer',
      'transition:all 0.18s ease',
      'text-align:left',
      'width:100%',
      'max-width:460px',
      'line-height:1.4'
    ].join(';');
    btn.onmouseover = function() {
      this.style.borderColor = '#C9A84C';
      this.style.color = '#F0EDE6';
      this.style.background = 'rgba(201,168,76,0.06)';
    };
    btn.onmouseout = function() {
      if (!this.classList.contains('selected')) {
        this.style.borderColor = '#2A2A2A';
        this.style.color = '#C8C4BC';
        this.style.background = '#1A1A1A';
      }
    };
    btn.onclick = function() {
      // Remove all option chips
      var chips = document.getElementById('conv-options-' + context);
      if (chips) chips.remove();
      // Show as user message
      addMessage('user', opt);
      // Handle the response
      handleConversationalResponse(opt, context);
    };
    chipsDiv.appendChild(btn);
  });
  
  var messages = document.getElementById('messages');
  messages.appendChild(chipsDiv);
  messages.scrollTop = messages.scrollHeight;
}

async function handleConversationalResponse(answer, context) {
  conversationalProfile.lastAnswer = answer;
  
  if (context === 'opening') {
    conversationalProfile.openingChoice = answer;
    // Save weakest section hint
    if (answer.includes('weak in')) studentProfile.weakestSection = null; // will get from follow-up
    if (answer.includes('mock')) studentProfile.situation = 'mock analysis needed';
    
    // Let Marg respond naturally via AI
    await sendConversationalMessage(answer, context);
    
  } else if (context === 'section') {
    var section = answer.includes('VARC') ? 'VARC' : answer.includes('DILR') ? 'DILR' : answer.includes('QA') ? 'QA' : 'All';
    conversationalProfile.weakSection = section;
    studentProfile.weakestSection = section;
    await sendConversationalMessage(answer, context);
    
  } else if (context === 'hours') {
    studentProfile.dailyHours = answer;
    conversationalProfile.hours = answer;
    await sendConversationalMessage(answer, context);
    
  } else if (context === 'attempt') {
    studentProfile.attemptNumber = answer;
    conversationalProfile.attempt = answer;
    await sendConversationalMessage(answer, context);
    
  } else if (context === 'situation') {
    studentProfile.situation = answer;
    conversationalProfile.situation = answer;
    await sendConversationalMessage(answer, context);
    
  } else {
    // Generic - just send to Marg
    await sendConversationalMessage(answer, context);
  }
  
  // Save profile progressively
  saveProfileProgressively();
}

async function sendConversationalMessage(userMessage, context) {
  conversationHistory.push({ role: 'user', content: userMessage });
  if (!isGuestMode) saveChatMessage('user', userMessage);
  showTyping();
  
  var profileSoFar = '';
  if (conversationalProfile.weakSection) profileSoFar += 'Weak section: ' + conversationalProfile.weakSection + '. ';
  if (conversationalProfile.hours) profileSoFar += 'Daily hours: ' + conversationalProfile.hours + '. ';
  if (conversationalProfile.attempt) profileSoFar += 'Attempt: ' + conversationalProfile.attempt + '. ';
  if (conversationalProfile.situation) profileSoFar += 'Situation: ' + conversationalProfile.situation + '. ';
  
  var systemAddition = profileSoFar ? '\n\nPROFILE COLLECTED SO FAR: ' + profileSoFar : '';
  systemAddition += '\n\nCONVERSATIONAL ONBOARDING MODE: Be warm and direct. When you need to narrow something down, use options. Format: [OPTIONS: opt1|opt2|opt3][CONTEXT: type]. Only use options when it genuinely helps — not for every response.\n\nOPTIONS TO USE FOR EACH CONTEXT:\n\nSection weakness (CONTEXT: section): VARC|DILR|QA|All sections equally\n\nVARC sub-issue (CONTEXT: varc_sub): RC is the problem|VA is the problem|Both RC and VA\n\nRC specific issues (CONTEXT: rc_specific): I dont understand the passage|I understand but pick wrong options|I get stuck between 2 final options|I run out of time|I do well in practice but fail in mocks|I change my correct answer at the last moment\n\nVA specific issues (CONTEXT: va_specific): Para jumbles confuse me|Odd sentence out is hit or miss|Para summary questions feel subjective|All VA types trouble me\n\nDILR sub-issue (CONTEXT: dilr_sub): I run out of time|I cant crack the setup|I stay too long on hard sets|I solve correctly but make calculation errors|I panic and lose accuracy\n\nQA sub-issue (CONTEXT: qa_sub): I dont know the concept|I know the concept but make errors|I am too slow|I make careless mistakes in final step|Certain topics like geometry or P&C feel impossible\n\nDaily hours (CONTEXT: hours): Less than 1 hour|1-2 hours|2-4 hours|4-6 hours|6+ hours\n\nAttempt number (CONTEXT: attempt): First attempt|Second attempt|Third attempt or more\n\nSituation (CONTEXT: situation): Working professional|College student|Full-time prep|Preparing alongside other exams\n\nAfter 3-4 exchanges give a specific diagnosis. Never generic. Never list Marg features. IMPORTANT: Never show two sets of [OPTIONS] in the same message. One question, one set of options per message. If you need to ask about both RC and VA — ask RC first, wait for answer, then ask VA.';
  
  try {
    var res = await fetch(WORKER_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 400,
        system: SYSTEM_PROMPT + systemAddition,
        messages: conversationHistory
      })
    });
    var data = await res.json();
    var response = data.content && data.content[0] ? data.content[0].text : null;
    hideTyping();
    if (response) {
      // Strip markdown and option tags before displaying
      var cleanResponse = response
        .replace(/\[OPTIONS:[^\]]*\]/g, '')
        .replace(/\[CONTEXT:[^\]]*\]/g, '')
        .replace(/\*\*(.*?)\*\*/g, '$1')
        .replace(/\*(.*?)\*/g, '$1')
        .replace(/^#{1,3}\s+/gm, '')
        .replace(/^[-•*]\s+/gm, '')
        .replace(/^\d+\.\s+/gm, '')
        .replace(/---+/g, '')
        .replace(/===+/g, '')
        .replace(/\n{3,}/g, '\n\n')
        .trim();
      
      addMessage('marg', cleanResponse);
      conversationHistory.push({ role: 'assistant', content: response });
      if (!isGuestMode) saveChatMessage('assistant', cleanResponse);
      
      // Check original response for MCQ options to render
      checkAndRenderMargOptions(response);
      
      // After 4+ exchanges, transition to full chat
      if (conversationHistory.length >= 8 && !onboardingComplete) {
        onboardingComplete = true;
        localStorage.setItem('marg_onboarding_done_' + (currentUser ? currentUser.id : 'guest'), '1');
        showBottomNav();
        studentProfile.monthsLeft = calculateMonthsLeftForCAT();
        await saveProfile();
        await saveLastTask('Complete CAT prep plan from onboarding conversation', 'Initial diagnosis done');
      }
    }
  } catch(e) {
    hideTyping();
    addMessage('marg', 'Tell me more — what specifically feels stuck?');
  }
}

function checkAndRenderMargOptions(response) {
  // Check if response contains [OPTIONS: ...] signal
  var optMatch = response.match(/\[OPTIONS:\s*([^\]]+)\]/);
  if (optMatch) {
    var options = optMatch[1].split('|').map(function(o) { return o.trim(); });
    var contextMatch = response.match(/\[CONTEXT:\s*([^\]]+)\]/);
    var ctx = contextMatch ? contextMatch[1].trim() : 'general';
    showConversationalOptions(options, ctx);
  }
}

async function saveProfileProgressively() {
  if (!currentUser || !SUPABASE_TOKEN) return;
  try {
    var updates = { user_id: currentUser.id };
    if (studentProfile.weakestSection) updates.weakest_section = studentProfile.weakestSection;
    if (studentProfile.dailyHours) updates.daily_hours = studentProfile.dailyHours;
    if (studentProfile.attemptNumber) updates.attempt_number = studentProfile.attemptNumber;
    if (studentProfile.situation) updates.situation = studentProfile.situation;
    if (studentProfile.monthsLeft) updates.months_left = studentProfile.monthsLeft;
    
    await fetch(SUPABASE_URL + '/rest/v1/profiles', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': SUPABASE_ANON_KEY,
        'Authorization': 'Bearer ' + SUPABASE_TOKEN,
        'Prefer': 'resolution=merge-duplicates'
      },
      body: JSON.stringify(updates)
    });
  } catch(e) {}
}

function skipToOnboarding() {
  var welcome = document.getElementById('welcome-marg-overlay');
  if (welcome) welcome.style.display = 'none';
  var preview = document.getElementById('preview-overlay');
  if (preview) preview.style.display = 'none';
  showProfileSetup();
}

function showProfileSetup() {
  var overlay = document.getElementById('profile-setup-overlay');
  if (overlay) overlay.style.display = 'flex';
}

function hideProfileSetup() {
  var overlay = document.getElementById('profile-setup-overlay');
  if (overlay) overlay.style.display = 'none';
}

function skipProfileSetup() {
  hideProfileSetup();
  // Set default profile values
  studentProfile.attemptNumber = studentProfile.attemptNumber || '1st attempt';
  studentProfile.monthsLeft = studentProfile.monthsLeft || '4-5 months';
  studentProfile.weakestSection = studentProfile.weakestSection || 'VARC';
  studentProfile.dailyHours = studentProfile.dailyHours || '2-4 hours';
  studentProfile.situation = studentProfile.situation || 'Full-time CAT prep';
  finishOnboarding();
}


async function choosePathDiscuss() {
  document.getElementById('user-input').disabled = false;
  document.getElementById('send-btn').disabled = false;
  document.getElementById('user-input').focus();
  await startDiscussPath();
}

function choosePathPractice() {
  switchTab('practice');
}

async function startDiscussPath() {
  const profileHtml = '<div class="profile-card"><div class="label">Your Marg Profile</div><div class="profile-row"><div class="profile-item"><span>Attempt</span><span>' + studentProfile.attemptNumber + '</span></div><div class="profile-item"><span>Time left</span><span>' + studentProfile.monthsLeft + '</span></div><div class="profile-item"><span>Weak area</span><span>' + studentProfile.weakestSection + '</span></div><div class="profile-item"><span>Daily hours</span><span>' + studentProfile.dailyHours + '</span></div><div class="profile-item"><span>Situation</span><span>' + studentProfile.situation + '</span></div></div></div>';
  const firstMsg = buildPersonalizedOpening();
  setTimeout(function() {
    addMessage('marg', firstMsg + profileHtml, true);
    addSuggestionChips();
    const varcBtn = document.getElementById('varc-toggle-btn');
    if (varcBtn) varcBtn.style.display = 'inline-flex';
    const profileMsg = 'My profile: Attempt number: ' + studentProfile.attemptNumber + ', Months until CAT: ' + studentProfile.monthsLeft + ', Weakest section: ' + studentProfile.weakestSection + ', Daily study hours: ' + studentProfile.dailyHours + ', Current situation: ' + studentProfile.situation;
    conversationHistory.push({ role: 'user', content: profileMsg });
    conversationHistory.push({ role: 'assistant', content: firstMsg });
    saveChatMessage('user', profileMsg);
    saveChatMessage('assistant', firstMsg);
  }, 1000);
}

function buildPersonalizedOpening() {
  const attempt = studentProfile.attemptNumber;
  const months = studentProfile.monthsLeft;
  const weak = studentProfile.weakestSection;
  const hours = studentProfile.dailyHours;
  let opening = '';
  if (attempt === '1st attempt') { opening = "Good — you're starting fresh, which means no bad habits to unlearn. That's actually an advantage most people don't realise."; }
  else if (attempt === '2nd attempt') { opening = "I've got your profile. Second attempt — you know what the exam feels like now. That experience is more valuable than you think. This time we go in with a real plan, not just hard work."; }
  else { opening = "Okay. I have your full picture. Multiple attempts mean you're serious about this — but it also means something specific hasn't been clicking. Let's find exactly what that is."; }
  opening += ' With <span class="highlight">' + months + '</span> left, studying <span class="highlight">' + hours + '/day</span>, and <span class="highlight">' + weak + '</span> as your weak spot — here\'s where we stand:';
  return opening;
}

function restoreConversation() {
  onboardingComplete = true;
  showBottomNav();
  document.getElementById('user-input').disabled = false;
  document.getElementById('send-btn').disabled = false;
  const displayMessages = conversationHistory.slice(2);
  if (displayMessages.length > 0) {
    displayMessages.forEach(function(msg) {
      const formatted = msg.content.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>').replace(/\*(.*?)\*/g, '<em>$1</em>').replace(/\n\n/g, '<br><br>').replace(/\n/g, '<br>');
      addMessage(msg.role === 'user' ? 'user' : 'marg', formatted);
    });
  }
  const name = currentUser && currentUser.user_metadata && currentUser.user_metadata.full_name ? currentUser.user_metadata.full_name.split(' ')[0] : '';
  addMessage('marg', 'Welcome back' + (name ? ', ' + name : '') + '! 👋 Ready to continue from where we left off?', true);
  addSuggestionChips();
  document.getElementById('user-input').focus();
  checkAndShowTour();
}

function addSuggestionChips() {
  const container = document.getElementById('messages');
  const chipsDiv = document.createElement('div');
  chipsDiv.style.marginLeft = '38px'; chipsDiv.className = 'fade-in';
  const weak = studentProfile.weakestSection;
  let suggestions = ['Make my study plan', 'Which mock tests should I take?', 'How do I improve my accuracy?'];
  if (weak && weak.includes('VARC')) suggestions = ['How to improve VARC fast', 'RC strategy for beginners', 'Which mock tests should I take?'];
  if (weak && weak.includes('DILR')) suggestions = ['DILR sets practice strategy', 'How to attempt DILR in exam', 'Which mock tests should I take?'];
  if (weak && weak.includes('QA')) suggestions = ['QA topics to prioritise', 'How to build QA basics fast', 'Which mock tests should I take?'];
  chipsDiv.innerHTML = '<div class="chips">' + suggestions.map(function(s) { return '<button class="chip" onclick="sendQuick(\'' + s + '\')">' + s + '</button>'; }).join('') + '</div>';
  container.appendChild(chipsDiv);
  container.scrollTop = container.scrollHeight;
}

function showTyping() {
  const container = document.getElementById('messages');
  const wrap = document.createElement('div');
  wrap.className = 'msg-wrap marg fade-in'; wrap.id = 'typing-wrap';
  wrap.innerHTML = '<div class="avatar"><img src="' + LOGO_ICON + '" alt="M"></div><div class="typing-bubble"><span></span><span></span><span></span></div>';
  container.appendChild(wrap); container.scrollTop = container.scrollHeight;
}

function hideTyping() { const el = document.getElementById('typing-wrap'); if (el) el.remove(); }

function buildActivitySummary() {
  if (!streakData || streakData.length === 0) return '';
  const today = new Date();
  const todayStr = formatDate(today);
  const checkedDates = new Set(streakData.map(function(c) { return c.date; }));
  let streak = 0;
  const d = new Date();
  d.setDate(d.getDate() - 1);
  while (checkedDates.has(formatDate(d))) { streak++; d.setDate(d.getDate() - 1); }
  if (checkedDates.has(todayStr)) streak++;
  const weekDays = [];
  for (let i = 6; i >= 0; i--) { const day = new Date(); day.setDate(day.getDate() - i); weekDays.push(formatDate(day)); }
  const studiedThisWeek = weekDays.filter(function(d) { return checkedDates.has(d); }).length;
  const missedThisWeek = weekDays.filter(function(d) { return d < todayStr && !checkedDates.has(d); }).length;
  const weekAgo = new Date(); weekAgo.setDate(weekAgo.getDate() - 7);
  const weekStr = formatDate(weekAgo);
  const weeklyHours = streakData.filter(function(c) { return c.date >= weekStr; }).reduce(function(sum, c) { return sum + (c.hours || 0); }, 0);
  const lastCheckin = streakData[0];
  const lastStudied = lastCheckin ? (lastCheckin.studied ? 'studied ' + (lastCheckin.hours || 0) + ' hours' : 'did not study') : 'unknown';
  let summary = '\n\nSTUDENT ACTIVITY SUMMARY:';
  summary += '\n- Current streak: ' + streak + ' days';
  summary += '\n- This week: studied ' + studiedThisWeek + ' days, missed ' + missedThisWeek + ' days';
  summary += '\n- Hours this week: ' + weeklyHours.toFixed(1) + 'h';
  summary += '\n- Yesterday: ' + lastStudied;
  if (missedThisWeek >= 3) summary += '\n- IMPORTANT: Tough week with consistency — address with empathy first.';
  if (streak >= 7) summary += '\n- IMPORTANT: ' + streak + ' day streak — acknowledge specifically.';
  return summary;
}

function sendQuick(text) { if (isLoading || !onboardingComplete) return; document.getElementById('user-input').value = text; sendMessage(); }

async function sendMessage() {
  if (isLoading) return;
  // Allow chat if onboarding is complete OR if mock onboarding overlay is shown
  const mockOverlay = document.getElementById('mock-onboarding-overlay');
  const mockVisible = mockOverlay && mockOverlay.style.display === 'flex';
  // Allow during conversational onboarding too
  var inConversationalOnboarding = !onboardingComplete && conversationHistory.length > 0;
  if (!onboardingComplete && !mockVisible && !inConversationalOnboarding) return;
  if (!checkGuestLimit()) return;
  const input = document.getElementById('user-input');
  const text = input.value.trim();
  if (!text) return;
  input.value = ''; input.style.height = 'auto';
  isLoading = true; document.getElementById('send-btn').disabled = true;
  if (isGuestMode) { guestMessageCount++; updateGuestBanner(); }
  addMessage('user', text);
  conversationHistory.push({ role: 'user', content: text });
  detectAndSaveMockScores(text);
  if (!isGuestMode) saveChatMessage('user', text);
  
  // Route through conversational onboarding if still active
  if (!onboardingComplete && conversationHistory.length <= 10) {
    await sendConversationalMessage(text, 'typed');
    isLoading = false;
    document.getElementById('send-btn').disabled = false;
    return;
  }
  
  showTyping();
  const activitySummary = buildActivitySummary();
  var currentDate = new Date();
  var dateString = currentDate.toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  profileContext = '\n\nCURRENT DATE: ' + dateString + ' (year is 2026, CAT 2026 is on November 29 2026)\n\nSESSION MEMORY (what happened in previous sessions):\n' + (studentProfile.sessionSummary || 'First session - no previous history yet') + '\n\nSTUDENT PROFILE:\n- Attempt number: ' + studentProfile.attemptNumber + '\n- Months until CAT: ' + studentProfile.monthsLeft + '\n- Weakest section: ' + studentProfile.weakestSection + '\n- Daily study hours: ' + studentProfile.dailyHours + '\n- Current situation: ' + studentProfile.situation +
    (studentProfile.varcPattern ? '\n- VARC cognitive pattern: ' + studentProfile.varcPattern : '') +
    (studentProfile.dilrPattern ? '\n- DILR cognitive pattern: ' + studentProfile.dilrPattern : '') +
    (studentProfile.qaPattern ? '\n- QA cognitive pattern: ' + studentProfile.qaPattern : '') +
    (studentProfile.mockHistory ? '\n- Mock history: ' + studentProfile.mockHistory : '') +
    (studentProfile.sessionsCount ? '\n- Total sessions with Marg: ' + studentProfile.sessionsCount : '') +
    (studentProfile.recentMistakes && studentProfile.recentMistakes.length > 0 ?
      '\n\nRECENT MISTAKES (last ' + studentProfile.recentMistakes.length + ' wrong answers — USE THESE to target practice):\n' +
      studentProfile.recentMistakes.slice(0, 5).map(function(m) {
        return '- ' + m.date + ' | ' + m.type.toUpperCase() + ' | ' + m.topic + ': ' + m.insight;
      }).join('\n') : '') +
    activitySummary;
  try {
    const response = await fetch(WORKER_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ model: 'claude-haiku-4-5-20251001', max_tokens: 800, system: SYSTEM_PROMPT + profileContext, messages: conversationHistory }) });
    const data = await response.json();
    const reply = (data.content && data.content.map(function(b) { return b.text || ''; }).join('')) || 'Something went wrong. Please try again.';
    hideTyping();
    conversationHistory.push({ role: 'assistant', content: reply });
    if (!isGuestMode) saveChatMessage('assistant', reply);
    const cleanReply = reply
      .replace(/\[OPTIONS:[^\]]*\]/g, '')
      .replace(/\[CONTEXT:[^\]]*\]/g, '')
      .replace(/\*\*(.*?)\*\*/g, '$1')
      .replace(/\*(.*?)\*/g, '$1')
      .replace(/^#{1,3}\s+/gm, '')
      .replace(/^[-•*]\s+/gm, '')
      .replace(/^\d+\.\s+/gm, '')
      .replace(/---+/g, '')
      .replace(/===+/g, '')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
    const formatted = cleanReply.replace(/\n\n/g, '<br><br>').replace(/\n/g, '<br>');
    addMessage('marg', formatted);
    checkAndRenderMargOptions(reply);
  } catch (e) { hideTyping(); addMessage('marg', 'Yaar, connection issue. Please try again in a moment.'); }
  isLoading = false; document.getElementById('send-btn').disabled = false; input.focus();
}

document.getElementById('user-input').addEventListener('input', function() { this.style.height = 'auto'; this.style.height = Math.min(this.scrollHeight, 120) + 'px'; });
document.getElementById('user-input').addEventListener('keydown', function(e) { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); } });

let checkinStudied = null;
let checkinHours = 2;
let streakData = [];

function formatDate(d) { return d.toISOString().split('T')[0]; }
function getTodayDate() { return formatDate(new Date()); }

async function hasCheckedInToday() {
  if (!currentUser || !SUPABASE_TOKEN) return false;
  try {
    const today = getTodayDate();
    const { data } = await sbFetch('checkins?select=*&user_id=eq.' + currentUser.id + '&date=eq.' + today, 'GET');
    return data && data.length > 0;
  } catch(e) { return false; }
}

async function loadStreakData() {
  if (!currentUser || !SUPABASE_TOKEN) return;
  try {
    const { data } = await sbFetch('checkins?select=*&user_id=eq.' + currentUser.id + '&order=date.desc&limit=30', 'GET');
    streakData = data || [];
    renderStreakBar();
  } catch(e) {}
}

function renderStreakBar() {
  const bar = document.getElementById('streak-bar');
  const daysEl = document.getElementById('streak-days');
  const countEl = document.getElementById('streak-count');
  const hoursEl = document.getElementById('streak-hours');
  bar.style.display = 'flex';
  const days = ['M','T','W','T','F','S','S'];
  const today = new Date();
  const todayStr = formatDate(today);
  const checkedDates = new Set(streakData.map(function(c) { return c.date; }));
  let html = '';
  for (let i = 6; i >= 0; i--) {
    const d = new Date(); d.setDate(d.getDate() - i);
    const dateStr = formatDate(d);
    const dayName = days[d.getDay() === 0 ? 6 : d.getDay() - 1];
    let cls = 'future';
    if (dateStr === todayStr) cls = 'today';
    else if (dateStr < todayStr) cls = checkedDates.has(dateStr) ? 'done' : 'miss';
    html += '<div class="s-day ' + cls + '">' + dayName + '</div>';
  }
  daysEl.innerHTML = html;
  let streak = 0;
  const d = new Date(); d.setDate(d.getDate() - 1);
  while (checkedDates.has(formatDate(d))) { streak++; d.setDate(d.getDate() - 1); }
  if (checkedDates.has(todayStr)) streak++;
  let streakMsg = '';
  if (streak === 0) streakMsg = 'Start your streak today';
  else if (streak === 1) streakMsg = '<span>1 day</span> streak — keep going!';
  else if (streak < 5) streakMsg = '<span>' + streak + ' day</span> streak 🔥';
  else if (streak < 10) streakMsg = '<span>' + streak + ' day</span> streak 🔥 — you\'re building momentum!';
  else streakMsg = '<span>' + streak + ' day</span> streak 🔥🔥 — don\'t break the chain!';
  countEl.innerHTML = streakMsg;
  const weekAgo = new Date(); weekAgo.setDate(weekAgo.getDate() - 7);
  const weekStr = formatDate(weekAgo);
  const weeklyHours = streakData.filter(function(c) { return c.date >= weekStr; }).reduce(function(sum, c) { return sum + (c.hours || 0); }, 0);
  hoursEl.textContent = 'This week: ' + weeklyHours.toFixed(1) + 'h';
}

function selectCheckin(val) {
  checkinStudied = val;
  document.querySelectorAll('.ci-btn').forEach(function(b) { b.classList.remove('selected'); });
  event.target.classList.add('selected');
  document.getElementById('checkin-hours').style.display = (val === 'yes' || val === 'partial') ? 'flex' : 'none';
  if (val === 'no') checkinHours = 0;
  document.getElementById('checkin-submit').style.display = 'block';
}

function updateHours(val) { checkinHours = parseFloat(val); document.getElementById('hours-display').textContent = checkinHours + 'h'; }

async function submitCheckin() {
  if (!currentUser || !SUPABASE_TOKEN) return;
  try { await sbFetch('checkins', 'POST', { user_id: currentUser.id, studied: checkinStudied !== 'no', hours: checkinHours, date: getTodayDate() }); } catch(e) {}
  hideCheckin();
  loadStreakData();
  sendCheckinMessage();
}

function sendCheckinMessage() {
  const name = currentUser && currentUser.user_metadata && currentUser.user_metadata.full_name ? currentUser.user_metadata.full_name.split(' ')[0] : '';
  const weak = studentProfile.weakestSection || 'your prep';
  let msg = '';
  if (checkinStudied === 'yes') {
    if (checkinHours >= 5) msg = checkinHours + ' hours yesterday — serious session' + (name ? ', ' + name : '') + '. Carry that energy. What section did you work on most?';
    else if (checkinHours >= 3) msg = checkinHours + ' hours yesterday — solid and consistent. What are we focusing on today?';
    else msg = checkinHours + ' hours yesterday. Every hour counts. What\'s your plan for today?';
  } else if (checkinStudied === 'partial') {
    msg = 'Partial prep is still prep' + (name ? ', ' + name : '') + '. What got in the way yesterday?';
  } else {
    msg = "Missed yesterday — happens. The only day that matters is today. What's the one thing you're opening first — " + weak + "?";
  }
  setTimeout(function() { addMessage('marg', msg, true); }, 400);
}

function showCheckin(userName) {
  const overlay = document.getElementById('checkin-overlay');
  const today = new Date();
  document.getElementById('checkin-date').textContent = today.toLocaleDateString('en-IN', { weekday: 'long', month: 'long', day: 'numeric' });
  document.getElementById('checkin-q1').textContent = 'Good morning' + (userName ? ', ' + userName : '') + '! Did you study yesterday?';
  overlay.style.display = 'flex';
}

function hideCheckin() { document.getElementById('checkin-overlay').style.display = 'none'; }

let currentArticle = null;
let currentTopic = 'economy';
let varcShownToday = false;

const RSS_FEEDS = {
  economy: 'https://api.rss2json.com/v1/api.json?rss_url=https://www.thehindu.com/business/feeder/default.rss&count=10',
  environment: 'https://api.rss2json.com/v1/api.json?rss_url=https://www.thehindu.com/sci-tech/feeder/default.rss&count=10',
  politics: 'https://api.rss2json.com/v1/api.json?rss_url=https://www.thehindu.com/opinion/editorial/feeder/default.rss&count=10',
  technology: 'https://api.rss2json.com/v1/api.json?rss_url=https://www.thehindu.com/sci-tech/technology/feeder/default.rss&count=10',
  philosophy: 'https://api.rss2json.com/v1/api.json?rss_url=https://aeon.co/feed.rss&count=10'
};

const FALLBACK_ARTICLES = {
  economy: { title: "India's GDP growth moderates as global headwinds persist", source: "The Hindu", preview: "India's economic growth has shown signs of moderation amid global uncertainties.", url: "https://www.thehindu.com/business/" },
  environment: { title: "Climate change and its cascading effects on monsoon patterns", source: "The Hindu", preview: "Scientists have documented significant shifts in India's monsoon patterns over the past decade.", url: "https://www.thehindu.com/sci-tech/" },
  politics: { title: "Federalism and the balance of power in modern democracies", source: "The Hindu Editorial", preview: "The relationship between central authority and state autonomy remains one of the most contested terrains in democratic governance.", url: "https://www.thehindu.com/opinion/editorial/" },
  technology: { title: "Artificial intelligence and the transformation of knowledge work", source: "The Hindu", preview: "The rapid advancement of artificial intelligence technologies is fundamentally altering the nature of cognitive work.", url: "https://www.thehindu.com/sci-tech/technology/" },
  philosophy: { title: "The paradox of choice in an age of infinite options", source: "Aeon", preview: "Contemporary societies offer unprecedented freedom of choice, yet psychological research consistently shows that more options often lead to greater anxiety.", url: "https://aeon.co/" }
};

async function fetchDailyArticle(topic) {
  try {
    const response = await fetch(RSS_FEEDS[topic]);
    if (!response.ok) throw new Error('RSS fetch failed');
    const data = await response.json();
    if (data.status !== 'ok' || !data.items || data.items.length === 0) throw new Error('No items');
    const dayOfMonth = new Date().getDate();
    const article = data.items[dayOfMonth % data.items.length];
    const div = document.createElement('div');
    div.innerHTML = article.description || '';
    const cleanText = div.textContent || div.innerText || '';
    return { title: article.title, source: data.feed ? data.feed.title : 'The Hindu', preview: cleanText.substring(0, 200) + '...', url: article.link, content: cleanText.substring(0, 1500) };
  } catch(e) { return FALLBACK_ARTICLES[topic]; }
}

async function loadVarcCard(topic) {
  topic = topic || currentTopic;
  const card = document.getElementById('varc-card');
  document.getElementById('varc-title').textContent = 'Loading article...';
  document.getElementById('varc-meta').textContent = '';
  document.getElementById('varc-preview').textContent = '';
  const article = await fetchDailyArticle(topic);
  currentArticle = article;
  document.getElementById('varc-title').textContent = article.title;
  document.getElementById('varc-meta').textContent = article.source + ' · Today';
  document.getElementById('varc-preview').textContent = article.preview;
  document.getElementById('varc-read-btn').onclick = function() { window.open(article.url, '_blank'); };
  card.classList.add('visible');
  const toggleBtn = document.getElementById('varc-toggle-btn');
  if (toggleBtn) toggleBtn.style.display = 'inline-flex';
}

function selectVarcTopic(topic, btn) {
  currentTopic = topic;
  document.querySelectorAll('.varc-topic').forEach(function(b) { b.classList.remove('active'); });
  btn.classList.add('active');
  loadVarcCard(topic);
}

function closeVarcCard() {
  document.getElementById('varc-card').classList.remove('visible');
  document.getElementById('varc-card').style.display = 'none';
  varcShownToday = true;
  const btn = document.getElementById('varc-toggle-btn');
  if (btn) btn.style.display = 'inline-flex';
}

function toggleVarcCard() {
  const card = document.getElementById('varc-card');
  const btn = document.getElementById('varc-toggle-btn');
  if (card.classList.contains('visible')) {
    card.classList.remove('visible'); card.style.display = 'none';
    if (btn) btn.textContent = '📖 Today VARC';
  } else {
    card.style.display = ''; card.classList.add('visible');
    if (btn) btn.textContent = '× Close VARC';
    if (!currentArticle) loadVarcCard('economy');
  }
}

let articleIndex = -1;
async function refreshArticle() {
  try {
    const response = await fetch(RSS_FEEDS[currentTopic]);
    if (!response.ok) throw new Error('RSS fetch failed');
    const data = await response.json();
    if (data.status !== 'ok' || !data.items || data.items.length === 0) throw new Error('No items');
    articleIndex = (articleIndex + 1) % data.items.length;
    const article = data.items[articleIndex];
    const div = document.createElement('div');
    div.innerHTML = article.description || '';
    const cleanText = div.textContent || div.innerText || '';
    currentArticle = { title: article.title, source: data.feed ? data.feed.title : 'The Hindu', preview: cleanText.substring(0, 200) + '...', url: article.link, content: cleanText.substring(0, 1500) };
    document.getElementById('varc-title').textContent = currentArticle.title;
    document.getElementById('varc-meta').textContent = currentArticle.source + ' · Today';
    document.getElementById('varc-preview').textContent = currentArticle.preview;
    document.getElementById('varc-read-btn').onclick = function() { window.open(currentArticle.url, '_blank'); };
  } catch(e) {
    const topics = Object.keys(FALLBACK_ARTICLES);
    articleIndex = (articleIndex + 1) % topics.length;
    currentArticle = FALLBACK_ARTICLES[topics[articleIndex]];
    document.getElementById('varc-title').textContent = currentArticle.title;
    document.getElementById('varc-meta').textContent = currentArticle.source + ' · Today';
    document.getElementById('varc-preview').textContent = currentArticle.preview;
  }
}

function readArticle() { if (currentArticle) window.open(currentArticle.url, '_blank'); }

async function createRCPassage() {
  if (!currentArticle) return;
  closeVarcCard();
  const articleText = currentArticle.content || currentArticle.preview;
  const prompt = `Based on this article from ${currentArticle.source}:\n\nTitle: "${currentArticle.title}"\n\nContent: ${articleText}\n\nCreate a HARD CAT exam style RC exercise. IMPORTANT: Show ONLY passage and questions, NO answers yet.\n\nPASSAGE: 280-320 words, dense and abstract. Use complex sentence structures, nuanced arguments, at least one subtle shift in author's position. Must require careful reading — not skimmable.\n\nQUESTIONS — 4 total, one each of: Primary purpose, Specific detail, Inference, Author's attitude.\n\nTRAP OPTIONS are mandatory for every question:\n- Wrong options must use exact words from passage but in wrong context\n- Two options per question should feel very close to correct\n- Options that are partially true but go beyond what passage actually states\n- Never make wrong options obviously wrong\n\nCRITICAL: Randomize correct answers across A B C D — do NOT default to B or C repeatedly. Mix it up naturally like real CAT papers.\n\nDifficulty: Hard enough that a student who skims will get it wrong.\n\nANSWER KEY DISTRIBUTION — STRICTLY FOLLOW THIS:\nBefore writing questions, randomly pick 4 different letters from A B C D for the correct answers — no two consecutive questions should have the same letter. Actively avoid B,C,B,C pattern. Use patterns like A,D,B,C or D,A,C,B or C,B,D,A.\n\nFormat:\nPASSAGE\n[text]\n\nQUESTIONS\n1. [question]\nA. B. C. D.\n[repeat for 4 questions]\n\nEnd with exactly: "---\nReady? Type your answers (e.g. 1-A, 2-C, 3-B, 4-D) and I'll explain each one in detail."`;

  addMessage('marg', "📖 Great choice! Let me create a CAT style RC passage from today's article on <strong>" + currentArticle.title + "</strong>. Give me a moment...", true);
  showTyping();
  var currentDate = new Date();
  var dateString = currentDate.toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  profileContext = '\n\nCURRENT DATE: ' + dateString + ' (year is 2026, CAT 2026 is on November 29 2026)\n\nSESSION MEMORY (what happened in previous sessions):\n' + (studentProfile.sessionSummary || 'First session - no previous history yet') + '\n\nSTUDENT PROFILE:\n- Attempt number: ' + studentProfile.attemptNumber + '\n- Months until CAT: ' + studentProfile.monthsLeft + '\n- Weakest section: ' + studentProfile.weakestSection + '\n- Daily study hours: ' + studentProfile.dailyHours + '\n- Current situation: ' + studentProfile.situation;
  try {
    const response = await fetch(WORKER_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ model: 'claude-haiku-4-5-20251001', max_tokens: 1200, system: SYSTEM_PROMPT + profileContext, messages: [{ role: 'user', content: prompt }] }) });
    const data = await response.json();
    const reply = (data.content && data.content.map(function(b) { return b.text || ''; }).join('')) || 'Something went wrong. Please try again.';
    hideTyping();
    const formatted = reply.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>').replace(/\*(.*?)\*/g, '<em>$1</em>').replace(/\n\n/g, '<br><br>').replace(/\n/g, '<br>');
    addMessage('marg', formatted, true);
    saveChatMessage('assistant', reply);
    localStorage.setItem('marg_rc_article', JSON.stringify({ title: currentArticle.title, source: currentArticle.source, content: articleText }));
  } catch(e) { hideTyping(); addMessage('marg', 'Connection issue. Please try again in a moment.'); }
}

async function checkVarcShownToday() {
  const lastVarcDate = localStorage.getItem('marg_varc_date');
  const today = getTodayDate();
  if (lastVarcDate === today) return true;
  localStorage.setItem('marg_varc_date', today);
  return false;
}

let isGuestMode = false;
let guestMessageCount = 0;
const GUEST_MESSAGE_LIMIT = 5;

function startGuestMode() {
  isGuestMode = true; guestMessageCount = 0; currentUser = null; SUPABASE_TOKEN = null;
  studentProfile = { attemptNumber: null, monthsLeft: null, weakestSection: null, dailyHours: null, situation: null };
  document.getElementById('loading-screen').style.display = 'none';
  document.getElementById('landing-page').style.display = 'none';
  document.getElementById('chat-app').style.display = 'flex';
  document.getElementById('guest-limit-banner').classList.add('visible');
  updateGuestBanner();
  document.getElementById('user-info').innerHTML = '<span style="font-size:12px;color:var(--text-dim)">Guest mode</span><button style="font-size:11px;color:var(--gold);background:none;border:none;cursor:pointer;margin-left:8px;" onclick="startLogin()">Login to save →</button>';
  onboardingComplete = true;
  studentProfile = { attemptNumber: 'Guest', monthsLeft: 'Unknown', weakestSection: 'Unknown', dailyHours: 'Unknown', situation: 'Guest user' };
  addMessage('marg', "Namaste! 🙏 I'm Marg — your personal CAT mentor. What do you want help with today?", true);
  setTimeout(function() {
    const container = document.getElementById('messages');
    const chipsDiv = document.createElement('div');
    chipsDiv.style.marginLeft = '38px'; chipsDiv.className = 'fade-in';
    chipsDiv.innerHTML = '<div class="chips"><button class="chip" onclick="sendQuick(\'How do I start CAT prep from scratch?\')">Where to start</button><button class="chip" onclick="sendQuick(\'How to improve VARC for CAT?\')">Improve VARC</button><button class="chip" onclick="sendQuick(\'How to attempt DILR in exam?\')">DILR strategy</button><button class="chip" onclick="sendQuick(\'How to build consistency in CAT prep?\')">Consistency</button><button class="chip" onclick="sendQuick(\'Which mock test series is best for CAT?\')">Mock tests</button></div>';
    container.appendChild(chipsDiv);
    container.scrollTop = container.scrollHeight;
  }, 600);
  document.getElementById('user-input').disabled = false;
  document.getElementById('send-btn').disabled = false;
  document.getElementById('user-input').focus();
}

function updateGuestBanner() {
  const left = GUEST_MESSAGE_LIMIT - guestMessageCount;
  const el = document.getElementById('guest-msgs-left');
  if (el) el.textContent = Math.max(0, left);
}

function checkGuestLimit() {
  if (!isGuestMode) return true;
  if (guestMessageCount >= GUEST_MESSAGE_LIMIT) { showGuestLimitModal(); return false; }
  return true;
}

function showGuestLimitModal() {
  const inputArea = document.getElementById('input-area');
  const googleIcon = '<svg viewBox="0 0 24 24" width="18" height="18"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/></svg>';
  inputArea.innerHTML = '<div style="padding:16px;text-align:center;border-top:1px solid var(--border);background:var(--surface);display:flex;flex-direction:column;gap:12px;align-items:center;"><div style="font-size:14px;color:var(--text);font-weight:500;">You have used your 5 free messages</div><div style="font-size:13px;color:var(--text-muted);">Login to save your progress and continue with Marg — completely free.</div><button onclick="startLogin()" style="display:flex;align-items:center;gap:10px;background:#fff;color:#333;border:none;border-radius:10px;padding:12px 24px;font-family:DM Sans,sans-serif;font-size:14px;font-weight:500;cursor:pointer;">' + googleIcon + 'Continue with Google — free</button><div style="font-size:11px;color:var(--text-dim)">Your conversation will be saved automatically</div></div>';
  addMessage('marg', "You have used your 5 free messages. Login with Google to continue — completely free.", true);
}

async function initSession() {
  showRandomQuote();
  const hash = window.location.hash;
  if (hash && hash.includes('access_token')) {
    const params = new URLSearchParams(hash.substring(1));
    const token = params.get('access_token');
    if (token) { localStorage.setItem('marg_token', token); window.history.replaceState({}, document.title, window.location.pathname); }
  }
  const token = localStorage.getItem('marg_token');
  if (!token) { setTimeout(showLanding, 3200); return; }
  try {
    const res = await fetch(SUPABASE_URL + '/auth/v1/user', { headers: { 'apikey': SUPABASE_ANON_KEY, 'Authorization': 'Bearer ' + token } });
    if (!res.ok) { localStorage.removeItem('marg_token'); setTimeout(showLanding, 3200); return; }
    const user = await res.json();
    SUPABASE_TOKEN = token;
    currentUser = user;
    updateUserUI(user);
    showWelcome(async function() {
      const hasHistory = await loadUserData();
      if (hasHistory) {
        restoreConversation();
        loadStreakData();
        setTimeout(function() { const btn = document.getElementById('varc-toggle-btn'); if (btn) btn.style.display = 'inline-flex'; }, 500);
        
        // Marg speaks first for returning users
        setTimeout(async function() {
          await sendReturningUserGreeting();
        }, 600);

        const alreadyCheckedIn = await hasCheckedInToday();
        if (!alreadyCheckedIn) {
          const name = currentUser && currentUser.user_metadata && currentUser.user_metadata.full_name ? currentUser.user_metadata.full_name.split(' ')[0] : '';
          setTimeout(function() { showCheckin(name); }, 2000);
        }
        const varcShown = await checkVarcShownToday();
        if (!varcShown) { setTimeout(function() { loadVarcCard('economy'); }, 3000); }
        document.getElementById('landing-page').style.display = 'none';
        document.getElementById('chat-app').style.display = 'flex';
        showBottomNav();
      } else {
        // New user
        document.getElementById('landing-page').style.display = 'none';
        document.getElementById('chat-app').style.display = 'flex';
        showBottomNav();
        // Check if they came from mock diagnosis CTA
        if (mobLoginForMock) {
          mobLoginForMock = false;
          showMockOnboarding();
        } else {
          // Check if they've done onboarding before (refresh mid-onboarding)
          var onboardingKey = 'marg_onboarding_done_' + (currentUser ? currentUser.id : 'guest');
          var prevOnboarded = localStorage.getItem(onboardingKey);
          if (prevOnboarded) {
            onboardingComplete = true;
            showBottomNav();
            checkAndShowTour();
            loadStreakData();
            setTimeout(function() { 
              var btn = document.getElementById('varc-toggle-btn'); 
              if (btn) btn.style.display = 'inline-flex'; 
            }, 500);
            checkVarcShownToday().then(function(shown) {
              if (!shown) setTimeout(function() { loadVarcCard('economy'); }, 1000);
            });
            addMessage('marg', 'Welcome back! Pick up where you left off — what do you want to work on today?');
          } else {
            showWelcomeMarg();
          }
        }
        // Don't set onboardingComplete yet - will be set after conversational onboarding
      }
    });
  } catch(e) { localStorage.removeItem('marg_token'); setTimeout(showLanding, 3200); }
}



// ─── RETURNING USER GREETING ───
async function sendReturningUserGreeting() {
  showBottomNav();
  if (typeof checkAndShowTour === 'function') checkAndShowTour();
  if (!conversationHistory || conversationHistory.length < 2) return;
  const todayStr = new Date().toISOString().split('T')[0];
  const lastGreetKey = 'marg_last_greet_' + (currentUser ? currentUser.id : 'guest');
  const lastGreet = localStorage.getItem(lastGreetKey);
  if (lastGreet === todayStr) return;
  localStorage.setItem(lastGreetKey, todayStr);

  let streak = 0;
  let lastSession = null;

  try {
    const streakRes = await fetch(SUPABASE_URL + '/rest/v1/checkins?select=date&user_id=eq.' + currentUser.id + '&order=date.desc&limit=30', {
      headers: { 'apikey': SUPABASE_ANON_KEY, 'Authorization': 'Bearer ' + SUPABASE_TOKEN }
    });
    const checkins = await streakRes.json();
    lastSession = await getLastSession();

    if (checkins && checkins.length > 0) {
      const d = new Date();
      d.setDate(d.getDate() - 1);
      const dates = new Set(checkins.map(c => c.date));
      while (dates.has(d.toISOString().split('T')[0])) {
        streak++;
        d.setDate(d.getDate() - 1);
      }
    }
  } catch(e) {}

  const name = currentUser && currentUser.user_metadata && currentUser.user_metadata.full_name 
    ? currentUser.user_metadata.full_name.split(' ')[0] 
    : '';

  const hour = new Date().getHours();
  const timeGreet = hour < 12 ? 'Morning' : hour < 17 ? 'Hey' : 'Evening';

  let greeting = '';

  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayStr = yesterday.toISOString().split('T')[0];

  if (lastSession && lastSession.last_task && lastSession.last_session_date === yesterdayStr) {
    greeting = `${timeGreet} ${name}! Good to see you back.

Yesterday I gave you one task — ${lastSession.last_task}

Did you do it? Tell me what happened — even if you didn't, that's useful to know.`;
  } else if (lastSession && lastSession.last_task && lastSession.last_session_date) {
    const daysSince = Math.floor((new Date() - new Date(lastSession.last_session_date)) / (1000 * 60 * 60 * 24));
    greeting = `${timeGreet} ${name}! It's been ${daysSince} day${daysSince > 1 ? 's' : ''} since we last spoke.

Last time I gave you this task — ${lastSession.last_task}

What happened? Did you get to it?`;
  } else if (streak >= 5) {
    greeting = `${timeGreet} ${name}! 🔥 You're on a ${streak}-day streak — don't break it today.

What did you work on yesterday? Tell me in one line and let's figure out today's focus.`;
  } else if (streak >= 2) {
    greeting = `${timeGreet} ${name}! ${streak} days in a row — good momentum.

What are you working on today — VARC, DILR, or QA? Tell me where you left off and we'll build from there.`;
  } else {
    greeting = `${timeGreet} ${name}! Good to have you back.

What's on your mind today? Tell me your weakest section and last mock score and I'll tell you exactly what to do first.`;
  }

  if (streak > 0 && !(lastSession && lastSession.last_task)) {
    greeting += `

_(${streak}-day streak — check in before midnight to keep it going)_`;
  }

  addMessage('marg', greeting);
  
  // Enable input for returning users
  document.getElementById('user-input').disabled = false;
  document.getElementById('send-btn').disabled = false;
  document.getElementById('user-input').focus();
}



// ─── MOCK DIAGNOSIS ONBOARDING ───
let mobData = { varc: 0, dilr: 0, qa: 0, attempt: '', weak: '' };
let mobLoginForMock = false;

function startMockOnboardingLogin() {
  // If already logged in, show mock onboarding directly
  if (currentUser) {
    showMockOnboarding();
    // Hide landing, show app
    document.getElementById('landing').style.display = 'none';
    document.getElementById('app').style.display = 'flex';
    return;
  }
  // Not logged in - set flag and login
  mobLoginForMock = true;
  startLogin();
}

function showMockOnboarding() {
  // Ensure chat is always enabled when mock onboarding shows
  onboardingComplete = true;
  document.getElementById('mock-onboarding-overlay').style.display = 'flex';
  mobSetStep(1);
}

function mobSetStep(n) {
  // Hide all steps
  for (let i = 1; i <= 4; i++) {
    const s = document.getElementById('mob-step-' + i);
    const d = document.getElementById('mob-dot-' + i);
    if (s) s.classList.remove('active');
    if (d) d.classList.remove('active');
  }
  const step = document.getElementById('mob-step-' + n);
  const dot = document.getElementById('mob-dot-' + n);
  if (step) step.classList.add('active');
  if (dot) dot.classList.add('active');
}

function mobNextStep(n) {
  mobSetStep(n);
}

function selectMobOption(el, field, value) {
  // Deselect siblings
  el.parentElement.querySelectorAll('.mob-option').forEach(o => o.classList.remove('selected'));
  el.classList.add('selected');
  mobData[field] = value;
  
  // Enable next button
  if (field === 'attempt') {
    document.getElementById('mob-step3-next').disabled = false;
  } else if (field === 'weak') {
    document.getElementById('mob-step4-next').disabled = false;
  }
}

async function submitMockOnboarding() {
  const varc = parseInt(document.getElementById('mob-varc').value) || 0;
  const dilr = parseInt(document.getElementById('mob-dilr').value) || 0;
  const qa = parseInt(document.getElementById('mob-qa').value) || 0;

  if (varc === 0 && dilr === 0 && qa === 0) {
    alert('Please enter at least one section score.');
    return;
  }

  mobData.varc = varc; mobData.dilr = dilr; mobData.qa = qa;
  mobSetStep(2);

  // Generate diagnosis using Anthropic API
  const diagnosisEl = document.getElementById('mob-diagnosis-text');
  diagnosisEl.className = 'mob-diagnosis loading';
  diagnosisEl.textContent = 'Analysing your mock scores...';

  try {
    const total = varc + dilr + qa;
    const weakSection = dilr <= qa && dilr <= varc ? 'DILR' : qa <= varc && qa <= dilr ? 'QA' : 'VARC';
    
    const prompt = `A CAT aspirant just gave a mock with these scores: VARC: ${varc}/72, DILR: ${dilr}/60, QA: ${qa}/60. Total: ${total}/192.

Based on these scores, give a mentor-style diagnosis in 2-3 sentences. Sound like a real mentor who has seen this pattern before — not a tool. Make an educated hypothesis about WHY the weakest section (${weakSection}) is struggling — is it a concept gap, execution/speed issue, or careless mistakes? State it as a hypothesis not a fact. End with one specific question to confirm your reading. Be warm and direct.`;

    const response = await fetch(WORKER_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 150,
        system: 'You are Marg, a warm and direct CAT mentor. Give a 2-3 sentence mentor-style diagnosis based on mock scores. State hypothesis as question not fact. Be specific and personal.',
        messages: [{ role: 'user', content: prompt }]
      })
    });

    const data = await response.json();
    const diagnosis = data.content && data.content[0] ? data.content[0].text : null;
    if (!diagnosis) throw new Error('No response');
    
    diagnosisEl.className = 'mob-diagnosis';
    diagnosisEl.textContent = diagnosis;
    
    document.getElementById('mob-step2-next').style.display = 'block';
    document.getElementById('mob-step2-skip').style.display = 'block';
    
    // Store diagnosis for later
    mobData.diagnosis = diagnosis;

  } catch(e) {
    const total = mobData.varc + mobData.dilr + mobData.qa;
    const weakSection = mobData.dilr <= mobData.qa && mobData.dilr <= mobData.varc ? 'DILR' : mobData.qa <= mobData.varc && mobData.qa <= mobData.dilr ? 'QA' : 'VARC';
    diagnosisEl.className = 'mob-diagnosis';
    diagnosisEl.textContent = `Based on your scores — ${weakSection} looks like the main area to focus on. Your total of ${total} suggests there's real room to improve with the right diagnosis. Let me ask you a couple of quick questions to understand what's actually happening.`;
    document.getElementById('mob-step2-next').style.display = 'block';
    document.getElementById('mob-step2-skip').style.display = 'block';
  }
}

function skipMockOnboarding() {
  document.getElementById('mock-onboarding-overlay').style.display = 'none';
  showWelcomeMarg();
}

async function finishMockOnboarding() {
  const varc = parseFloat(document.getElementById('mob-varc').value) || 0;
  const dilr = parseFloat(document.getElementById('mob-dilr').value) || 0;
  const qa = parseFloat(document.getElementById('mob-qa').value) || 0;
  const attempt = document.getElementById('mob-attempt-select').value || '1st attempt';
  const weak = document.getElementById('mob-weak-select').value || 'VARC';

  document.getElementById('mock-onboarding-overlay').style.display = 'none';

  studentProfile.attemptNumber = attempt;
  studentProfile.monthsLeft = calculateMonthsLeftForCAT();
  studentProfile.weakestSection = weak;
  studentProfile.dailyHours = '3-4 hours';
  studentProfile.situation = 'Full-time CAT prep';

  onboardingComplete = true;
  await saveProfile();
  showBottomNav();

  document.getElementById('user-input').disabled = false;
  document.getElementById('send-btn').disabled = false;

  // Save mock scores
  await saveMockScore(varc, dilr, qa);

  // Build context message
  const total = varc + dilr + qa;
  const contextMsg = 'I just gave a mock. My scores: VARC ' + varc + ', DILR ' + dilr + ', QA ' + qa + '. Total: ' + total + '. It is my ' + attempt + ' and my weakest section is ' + weak + '. Please analyse this and tell me what to fix first.';
  conversationHistory.push({ role: 'user', content: contextMsg });
  showTyping();

  try {
    const res = await fetch(WORKER_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 600,
        system: SYSTEM_PROMPT,
        messages: conversationHistory
      })
    });
    const data = await res.json();
    const response = data.content && data.content[0] ? data.content[0].text : null;
    hideTyping();
    if (response) {
      addMessage('marg', response);
      conversationHistory.push({ role: 'assistant', content: response });
    }
  } catch(e) {
    hideTyping();
    addMessage('marg', 'Got your scores — VARC ' + varc + ', DILR ' + dilr + ', QA ' + qa + '. Let me analyse what this tells us. Which section do you feel went worst?');
  }
}


async function saveCognitivePattern(varc, dilr, qa) {
  if (!currentUser || !SUPABASE_TOKEN) return;
  try {
    const updates = {};
    if (varc) updates.varc_cognitive_pattern = varc;
    if (dilr) updates.dilr_cognitive_pattern = dilr;
    if (qa) updates.qa_cognitive_pattern = qa;
    if (Object.keys(updates).length === 0) return;
    updates.user_id = currentUser.id;
    await fetch(SUPABASE_URL + '/rest/v1/profiles', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': SUPABASE_ANON_KEY,
        'Authorization': 'Bearer ' + SUPABASE_TOKEN,
        'Prefer': 'resolution=merge-duplicates'
      },
      body: JSON.stringify(updates)
    });
  } catch(e) { console.error('saveCognitivePattern error:', e); }
}

async function saveMockScore(varc, dilr, qa) {
  if (!currentUser || !SUPABASE_TOKEN) return;
  try {
    // Get existing mock history
    const res = await fetch(
      SUPABASE_URL + '/rest/v1/profiles?select=mock_history,sessions_count&user_id=eq.' + currentUser.id,
      { headers: { 'apikey': SUPABASE_ANON_KEY, 'Authorization': 'Bearer ' + SUPABASE_TOKEN } }
    );
    const data = await res.json();
    const existing = data[0]?.mock_history || [];
    const sessionsCount = (data[0]?.sessions_count || 0) + 1;
    
    const newEntry = {
      date: new Date().toISOString().split('T')[0],
      varc: varc, dilr: dilr, qa: qa,
      total: varc + dilr + qa
    };
    const updated = [...existing, newEntry].slice(-20); // keep last 20 mocks
    
    await fetch(SUPABASE_URL + '/rest/v1/profiles', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': SUPABASE_ANON_KEY,
        'Authorization': 'Bearer ' + SUPABASE_TOKEN,
        'Prefer': 'resolution=merge-duplicates'
      },
      body: JSON.stringify({
        user_id: currentUser.id,
        mock_history: updated,
        sessions_count: sessionsCount
      })
    });
  } catch(e) { console.error('saveMockScore error:', e); }
}

async function saveSessionSummary(summary) {
  if (!currentUser || !SUPABASE_TOKEN) return;
  try {
    await fetch(SUPABASE_URL + '/rest/v1/profiles', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': SUPABASE_ANON_KEY,
        'Authorization': 'Bearer ' + SUPABASE_TOKEN,
        'Prefer': 'resolution=merge-duplicates'
      },
      body: JSON.stringify({
        user_id: currentUser.id,
        session_summary: summary
      })
    });
    studentProfile.sessionSummary = summary;
  } catch(e) { console.error('saveSessionSummary error:', e); }
}

async function generateAndSaveSessionSummary() {
  if (!currentUser || conversationHistory.length < 4) return;
  try {
    // Build a summary of this session using the last 20 messages
    const recentHistory = conversationHistory.slice(-20);
    const summaryPrompt = 'Summarise this CAT mentoring session in 3-4 sentences. Focus on: what topic was discussed, what specific problem or weakness was identified, what advice or task was given, and what the student should work on next. Be specific - include section names, topic names, scores if mentioned. This summary will be used to give the student continuity in their next session.';
    
    const res = await fetch(WORKER_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 200,
        system: 'You are a helpful assistant that summarises tutoring sessions concisely.',
        messages: [...recentHistory, { role: 'user', content: summaryPrompt }]
      })
    });
    const data = await res.json();
    const summary = data.content && data.content[0] ? data.content[0].text : null;
    if (summary) {
      await saveSessionSummary(summary);
    }
  } catch(e) { console.error('generateAndSaveSessionSummary error:', e); }
}

async function saveLastTask(task, insight) {
  if (!currentUser || !SUPABASE_TOKEN) return;
  try {
    await fetch(SUPABASE_URL + '/rest/v1/profiles', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': SUPABASE_ANON_KEY,
        'Authorization': 'Bearer ' + SUPABASE_TOKEN,
        'Prefer': 'resolution=merge-duplicates'
      },
      body: JSON.stringify({
        user_id: currentUser.id,
        last_task: task,
        last_insight: insight,
        last_session_date: new Date().toISOString().split('T')[0]
      })
    });
  } catch(e) { console.error('saveLastTask error:', e); }
}

async function getLastSession() {
  if (!currentUser || !SUPABASE_TOKEN) return null;
  try {
    const res = await fetch(
      SUPABASE_URL + '/rest/v1/profiles?select=last_task,last_insight,last_session_date,varc_cognitive_pattern,dilr_cognitive_pattern,qa_cognitive_pattern,mock_history,sessions_count&user_id=eq.' + currentUser.id,
      {
        headers: {
          'apikey': SUPABASE_ANON_KEY,
          'Authorization': 'Bearer ' + SUPABASE_TOKEN
        }
      }
    );
    const data = await res.json();
    if (data && data.length > 0) return data[0];
    return null;
  } catch(e) { return null; }
}

// ─── TOMORROW TASK MEMORY ───
async function saveTomorrowTask(task) {
  if (!currentUser || !SUPABASE_TOKEN) return;
  try {
    const headers = {
      'Content-Type': 'application/json',
      'apikey': SUPABASE_ANON_KEY,
      'Authorization': 'Bearer ' + SUPABASE_TOKEN,
      'Prefer': 'resolution=merge-duplicates'
    };
    await fetch(SUPABASE_URL + '/rest/v1/profiles', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        user_id: currentUser.id,
        last_task: task,
        last_task_date: new Date().toISOString().split('T')[0]
      })
    });
  } catch(e) { console.error('saveTomorrowTask error:', e); }
}

async function getLastTask() {
  if (!currentUser || !SUPABASE_TOKEN) return null;
  try {
    const res = await fetch(
      SUPABASE_URL + '/rest/v1/profiles?select=last_task,last_task_date&user_id=eq.' + currentUser.id,
      { headers: { 'apikey': SUPABASE_ANON_KEY, 'Authorization': 'Bearer ' + SUPABASE_TOKEN } }
    );
    const data = await res.json();
    if (data && data.length > 0 && data[0].last_task) {
      const taskDate = data[0].last_task_date;
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      const yesterdayStr = yesterday.toISOString().split('T')[0];
      const twoDaysAgo = new Date();
      twoDaysAgo.setDate(twoDaysAgo.getDate() - 2);
      const twoDaysAgoStr = twoDaysAgo.toISOString().split('T')[0];
      // Return task if it was assigned yesterday or up to 2 days ago
      if (taskDate === yesterdayStr || taskDate === twoDaysAgoStr) {
        return data[0].last_task;
      }
    }
    return null;
  } catch(e) { return null; }
}

function extractTomorrowTask(margResponse) {
  // Extract the tomorrow task from Marg's response
  const patterns = [
    /tomorrow[^.]*?[—:-]\s*([^.\n]+)/i,
    /your task[^.]*?[—:-]\s*([^.\n]+)/i,
    /come back[^.]*after[^.]*?([^.\n]+)/i,
    /tomorrow morning[^.]*?[—:-]\s*([^.\n]+)/i,
    /do this tomorrow[^.]*?[—:-]\s*([^.\n]+)/i
  ];
  for (const pattern of patterns) {
    const match = margResponse.match(pattern);
    if (match && match[1] && match[1].length > 10 && match[1].length < 200) {
      return match[1].trim().replace(/[.!?]$/, '');
    }
  }
  return null;
}


// ─── IN-CHAT MOCK ANALYSIS FLOW ───
function startMockAnalysis() {
  // If not logged in or onboarding not complete, still show the card
  // Don't silently block - always show the mock analysis interface
  
  // Show mock analysis card in chat
  // Remove existing card if present
  const existingCard = document.getElementById('mock-analysis-card');
  if (existingCard) existingCard.remove();
  
  const card = document.createElement('div');
  card.className = 'mock-analysis-card';
  card.id = 'mock-analysis-card';
  card.innerHTML = `
    <div class="mac-header">
      <div class="mac-title">📊 Mock Analysis</div>
      <div class="mac-sub">Let's find exactly where your marks are leaking</div>
    </div>
    <div class="mac-body">
      <div class="mac-step" id="mac-step-1">
        <div class="mac-label">Step 1 — Your scores</div>
        <div class="mac-inputs">
          <div class="mac-input-group">
            <label>VARC</label>
            <input type="number" id="mac-varc" placeholder="e.g. 28" min="0" max="72"/>
          </div>
          <div class="mac-input-group">
            <label>DILR</label>
            <input type="number" id="mac-dilr" placeholder="e.g. 18" min="0" max="60"/>
          </div>
          <div class="mac-input-group">
            <label>QA</label>
            <input type="number" id="mac-qa" placeholder="e.g. 22" min="0" max="60"/>
          </div>
        </div>
        <button class="mac-btn" onclick="submitMockScores()">Analyse my mock →</button>
      </div>
    </div>
  `;
  
  const messages = document.getElementById('messages');
  messages.appendChild(card);
  messages.scrollTop = messages.scrollHeight;
}

async function submitMockScores() {
  const varc = parseInt(document.getElementById('mac-varc').value) || 0;
  const dilr = parseInt(document.getElementById('mac-dilr').value) || 0;
  const qa = parseInt(document.getElementById('mac-qa').value) || 0;

  if (varc === 0 && dilr === 0 && qa === 0) {
    alert('Please enter at least one section score.');
    return;
  }

  // Remove the card
  const card = document.getElementById('mock-analysis-card');
  if (card) card.remove();

  // Send to Marg as a structured message
  const mockMsg = `I just completed a mock. My scores are: VARC: ${varc}, DILR: ${dilr}, QA: ${qa}. Please analyse my mock and tell me exactly which bucket is costing me marks — concept gap, execution lag, or careless mistake. Give me one specific task to fix before my next mock.`;
  
  addMessage('user', `📊 Mock scores — VARC: ${varc} | DILR: ${dilr} | QA: ${qa}`);
  
  // Send to Marg API
  conversationHistory.push({ role: 'user', content: mockMsg });
  showTyping();
  
  try {
    const res = await fetch(WORKER_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 400,
        system: SYSTEM_PROMPT,
        messages: conversationHistory
      })
    });
    const data = await res.json();
    const response = data.content && data.content[0] ? data.content[0].text : null;
    hideTyping();
    if (response) {
      addMessage('marg', response);
      conversationHistory.push({ role: 'assistant', content: response });
    } else {
      addMessage('marg', 'Based on your scores — which section felt most frustrating today? Tell me what was happening when you attempted those questions.');
    }
  } catch(e) {
    hideTyping();
    addMessage('marg', 'Based on your scores — which section felt most frustrating today? Tell me what was happening when you attempted those questions.');
  }
}

// ─── PROFILE SETUP & DIAGNOSIS ───
let newUserProfile = {};

function showProfileSetup() {
  document.getElementById('profile-setup-overlay').style.display = 'flex';
}

function hideProfileSetup() {
  document.getElementById('profile-setup-overlay').style.display = 'none';
}

function skipProfileSetup() {
  hideProfileSetup();
  startChat();
}

function submitProfileSetup() {
  try {
    var category = (document.getElementById('ps-category') || {}).value || 'general';
    var tenth = parseFloat((document.getElementById('ps-tenth') || {}).value) || 0;
    var twelfth = parseFloat((document.getElementById('ps-twelfth') || {}).value) || 0;
    var grad = parseFloat((document.getElementById('ps-grad') || {}).value) || 0;
    var mock = (document.getElementById('ps-mock') || {}).value || 'none';
    var weak = (document.getElementById('ps-weak') || {}).value || 'VARC';
    var email = ((document.getElementById('ps-email') || {}).value || '').trim();

    newUserProfile = { category: category, tenth: tenth, twelfth: twelfth, grad: grad, mock: mock, weak: weak, email: email };

    if (email && currentUser) {
      fetch(SUPABASE_URL + '/rest/v1/profiles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'apikey': SUPABASE_ANON_KEY, 'Authorization': 'Bearer ' + SUPABASE_TOKEN, 'Prefer': 'resolution=merge-duplicates' },
        body: JSON.stringify({ user_id: currentUser.id, notification_email: email })
      }).catch(function() {});
    }

    // Hide profile setup
    var psOverlay = document.getElementById('profile-setup-overlay');
    if (psOverlay) psOverlay.style.display = 'none';

    // Show diagnosis
    showDiagnosis(newUserProfile);
  } catch(err) {
    console.error('submitProfileSetup error:', err);
    // Fallback - skip to onboarding questions
    var psOverlay = document.getElementById('profile-setup-overlay');
    if (psOverlay) psOverlay.style.display = 'none';
    startOnboardingQuestions();
  }
}

function showDiagnosis(profile) {
  var overlay = document.getElementById('diagnosis-overlay');
  if (!overlay) { startOnboardingQuestions(); return; }
  overlay.style.display = 'flex';
  overlay.style.flexDirection = 'column';

  // Target percentile by category
  var targets = { general: 99.0, obc: 96.0, sc: 88.0, st: 80.0, ews: 97.0 };
  var target = targets[profile.category] || 99.0;
  document.getElementById('diag-percentile').textContent = target + '+';

  // Academic risk
  var acadScore = (profile.tenth * 0.3 + profile.twelfth * 0.3 + profile.grad * 0.4);
  var acadRisk = 'low';
  if (acadScore < 65) acadRisk = 'high';
  else if (acadScore < 75) acadRisk = 'mid';

  // Mock risk
  var mockRisk = 'high';
  if (profile.mock === '99+' || profile.mock === '95-99') mockRisk = 'low';
  else if (profile.mock === '90-95' || profile.mock === '80-90') mockRisk = 'mid';

  var riskLabels = { high: 'High risk', mid: 'Moderate risk', low: 'On track' };
  var riskClasses = { high: 'risk-high', mid: 'risk-mid', low: 'risk-low' };
  var mockLabel = profile.mock === 'none' ? 'No mock given yet' : 'Mock: ' + profile.mock + ' percentile';

  // IIM tier targeting
  var tier = 'Tier 1 IIMs (IIM A/B/C)';
  if (target < 95) tier = 'Tier 2 IIMs (IIM K/L/I)';
  if (target < 90) tier = 'Tier 3 IIMs + New IIMs';
  document.getElementById('diag-title').textContent = 'Your IIM Profile — ' + tier;

  document.getElementById('diag-risk-grid').innerHTML =
    '<div class="risk-item"><span class="risk-label">Academic score</span><span class="risk-badge ' + riskClasses[acadRisk] + '">' + riskLabels[acadRisk] + '</span></div>' +
    '<div class="risk-item"><span class="risk-label">' + mockLabel + '</span><span class="risk-badge ' + riskClasses[mockRisk] + '">' + riskLabels[mockRisk] + '</span></div>' +
    '<div class="risk-item"><span class="risk-label">Weakest: ' + profile.weak + '</span><span class="risk-badge risk-high">Needs work</span></div>';

  // Threat text
  var threats = {
    VARC: 'VARC inconsistency at ' + target + '+ is the biggest reason aspirants miss IIM calls despite strong QA.',
    DILR: 'DILR is the most unpredictable section — one bad set selection decision can drop your percentile by 5+.',
    QA: 'At ' + target + '+ percentile, even 2-3 careless QA mistakes cost an IIM call.',
    All: 'Trying to fix all three sections simultaneously is the most common reason scores stagnate. One section at a time.'
  };
  document.getElementById('diag-threat-text').textContent = threats[profile.weak] || threats['All'];
}

function startOnboardingQuestions() {
  document.getElementById('diagnosis-overlay').style.display = 'none';
  // Start the 5-question onboarding through chat
  document.getElementById('user-input').disabled = false;
  document.getElementById('send-btn').disabled = false;
  startOnboardingChat();
}

function skipToChat() {
  document.getElementById('diagnosis-overlay').style.display = 'none';
  studentProfile.weakestSection = newUserProfile.weak === 'All' ? 'All sections' : newUserProfile.weak;
  studentProfile.situation = 'CAT aspirant';
  studentProfile.dailyHours = '3-4 hours';
  studentProfile.monthsLeft = calculateMonthsLeftForCAT();
  studentProfile.attemptNumber = '1st attempt';
  finishOnboarding();
}


function showDiagnosis(profile) {
  const overlay = document.getElementById('diagnosis-overlay');
  
  // Calculate target percentile based on category
  const targets = {
    general: 99.0, obc: 96.0, sc: 88.0, st: 80.0, ews: 97.0
  };
  const target = targets[profile.category] || 99.0;
  document.getElementById('diag-percentile').textContent = target + '+';

  // Academic risk
  const acadScore = (profile.tenth * 0.3 + profile.twelfth * 0.3 + profile.grad * 0.4);
  let acadRisk = 'low';
  if (acadScore < 65) acadRisk = 'high';
  else if (acadScore < 75) acadRisk = 'mid';

  // Mock risk
  let mockRisk = 'high';
  if (profile.mock === '99+') mockRisk = 'low';
  else if (profile.mock === '95-99') mockRisk = 'low';
  else if (profile.mock === '90-95') mockRisk = 'mid';
  else if (profile.mock === '80-90') mockRisk = 'mid';

  // Section risk
  const sectionRisk = profile.weak === 'All' ? 'high' : 'high';

  const riskLabels = { high: 'Focus area', mid: 'Looking good', low: 'Strong ✓' };
  const riskClasses = { high: 'risk-high', mid: 'risk-mid', low: 'risk-low' };

  const mockLabel = profile.mock === 'none' ? 'No mock given yet' : 'Mock: ' + profile.mock + ' percentile';

  document.getElementById('diag-risk-grid').innerHTML = 
    '<div class="risk-item"><span class="risk-label">Academic score</span><span class="risk-badge ' + riskClasses[acadRisk] + '">' + riskLabels[acadRisk] + '</span></div>' +
    '<div class="risk-item"><span class="risk-label">' + mockLabel + '</span><span class="risk-badge ' + riskClasses[mockRisk] + '">' + riskLabels[mockRisk] + '</span></div>' +
    '<div class="risk-item"><span class="risk-label">Weakest: ' + profile.weak + '</span><span class="risk-badge risk-high">High risk</span></div>';

  // Threat text
  const threats = {
    VARC: 'VARC is where the biggest score jumps happen fastest — one focused month on active reading technique can move your percentile more than 3 months of scattered prep.',
    DILR: 'DILR is the highest-leverage section to improve right now — students who crack set selection strategy early see the fastest overall percentile improvement.',
    QA: 'QA is the most predictable section to improve — it responds fastest to structured practice. Getting this right gives you a solid base to build from.',
    All: 'Starting with a clear priority order rather than covering everything equally is what separates students who improve fast from those who plateau. Let Marg help you figure out where to start.'
  };
  document.getElementById('diag-threat-text').textContent = threats[profile.weak] || threats['All'];

  // Primary button text
  document.getElementById('diag-btn-primary').textContent = 'Fix my ' + profile.weak + ' — start now →';

  overlay.style.display = 'flex';
}

function startDiagnosisChat(type) {
  document.getElementById('diagnosis-overlay').style.display = 'none';
  
  // Pre-fill conversation context based on diagnosis
  const weak = newUserProfile.weak || 'VARC';
  const mock = newUserProfile.mock || 'none';
  
  let firstMessage = '';
  if (type === 'primary') {
    firstMessage = 'I just completed my profile setup. My weakest section is ' + weak + ' and I want to fix it specifically. Based on my diagnosis, what should I do first?';
  } else {
    firstMessage = 'I want to analyze my last mock score. My current mock percentile is ' + mock + ' and my weakest section is ' + weak + '. Help me understand what to fix.';
  }

  // Store for after chat loads
  localStorage.setItem('marg_first_message', firstMessage);
  startChat();
}

function prefillMessage(text) {
  const input = document.getElementById('user-input');
  if (input && !input.disabled) {
    input.value = text;
    input.focus();
    input.dispatchEvent(new Event('input'));
  }
}

function startChat() {
  // Called after profile setup - now run the 5-question onboarding
  document.getElementById('user-input').disabled = false;
  document.getElementById('send-btn').disabled = false;
  
  // Check if there's a pre-set first message (from diagnosis buttons)
  const firstMsg = localStorage.getItem('marg_first_message');
  if (firstMsg) {
    localStorage.removeItem('marg_first_message');
    // Store profile context but run 5 questions first
    setTimeout(function() {
      // Run 5 question onboarding
      addMessage('marg', onboardingFlow[0].message);
      addOnboardingCard(0);
    }, 400);
  } else {
    // Normal flow - run 5 questions
    setTimeout(function() {
      addMessage('marg', onboardingFlow[0].message);
      addOnboardingCard(0);
    }, 400);
  }
}


window.onload = initSession;


// ═══════════════════════════════════════════════
// TAB NAVIGATION
// ═══════════════════════════════════════════════

var currentTab = 'chat';
var currentPracticeType = 'rc';
var practiceData = { rc: null, dilr: null, qa: null };
var currentQuestionIndex = 0;
var practiceAnswered = false;
var sessionResults = { correct: 0, wrong: 0, total: 0, mistakes: [], passageTitle: '' };

function switchTab(tab) {
  currentTab = tab;
  document.querySelectorAll('.tab-section').forEach(function(s) { s.classList.remove('active'); });
  document.querySelectorAll('.bnav-btn').forEach(function(b) { b.classList.remove('active'); });
  
  var chatElements = ['messages', 'quick-actions', 'input-area', 'varc-section'];
  
  if (tab === 'chat') {
    chatElements.forEach(function(id) {
      var el = document.getElementById(id);
      if (el) el.style.display = '';
    });
    document.getElementById('bnav-chat').classList.add('active');
    if (window._practiceCompleteSummary) {
      setTimeout(function() {
        prefillMessage(window._practiceCompleteSummary);
        window._practiceCompleteSummary = null;
      }, 300);
    }
  } else {
    chatElements.forEach(function(id) {
      var el = document.getElementById(id);
      if (el) el.style.display = 'none';
    });
    if (tab === 'practice') {
      document.getElementById('practice-tab').classList.add('active');
      document.getElementById('bnav-practice').classList.add('active');
      loadDailyPractice();
    } else if (tab === 'progress') {
      document.getElementById('progress-tab').classList.add('active');
      document.getElementById('bnav-progress').classList.add('active');
      loadProgressDashboard();
    }
  }
}

function showBottomNav() {
  var nav = document.getElementById('bottom-nav');
  if (nav) nav.classList.add('visible');
  var fbBtn = document.getElementById('feedback-btn');
  if (fbBtn) fbBtn.style.display = 'block';
}

// ═══════════════════════════════════════════════
// PRACTICE TAB
// ═══════════════════════════════════════════════

function switchPracticeTab(type) {
  currentPracticeType = type;
  currentQuestionIndex = 0;
  practiceAnswered = false;
  document.querySelectorAll('.ptab-btn').forEach(function(b) { b.classList.remove('active'); });
  var btn = document.getElementById('ptab-' + type);
  if (btn) btn.classList.add('active');
  loadDailyPractice();
}

function buildRCPrompt() {
  var focusArea = '';
  if (studentProfile.varcPattern) {
    focusArea = 'This student specifically: ' + studentProfile.varcPattern + '. ';
  }
  var recentMistakes = '';
  if (studentProfile.recentMistakes && studentProfile.recentMistakes.length > 0) {
    var rcMistakes = studentProfile.recentMistakes.filter(function(m) { return m.type === 'rc'; }).slice(0, 3);
    if (rcMistakes.length > 0) {
      recentMistakes = 'Recent specific mistakes to target: ' + rcMistakes.map(function(m) { return m.insight; }).join('; ') + '. Generate questions that specifically expose and help fix these exact mistakes.';
    }
  }
  return 'Generate a CAT-level RC passage and 3 questions. ' + focusArea + recentMistakes + ' Passage 350-420 words on Philosophy Economics Science Technology Social Issues or Psychology. Dense argument-driven. 3 questions on Primary Purpose, Author Attitude, Inference. 4 options where wrong ones are extreme, out of scope, or reversals. Return ONLY valid JSON: {"passage":"text","difficulty":"Medium or Hard","topic":"name","questions":[{"q":"question","options":["A. text","B. text","C. text","D. text"],"correct":0,"explanation":"why correct and why each wrong is a trap","trap_type":"cognitive error","marg_insight":"what wrong answer reveals about thinking"}]}';
}

function buildDILRPrompt() {
  var focusArea = '';
  if (studentProfile.dilrPattern) {
    focusArea = 'This student specifically: ' + studentProfile.dilrPattern + '. ';
  }
  var recentMistakes = '';
  if (studentProfile.recentMistakes && studentProfile.recentMistakes.length > 0) {
    var dilrMistakes = studentProfile.recentMistakes.filter(function(m) { return m.type === 'dilr'; }).slice(0, 3);
    if (dilrMistakes.length > 0) {
      recentMistakes = 'Recent specific DILR mistakes: ' + dilrMistakes.map(function(m) { return m.insight; }).join('; ') + '. Design the set to specifically expose and help fix these mistakes.';
    }
  }
  return 'Generate a CAT-level DILR set. ' + focusArea + recentMistakes + ' Combine 2 of: Arrangements+Rankings, Scheduling+Grouping, Matrix+Conditions. 5 elements, 4 questions increasing difficulty. Include a time trap. Return ONLY valid JSON: {"set_title":"description","difficulty":"Medium or Hard","constraint_types":["Type1","Type2"],"setup":"full set with all conditions","questions":[{"q":"question","options":["A. opt","B. opt","C. opt","D. opt"],"correct":0,"explanation":"step by step solution","common_mistake":"what students get wrong","marg_insight":"what wrong answer reveals"}]}';
}

function buildQAPrompt() {
  var focusArea = '';
  if (studentProfile.qaPattern) {
    focusArea = 'This student specifically: ' + studentProfile.qaPattern + '. ';
  }
  var recentMistakes = '';
  if (studentProfile.recentMistakes && studentProfile.recentMistakes.length > 0) {
    var qaMistakes = studentProfile.recentMistakes.filter(function(m) { return m.type === 'qa'; }).slice(0, 3);
    if (qaMistakes.length > 0) {
      recentMistakes = 'Recent specific QA mistakes: ' + qaMistakes.map(function(m) { return m.topic + ': ' + m.insight; }).join('; ') + '. Generate questions specifically targeting these exact weaknesses.';
    }
  }
  return 'Generate 2 CAT-level QA questions combining 2 topics each. ' + focusArea + recentMistakes + ' Combine: Percentages+TSD, Ratios+Profit-Loss, or Geometry+Mensuration. 2 conceptual steps each. Wrong options = common calculation mistakes. Return ONLY valid JSON: {"difficulty":"Medium or Hard","topics_combined":["Topic1","Topic2"],"questions":[{"q":"full question","options":["A. val","B. val","C. val","D. val"],"correct":0,"solution":"step by step","common_mistake":"most common error","concept_check":"concept tested","marg_insight":"what wrong answer reveals"}]}';
}

async function loadDailyPractice() {
  sessionResults = { correct: 0, wrong: 0, total: 0, mistakes: [], passageTitle: '' };
  var content = document.getElementById('practice-content');
  
  if (isPracticeDoneToday(currentPracticeType)) {
    showDailyLimitCard(currentPracticeType);
    return;
  }
  
  var dateEl = document.getElementById('practice-date');
  if (dateEl) {
    dateEl.textContent = new Date().toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' });
  }
  
  var typeName = currentPracticeType === 'rc' ? 'RC' : currentPracticeType === 'dilr' ? 'DILR' : 'QA';
  content.innerHTML = '<div class="practice-loading"><div class="practice-spinner"></div><div class="practice-loading-text">Marg is generating today\'s personalised ' + typeName + ' practice based on your profile...</div></div>';
  
  var prompt = '';
  if (currentPracticeType === 'rc') prompt = buildRCPrompt();
  else if (currentPracticeType === 'dilr') prompt = buildDILRPrompt();
  else prompt = buildQAPrompt();
  
  try {
    var res = await fetch(WORKER_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 2000,
        system: 'You are an expert CAT exam question generator. Generate only valid JSON with no markdown, no backticks, no extra text. The JSON must be parseable directly with JSON.parse().',
        messages: [{ role: 'user', content: prompt }]
      })
    });
    
    var data = await res.json();
    var text = data.content && data.content[0] ? data.content[0].text : null;
    if (!text) throw new Error('No response');
    
    var clean = text.replace(/```json/g, '').replace(/```/g, '').trim();
    var practiceJson = JSON.parse(clean);
    practiceData[currentPracticeType] = practiceJson;
    currentQuestionIndex = 0;
    practiceAnswered = false;
    renderPractice(practiceJson);
    
  } catch(e) {
    console.error('Practice error:', e);
    content.innerHTML = '<div class="practice-loading"><div class="practice-loading-text">Having trouble generating practice right now. Try again in a moment.</div><button class="pcard-nav-btn primary" onclick="loadDailyPractice()" style="margin-top:12px;max-width:200px;">Try again</button></div>';
  }
}

function getMorningPromptHtml() {
  if (!studentProfile.lastTask) return '';
  return '<div class="morning-prompt"><div class="morning-prompt-title">Good morning — picking up where you left off</div><div class="morning-prompt-body">Last time: <strong>' + studentProfile.lastTask + '</strong><br>Today\'s practice targets your specific weak areas.</div></div>';
}

function getOptionsHtml(options) {
  return options.map(function(opt, i) {
    return '<button class="pcard-option" onclick="selectAnswer(' + i + ')" data-index="' + i + '">' + opt + '</button>';
  }).join('');
}

function renderPractice(data) {
  var content = document.getElementById('practice-content');
  var morningPrompt = getMorningPromptHtml();
  var q, qNum, total, headerLabel, diffLabel, bodyHtml;
  
  if (currentPracticeType === 'rc') {
    q = data.questions[currentQuestionIndex];
    qNum = currentQuestionIndex + 1;
    total = data.questions.length;
    headerLabel = 'RC — Question ' + qNum + ' of ' + total;
    diffLabel = (data.difficulty || 'Medium') + ' · ' + (data.topic || 'General');
    var passageHtml = currentQuestionIndex === 0 ? '<div class="pcard-passage">' + data.passage + '</div>' : '';
    bodyHtml = passageHtml + '<div class="pcard-question">' + q.q + '</div><div class="pcard-options" id="options-container">' + getOptionsHtml(q.options) + '</div>';
  } else if (currentPracticeType === 'dilr') {
    q = data.questions[currentQuestionIndex];
    qNum = currentQuestionIndex + 1;
    total = data.questions.length;
    headerLabel = 'DILR — Question ' + qNum + ' of ' + total;
    diffLabel = (data.difficulty || 'Medium') + ' · ' + (data.constraint_types || []).join(' + ');
    var setupHtml = currentQuestionIndex === 0 ? '<div class="pcard-passage"><strong>Set:</strong> ' + data.setup + '</div>' : '';
    bodyHtml = setupHtml + '<div class="pcard-question">' + q.q + '</div><div class="pcard-options" id="options-container">' + getOptionsHtml(q.options) + '</div>';
  } else {
    q = data.questions[currentQuestionIndex];
    qNum = currentQuestionIndex + 1;
    total = data.questions.length;
    headerLabel = 'QA — Question ' + qNum + ' of ' + total;
    diffLabel = (data.difficulty || 'Medium') + ' · ' + (data.topics_combined || []).join(' + ');
    bodyHtml = '<div class="pcard-question">' + q.q + '</div><div class="pcard-options" id="options-container">' + getOptionsHtml(q.options) + '</div>';
  }
  
  var prevBtn = currentQuestionIndex > 0 ? '<button class="pcard-nav-btn secondary" onclick="prevQuestion()">Previous</button>' : '';
  var nextLabel = currentQuestionIndex < total - 1 ? 'Next question' : 'Finish session';
  
  content.innerHTML = morningPrompt + '<div class="practice-card"><div class="pcard-header"><div class="pcard-label">' + headerLabel + '</div><div class="pcard-difficulty">' + diffLabel + '</div></div><div class="pcard-body">' + bodyHtml + '<div class="pcard-explanation" id="explanation-box"><div class="explanation-title">Answer &amp; Analysis</div><div class="explanation-body" id="explanation-body"></div><div class="marg-insight" id="marg-insight"></div></div></div><div class="pcard-nav">' + prevBtn + '<button class="pcard-nav-btn primary" id="next-btn" onclick="nextQuestion()" disabled>' + nextLabel + '</button></div></div>';
}

function selectAnswer(selectedIndex) {
  if (practiceAnswered) return;
  practiceAnswered = true;
  
  var data = practiceData[currentPracticeType];
  var q = data.questions[currentQuestionIndex];
  var correct = q.correct;
  var isCorrect = selectedIndex === correct;
  
  document.querySelectorAll('.pcard-option').forEach(function(btn, i) {
    if (i === correct) btn.classList.add('correct');
    else if (i === selectedIndex && !isCorrect) btn.classList.add('wrong');
    btn.style.cursor = 'default';
  });
  
  var box = document.getElementById('explanation-box');
  var body = document.getElementById('explanation-body');
  var insight = document.getElementById('marg-insight');
  
  var explanationText = '';
  var insightText = '';
  
  if (currentPracticeType === 'rc') {
    explanationText = q.explanation || '';
    insightText = isCorrect ? 'Good read — you found the right line.' : (q.marg_insight || '') + (q.trap_type ? ' This is the ' + q.trap_type + ' trap.' : '');
  } else if (currentPracticeType === 'dilr') {
    explanationText = (q.explanation || '') + (q.common_mistake ? '<br><br><strong>Common mistake:</strong> ' + q.common_mistake : '');
    insightText = isCorrect ? 'Clean solve.' : (q.marg_insight || '');
  } else {
    explanationText = (q.solution || '') + (q.common_mistake ? '<br><br><strong>Watch out for:</strong> ' + q.common_mistake : '');
    insightText = isCorrect ? 'Correct approach.' : (q.marg_insight || '') + (q.concept_check ? ' (Topic: ' + q.concept_check + ')' : '');
  }
  
  body.innerHTML = explanationText;
  insight.textContent = insightText;
  box.classList.add('visible');
  
  var nextBtn = document.getElementById('next-btn');
  if (nextBtn) nextBtn.disabled = false;
  
  // Track session results
  sessionResults.total++;
  if (isCorrect) {
    sessionResults.correct++;
  } else {
    sessionResults.wrong++;
    if (q.marg_insight) {
      sessionResults.mistakes.push({
        topic: q.concept_check || q.trap_type || currentPracticeType.toUpperCase(),
        insight: q.marg_insight,
        trap: q.trap_type || ''
      });
    }
  }
  // Store passage/set title
  var data = practiceData[currentPracticeType];
  if (data && data.topic) sessionResults.passageTitle = data.topic;
  if (data && data.set_title) sessionResults.passageTitle = data.set_title;
  if (data && data.topics_combined) sessionResults.passageTitle = data.topics_combined.join(' + ');

  if (!isCorrect && q.marg_insight) {
    updateCognitivePattern(currentPracticeType, q.marg_insight);
    showInsightToast('<strong>Marg just learned something</strong><br>' + q.marg_insight);
    storeWrongAnswer(currentPracticeType, q, q.marg_insight);
  }
  incrementSessionCount();
}

function storeWrongAnswer(type, question, insight) {
  try {
    var key = 'marg_wrong_answers_' + (currentUser ? currentUser.id : 'guest');
    var existing = JSON.parse(localStorage.getItem(key) || '[]');
    var entry = {
      date: new Date().toISOString().split('T')[0],
      type: type,
      topic: question.concept_check || question.trap_type || type.toUpperCase(),
      insight: insight,
      questionText: (question.q || '').substring(0, 80)
    };
    existing.unshift(entry);
    // Keep only last 10 wrong answers
    existing = existing.slice(0, 10);
    localStorage.setItem(key, JSON.stringify(existing));
    studentProfile.recentMistakes = existing;
  } catch(e) {}
}

function loadRecentMistakes() {
  try {
    var key = 'marg_wrong_answers_' + (currentUser ? currentUser.id : 'guest');
    var mistakes = JSON.parse(localStorage.getItem(key) || '[]');
    studentProfile.recentMistakes = mistakes;
    return mistakes;
  } catch(e) { return []; }
}

async function updateCognitivePattern(type, insight) {
  if (!currentUser || !SUPABASE_TOKEN) return;
  try {
    var colMap = { rc: 'varc_cognitive_pattern', dilr: 'dilr_cognitive_pattern', qa: 'qa_cognitive_pattern' };
    var profMap = { rc: 'varcPattern', dilr: 'dilrPattern', qa: 'qaPattern' };
    var col = colMap[type];
    
    var res = await fetch(SUPABASE_URL + '/rest/v1/profiles?select=' + col + '&user_id=eq.' + currentUser.id, {
      headers: { 'apikey': SUPABASE_ANON_KEY, 'Authorization': 'Bearer ' + SUPABASE_TOKEN }
    });
    var data = await res.json();
    var existing = (data[0] && data[0][col]) ? data[0][col] : '';
    var updated = existing ? existing + '; ' + insight : insight;
    var parts = updated.split('; ').slice(-3).join('; ');
    
    var updates = { user_id: currentUser.id };
    updates[col] = parts;
    
    await fetch(SUPABASE_URL + '/rest/v1/profiles', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'apikey': SUPABASE_ANON_KEY, 'Authorization': 'Bearer ' + SUPABASE_TOKEN, 'Prefer': 'resolution=merge-duplicates' },
      body: JSON.stringify(updates)
    });
    
    studentProfile[profMap[type]] = parts;
  } catch(e) { console.error('updateCognitivePattern error:', e); }
}

// Save session summary when user leaves or switches tabs
document.addEventListener('visibilitychange', function() {
  if (document.visibilityState === 'hidden' && onboardingComplete && conversationHistory.length >= 4) {
    generateAndSaveSessionSummary();
  }
});

window.addEventListener('beforeunload', function() {
  if (onboardingComplete && conversationHistory.length >= 4) {
    generateAndSaveSessionSummary();
  }
});

async function incrementSessionCount() {
  if (!currentUser || !SUPABASE_TOKEN) return;
  try {
    var newCount = (studentProfile.sessionsCount || 0) + 1;
    studentProfile.sessionsCount = newCount;
    await fetch(SUPABASE_URL + '/rest/v1/profiles', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'apikey': SUPABASE_ANON_KEY, 'Authorization': 'Bearer ' + SUPABASE_TOKEN, 'Prefer': 'resolution=merge-duplicates' },
      body: JSON.stringify({ user_id: currentUser.id, sessions_count: newCount })
    });
  } catch(e) {}
}

function nextQuestion() {
  var data = practiceData[currentPracticeType];
  if (!data) return;
  var total = data.questions.length;
  if (currentQuestionIndex < total - 1) {
    currentQuestionIndex++;
    practiceAnswered = false;
    renderPractice(data);
  } else {
    showPracticeSummary();
  }
}

function prevQuestion() {
  if (currentQuestionIndex > 0) {
    currentQuestionIndex--;
    practiceAnswered = true;
    renderPractice(practiceData[currentPracticeType]);
  }
}

function showPracticeSummary() {
  markPracticeDoneToday(currentPracticeType);
  var content = document.getElementById('practice-content');
  var type = currentPracticeType.toUpperCase();
  content.innerHTML = '<div class="practice-card"><div class="pcard-header"><div class="pcard-label">Session Complete</div></div><div class="pcard-body"><div style="text-align:center;padding:20px 0;"><div style="font-size:32px;margin-bottom:12px;">🎯</div><div style="font-size:16px;color:var(--text);font-weight:600;margin-bottom:8px;">' + type + ' session done</div><div style="font-size:13px;color:var(--text-dim);line-height:1.6;margin-bottom:20px;">Marg has updated your cognitive profile. Tomorrow\'s questions will be more targeted.</div><button class="pcard-nav-btn primary" onclick="switchTab(\'chat\')" style="max-width:200px;margin:0 auto;">Talk to Marg about today</button></div></div></div>';
  window._practiceCompleteSummary = 'I just completed today' + "'" + 's ' + type + ' practice session on Marg. My cognitive pattern: ' + (type === 'rc' ? studentProfile.varcCognitivePattern : type === 'dilr' ? studentProfile.dilrCognitivePattern : studentProfile.qaCognitivePattern) + '. What one specific thing should I focus on next?';
}

// ═══════════════════════════════════════════════
// PROGRESS DASHBOARD
// ═══════════════════════════════════════════════

async function loadProgressDashboard() {
  var sessEl = document.getElementById('stat-sessions');
  if (sessEl) sessEl.textContent = studentProfile.sessionsCount || 0;
  
  var mockHistory = studentProfile.mockHistory || [];
  var mocksEl = document.getElementById('stat-mocks');
  if (mocksEl) mocksEl.textContent = mockHistory.length;
  
  try {
    var res = await fetch(SUPABASE_URL + '/rest/v1/checkins?select=date&user_id=eq.' + currentUser.id + '&order=date.desc&limit=30', {
      headers: { 'apikey': SUPABASE_ANON_KEY, 'Authorization': 'Bearer ' + SUPABASE_TOKEN }
    });
    var checkins = await res.json();
    var streak = 0;
    var d = new Date();
    d.setDate(d.getDate() - 1);
    var dates = new Set((checkins || []).map(function(c) { return c.date; }));
    while (dates.has(d.toISOString().split('T')[0])) { streak++; d.setDate(d.getDate() - 1); }
    var streakEl = document.getElementById('stat-streak');
    if (streakEl) streakEl.textContent = streak + (streak > 0 ? ' 🔥' : '');
  } catch(e) {
    var streakEl = document.getElementById('stat-streak');
    if (streakEl) streakEl.textContent = '-';
  }
  
  renderMockChart(mockHistory);
  
  var varcEl = document.getElementById('varc-pattern-display');
  if (varcEl && studentProfile.varcPattern) varcEl.textContent = studentProfile.varcPattern;
  var dilrEl = document.getElementById('dilr-pattern-display');
  if (dilrEl && studentProfile.dilrPattern) dilrEl.textContent = studentProfile.dilrPattern;
  var qaEl = document.getElementById('qa-pattern-display');
  if (qaEl && studentProfile.qaPattern) qaEl.textContent = studentProfile.qaPattern;
  
  if (mockHistory.length === 0 && !studentProfile.sessionsCount) {
    var empty = document.getElementById('progress-empty');
    var chart = document.getElementById('mock-chart-card');
    if (empty) empty.style.display = 'block';
    if (chart) chart.style.display = 'none';
  }
  
  if (new Date().getDay() === 0 && mockHistory.length > 1) {
    generateWeeklyMentorReport(mockHistory);
  }
}

function renderMockChart(history) {
  var barsContainer = document.getElementById('chart-bars');
  var labelsContainer = document.getElementById('chart-labels');
  if (!barsContainer) return;
  
  if (!history || history.length === 0) {
    barsContainer.innerHTML = '<div style="text-align:center;color:var(--text-dim);font-size:12px;width:100%;padding:20px;">No mock data yet — share your mock scores with Marg to track progress</div>';
    return;
  }
  
  var recent = history.slice(-8);
  barsContainer.innerHTML = recent.map(function(mock) {
    var varcH = Math.round((mock.varc / 72) * 100);
    var dilrH = Math.round((mock.dilr / 60) * 100);
    var qaH = Math.round((mock.qa / 60) * 100);
    return '<div class="chart-bar-group"><div class="chart-bar varc" style="height:' + varcH + '%"></div><div class="chart-bar dilr" style="height:' + dilrH + '%"></div><div class="chart-bar qa" style="height:' + qaH + '%"></div></div>';
  }).join('');
  
  if (labelsContainer) {
    labelsContainer.innerHTML = recent.map(function(mock) {
      var d = new Date(mock.date);
      return '<div class="chart-label">' + d.getDate() + '/' + (d.getMonth()+1) + '</div>';
    }).join('');
  }
}

function generateWeeklyMentorReport(history) {
  if (history.length < 2) return;
  var latest = history[history.length - 1];
  var previous = history[history.length - 2];
  
  var varcChange = latest.varc - previous.varc;
  var dilrChange = latest.dilr - previous.dilr;
  var qaChange = latest.qa - previous.qa;
  
  var improving = [];
  var declining = [];
  
  if (varcChange > 0) improving.push('VARC (+' + varcChange + ')');
  else if (varcChange < 0) declining.push('VARC (' + varcChange + ')');
  if (dilrChange > 0) improving.push('DILR (+' + dilrChange + ')');
  else if (dilrChange < 0) declining.push('DILR (' + dilrChange + ')');
  if (qaChange > 0) improving.push('QA (+' + qaChange + ')');
  else if (qaChange < 0) declining.push('QA (' + qaChange + ')');
  
  var weakest = latest.varc/72 < latest.dilr/60 && latest.varc/72 < latest.qa/60 ? 'VARC' : latest.dilr/60 < latest.qa/60 ? 'DILR' : 'QA';
  
  var report = '';
  if (improving.length) report += '<strong>Improving:</strong> ' + improving.join(', ') + '<br>';
  if (declining.length) report += '<strong>Needs work:</strong> ' + declining.join(', ') + '<br>';
  report += '<br><strong>This week — fix ONE thing:</strong> Your ' + weakest + ' score relative to max is the biggest leak.';
  
  var bodyEl = document.getElementById('weekly-mentor-body');
  var cardEl = document.getElementById('weekly-mentor-card');
  if (bodyEl) bodyEl.innerHTML = report;
  if (cardEl) cardEl.style.display = 'block';
}

// ═══════════════════════════════════════════════
// AUTO-DETECT MOCK SCORES IN CHAT
// ═══════════════════════════════════════════════

function detectAndSaveMockScores(message) {
  var varcMatch = message.match(/varc[: ]+([0-9]+)/i);
  var dilrMatch = message.match(/(?:dilr|lrdi)[: ]+([0-9]+)/i);
  var qaMatch = message.match(/(?:qa|quant)[: ]+([0-9]+)/i);
  
  if (varcMatch && dilrMatch && qaMatch) {
    var varc = parseInt(varcMatch[1]);
    var dilr = parseInt(dilrMatch[1]);
    var qa = parseInt(qaMatch[1]);
    if (varc <= 72 && dilr <= 60 && qa <= 60) {
      saveMockScore(varc, dilr, qa);
    }
  }
}


// ═══════════════════════════════════════════════
// INSIGHT TOAST — shows when Marg learns something
// ═══════════════════════════════════════════════

function showInsightToast(message) {
  var toast = document.getElementById('insight-toast');
  var text = document.getElementById('toast-text');
  if (!toast || !text) return;
  text.innerHTML = message;
  toast.classList.add('show');
  setTimeout(function() {
    toast.classList.remove('show');
  }, 3500);
}

// ═══════════════════════════════════════════════
// DAILY PRACTICE LIMIT — one set per type per day
// ═══════════════════════════════════════════════

function getTodayPracticeKey(type) {
  return 'marg_practice_done_' + type + '_' + new Date().toISOString().split('T')[0];
}

function isPracticeDoneToday(type) {
  return localStorage.getItem(getTodayPracticeKey(type)) === 'true';
}

function markPracticeDoneToday(type) {
  localStorage.setItem(getTodayPracticeKey(type), 'true');
}

function showDailyLimitCard(type) {
  var content = document.getElementById('practice-content');
  var typeName = type === 'rc' ? 'RC' : type === 'dilr' ? 'DILR' : 'QA';
  var sessionsCount = studentProfile.sessionsCount || 0;
  
  content.innerHTML = '<div class="daily-limit-card">' +
    '<div class="daily-limit-icon">✅</div>' +
    '<div class="daily-limit-title">Today\'s ' + typeName + ' practice — done</div>' +
    '<div class="daily-limit-body">Marg builds your cognitive profile one focused session at a time. Quality over quantity — come back tomorrow for fresh ' + typeName + ' practice targeting your specific patterns.</div>' +
    '<div class="daily-limit-stat">🔥 ' + sessionsCount + ' sessions completed with Marg</div>' +
    '<div style="font-size:12px;color:var(--text-dim);">Try a different section, or chat with Marg about today\'s mistakes</div>' +
    '</div>';
}



// ═══════════════════════════════════════════════
// 5-QUESTION ONBOARDING CHAT FLOW
// ═══════════════════════════════════════════════


function startOnboardingChat() {
  onboardingStep = 0;
  askOnboardingQuestion();
}

function askOnboardingQuestion() {
  var step = onboardingFlow[onboardingStep];
  if (!step) {
    completeOnboarding();
    return;
  }

  // Show Marg's question
  addMessage('marg', step.message.replace(/\n/g, '<br>'));

  // Show option chips
  setTimeout(function() {
    showOnboardingOptions(step.options);
  }, 400);
}

function showOnboardingOptions(options) {
  var chipsDiv = document.createElement('div');
  chipsDiv.id = 'onboarding-chips';
  chipsDiv.style.cssText = 'display:flex;flex-direction:column;gap:8px;padding:4px 0 4px 38px;max-width:100%;width:100%;';

  options.forEach(function(opt) {
    var btn = document.createElement('button');
    btn.textContent = opt;
    btn.style.cssText = [
      'background:#1A1A1A',
      'border:1.5px solid #2A2A2A',
      'border-radius:10px',
      'padding:13px 18px',
      'font-family:\'DM Sans\',sans-serif',
      'font-size:14px',
      'color:#C8C4BC',
      'cursor:pointer',
      'transition:all 0.18s ease',
      'text-align:left',
      'width:100%',
      'letter-spacing:0.01em',
      'line-height:1.4'
    ].join(';');
    btn.onmouseover = function() {
      this.style.borderColor = '#C9A84C';
      this.style.color = '#F0EDE6';
      this.style.background = 'rgba(201,168,76,0.06)';
    };
    btn.onmouseout = function() {
      if (!this.classList.contains('selected')) {
        this.style.borderColor = '#2A2A2A';
        this.style.color = '#C8C4BC';
        this.style.background = '#1A1A1A';
      }
    };
    btn.onclick = function() { selectOnboardingOption(opt); };
    chipsDiv.appendChild(btn);
  });

  var messages = document.getElementById('messages');
  messages.appendChild(chipsDiv);
  messages.scrollTop = messages.scrollHeight;
}

function selectOnboardingOption(value) {
  var step = onboardingFlow[onboardingStep];

  // Remove chips
  var chips = document.getElementById('onboarding-chips');
  if (chips) chips.remove();

  // Show user's answer
  addMessage('user', value);

  // Save to profile
  studentProfile[step.key] = value;

  // Show follow-up if exists
  var followUp = step.followUp && step.followUp[value];
  if (followUp) {
    setTimeout(function() {
      addMessage('marg', followUp);
      onboardingStep++;
      setTimeout(askOnboardingQuestion, 800);
    }, 400);
  } else {
    onboardingStep++;
    setTimeout(askOnboardingQuestion, 600);
  }
}

function calculateMonthsLeftForCAT() {
  var catDate = new Date('2026-11-29'); // CAT 2026 expected date
  var today = new Date();
  var diffMs = catDate - today;
  var diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  var diffMonths = Math.round(diffDays / 30);
  if (diffDays < 30) return 'Less than 1 month (' + diffDays + ' days)';
  if (diffDays < 60) return '1-2 months (' + diffDays + ' days)';
  if (diffDays < 90) return '2-3 months (' + diffDays + ' days)';
  if (diffDays < 120) return '3-4 months (' + diffDays + ' days)';
  if (diffDays < 150) return '4-5 months (' + diffDays + ' days)';
  if (diffDays < 180) return '5-6 months (' + diffDays + ' days)';
  return diffMonths + ' months (' + diffDays + ' days until CAT 2026)';
}

async function completeOnboarding() {
  studentProfile.monthsLeft = calculateMonthsLeftForCAT();
  await saveProfile();
  showBottomNav();
  onboardingComplete = true;
  document.getElementById('user-input').disabled = false;
  document.getElementById('send-btn').disabled = false;

  // Build profile context for Marg's opening message
  var profileContext = 'New student profile: ' +
    'Attempt: ' + (studentProfile.attemptNumber || '1st attempt') + '. ' +
    'Weakest section: ' + (studentProfile.weakestSection || 'VARC') + '. ' +
    'Months left: ' + (studentProfile.monthsLeft || '4-6 months') + '. ' +
    'Daily hours: ' + (studentProfile.dailyHours || '3-4 hours') + '. ' +
    'Situation: ' + (studentProfile.situation || 'CAT prep') + '.';

  conversationHistory.push({ role: 'user', content: profileContext });
  showTyping();

  try {
    var res = await fetch(WORKER_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 300,
        system: SYSTEM_PROMPT + '\n\nIMPORTANT: A new student just completed their profile. Give a warm 2-3 sentence opening that: 1) acknowledges ONE specific thing from their profile (attempt number or weak section), 2) shares your hypothesis in one line, 3) asks what they want to do first — discuss strategy or start practicing. Keep it conversational and warm, not robotic. Do NOT list all their profile details back at them.',
        messages: conversationHistory
      })
    });
    var data = await res.json();
    var response = data.content && data.content[0] ? data.content[0].text : null;
    hideTyping();
    if (response) {
      addMessage('marg', response);
      conversationHistory.push({ role: 'assistant', content: response });
    }
  } catch(e) {
    hideTyping();
    var name = currentUser && currentUser.user_metadata && currentUser.user_metadata.full_name
      ? currentUser.user_metadata.full_name.split(' ')[0] : '';
    addMessage('marg', 'Good' + (name ? ', ' + name : '') + ' — I have everything I need. What do you want to do first — should we talk through your strategy, or do you want to jump straight into practice?');
  }

  setTimeout(function() {
    showPathChoiceScreen();
  }, 800);
}


  var sectionPattern = type === 'rc' ? studentProfile.varcCognitivePattern : type === 'dilr' ? studentProfile.dilrCognitivePattern : studentProfile.qaCognitivePattern;
  var patternText = (sectionPattern && sectionPattern !== 'undefined' && sectionPattern !== 'null') ? sectionPattern : 'not identified yet';
  
  // Build real session results
  var resultsText = '';
  if (sessionResults.total > 0) {
    resultsText = 'Session results: ' + sessionResults.correct + ' correct out of ' + sessionResults.total + ' questions';
    if (sessionResults.passageTitle) resultsText += ' on ' + sessionResults.passageTitle;
    resultsText += '. ';
    if (sessionResults.mistakes.length > 0) {
      resultsText += 'Wrong answers: ' + sessionResults.mistakes.map(function(m) { return m.topic + ' (' + m.insight + ')'; }).join('; ') + '. ';
    } else if (sessionResults.correct === sessionResults.total) {
      resultsText += 'Got all correct. ';
    }
  }
  
  completeSummary = 'I just completed my ' + type.toUpperCase() + ' practice on Marg. ' + resultsText + 'My cognitive pattern: ' + patternText + '. Weakest section: ' + (studentProfile.weakestSection || 'unknown') + '. You already know exactly what happened — tell me specifically what this reveals about my thinking and give me one concrete thing to work on next. Do not ask me what happened — you have all the data.';

// ═══════════════════════════════════════════════
// TOUR SYSTEM
// ═══════════════════════════════════════════════
var tourStep = 0;
var totalTourSteps = 3;

function showTour() {
  var modal = document.getElementById('tour-modal');
  if (modal) { modal.style.display = 'flex'; modal.style.alignItems = 'center'; modal.style.justifyContent = 'center'; }
}

function closeTour() {
  var modal = document.getElementById('tour-modal');
  if (modal) modal.style.display = 'none';
  localStorage.setItem('marg_tour_done', '1');
}

function tourNext() {
  var cur = document.getElementById('tour-' + tourStep);
  var dot = document.getElementById('dot-' + tourStep);
  if (cur) cur.style.display = 'none';
  if (dot) dot.style.background = '#333';
  tourStep++;
  if (tourStep >= totalTourSteps) { closeTour(); return; }
  var next = document.getElementById('tour-' + tourStep);
  var nextDot = document.getElementById('dot-' + tourStep);
  if (next) next.style.display = 'block';
  if (nextDot) nextDot.style.background = '#C9A84C';
  var btn = document.getElementById('tour-next-btn');
  if (btn && tourStep === totalTourSteps - 1) btn.textContent = "Let\'s go 🚀";
}

function checkAndShowTour() {
  if (!localStorage.getItem('marg_tour_done')) {
    setTimeout(showTour, 1500);
  }
}

// ═══════════════════════════════════════════════
// FEEDBACK SYSTEM
// ═══════════════════════════════════════════════
var feedbackSelected = null;
var feedbackShown = false;

function showFeedback() {
  var modal = document.getElementById('feedback-modal');
  if (modal) { modal.style.display = 'flex'; modal.style.alignItems = 'center'; modal.style.justifyContent = 'center'; feedbackShown = true; }
}

window._showFeedback = function() {
  try {
    feedbackShown = false;
    var modal = document.getElementById('feedback-modal');
    if (modal) {
      modal.style.display = 'flex';
      feedbackShown = true;
    } else {
      console.error('feedback-modal not found');
    }
  } catch(e) { console.error('showFeedback error:', e); }
};

function closeFeedback() {
  var modal = document.getElementById('feedback-modal');
  if (modal) modal.style.display = 'none';
}

function selectFeedback(btn) {
  document.querySelectorAll('.fb-opt').forEach(function(b) { b.classList.remove('selected'); });
  btn.classList.add('selected');
  feedbackSelected = btn.textContent;
}

async function submitFeedback() {
  var text = document.getElementById('feedback-text').value;
  try {
    await fetch(SUPABASE_URL + '/rest/v1/feedback', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'apikey': SUPABASE_ANON_KEY, 'Authorization': 'Bearer ' + (SUPABASE_TOKEN || SUPABASE_ANON_KEY) },
      body: JSON.stringify({ user_id: currentUser ? currentUser.id : 'guest', selected: feedbackSelected || 'none', text: text, page: 'marg_chat', sessions: studentProfile ? studentProfile.sessionsCount : 0 })
    });
  } catch(e) {}
  closeFeedback();
  setTimeout(function() {
    var msg = document.getElementById('messages');
    if (msg) {
      var thanks = document.createElement('div');
      thanks.style.cssText = 'text-align:center;padding:8px;font-size:13px;color:#4CAF7D;margin:8px 0;';
      thanks.textContent = 'Thanks for the feedback — it genuinely helps 🙏';
      msg.appendChild(thanks);
      msg.scrollTop = msg.scrollHeight;
    }
  }, 300);
}

document.addEventListener('visibilitychange', function() {
  if (document.visibilityState === 'hidden' && conversationHistory && conversationHistory.length >= 2 && !feedbackShown) {
    showFeedback();
  }
});
