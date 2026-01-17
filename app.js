// DECIDE — Deterministic decision engine + UI wiring
// Audience: non-AV; plain, glanceable UI and rules-first logic.

(function () {
  // ----- Types and constants -----
  const State = {
    MONITOR: 'monitor',
    REMOTE: 'remote',
    FIELD: 'field',
    SERVICE: 'service',
  };

  // Last evaluated ticker
  let lastEvalTime = Date.now();
  let tickerId = null;
  function startTicker() {
    if (tickerId) clearInterval(tickerId);
    tickerId = setInterval(() => {
      const seconds = Math.floor((Date.now() - lastEvalTime) / 1000);
      els.lastEvaluated.textContent = `Last evaluated: ${seconds}s ago`;
    }, 1000);
  }

  const Priority = {
    LOW: 'Low',
    MEDIUM: 'Medium',
    HIGH: 'High',
  };

  const Condition = {
    BLOCKED: 'Blocked',
    STUCK: 'Stuck',
    DEGRADED: 'Degraded',
  };

  const ladder = [State.MONITOR, State.REMOTE, State.FIELD, State.SERVICE];

  const stateMeta = {
    [State.MONITOR]: { emoji: '🟢', label: 'Monitor', cls: 'state-monitor' },
    [State.REMOTE]: { emoji: '🟡', label: 'Remote Assist', cls: 'state-remote' },
    [State.FIELD]: { emoji: '🔴', label: 'Field Recovery', cls: 'state-field' },
    [State.SERVICE]: { emoji: '⚙️', label: 'Service', cls: 'state-service' },
  };

  const cues = {
    [State.MONITOR]: [
      ['Situation Check', 'Is this a normal, transient pause?'],
      ['Vehicle Health', 'Is the vehicle healthy and drivable?'],
      ['Time Impact', 'Has the blockage lasted only briefly?'],
    ],
    [State.REMOTE]: [
      ['Intervention Feasibility', 'Can a human-guided action resolve this?'],
      ['Escalation Avoidance', 'Can physical dispatch be avoided?'],
      ['Safety Risk', 'Is remote intervention safe and appropriate?'],
    ],
    [State.FIELD]: [
      ['Public Impact', 'Is it blocking traffic/creating risk?'],
      ['Authority Involvement', 'Are police/external responders present?'],
      ['Remote Failure', 'Has remote assist been insufficient/inappropriate?'],
    ],
    [State.SERVICE]: [
      ['Repair Need', 'Does it require inspection or repair?'],
      ['Redeploy Risk', 'Is it unsafe to continue without service?'],
      ['Fleet Status', 'Should it be removed from active use?'],
    ],
  };

  // ----- App state (signals + derived) -----
  let signals = {
    condition: Condition.BLOCKED, // Blocked | Stuck | Degraded
    timeBlockedMin: 1, // integer
    riderOnboard: true, // boolean
    policePresent: false, // boolean
    drivable: true, // boolean
    currentIntervention: 'none', // none | monitor | remote | field | service
    attemptCount: 0, // integer (remote attempts)
    lastAction: null, // {type, timestamp}
    // Additional promoted signals (optional)
    towEtaMin: null,
    riderState: null, // e.g., 'anxious', 'calm'
    remoteAssistFailed: false,
    lanePartiallyBlocked: false,
    // Visualization severity score (0-100). If null, derive from state.
    severityScore: null,
  };

  // Track previous recommendation for status banner
  let previousRecommendation = null; // { state, priority }

  // Utility: timestamp string
  function nowISO() { return new Date().toISOString(); }

  // ----- Deterministic decision engine -----
  function evaluate(s) {
    // Compute base recommendation first (no early returns), then apply closed-loop escalation.

    let baseRec;

    // 1) If condition = Degraded AND drivable = false → Service, Priority High
    if (s.condition === Condition.DEGRADED && s.drivable === false) {
      baseRec = result(State.SERVICE, Priority.HIGH, 'Not drivable while degraded');
    }
    // 2) If condition = Stuck AND policePresent = true → Field Recovery, Priority High
    else if (s.condition === Condition.STUCK && s.policePresent === true) {
      baseRec = result(State.FIELD, Priority.HIGH, 'Stuck with police on scene');
    }
    // 3) If condition = Stuck AND riderOnboard = true → Remote Assist, Priority High
    else if (s.condition === Condition.STUCK && s.riderOnboard === true) {
      baseRec = result(State.REMOTE, Priority.HIGH, 'Stuck with rider onboard');
    }
    // 4) If condition = Blocked AND timeBlockedMin >= 5 → Remote Assist, Priority Medium
    else if (s.condition === Condition.BLOCKED && s.timeBlockedMin >= 5) {
      baseRec = result(State.REMOTE, Priority.MEDIUM, 'Blocked ≥5 min');
    }
    // 5) Else → Monitor, Priority Low
    else {
      baseRec = result(State.MONITOR, Priority.LOW, 'Transient or minor');
    }

    // Closed-loop escalation rule (applied after base, unless already Service)
    // If currentIntervention = remote AND attemptCount >= 1 AND situation still unresolved
    // (e.g., timeBlockedMin >= 5 and condition is Blocked/Stuck) → Field Recovery (High)
    const stillUnresolved = (s.condition === Condition.BLOCKED || s.condition === Condition.STUCK) && s.timeBlockedMin >= 5;
    if (
      baseRec.state !== State.SERVICE &&
      s.currentIntervention === State.REMOTE &&
      s.attemptCount >= 1 &&
      stillUnresolved
    ) {
      return result(State.FIELD, Priority.HIGH, 'Remote assist failed to resolve');
    }

    return baseRec;
  }

  function result(state, priority, why) {
    return { state, priority, oneLineWhy: why, cues: buildConfidenceCues(state, signals) };
  }

  // Map recommended state to a position along green→yellow→red band
  function severityPosition(state) {
    switch (state) {
      case State.MONITOR: return 10;    // near green
      case State.REMOTE: return 40;     // trending yellow
      case State.FIELD: return 75;      // orange/red
      case State.SERVICE: return 95;    // far red
      default: return 10;
    }
  }

  // Generate concise answers for the three cues of a state
  function buildConfidenceCues(state, s) {
    const yes = 'Yes';
    const no = 'No';

    if (state === State.MONITOR) {
      const situationCheck = s.condition === Condition.BLOCKED && s.timeBlockedMin < 5 ? yes : 'Likely temporary?';
      const vehicleHealth = s.drivable ? yes : no;
      const timeImpact = s.timeBlockedMin < 5 ? yes : no;
      return [
        [cues[state][0][0], situationCheck],
        [cues[state][1][0], vehicleHealth],
        [cues[state][2][0], timeImpact],
      ];
    }

    if (state === State.REMOTE) {
      const feasible = (s.drivable || s.condition === Condition.BLOCKED) ? yes : 'Unclear';
      const avoidDispatch = (!s.policePresent) ? yes : 'Unlikely';
      const safe = (s.policePresent ? 'Coordinated' : yes);
      return [
        [cues[state][0][0], feasible],
        [cues[state][1][0], avoidDispatch],
        [cues[state][2][0], safe],
      ];
    }

    if (state === State.FIELD) {
      const publicImpact = (s.condition !== Condition.DEGRADED && s.timeBlockedMin >= 5) ? yes : (s.policePresent ? 'Managed' : 'Limited');
      const authority = s.policePresent ? yes : no;
      const remoteFailure = (s.currentIntervention === State.REMOTE && s.attemptCount >= 1) ? yes : 'Not attempted/insufficient';
      return [
        [cues[state][0][0], publicImpact],
        [cues[state][1][0], authority],
        [cues[state][2][0], remoteFailure],
      ];
    }

    if (state === State.SERVICE) {
      const repairNeed = (!s.drivable) ? yes : 'Investigate';
      const redeployRisk = (!s.drivable) ? yes : 'Unknown';
      const fleetStatus = (!s.drivable) ? 'Remove until cleared' : 'Keep under watch';
      return [
        [cues[state][0][0], repairNeed],
        [cues[state][1][0], redeployRisk],
        [cues[state][2][0], fleetStatus],
      ];
    }

    return [];
  }

  // ----- Rendering -----
  const els = {
    statusBanner: document.getElementById('statusBanner'),
    contextList: document.getElementById('contextList'),
    decisionCard: document.getElementById('decisionCard'),
    confidenceList: document.getElementById('confidenceList'),
    lastEvaluated: document.getElementById('lastEvaluated'),

    // Chat
    liveSummaryList: document.getElementById('liveSummaryList'),
    chatFeed: document.getElementById('chatFeed'),
    askInput: document.getElementById('askInput'),
    askSend: document.getElementById('askSend'),

    confirmBtn: document.getElementById('confirmBtn'),
    escalateBtn: document.getElementById('escalateBtn'),
    overrideBtn: document.getElementById('overrideBtn'),

    add5min: document.getElementById('add5min'),
    resetAttempts: document.getElementById('resetAttempts'),

    scenarioButtons: document.querySelectorAll('.scenario-btn'),

    modal: document.getElementById('overrideModal'),
    closeModal: document.getElementById('closeModal'),
    overrideSelect: document.getElementById('overrideSelect'),
    applyOverride: document.getElementById('applyOverride'),
  };

  // ----- Chat state and agents -----
  let chatMessages = []; // {source, text, timestamp, kind: 'human'|'system'|'agent'}
  let liveSummary = []; // array of short bullet strings

  function addChatMessage(source, text, kind = 'human') {
    const msg = { source, text, timestamp: nowISO(), kind };
    chatMessages.push(msg);
    runAgents(msg);
    renderChat();
  }

  function renderChat() {
    // Live summary list
    els.liveSummaryList.innerHTML = liveSummary
      .map((s) => `<li>${escapeHtml(s)}</li>`) 
      .join('');
    // Feed entries
    els.chatFeed.innerHTML = chatMessages
      .slice(-50)
      .map((m) => `
        <div class="chat-item ${m.kind}">
          <div class="meta"><span class="src">${escapeHtml(m.source)}</span><span class="time">${escapeHtml(new Date(m.timestamp).toLocaleTimeString())}</span></div>
          <div class="text">${escapeHtml(m.text)}</div>
        </div>
      `)
      .join('');
    els.chatFeed.scrollTop = els.chatFeed.scrollHeight;
  }

  // Agents pipeline
  function runAgents(latestMsg) {
    // Agent 1: Aggregator — recompute live summary from all messages
    liveSummary = aggregateSummary(chatMessages);

    // Agent 2: Signal extraction — from latest message & context
    const extracted = extractSignals(latestMsg, liveSummary);

    // Agent 3: Relevance gate — promote if affects escalation, safety, or time
    const promoted = promoteRelevantSignals(extracted);

    if (promoted.length) {
      // Show system messages and re-render recommendation
      promoted.forEach((p) => addChatMessage('System', `New signal detected: ${p.label}`, 'system'));
      showInfoBanner('Re-evaluating recommendation');
      render();
    } else {
      // Update UI to reflect new summary even if no promotions
      renderChat();
    }
  }

  function aggregateSummary(msgs) {
    // Simple rule-based summarization; deduplicate facts
    const facts = new Set();
    const text = msgs.map((m) => m.text.toLowerCase());
    if (text.some((t) => t.includes('police arrived'))) facts.add('Police on scene');
    if (text.some((t) => t.includes('request immediate removal'))) facts.add('Police request immediate removal');
    const tow = text.find((t) => /tow\s*eta\s*\d+/.test(t));
    if (tow) {
      const m = tow.match(/tow\s*eta\s*(\d+)/);
      if (m) facts.add(`Tow ETA ~${m[1]} minutes`);
    }
    if (text.some((t) => t.includes('rider anxious'))) facts.add('Rider reported anxious but safe');
    if (text.some((t) => t.includes('remote assist attempt failed'))) facts.add('Remote assist attempt failed');
    if (text.some((t) => t.includes('lane partially blocked'))) facts.add('Lane partially blocked');
    if (text.some((t) => t.includes('no injuries'))) facts.add('No injuries reported');
    return Array.from(facts).slice(0, 5);
  }

  function extractSignals(latestMsg, summary) {
    const proposed = [];
    const t = (latestMsg?.text || '').toLowerCase();
    // From latest
    if (t.includes('police arrived') || t.includes('request immediate removal')) proposed.push({ key: 'policePresent', value: true, label: 'Police present' });
    const towMatch = t.match(/tow\s*eta\s*(\d+)/);
    if (towMatch) proposed.push({ key: 'towEtaMin', value: parseInt(towMatch[1], 10), label: `Tow ETA ${towMatch[1]}m` });
    if (t.includes('rider anxious')) proposed.push({ key: 'riderState', value: 'anxious', label: 'Rider state: anxious' });
    if (t.includes('remote assist attempt failed')) proposed.push({ key: 'remoteAssistFailed', value: true, label: 'Remote assist failed' });
    if (t.includes('lane partially blocked')) proposed.push({ key: 'lanePartiallyBlocked', value: true, label: 'Lane partially blocked' });
    if (t.includes('no injuries')) proposed.push({ key: 'injuries', value: 'none', label: 'No injuries reported' });

    // From summary
    if (summary.some((s) => s.toLowerCase().includes('police on scene'))) proposed.push({ key: 'policePresent', value: true, label: 'Police present' });
    return proposed;
  }

  function promoteRelevantSignals(proposed) {
    const promoted = [];
    for (const p of proposed) {
      const affects = ['policePresent', 'remoteAssistFailed', 'towEtaMin', 'lanePartiallyBlocked'];
      if (!affects.includes(p.key)) continue; // simple relevance gate
      // Promote if changed
      if (signals[p.key] !== p.value) {
        signals[p.key] = p.value;
        promoted.push(p);
      }
    }
    return promoted;
  }

  function showInfoBanner(text) {
    els.statusBanner.textContent = text;
    els.statusBanner.classList.remove('hidden');
    setTimeout(() => {
      els.statusBanner.classList.add('hidden');
    }, 1500);
  }

  function render() {
    const rec = evaluate(signals);
    lastEvalTime = Date.now();
    els.lastEvaluated.textContent = 'Last evaluated: 0s ago';

    // Status banner: show if recommendation changed since last render
    const changed = !previousRecommendation ||
      previousRecommendation.state !== rec.state ||
      previousRecommendation.priority !== rec.priority;

    if (changed && previousRecommendation) {
      els.statusBanner.textContent = `Recommendation changed: ${stateMeta[previousRecommendation.state].label} → ${stateMeta[rec.state].label}`;
      els.statusBanner.classList.remove('hidden');
    } else {
      els.statusBanner.classList.add('hidden');
    }

    previousRecommendation = { state: rec.state, priority: rec.priority };

    // Context list (read-only, one line per signal)
    const ctx = [
      [`Condition`, signals.condition.toUpperCase()],
      [`Time blocked`, `${signals.timeBlockedMin}m`],
      [`Rider onboard`, signals.riderOnboard ? 'Yes' : 'No'],
      [`Police present`, signals.policePresent ? 'Yes' : 'No'],
      [`Drivable`, signals.drivable ? 'Yes' : 'No'],
      [`Current intervention`, signals.currentIntervention !== 'none' ? (stateMeta[signals.currentIntervention]?.label || signals.currentIntervention) : 'None'],
    ];
    if (signals.towEtaMin != null) ctx.push(['Tow ETA', `${signals.towEtaMin}m`]);
    if (signals.riderState) ctx.push(['Rider state', signals.riderState]);
    if (signals.remoteAssistFailed) ctx.push(['Remote assist', 'Failed']);
    if (signals.lanePartiallyBlocked) ctx.push(['Lane', 'Partially blocked']);
    els.contextList.innerHTML = ctx
      .map(([k, v]) => `<li><strong>${escapeHtml(k)}:</strong> ${escapeHtml(v)}</li>`) 
      .join('');

    // Decision card
    const meta = stateMeta[rec.state];
    els.decisionCard.className = `decision-card state-border ${meta.cls}`;
    // Compute marker position: prefer severityScore if present
    const markerLeft = (typeof signals.severityScore === 'number')
      ? Math.max(0, Math.min(100, signals.severityScore))
      : severityPosition(rec.state);

    els.decisionCard.innerHTML = `
      <div class="decision-header">
        <div class="state"><span>${meta.emoji}</span><span>${meta.label}</span></div>
        <div class="priority ${rec.priority.toLowerCase()}">${rec.priority}</div>
      </div>
      <div class="one-line-why">${escapeHtml(rec.oneLineWhy)}</div>
      <div class="severity" id="severityBand"><div class="marker" style="left: ${markerLeft}%"></div></div>
    `;

    // Confidence cues (exactly three bullets: label + short answer)
    els.confidenceList.innerHTML = rec.cues
      .map(([label, answer]) => `<li><strong>${escapeHtml(label)}:</strong> ${escapeHtml(answer)}</li>`) 
      .join('');
  }

  // badges no longer used in tri-grid context

  function escapeHtml(str) {
    return String(str)
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;');
  }

  // ----- Actions -----
  function confirmAction() {
    const rec = evaluate(signals);
    signals.currentIntervention = rec.state;
    if (rec.state === State.REMOTE) {
      signals.attemptCount += 1;
    }
    signals.lastAction = { type: 'confirm', timestamp: nowISO() };
    render();
  }

  function escalateAction() {
    const rec = evaluate(signals);
    const idx = ladder.indexOf(rec.state);
    const nextIdx = Math.min(idx + 1, ladder.length - 1);
    const escalated = ladder[nextIdx];
    signals.currentIntervention = escalated;
    if (escalated === State.REMOTE) {
      signals.attemptCount += 1;
    }
    signals.lastAction = { type: 'escalate', timestamp: nowISO() };
    render();
  }

  function openOverride() { els.modal.classList.remove('hidden'); }
  function closeOverride() { els.modal.classList.add('hidden'); }

  function applyOverrideAction() {
    const chosen = els.overrideSelect.value; // monitor|remote|field|service
    signals.currentIntervention = chosen;
    if (chosen === State.REMOTE) {
      signals.attemptCount += 1;
    }
    signals.lastAction = { type: 'override', timestamp: nowISO() };
    closeOverride();
    render();
  }

  // ----- Scenario presets -----
  const scenarios = {
    blocked1: () => ({
      condition: Condition.BLOCKED,
      timeBlockedMin: 1,
      riderOnboard: true,
      policePresent: false,
      drivable: true,
    }),
    blocked6: () => ({
      condition: Condition.BLOCKED,
      timeBlockedMin: 6,
      riderOnboard: true,
      policePresent: false,
      drivable: true,
    }),
    stuckRider: () => ({
      condition: Condition.STUCK,
      timeBlockedMin: 4,
      riderOnboard: true,
      policePresent: false,
      drivable: true, // uncertain/true → use true for simplicity
    }),
    stuckPolice: () => ({
      condition: Condition.STUCK,
      timeBlockedMin: 3,
      riderOnboard: false,
      policePresent: true,
      drivable: false,
    }),
    degradedND: () => ({
      condition: Condition.DEGRADED,
      timeBlockedMin: 0,
      riderOnboard: false,
      policePresent: false,
      drivable: false,
    }),
  };

  function applyScenario(key) {
    const next = scenarios[key]?.();
    if (!next) return;
    signals = {
      ...signals,
      ...next,
      currentIntervention: 'none',
      attemptCount: 0,
      lastAction: { type: 'scenario', timestamp: nowISO() },
    };
    render();
  }

  // ----- Demo tools -----
  function add5min() {
    signals.timeBlockedMin = Math.max(0, (signals.timeBlockedMin || 0) + 5);
    signals.lastAction = { type: 'time+5', timestamp: nowISO() };
    render();
  }

  function resetAttempts() {
    signals.attemptCount = 0;
    signals.currentIntervention = signals.currentIntervention; // no-op but explicit
    signals.lastAction = { type: 'resetAttempts', timestamp: nowISO() };
    render();
  }

  // ----- Event wiring -----
  els.confirmBtn.addEventListener('click', confirmAction);
  els.escalateBtn.addEventListener('click', escalateAction);
  els.overrideBtn.addEventListener('click', openOverride);
  els.closeModal.addEventListener('click', closeOverride);
  els.applyOverride.addEventListener('click', applyOverrideAction);

  els.add5min.addEventListener('click', add5min);
  els.resetAttempts.addEventListener('click', resetAttempts);

  els.scenarioButtons.forEach((btn) => {
    btn.addEventListener('click', () => applyScenario(btn.dataset.scenario));
  });

  // Demo inject buttons
  document.querySelectorAll('.inject-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const src = btn.getAttribute('data-src');
      const msg = btn.getAttribute('data-msg');
      addChatMessage(src, msg);
    });
  });

  // Ask input
  function handleAsk() {
    const q = (els.askInput.value || '').trim();
    if (!q) return;
    addChatMessage('Operator', q, 'human');
    els.askInput.value = '';
    cloudChatAnswer(q)
      .then((resp) => {
        // resp may be string (fallback) or structured {answer, new_signals, severity_delta, confidence}
        if (typeof resp === 'string') {
          addChatMessage('DECIDE', resp, 'agent');
          return;
        }
        const { answer, new_signals, severity_delta } = resp || {};
        if (answer) addChatMessage('DECIDE', answer, 'agent');
        // Promote signals
        if (new_signals && typeof new_signals === 'object') {
          Object.entries(new_signals).forEach(([k, v]) => {
            if (signals[k] !== v) {
              signals[k] = v;
              addChatMessage('System', `Signal promoted: ${k.replace(/_/g,' ')} → ${String(v)}`, 'system');
            }
          });
        }
        // Severity delta adjust
        if (typeof severity_delta === 'number') {
          const current = (typeof signals.severityScore === 'number') ? signals.severityScore : severityPosition(evaluate(signals).state);
          signals.severityScore = Math.max(0, Math.min(100, current + severity_delta));
          // animate band
          const band = document.getElementById('severityBand');
          if (band) {
            band.classList.remove('pulse');
            void band.offsetWidth; // reflow to restart animation
            band.classList.add('pulse');
          }
        }
        render();
      })
      .catch(() => {
        // Fallback concise answer based on current context
        let reply = '';
        if (/eta|tow/i.test(q)) reply = signals.towEtaMin != null ? `Tow ETA ~${signals.towEtaMin} minutes.` : 'No tow ETA available yet.';
        else if (/rider|distress|anxious/i.test(q)) reply = signals.riderState ? `Rider appears ${signals.riderState}.` : 'No rider distress reported.';
        else if (/police|officer/i.test(q)) reply = signals.policePresent ? 'Police on scene.' : 'No police on scene.';
        else if (/remote assist.*fail|failed/i.test(q)) reply = signals.remoteAssistFailed ? 'Remote assist has failed.' : 'No remote assist failure reported.';
        else reply = 'No additional context beyond signals and summary.';
        addChatMessage('DECIDE', reply, 'agent');
      });
  }
  els.askSend.addEventListener('click', handleAsk);
  els.askInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') handleAsk(); });

  // ----- Initial render -----
  render();
  startTicker();

  // Seed a couple of initial context items for the demo
  addChatMessage('Mission Control', 'Initial check: no injuries reported');

  // ----- Cloud chat integration (optional) -----
  function lastQAHistory(maxPairs = 3) {
    const pairs = [];
    for (let i = chatMessages.length - 1; i >= 0; i--) {
      const m = chatMessages[i];
      if (m.source === 'DECIDE' && m.kind === 'agent') {
        // find preceding operator question
        let q = null;
        for (let j = i - 1; j >= 0; j--) {
          if (chatMessages[j].source === 'Operator') { q = chatMessages[j]; break; }
        }
        if (q) pairs.unshift({ q: q.text, a: m.text });
        if (pairs.length >= maxPairs) break;
      }
    }
    return pairs;
  }

  async function cloudChatAnswer(question) {
    const cfg = (window.DECIDE_CONFIG || {});
    const provider = cfg.PROVIDER || 'anthropic';

    // Build concise context from signals and live summary
    const signalsContext = {
      condition: signals.condition,
      timeBlockedMin: signals.timeBlockedMin,
      riderOnboard: signals.riderOnboard,
      policePresent: signals.policePresent,
      drivable: signals.drivable,
      currentIntervention: signals.currentIntervention,
      attemptCount: signals.attemptCount,
      towEtaMin: signals.towEtaMin,
      riderState: signals.riderState,
      remoteAssistFailed: signals.remoteAssistFailed,
      lanePartiallyBlocked: signals.lanePartiallyBlocked,
    };
    const summaryBullets = (liveSummary || []).join('; ');
    const systemPrompt = "You are DECIDE, an ops decision assistant. Use only provided inputs. Do not invent facts. If missing info, say what's missing. Answer briefly (≤25 words). Return strict JSON with keys: answer (string), new_signals (object, optional), severity_delta (number, optional), confidence (string).";

    // Preferred: local proxy for security and CORS
    if (cfg.USE_PROXY && cfg.PROXY_URL) {
      const rec = evaluate(signals);
      const payload = {
        question,
        signals,
        context_summary: liveSummary.slice(0, 5),
        recent_updates: chatMessages.slice(-5).map(({ source, text }) => ({ source, text })),
        current_recommendation: { action: rec.state, priority: rec.priority, reason: rec.oneLineWhy },
        history: lastQAHistory(3),
        systemPrompt,
      };
      const res = await fetch(cfg.PROXY_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error('Proxy error');
      const data = await res.json();
      // Expect structured json
      if (typeof data === 'string') {
        try { return JSON.parse(data); } catch { return data; }
      }
      return data;
    }

    // Provider: Anthropic Messages API
    if (provider === 'anthropic') {
      const key = cfg.ANTHROPIC_API_KEY;
      const url = cfg.ANTHROPIC_BASE_URL || 'https://api.anthropic.com/v1/messages';
      const model = cfg.ANTHROPIC_MODEL || 'claude-3-5-haiku-latest';
      const version = cfg.ANTHROPIC_VERSION || '2023-06-01';
      if (!key) throw new Error('No API key');
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'x-api-key': key,
          'anthropic-version': version,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          model,
          max_tokens: 120,
          system: systemPrompt,
          messages: [
            {
              role: 'user',
              content: [
                { type: 'text', text: `Current signals: ${JSON.stringify(signalsContext)}.` },
                { type: 'text', text: `Live summary bullets: ${summaryBullets}` },
                { type: 'text', text: question },
              ],
            },
          ],
        }),
      });
      if (!res.ok) throw new Error('HTTP error');
      const data = await res.json();
      const text = data?.content?.[0]?.text?.trim();
      if (!text) throw new Error('No content');
      return text;
    }

    // Provider: OpenRouter (fallback)
    if (provider === 'openrouter') {
      const key = cfg.OPENROUTER_API_KEY;
      const url = cfg.OPENROUTER_BASE_URL || 'https://openrouter.ai/api/v1/chat/completions';
      const model = cfg.OPENROUTER_MODEL || 'openai/gpt-4o-mini';
      if (!key) throw new Error('No API key');
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${key}`,
          'Content-Type': 'application/json',
          'X-Title': 'DECIDE Demo',
        },
        body: JSON.stringify({
          model,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: `Current signals: ${JSON.stringify(signalsContext)}. Live summary bullets: ${summaryBullets}.` },
            { role: 'user', content: question },
          ],
          temperature: 0.2,
          max_tokens: 120,
        }),
      });
      if (!res.ok) throw new Error('HTTP error');
      const data = await res.json();
      const text = data?.choices?.[0]?.message?.content?.trim();
      if (!text) throw new Error('No content');
      return text;
    }

    // If no supported provider configured, fall through to canned answers by rejecting
    throw new Error('No provider configured');
  }
})();
