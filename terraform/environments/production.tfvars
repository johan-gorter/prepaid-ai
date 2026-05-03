project_id         = "prepaid-ai-production"
environment        = "production"
region             = "europe-west1"
firestore_location = "eur3"
public_url         = "https://payasyougo.app"
ai_backend         = "vertex"

# stripe_backend defaults to "dummy". Flip to "stripe" in a separate apply
# AFTER STRIPE_SECRET_KEY and STRIPE_WEBHOOK_SECRET have versions in Secret
# Manager — see docs/stripe.md.
