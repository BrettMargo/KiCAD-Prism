from pydantic import BaseModel

class Settings(BaseModel):
    # TODO: Replace with env var in production
    GOOGLE_CLIENT_ID: str = "PLACEHOLDER_CLIENT_ID_FROM_GOOGLE_CLOUD_CONSOLE"
    ALLOWED_DOMAINS: list[str] = ["pixxel.co.in", "space.pixxel.co.in"]

settings = Settings()
