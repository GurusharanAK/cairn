# Incident log

Issue: Token refresh fails after every deploy (recurring)
Attempt 1 (failed): Increased the token lifetime to 2 hours - no change.
Attempt 2 (failed): Restarted the auth service after each deploy - worked until the next deploy.
Attempt 3 (worked): Set AUTH_JWKS_CACHE_SEC=0 in the staging and production environments - fix confirmed on both.
