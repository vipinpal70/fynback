/**
 * apps/worker/src/index.ts
 *
 * Entry point for the FynBack background worker process.
 *
 * WHY A SEPARATE WORKER PROCESS?
 * Next.js runs serverlessly on Vercel — short-lived, stateless, no persistent connections.
 * BullMQ workers need to run continuously, maintaining a persistent Redis connection
 * and processing jobs as they arrive. Running a BullMQ worker inside a Next.js
 * serverless function would cause:
 *   1. Connection drops every 10-60s (function timeout)
 *   2. Jobs getting stuck in 'active' state (worker died mid-job, lock not released)
 *   3. Memory leaks (Redis connections not properly closed)
 *
 * This worker runs on Railway as an always-on Node.js process.
 * It connects to the same Redis and PostgreSQL as apps/web, but independently.
 *
 * WORKERS STARTED HERE:
 *   startWelcomeWorker()   → Sends branded welcome email after merchant onboarding
 *   startGatewayWorker()   → Sends gateway-connected email with webhook setup instructions
 *   startRecoveryWorker()  → Core payment recovery engine (retry + email + WhatsApp + SMS)
 *
 * GRACEFUL SHUTDOWN:
 * WHY SIGTERM HANDLING: When Railway (or Docker) stops the container, it sends SIGTERM.
 * If we exit immediately, BullMQ jobs that are mid-processing will be re-queued.
 * With graceful shutdown, we wait for in-progress jobs to complete before exiting.
 * This prevents double-processing and inconsistent state.
 */

// Load environment variables FIRST — before any other imports that may use process.env
// WHY: ES module imports are hoisted, so dotenv.config() after imports is too late.
// 'dotenv/config' is a side-effect import that runs synchronously before other modules.
import 'dotenv/config';
import { startWelcomeWorker } from './workers/welcome.worker';
import { startGatewayWorker } from './workers/gateway.worker';
import { startRecoveryWorker } from './workers/recovery.worker';

console.log('[Worker] FynBack Worker process starting...');

// ── Start all workers ───────────────────────────────────────────────────────

// Onboarding welcome email (sends branded email after merchant signup)
const welcomeWorker = startWelcomeWorker();

// Gateway-connected email (webhook setup instructions after gateway is linked)
const gatewayWorker = startGatewayWorker();

// Core payment recovery engine — THE HEART OF FYNBACK
// Processes: retry_payment | send_email | send_whatsapp | send_sms jobs
const recoveryWorker = startRecoveryWorker();

console.log('[Worker] All workers started successfully. Listening for jobs...');

// ── Graceful shutdown handling ──────────────────────────────────────────────

/**
 * Graceful shutdown on SIGTERM (sent by Railway/Docker when stopping the container).
 *
 * WHY GRACEFUL SHUTDOWN:
 * If we call process.exit() immediately, BullMQ marks in-progress jobs as stalled.
 * Stalled jobs get re-queued and may be processed twice — bad for payment operations.
 * Calling worker.close() waits for the current job to finish before stopping.
 */
process.on('SIGTERM', async () => {
  console.log('[Worker] SIGTERM received. Starting graceful shutdown...');

  // Close all workers — waits for in-progress jobs to complete
  await Promise.all([
    welcomeWorker.close(),
    gatewayWorker.close(),
    recoveryWorker.close(),
  ]);

  console.log('[Worker] All workers closed cleanly. Exiting.');
  process.exit(0);
});

/**
 * Also handle SIGINT (Ctrl+C during local development).
 * Same graceful shutdown logic as SIGTERM.
 */
process.on('SIGINT', async () => {
  console.log('[Worker] SIGINT received (Ctrl+C). Shutting down gracefully...');

  await Promise.all([
    welcomeWorker.close(),
    gatewayWorker.close(),
    recoveryWorker.close(),
  ]);

  process.exit(0);
});

/**
 * Catch unhandled promise rejections.
 *
 * WHY: In production, an unhandled rejection in a worker job would silently kill
 * the job. Logging it here gives us visibility in Railway logs.
 * BullMQ's own error handling retries the job — this is just for visibility.
 */
process.on('unhandledRejection', (reason, promise) => {
  console.error('[Worker] Unhandled Promise Rejection at:', promise, 'reason:', reason);
  // Don't exit the process — let BullMQ retry the failed job
});
