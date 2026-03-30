# Workflow: Payment Feature

1. Understand gateway (razorpay/cashfree)
2. Add schema in packages/db
3. Add queue job if async needed
4. Add worker processor
5. Add API route in apps/web/api
6. Normalize response in packages/shared
7. Add UI in dashboard

Validation:
- No business logic in API
- Retry handled via queue