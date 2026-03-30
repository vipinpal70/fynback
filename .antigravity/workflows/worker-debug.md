# Workflow: Debug Worker

1. Check queue status
2. Inspect job payload
3. Check retry-scheduler
4. Validate Redis connection
5. Check worker logs

Fix:
- Ensure idempotency
- Avoid duplicate processing