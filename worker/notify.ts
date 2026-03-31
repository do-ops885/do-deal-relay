import { CONFIG } from './config';
import { createGitHubIssue } from './lib/github';
import { getRecentLogs } from './lib/logger';
import type { Env, NotificationEvent } from './types';

// ============================================================================
// Notification System
// ============================================================================

interface NotificationHistory {
  type: string;
  source: string;
  timestamp: string;
}

const NOTIFICATION_KEY = 'meta:notifications';
const NOTIFICATION_COOLDOWN_MS = CONFIG.NOTIFICATION_COOLDOWN_HOURS * 60 * 60 * 1000;

/**
 * Send notification based on event type
 */
export async function notify(env: Env, event: NotificationEvent): Promise<boolean> {
  // Check deduplication
  const shouldSend = await shouldSendNotification(env, event);
  if (!shouldSend) {
    console.log(`Notification deduped: ${event.type}`);
    return false;
  }

  // Try Telegram first (if configured)
  if (env.TELEGRAM_BOT_TOKEN && env.TELEGRAM_CHAT_ID) {
    try {
      const success = await sendTelegramNotification(env, event);
      if (success) {
        await recordNotification(env, event);
        return true;
      }
    } catch (error) {
      console.error('Telegram notification failed:', error);
    }
  }

  // Fallback to GitHub Issues
  try {
    const issueNumber = await sendGitHubNotification(env, event);
    await recordNotification(env, event);
    console.log(`Created GitHub issue #${issueNumber} for ${event.type}`);
    return true;
  } catch (error) {
    console.error('GitHub notification failed:', error);
    return false;
  }
}

/**
 * Check if notification should be sent (dedupe)
 */
async function shouldSendNotification(env: Env, event: NotificationEvent): Promise<boolean> {
  try {
    const history = await env.DEALS_PROD.get<NotificationHistory[]>(NOTIFICATION_KEY, 'json') || [];
    const now = new Date().getTime();
    
    // Check for recent notifications of same type
    const recent = history.filter(
      (h) =>
        h.type === event.type &&
        now - new Date(h.timestamp).getTime() < NOTIFICATION_COOLDOWN_MS
    );
    
    return recent.length === 0;
  } catch {
    return true;
  }
}

/**
 * Record notification in history
 */
async function recordNotification(env: Env, event: NotificationEvent): Promise<void> {
  try {
    const history = await env.DEALS_PROD.get<NotificationHistory[]>(NOTIFICATION_KEY, 'json') || [];
    
    history.push({
      type: event.type,
      source: 'system',
      timestamp: new Date().toISOString(),
    });
    
    // Keep only last 100 entries
    const trimmed = history.slice(-100);
    await env.DEALS_PROD.put(NOTIFICATION_KEY, JSON.stringify(trimmed));
  } catch (error) {
    console.error('Failed to record notification:', error);
  }
}

/**
 * Send Telegram notification
 */
async function sendTelegramNotification(env: Env, event: NotificationEvent): Promise<boolean> {
  if (!env.TELEGRAM_BOT_TOKEN || !env.TELEGRAM_CHAT_ID) {
    return false;
  }

  const emoji = getSeverityEmoji(event.severity);
  const message = `${emoji} **${event.type}**

**Severity:** ${event.severity}
**Run ID:** ${event.run_id}
**Time:** ${new Date().toISOString()}

${event.message}

${event.context ? `\`\`\`json\n${JSON.stringify(event.context, null, 2)}\n\`\`\`` : ''}`;

  const response = await fetch(
    `https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: env.TELEGRAM_CHAT_ID,
        text: message,
        parse_mode: 'Markdown',
      }),
    }
  );

  if (!response.ok) {
    throw new Error(`Telegram API error: ${response.status}`);
  }

  const data = await response.json();
  return data.ok === true;
}

/**
 * Send GitHub Issue notification (fallback)
 */
async function sendGitHubNotification(env: Env, event: NotificationEvent): Promise<number> {
  const recentLogs = await getRecentLogs(env, 10);
  
  const details = {
    severity: event.severity,
    message: event.message,
    context: {
      ...event.context,
      recent_logs: recentLogs,
    },
  };

  return createGitHubIssue(CONFIG.GITHUB_REPO, event.type, event.run_id, details);
}

/**
 * Get emoji for severity
 */
function getSeverityEmoji(severity: NotificationEvent['severity']): string {
  switch (severity) {
    case 'critical':
      return '🚨';
    case 'warning':
      return '⚠️';
    case 'info':
    default:
      return 'ℹ️';
  }
}

/**
 * Check for high-value deals and notify
 */
export async function notifyHighValueDeals(
  env: Env,
  deals: Array<{ code: string; reward: number }>,
  run_id: string
): Promise<void> {
  for (const deal of deals) {
    await notify(env, {
      type: 'high_value_deal',
      severity: 'info',
      run_id,
      message: `High-value deal discovered: ${deal.code} with reward $${deal.reward}`,
      context: { code: deal.code, reward: deal.reward },
    });
  }
}
