import type { SkillSchedule } from '../components/Skills/ScheduleSkillDialog';

const STORAGE_KEY = 'arcadia-skill-schedules';
const HISTORY_KEY = 'arcadia-schedule-history';

// ─── Schedule History Entry ──────────────────────────────────────────────────
export interface ScheduleRunEntry {
  scheduleId: string;
  skillName: string;
  skillIcon: string;
  timestamp: number;
  status: 'success' | 'error' | 'skipped';
  summary: string;
  vaultPath?: string;
  duration: number; // ms
}

// ─── Storage helpers ─────────────────────────────────────────────────────────
export function getSchedules(): SkillSchedule[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function saveSchedules(schedules: SkillSchedule[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(schedules));
  document.dispatchEvent(new CustomEvent('arcadia:schedules-changed', { detail: schedules }));
}

export function saveSchedule(schedule: SkillSchedule): void {
  const schedules = getSchedules();
  const idx = schedules.findIndex(s => s.id === schedule.id);
  if (idx >= 0) {
    schedules[idx] = schedule;
  } else {
    schedules.push(schedule);
  }
  saveSchedules(schedules);
}

export function deleteSchedule(id: string): void {
  const schedules = getSchedules().filter(s => s.id !== id);
  saveSchedules(schedules);
}

export function toggleSchedule(id: string): void {
  const schedules = getSchedules();
  const schedule = schedules.find(s => s.id === id);
  if (schedule) {
    schedule.enabled = !schedule.enabled;
    if (schedule.enabled) {
      schedule.nextRun = calculateNextRun(schedule);
    }
    saveSchedules(schedules);
  }
}

// ─── Run History ─────────────────────────────────────────────────────────────
export function getRunHistory(): ScheduleRunEntry[] {
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function addRunHistory(entry: ScheduleRunEntry): void {
  const history = getRunHistory();
  history.unshift(entry); // newest first
  // Keep last 100 entries
  if (history.length > 100) history.length = 100;
  localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
  document.dispatchEvent(new CustomEvent('arcadia:schedule-run', { detail: entry }));
}

// ─── Next Run Calculation ────────────────────────────────────────────────────
export function calculateNextRun(schedule: SkillSchedule): number {
  const now = new Date();
  const [h, m] = schedule.time.split(':').map(Number);
  const target = new Date();
  target.setHours(h, m, 0, 0);

  // If target time already passed today, start from tomorrow
  if (target <= now) {
    target.setDate(target.getDate() + 1);
  }

  switch (schedule.frequency) {
    case 'daily':
      // Already set to next occurrence
      break;
    case 'weekdays':
      while (target.getDay() === 0 || target.getDay() === 6) {
        target.setDate(target.getDate() + 1);
      }
      break;
    case 'weekly': {
      const targetDay = schedule.customDays?.[0] || 1;
      while (target.getDay() !== targetDay) {
        target.setDate(target.getDate() + 1);
      }
      break;
    }
    case 'custom': {
      const days = schedule.customDays || [];
      if (days.length > 0) {
        while (!days.includes(target.getDay())) {
          target.setDate(target.getDate() + 1);
        }
      }
      break;
    }
  }

  return target.getTime();
}

// ─── Schedule Engine ─────────────────────────────────────────────────────────
let checkInterval: ReturnType<typeof setInterval> | null = null;

export function startScheduleEngine(): void {
  if (checkInterval) return;

  // Check every 30 seconds for due schedules
  checkInterval = setInterval(() => {
    checkDueSchedules();
  }, 30000);

  // Also check immediately on start
  checkDueSchedules();

  console.log('[Scheduler] Engine started');
}

export function stopScheduleEngine(): void {
  if (checkInterval) {
    clearInterval(checkInterval);
    checkInterval = null;
  }
  console.log('[Scheduler] Engine stopped');
}

function checkDueSchedules(): void {
  const now = Date.now();
  const schedules = getSchedules();
  let changed = false;

  for (const schedule of schedules) {
    if (!schedule.enabled || !schedule.nextRun) continue;

    // Allow 60 second window for execution
    if (now >= schedule.nextRun && now - schedule.nextRun < 60000) {
      executeScheduledSkill(schedule);
      schedule.lastRun = now;
      schedule.runCount += 1;
      schedule.nextRun = calculateNextRun(schedule);
      changed = true;
    }
    // If we missed the window (e.g., app was closed), recalculate next run
    else if (now - (schedule.nextRun || 0) >= 60000) {
      schedule.nextRun = calculateNextRun(schedule);
      changed = true;
    }
  }

  if (changed) {
    saveSchedules(schedules);
  }
}

async function executeScheduledSkill(schedule: SkillSchedule): Promise<void> {
  const startTime = Date.now();
  console.log(`[Scheduler] Executing: ${schedule.skillName}`);

  try {
    // Send the skill prompt through the bridge
    const bridgeUrl = 'http://127.0.0.1:8087';
    const response = await fetch(`${bridgeUrl}/v1/secondbrain/send`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: schedule.skillPrompt,
        source: 'scheduler',
        metadata: {
          scheduleId: schedule.id,
          skillName: schedule.skillName,
          automated: true,
        },
      }),
    });

    if (!response.ok) {
      throw new Error(`Bridge returned ${response.status}`);
    }

    const result = await response.json();
    const duration = Date.now() - startTime;
    const summary = result?.response?.slice(0, 200) || 'Skill executed successfully';

    // Write to vault if enabled
    if (schedule.writeToVault && schedule.vaultPath) {
      try {
        await writeToVault(schedule, summary, result?.response || summary);
      } catch (vaultErr) {
        console.warn('[Scheduler] Vault write failed:', vaultErr);
      }
    }

    // Record history
    addRunHistory({
      scheduleId: schedule.id,
      skillName: schedule.skillName,
      skillIcon: schedule.skillIcon,
      timestamp: Date.now(),
      status: 'success',
      summary,
      vaultPath: schedule.writeToVault ? schedule.vaultPath : undefined,
      duration,
    });

    // Send notification
    if (schedule.sendNotification) {
      sendNotification(schedule, 'success', summary);
    }

  } catch (err) {
    const duration = Date.now() - startTime;
    const errorMsg = err instanceof Error ? err.message : 'Unknown error';

    addRunHistory({
      scheduleId: schedule.id,
      skillName: schedule.skillName,
      skillIcon: schedule.skillIcon,
      timestamp: Date.now(),
      status: 'error',
      summary: `Error: ${errorMsg}`,
      duration,
    });

    if (schedule.sendNotification) {
      sendNotification(schedule, 'error', errorMsg);
    }

    console.error(`[Scheduler] Error executing ${schedule.skillName}:`, err);
  }
}

async function writeToVault(schedule: SkillSchedule, _summary: string, fullResponse: string): Promise<void> {
  const bridgeUrl = 'http://127.0.0.1:8087';
  const timestamp = new Date().toISOString();
  const header = `\n\n---\n## ${schedule.skillName} — ${new Date().toLocaleDateString()} ${new Date().toLocaleTimeString()}\n`;
  const content = schedule.vaultMode === 'append'
    ? `${header}${fullResponse}\n`
    : `# ${schedule.skillName}\n_Last updated: ${timestamp}_\n\n${fullResponse}\n`;

  await fetch(`${bridgeUrl}/v1/secondbrain/vault/write`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      path: schedule.vaultPath,
      content,
      mode: schedule.vaultMode,
    }),
  });
}

function sendNotification(schedule: SkillSchedule, status: 'success' | 'error', message: string): void {
  const target = schedule.notificationTarget;

  // In-app toast notification
  if (target === 'toast' || target === 'both') {
    document.dispatchEvent(new CustomEvent('arcadia:toast', {
      detail: {
        type: status === 'success' ? 'success' : 'error',
        title: `${schedule.skillIcon} ${schedule.skillName}`,
        message: status === 'success'
          ? `Completed successfully${schedule.writeToVault ? ` · Saved to ${schedule.vaultPath}` : ''}`
          : `Failed: ${message}`,
      },
    }));
  }

  // Google Chat notification (via bridge)
  if (target === 'gchat' || target === 'both') {
    const bridgeUrl = 'http://127.0.0.1:8087';
    fetch(`${bridgeUrl}/v1/secondbrain/notify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        channel: 'gchat',
        title: `${schedule.skillIcon} ${schedule.skillName} — ${status === 'success' ? 'Completed' : 'Failed'}`,
        body: message.slice(0, 500),
      }),
    }).catch(() => {
      // Silently fail — GChat notification is best-effort
    });
  }
}

// ─── Utility: Format next run as relative time ───────────────────────────────
export function formatNextRun(timestamp: number | null): string {
  if (!timestamp) return 'Not scheduled';
  const now = Date.now();
  const diff = timestamp - now;

  if (diff < 0) return 'Overdue';
  if (diff < 60000) return 'In less than a minute';
  if (diff < 3600000) return `In ${Math.round(diff / 60000)} min`;
  if (diff < 86400000) {
    const hours = Math.floor(diff / 3600000);
    const mins = Math.round((diff % 3600000) / 60000);
    return `In ${hours}h ${mins}m`;
  }
  const days = Math.floor(diff / 86400000);
  return `In ${days} day${days > 1 ? 's' : ''}`;
}

// ─── Utility: Get schedule description ───────────────────────────────────────
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export function getScheduleLabel(schedule: SkillSchedule): string {
  const timeStr = new Date(`2000-01-01T${schedule.time}`).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  switch (schedule.frequency) {
    case 'daily': return `Daily at ${timeStr}`;
    case 'weekdays': return `Weekdays at ${timeStr}`;
    case 'weekly': return `${DAYS[schedule.customDays?.[0] || 1]}s at ${timeStr}`;
    case 'custom': return `${(schedule.customDays || []).map(d => DAYS[d]).join(', ')} at ${timeStr}`;
  }
}
